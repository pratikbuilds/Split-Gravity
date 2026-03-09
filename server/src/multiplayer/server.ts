import { randomUUID } from 'node:crypto';
import type {
  MatchRoomKind,
  MatchResult,
  MatchStatePacket,
  QueueStatePayload,
} from '../shared/multiplayer-contracts';
import { DEFAULT_CHARACTER_ID, isCharacterId } from '../shared/characters';
import { createHttpApp } from '../app/createHttpApp';
import { createSocketServer } from '../app/createSocketServer';
import { env } from '../config/env';
import { logAt } from '../lib/logger';
import {
  MAX_SCORE,
  derivePreMatchState,
  isValidClientId,
  isValidMatchStatePayload,
  normalizeRoomCode,
  pruneDisconnectedReadyPlayers,
  sanitizeNickname,
} from '../multiplayerGuards';
import {
  createRoomCode,
  getRoomOpponent,
  type QueueEntry,
  queueBucketKey,
  type Room,
  roomSummary,
  snapshotRoom,
  type ServerPlayer,
} from './runtime';
import { paymentService } from '../payments/service';
import { characterGenerationService } from '../modules/character-generation';

const PORT = env.PORT;
const RECONNECT_GRACE_MS = 10_000;
const ROOM_TTL_MS = 2 * 60 * 1000;
const START_COUNTDOWN_MS = 2_000;
const MAX_DELTA_SCROLL_PER_MS = 0.5;
const LOG_STATE_EVENTS = env.LOG_STATE_EVENTS;

export const startServer = async () => {
  await paymentService.initialize();
  await characterGenerationService.startWorker();

  const app = createHttpApp();
  const { httpServer, io } = createSocketServer(app);

  const rooms = new Map<string, Room>();
  const queueBuckets = new Map<string, QueueEntry[]>();
  const queueEntryIdBySocketId = new Map<string, string>();
  const socketIndex = new Map<string, { roomCode: string; playerId: string }>();

  const getRoomPaymentIntentIds = (room: Room) => [...room.paymentIntentIdsByPlayerId.values()];

  const emitQueueStateToSocket = (socketId: string, payload: QueueStatePayload) => {
    io.to(socketId).emit('queue:state', payload);
  };

  const clearPlayerTimers = (player: ServerPlayer) => {
    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      player.disconnectTimer = undefined;
    }
    if (player.reconnectInterval) {
      clearInterval(player.reconnectInterval);
      player.reconnectInterval = undefined;
    }
  };

  const emitRoomState = (room: Room) => {
    io.to(room.roomCode).emit('room:state', snapshotRoom(room));
    logAt('debug', 'room.state.emitted', roomSummary(room));
  };

  const runInBackground = (
    promise: Promise<unknown>,
    event: string,
    context: Record<string, unknown>
  ) => {
    // Socket.IO handlers are synchronous entrypoints; this keeps async settlement/refund work
    // from turning into unhandled promise rejections while still preserving structured logs.
    void promise.catch((error) => {
      logAt('error', event, {
        ...context,
        message: error instanceof Error ? error.message : 'unknown',
      });
    });
  };

  const clearRoomCleanup = (room: Room) => {
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = undefined;
    }
  };

  const scheduleRoomCleanup = (room: Room, delayMs = ROOM_TTL_MS) => {
    clearRoomCleanup(room);
    logAt('info', 'room.cleanup.scheduled', {
      roomCode: room.roomCode,
      delayMs,
      state: room.state,
    });
    room.cleanupTimer = setTimeout(() => {
      for (const player of room.players.values()) {
        socketIndex.delete(player.socketId);
      }
      rooms.delete(room.roomCode);
      logAt('info', 'room.cleanup.executed', { roomCode: room.roomCode });
    }, delayMs);
  };

  const removeQueueEntryById = (queueEntryId: string) => {
    for (const [bucketKey, entries] of queueBuckets.entries()) {
      const index = entries.findIndex((entry) => entry.id === queueEntryId);
      if (index === -1) continue;

      const [removed] = entries.splice(index, 1);
      if (removed) {
        queueEntryIdBySocketId.delete(removed.socketId);
      }
      if (entries.length === 0) {
        queueBuckets.delete(bucketKey);
      }
      return removed ?? null;
    }
    return null;
  };

  const removeQueueEntryBySocketId = (socketId: string) => {
    const queueEntryId = queueEntryIdBySocketId.get(socketId);
    if (!queueEntryId) return null;
    return removeQueueEntryById(queueEntryId);
  };

  const getQueueEntryBySocketId = (socketId: string) => {
    const queueEntryId = queueEntryIdBySocketId.get(socketId);
    if (!queueEntryId) return null;

    for (const entries of queueBuckets.values()) {
      const entry = entries.find((candidate) => candidate.id === queueEntryId);
      if (entry) {
        return entry;
      }
    }

    return null;
  };

  const insertQueueEntry = (entry: QueueEntry) => {
    const bucketKey = queueBucketKey(entry.tokenId, entry.entryFeeTierId);
    queueBuckets.set(bucketKey, [...(queueBuckets.get(bucketKey) ?? []), entry]);
    queueEntryIdBySocketId.set(entry.socketId, entry.id);
  };

  const refundPaidRoom = async (room: Room, description: string) => {
    if (
      (room.roomKind !== 'paid_private' && room.roomKind !== 'paid_queue') ||
      room.settlementStatus === 'refunded'
    ) {
      return true;
    }

    let allRefundsSucceeded = true;
    for (const player of room.players.values()) {
      if (!player.walletPlayerId || !player.paymentIntentId) continue;
      try {
        await paymentService.refundRealtimePaymentIntent(
          player.walletPlayerId,
          player.paymentIntentId,
          description
        );
      } catch (error) {
        allRefundsSucceeded = false;
        logAt('warn', 'payment.refund.failed', {
          roomCode: room.roomCode,
          playerId: player.playerId,
          message: error instanceof Error ? error.message : 'unknown',
        });
      }
    }

    if (allRefundsSucceeded) {
      room.settlementStatus = 'refunded';
    }

    return allRefundsSucceeded;
  };

  const closePaidRoomBeforeStart = async (room: Room, code: string, message: string) => {
    await refundPaidRoom(room, message);
    io.to(room.roomCode).emit('error', { code, message });
    for (const player of room.players.values()) {
      io.sockets.sockets.get(player.socketId)?.leave(room.roomCode);
      room.byClientId.delete(player.clientId);
      socketIndex.delete(player.socketId);
      clearPlayerTimers(player);
    }
    clearRoomCleanup(room);
    rooms.delete(room.roomCode);
    logAt('warn', 'room.cancelled_before_start', {
      roomCode: room.roomCode,
      roomKind: room.roomKind,
      code,
    });
  };

  const removePlayerFromRoom = (room: Room, playerId: string) => {
    const player = room.players.get(playerId);
    if (!player) return;

    clearPlayerTimers(player);
    socketIndex.delete(player.socketId);
    room.players.delete(playerId);
    room.byClientId.delete(player.clientId);
    room.readyPlayerIds.delete(playerId);
    room.fundedPlayerIds.delete(playerId);
    room.paymentIntentIdsByPlayerId.delete(playerId);

    if (room.players.size === 0) {
      clearRoomCleanup(room);
      rooms.delete(room.roomCode);
      logAt('info', 'room.deleted_empty', { roomCode: room.roomCode });
      return;
    }

    if (room.state !== 'RUNNING' && room.state !== 'ENDED') {
      room.state = derivePreMatchState(room.players.size, room.readyPlayerIds.size);
    }

    emitRoomState(room);
    if (room.state !== 'RUNNING' && room.state !== 'ENDED' && room.players.size < 2) {
      scheduleRoomCleanup(room);
    }
  };

  const endMatch = async (
    room: Room,
    winnerPlayerId: string,
    loserPlayerId: string,
    reason: MatchResult['reason']
  ) => {
    if (room.state === 'ENDED') {
      logAt('warn', 'match.end.ignored_already_ended', {
        roomCode: room.roomCode,
        winnerPlayerId,
        loserPlayerId,
        reason,
      });
      return;
    }

    room.state = 'ENDED';
    room.readyPlayerIds.clear();
    for (const player of room.players.values()) {
      clearPlayerTimers(player);
    }
    room.result = {
      winnerPlayerId,
      loserPlayerId,
      reason,
      endedAt: Date.now(),
    };

    if (
      (room.roomKind === 'paid_private' || room.roomKind === 'paid_queue') &&
      room.settlementStatus !== 'settled'
    ) {
      const winner = room.players.get(winnerPlayerId);
      const paymentIntentIds = getRoomPaymentIntentIds(room);
      if (winner?.walletPlayerId && paymentIntentIds.length > 0) {
        try {
          const settlement = await paymentService.settleRealtimeWinnerTakeAll(
            winner.walletPlayerId,
            paymentIntentIds,
            `${room.roomKind} winner-take-all payout`
          );
          room.result.settlementTransactionSignature = settlement.transactionSignature ?? null;
          room.settlementStatus = 'settled';
        } catch (error) {
          logAt('error', 'payment.settlement.failed', {
            roomCode: room.roomCode,
            roomKind: room.roomKind,
            winnerPlayerId,
            message: error instanceof Error ? error.message : 'unknown',
          });
          room.result.settlementTransactionSignature = null;
        }
      }
    }

    io.to(room.roomCode).emit('match:result', room.result);
    logAt('info', 'match.ended', {
      roomCode: room.roomCode,
      winnerPlayerId,
      loserPlayerId,
      reason,
      endedAt: room.result.endedAt,
    });
    emitRoomState(room);
    scheduleRoomCleanup(room, 15_000);
  };

  const startMatchIfReady = (room: Room) => {
    if (room.state !== 'READY' && room.state !== 'ROOM_FULL') {
      logAt('debug', 'match.start.skipped_invalid_state', {
        roomCode: room.roomCode,
        state: room.state,
      });
      return;
    }
    if (room.players.size !== 2 || room.readyPlayerIds.size !== 2) {
      logAt('debug', 'match.start.skipped_not_ready', {
        roomCode: room.roomCode,
        players: room.players.size,
        ready: room.readyPlayerIds.size,
      });
      return;
    }
    if (
      (room.roomKind === 'paid_private' || room.roomKind === 'paid_queue') &&
      room.fundedPlayerIds.size !== 2
    ) {
      logAt('debug', 'match.start.skipped_unfunded_paid_room', {
        roomCode: room.roomCode,
        funded: room.fundedPlayerIds.size,
      });
      return;
    }

    room.state = 'COUNTDOWN';
    logAt('info', 'match.countdown.started', {
      roomCode: room.roomCode,
      countdownMs: START_COUNTDOWN_MS,
    });
    emitRoomState(room);

    setTimeout(() => {
      if (!rooms.has(room.roomCode) || room.state !== 'COUNTDOWN') {
        logAt('warn', 'match.countdown.cancelled', {
          roomCode: room.roomCode,
          reason: 'room_missing_or_state_changed',
        });
        return;
      }

      const allConnected = [...room.players.values()].every((player) => player.connected);
      if (!allConnected) {
        pruneDisconnectedReadyPlayers(room.readyPlayerIds, room.players.values());
        room.state = derivePreMatchState(room.players.size, room.readyPlayerIds.size);
        logAt('warn', 'match.countdown.cancelled', {
          roomCode: room.roomCode,
          reason: 'players_disconnected',
          nextState: room.state,
          readyCount: room.readyPlayerIds.size,
        });
        emitRoomState(room);
        return;
      }

      room.state = 'RUNNING';
      room.startedAt = Date.now() + 400;
      io.to(room.roomCode).emit('match:start', {
        roomCode: room.roomCode,
        seed: room.seed,
        startAt: room.startedAt,
        config: {
          reconnectGraceMs: RECONNECT_GRACE_MS,
        },
      });
      logAt('info', 'match.started', {
        roomCode: room.roomCode,
        startAt: room.startedAt,
        seed: room.seed,
      });
      emitRoomState(room);
    }, START_COUNTDOWN_MS);
  };

  const findRoomBySocket = (socketId: string) => {
    const indexed = socketIndex.get(socketId);
    if (!indexed) return null;
    const room = rooms.get(indexed.roomCode);
    const player = room?.players.get(indexed.playerId);
    if (!room || !player) {
      socketIndex.delete(socketId);
      return null;
    }
    return { room, player };
  };

  const beginReconnectWindow = (room: Room, player: ServerPlayer) => {
    if (
      room.state !== 'RUNNING' ||
      player.connected ||
      player.disconnectTimer ||
      player.reconnectInterval
    ) {
      return;
    }

    const opponent = getRoomOpponent(room, player.playerId);
    if (!opponent) {
      return;
    }

    emitRoomState(room);

    let remainingSeconds = Math.ceil(RECONNECT_GRACE_MS / 1000);
    io.to(room.roomCode).emit('session:reconnectWindow', {
      playerId: player.playerId,
      secondsRemaining: remainingSeconds,
    });
    logAt('warn', 'session.reconnect_window.started', {
      roomCode: room.roomCode,
      playerId: player.playerId,
      secondsRemaining: remainingSeconds,
    });

    const interval = setInterval(() => {
      remainingSeconds -= 1;
      if (remainingSeconds <= 0) {
        clearInterval(interval);
        player.reconnectInterval = undefined;
        return;
      }
      io.to(room.roomCode).emit('session:reconnectWindow', {
        playerId: player.playerId,
        secondsRemaining: remainingSeconds,
      });
      if (LOG_STATE_EVENTS) {
        logAt('debug', 'session.reconnect_window.tick', {
          roomCode: room.roomCode,
          playerId: player.playerId,
          secondsRemaining: remainingSeconds,
        });
      }
    }, 1000);
    player.reconnectInterval = interval;

    player.disconnectTimer = setTimeout(() => {
      clearInterval(interval);
      player.reconnectInterval = undefined;
      player.disconnectTimer = undefined;
      if (player.connected || room.state !== 'RUNNING') {
        logAt('info', 'session.reconnect_window.cancelled', {
          roomCode: room.roomCode,
          playerId: player.playerId,
          connected: player.connected,
          state: room.state,
        });
        return;
      }
      runInBackground(
        endMatch(room, opponent.playerId, player.playerId, 'disconnect_forfeit'),
        'match.end.background_failed',
        {
          roomCode: room.roomCode,
          winnerPlayerId: opponent.playerId,
          loserPlayerId: player.playerId,
          reason: 'disconnect_forfeit',
        }
      );
      logAt('warn', 'match.disconnect_forfeit', {
        roomCode: room.roomCode,
        loserPlayerId: player.playerId,
      });
    }, RECONNECT_GRACE_MS);
  };

  io.on('connection', (socket) => {
    logAt('info', 'socket.connected', { socketId: socket.id });

    socket.on(
      'room:create',
      ({
        nickname,
        clientId,
        characterId,
        customCharacterVersionId,
        accessToken,
        roomKind,
        tokenId,
        entryFeeTierId,
        paymentIntentId,
      }) => {
        if (!isValidClientId(clientId)) {
          logAt('warn', 'room.create.invalid_client_id', { socketId: socket.id, clientId });
          socket.emit('error', {
            code: 'INVALID_CLIENT_ID',
            message: 'Invalid client session. Reopen app.',
          });
          return;
        }

        const linked = findRoomBySocket(socket.id);
        if (linked) {
          if (linked.room.state === 'RUNNING') {
            socket.emit('error', {
              code: 'MATCH_IN_PROGRESS',
              message: 'Finish the current match before creating a new room.',
            });
            return;
          }
          socket.leave(linked.room.roomCode);
          removePlayerFromRoom(linked.room, linked.player.playerId);
        }

        const roomCode = createRoomCode(rooms);
        const safeCharacterId = isCharacterId(characterId) ? characterId : DEFAULT_CHARACTER_ID;
        const safeRoomKind: MatchRoomKind = roomKind === 'paid_private' ? 'paid_private' : 'casual';
        let walletPlayerId: string | undefined;

        if (safeRoomKind === 'paid_private') {
          if (!tokenId || !entryFeeTierId || !paymentIntentId) {
            socket.emit('error', {
              code: 'PAID_ROOM_INVALID',
              message: 'Paid room requires token, entry fee tier, and funding.',
            });
            return;
          }

          try {
            walletPlayerId = paymentService.validateRealtimePaymentIntent(
              accessToken,
              paymentIntentId,
              {
                purpose: 'multi_paid_private',
                tokenId,
                entryFeeTierId,
              }
            ).player.id;
          } catch (error) {
            socket.emit('error', {
              code: 'PAID_ROOM_FUNDING_INVALID',
              message: error instanceof Error ? error.message : 'Unable to validate funding.',
            });
            return;
          }
        }

        const playerId = randomUUID();
        const room: Room = {
          roomCode,
          state: 'ROOM_OPEN',
          roomKind: safeRoomKind,
          tokenId: safeRoomKind === 'paid_private' ? tokenId : undefined,
          entryFeeTierId: safeRoomKind === 'paid_private' ? entryFeeTierId : undefined,
          seed: Math.floor(Math.random() * 1_000_000_000),
          createdAt: Date.now(),
          players: new Map(),
          byClientId: new Map(),
          readyPlayerIds: new Set(),
          fundedPlayerIds: new Set(),
          paymentIntentIdsByPlayerId: new Map(),
        };

        const player: ServerPlayer = {
          playerId,
          clientId,
          nickname: sanitizeNickname(nickname, 'Player 1'),
          characterId: safeCharacterId,
          customCharacterVersionId,
          alive: true,
          connected: true,
          socketId: socket.id,
          lastSeenAt: Date.now(),
          walletPlayerId,
          paymentIntentId: safeRoomKind === 'paid_private' ? paymentIntentId : undefined,
        };

        room.players.set(playerId, player);
        room.byClientId.set(clientId, playerId);
        if (safeRoomKind === 'paid_private' && paymentIntentId) {
          room.fundedPlayerIds.add(playerId);
          room.paymentIntentIdsByPlayerId.set(playerId, paymentIntentId);
        }
        rooms.set(roomCode, room);
        clearRoomCleanup(room);
        socketIndex.set(socket.id, { roomCode, playerId });

        socket.join(roomCode);
        socket.emit('room:created', {
          roomCode,
          player,
          roomKind: room.roomKind,
        });
        logAt('info', 'room.created', {
          roomCode,
          playerId,
          clientId,
          nickname: player.nickname,
          characterId: player.characterId,
          customCharacterVersionId: player.customCharacterVersionId,
          roomKind: room.roomKind,
          socketId: socket.id,
        });
        emitRoomState(room);
      }
    );

    socket.on(
      'room:join',
      ({
        roomCode,
        nickname,
        clientId,
        characterId,
        customCharacterVersionId,
        accessToken,
        tokenId,
        entryFeeTierId,
        paymentIntentId,
      }) => {
        if (!isValidClientId(clientId)) {
          logAt('warn', 'room.join.invalid_client_id', { socketId: socket.id, clientId });
          socket.emit('error', {
            code: 'INVALID_CLIENT_ID',
            message: 'Invalid client session. Reopen app.',
          });
          return;
        }

        const normalizedCode = normalizeRoomCode(roomCode);
        const room = rooms.get(normalizedCode);
        if (!room) {
          logAt('warn', 'room.join.failed_not_found', {
            roomCode: normalizedCode,
            clientId,
            socketId: socket.id,
          });
          socket.emit('error', { code: 'ROOM_NOT_FOUND', message: 'Room code not found.' });
          return;
        }

        if (room.state === 'ENDED') {
          logAt('warn', 'room.join.failed_ended', {
            roomCode: normalizedCode,
            clientId,
            socketId: socket.id,
          });
          socket.emit('error', { code: 'MATCH_ENDED', message: 'Match already ended.' });
          return;
        }
        if (
          room.roomKind === 'paid_private' &&
          ((tokenId && tokenId !== room.tokenId) ||
            (entryFeeTierId && entryFeeTierId !== room.entryFeeTierId))
        ) {
          logAt('warn', 'room.join.failed_paid_terms_mismatch', {
            roomCode: normalizedCode,
            tokenId,
            entryFeeTierId,
            expectedTokenId: room.tokenId,
            expectedEntryFeeTierId: room.entryFeeTierId,
          });
          socket.emit('error', {
            code: 'PAID_TERMS_MISMATCH',
            message: 'Paid room token or entry fee does not match.',
          });
          return;
        }

        const linked = findRoomBySocket(socket.id);
        if (linked && linked.room.roomCode !== normalizedCode) {
          if (linked.room.state === 'RUNNING') {
            socket.emit('error', {
              code: 'MATCH_IN_PROGRESS',
              message: 'Finish the current match before joining another room.',
            });
            return;
          }
          socket.leave(linked.room.roomCode);
          removePlayerFromRoom(linked.room, linked.player.playerId);
        }

        const safeCharacterId = isCharacterId(characterId) ? characterId : DEFAULT_CHARACTER_ID;
        let playerId = room.byClientId.get(clientId);
        let player = playerId ? room.players.get(playerId) : undefined;

        if (player) {
          if (player.socketId !== socket.id) {
            socketIndex.delete(player.socketId);
          }
          player.socketId = socket.id;
          player.connected = true;
          player.lastSeenAt = Date.now();
          player.nickname = sanitizeNickname(nickname, player.nickname);
          player.characterId = safeCharacterId;
          player.customCharacterVersionId = customCharacterVersionId;
          clearPlayerTimers(player);
          if (
            (room.roomKind === 'paid_private' || room.roomKind === 'paid_queue') &&
            paymentIntentId
          ) {
            room.fundedPlayerIds.add(player.playerId);
            room.paymentIntentIdsByPlayerId.set(player.playerId, paymentIntentId);
            player.paymentIntentId = paymentIntentId;
          }
          if (room.state !== 'RUNNING') {
            room.state = derivePreMatchState(room.players.size, room.readyPlayerIds.size);
          }
          socketIndex.set(socket.id, { roomCode: normalizedCode, playerId: player.playerId });
          socket.join(normalizedCode);
          logAt('info', 'room.rejoined', {
            roomCode: normalizedCode,
            playerId: player.playerId,
            clientId,
            socketId: socket.id,
          });
          emitRoomState(room);
          startMatchIfReady(room);
          return;
        }

        if (room.players.size >= 2) {
          logAt('warn', 'room.join.failed_full', {
            roomCode: normalizedCode,
            clientId,
            socketId: socket.id,
          });
          socket.emit('error', { code: 'ROOM_FULL', message: 'Room is full.' });
          return;
        }

        let walletPlayerId: string | undefined;
        if (room.roomKind === 'paid_private') {
          if (!tokenId || !entryFeeTierId || !paymentIntentId) {
            socket.emit('error', {
              code: 'PAID_ROOM_INVALID',
              message: 'Paid room requires token, entry fee tier, and funding.',
            });
            return;
          }

          try {
            walletPlayerId = paymentService.validateRealtimePaymentIntent(
              accessToken,
              paymentIntentId,
              {
                purpose: 'multi_paid_private',
                tokenId: room.tokenId ?? tokenId,
                entryFeeTierId: room.entryFeeTierId ?? entryFeeTierId,
              }
            ).player.id;
          } catch (error) {
            socket.emit('error', {
              code: 'PAID_ROOM_FUNDING_INVALID',
              message: error instanceof Error ? error.message : 'Unable to validate funding.',
            });
            return;
          }
        }

        playerId = randomUUID();
        player = {
          playerId,
          clientId,
          nickname: sanitizeNickname(nickname, 'Player 2'),
          characterId: safeCharacterId,
          customCharacterVersionId,
          alive: true,
          connected: true,
          socketId: socket.id,
          lastSeenAt: Date.now(),
          walletPlayerId,
          paymentIntentId: room.roomKind === 'paid_private' ? paymentIntentId : undefined,
        };

        room.players.set(playerId, player);
        room.byClientId.set(clientId, playerId);
        room.state = room.readyPlayerIds.size === 2 ? 'READY' : 'ROOM_FULL';
        if (
          (room.roomKind === 'paid_private' || room.roomKind === 'paid_queue') &&
          paymentIntentId
        ) {
          room.fundedPlayerIds.add(playerId);
          room.paymentIntentIdsByPlayerId.set(playerId, paymentIntentId);
        }

        socketIndex.set(socket.id, { roomCode: normalizedCode, playerId });
        socket.join(normalizedCode);
        logAt('info', 'room.joined', {
          roomCode: normalizedCode,
          playerId,
          clientId,
          nickname: player.nickname,
          socketId: socket.id,
        });
        emitRoomState(room);
        startMatchIfReady(room);
      }
    );

    socket.on(
      'queue:join',
      async ({
        nickname,
        clientId,
        characterId,
        customCharacterVersionId,
        accessToken,
        tokenId,
        entryFeeTierId,
        paymentIntentId,
      }) => {
        if (!isValidClientId(clientId)) {
          socket.emit('error', {
            code: 'INVALID_CLIENT_ID',
            message: 'Invalid client session. Reopen app.',
          });
          return;
        }

        const linked = findRoomBySocket(socket.id);
        if (linked) {
          socket.emit('error', {
            code: 'MATCH_IN_PROGRESS',
            message: 'Leave the current room before joining paid matchmaking.',
          });
          return;
        }
        const existingQueueEntry = getQueueEntryBySocketId(socket.id);

        let walletPlayerId: string;
        try {
          walletPlayerId = paymentService.validateRealtimePaymentIntent(
            accessToken,
            paymentIntentId,
            {
              purpose: 'multi_paid_queue',
              tokenId,
              entryFeeTierId,
            }
          ).player.id;
        } catch (error) {
          socket.emit('error', {
            code: 'PAID_QUEUE_FUNDING_INVALID',
            message: error instanceof Error ? error.message : 'Unable to validate queue funding.',
          });
          return;
        }

        if (existingQueueEntry) {
          const isSameEntry =
            existingQueueEntry.paymentIntentId === paymentIntentId &&
            existingQueueEntry.tokenId === tokenId &&
            existingQueueEntry.entryFeeTierId === entryFeeTierId;
          if (isSameEntry) {
            emitQueueStateToSocket(socket.id, {
              status: 'queued',
              queueEntryId: existingQueueEntry.id,
              tokenId: existingQueueEntry.tokenId,
              entryFeeTierId: existingQueueEntry.entryFeeTierId,
              message: 'Waiting for another funded player in this entry fee bucket.',
            });
            return;
          }

          try {
            await paymentService.refundRealtimePaymentIntent(
              existingQueueEntry.walletPlayerId,
              existingQueueEntry.paymentIntentId,
              'Replaced paid queue entry before a new queue join'
            );
            removeQueueEntryById(existingQueueEntry.id);
          } catch (error) {
            emitQueueStateToSocket(socket.id, {
              status: 'queued',
              queueEntryId: existingQueueEntry.id,
              tokenId: existingQueueEntry.tokenId,
              entryFeeTierId: existingQueueEntry.entryFeeTierId,
              message: 'Existing queue entry is still active because the refund failed.',
            });
            socket.emit('error', {
              code: 'QUEUE_REPLACE_FAILED',
              message:
                error instanceof Error
                  ? error.message
                  : 'Unable to replace the existing paid queue entry.',
            });
            return;
          }
        }

        const entry: QueueEntry = {
          id: randomUUID(),
          socketId: socket.id,
          clientId,
          nickname: sanitizeNickname(nickname, 'Player'),
          characterId: isCharacterId(characterId) ? characterId : DEFAULT_CHARACTER_ID,
          customCharacterVersionId,
          walletPlayerId,
          tokenId,
          entryFeeTierId,
          paymentIntentId,
        };

        const bucketKey = queueBucketKey(tokenId, entryFeeTierId);
        const bucket = queueBuckets.get(bucketKey) ?? [];
        const opponent = bucket.shift();

        if (bucket.length > 0) {
          queueBuckets.set(bucketKey, bucket);
        } else {
          queueBuckets.delete(bucketKey);
        }

        if (!opponent) {
          insertQueueEntry(entry);
          emitQueueStateToSocket(socket.id, {
            status: 'queued',
            queueEntryId: entry.id,
            tokenId,
            entryFeeTierId,
            message: 'Waiting for another funded player in this entry fee bucket.',
          });
          return;
        }

        queueEntryIdBySocketId.delete(opponent.socketId);
        const opponentSocket = io.sockets.sockets.get(opponent.socketId);
        const currentSocket = io.sockets.sockets.get(socket.id);

        if (!opponentSocket || !currentSocket) {
          void paymentService
            .refundRealtimePaymentIntent(
              opponent.walletPlayerId,
              opponent.paymentIntentId,
              'Paid queue entry refunded after stale opponent match attempt'
            )
            .catch((error) => {
              logAt('warn', 'queue.stale_opponent.refund_failed', {
                queueEntryId: opponent.id,
                message: error instanceof Error ? error.message : 'unknown',
              });
            });

          insertQueueEntry(entry);
          emitQueueStateToSocket(socket.id, {
            status: 'queued',
            queueEntryId: entry.id,
            tokenId,
            entryFeeTierId,
            message: 'Waiting for another funded player in this entry fee bucket.',
          });
          return;
        }

        const roomCode = createRoomCode(rooms);
        const room: Room = {
          roomCode,
          state: 'READY',
          roomKind: 'paid_queue',
          tokenId,
          entryFeeTierId,
          seed: Math.floor(Math.random() * 1_000_000_000),
          createdAt: Date.now(),
          players: new Map(),
          byClientId: new Map(),
          readyPlayerIds: new Set(),
          fundedPlayerIds: new Set(),
          paymentIntentIdsByPlayerId: new Map(),
        };

        const queuedPlayers = [opponent, entry];
        const roomPlayers = queuedPlayers.map<ServerPlayer>((queuedPlayer) => ({
          playerId: randomUUID(),
          clientId: queuedPlayer.clientId,
          nickname: queuedPlayer.nickname,
          characterId: queuedPlayer.characterId,
          customCharacterVersionId: queuedPlayer.customCharacterVersionId,
          alive: true,
          connected: true,
          socketId: queuedPlayer.socketId,
          lastSeenAt: Date.now(),
          walletPlayerId: queuedPlayer.walletPlayerId,
          paymentIntentId: queuedPlayer.paymentIntentId,
        }));

        roomPlayers.forEach((player, index) => {
          const queuedPlayer = queuedPlayers[index]!;
          room.players.set(player.playerId, player);
          room.byClientId.set(player.clientId, player.playerId);
          room.readyPlayerIds.add(player.playerId);
          room.fundedPlayerIds.add(player.playerId);
          room.paymentIntentIdsByPlayerId.set(player.playerId, queuedPlayer.paymentIntentId);
        });

        rooms.set(roomCode, room);
        clearRoomCleanup(room);

        roomPlayers.forEach((player) => {
          socketIndex.set(player.socketId, { roomCode, playerId: player.playerId });
          io.sockets.sockets.get(player.socketId)?.join(roomCode);
          io.to(player.socketId).emit('room:created', {
            roomCode,
            player,
            roomKind: room.roomKind,
          });
          emitQueueStateToSocket(player.socketId, {
            status: 'matched',
            tokenId,
            entryFeeTierId,
            message: 'Opponent found. Starting paid match.',
          });
        });

        logAt('info', 'queue.matched', {
          roomCode,
          tokenId,
          entryFeeTierId,
          playerIds: roomPlayers.map((player) => player.playerId),
        });
        emitRoomState(room);
        startMatchIfReady(room);
      }
    );

    socket.on('queue:leave', ({ queueEntryId }) => {
      const authoritativeQueueEntryId = queueEntryIdBySocketId.get(socket.id);
      const removed =
        (queueEntryId && queueEntryId === authoritativeQueueEntryId
          ? removeQueueEntryById(queueEntryId)
          : null) ?? removeQueueEntryBySocketId(socket.id);
      if (!removed) {
        emitQueueStateToSocket(socket.id, { status: 'idle' });
        return;
      }

      runInBackground(
        (async () => {
          try {
            await paymentService.refundRealtimePaymentIntent(
              removed.walletPlayerId,
              removed.paymentIntentId,
              'Paid queue entry cancelled before match start'
            );
            emitQueueStateToSocket(socket.id, {
              status: 'idle',
              message: 'Queue entry cancelled and refunded.',
            });
          } catch (error) {
            insertQueueEntry(removed);
            emitQueueStateToSocket(socket.id, {
              status: 'queued',
              queueEntryId: removed.id,
              tokenId: removed.tokenId,
              entryFeeTierId: removed.entryFeeTierId,
              message: 'Queue leave failed. Your paid queue entry is still active.',
            });
            socket.emit('error', {
              code: 'QUEUE_LEAVE_FAILED',
              message:
                error instanceof Error
                  ? error.message
                  : 'Unable to cancel the paid queue entry.',
            });
          }
        })(),
        'queue.leave.refund_failed',
        {
          queueEntryId: removed.id,
          socketId: socket.id,
        }
      );
    });

    socket.on('room:leave', ({ roomCode }) => {
      const linked = findRoomBySocket(socket.id);
      if (!linked) return;

      const normalizedCode = normalizeRoomCode(roomCode);
      if (normalizedCode && linked.room.roomCode !== normalizedCode) {
        logAt('warn', 'room.leave.ignored_room_mismatch', {
          requestedRoomCode: normalizedCode,
          actualRoomCode: linked.room.roomCode,
          socketId: socket.id,
        });
        return;
      }

      const { room, player } = linked;
      socket.leave(room.roomCode);

      if (room.state === 'RUNNING') {
        const opponent = getRoomOpponent(room, player.playerId);
        if (!opponent) {
          removePlayerFromRoom(room, player.playerId);
          return;
        }
        player.connected = false;
        runInBackground(
          endMatch(room, opponent.playerId, player.playerId, 'disconnect_forfeit'),
          'match.end.background_failed',
          {
            roomCode: room.roomCode,
            winnerPlayerId: opponent.playerId,
            loserPlayerId: player.playerId,
            reason: 'disconnect_forfeit',
          }
        );
        logAt('warn', 'room.left.running_forfeit', {
          roomCode: room.roomCode,
          loserPlayerId: player.playerId,
        });
        return;
      }

      if (room.roomKind === 'paid_private' || room.roomKind === 'paid_queue') {
        runInBackground(
          closePaidRoomBeforeStart(
            room,
            'PAID_ROOM_CANCELLED',
            'Paid room cancelled before the match started. Entry fees were refunded.'
          ),
          'room.cancelled_before_start.background_failed',
          {
            roomCode: room.roomCode,
            roomKind: room.roomKind,
            code: 'PAID_ROOM_CANCELLED',
          }
        );
        return;
      }

      removePlayerFromRoom(room, player.playerId);
      logAt('info', 'room.left', {
        roomCode: room.roomCode,
        playerId: player.playerId,
        state: room.state,
      });
    });

    socket.on('room:ready', ({ roomCode }) => {
      const normalizedCode = normalizeRoomCode(roomCode);
      const room = rooms.get(normalizedCode);
      if (!room) return;
      const linked = findRoomBySocket(socket.id);
      if (!linked || linked.room.roomCode !== normalizedCode) {
        logAt('warn', 'room.ready.ignored_unlinked_socket', {
          roomCode: normalizedCode,
          socketId: socket.id,
        });
        return;
      }

      room.readyPlayerIds.add(linked.player.playerId);
      if (room.players.size === 2 && room.readyPlayerIds.size === 2) {
        room.state = 'READY';
      }
      logAt('info', 'room.ready.updated', {
        roomCode: normalizedCode,
        playerId: linked.player.playerId,
        readyCount: room.readyPlayerIds.size,
        players: room.players.size,
        state: room.state,
      });

      emitRoomState(room);
      startMatchIfReady(room);
    });

    socket.on('match:input', ({ t }) => {
      const linked = findRoomBySocket(socket.id);
      if (!linked || linked.room.state !== 'RUNNING') return;
      if (linked.player.lastInputAt && t < linked.player.lastInputAt) {
        logAt('debug', 'match.input.rejected_non_monotonic', {
          roomCode: linked.room.roomCode,
          playerId: linked.player.playerId,
          t,
          lastInputAt: linked.player.lastInputAt,
        });
        return;
      }
      linked.player.lastInputAt = t;
      linked.player.lastSeenAt = Date.now();
    });

    socket.on('match:state', (payload: MatchStatePacket) => {
      const linked = findRoomBySocket(socket.id);
      if (!linked || linked.room.state !== 'RUNNING') return;

      const { room, player } = linked;
      player.lastSeenAt = Date.now();

      if (!isValidMatchStatePayload(payload)) {
        logAt('warn', 'match.state.rejected_invalid_payload', {
          roomCode: room.roomCode,
          playerId: player.playerId,
        });
        return;
      }

      const previous = player.lastState;
      if (previous && payload.t < previous.t) {
        if (LOG_STATE_EVENTS) {
          logAt('debug', 'match.state.rejected_non_monotonic', {
            roomCode: room.roomCode,
            playerId: player.playerId,
            t: payload.t,
            prevT: previous.t,
          });
        }
        return;
      }

      if (previous) {
        const dt = Math.max(1, payload.t - previous.t);
        const maxScrollDelta = dt * MAX_DELTA_SCROLL_PER_MS;
        if (payload.scroll < previous.scroll || payload.scroll - previous.scroll > maxScrollDelta) {
          logAt('warn', 'match.state.rejected_scroll_bounds', {
            roomCode: room.roomCode,
            playerId: player.playerId,
            scroll: payload.scroll,
            prevScroll: previous.scroll,
            dt,
            maxScrollDelta,
          });
          return;
        }
      }

      player.lastState = payload;
      if (LOG_STATE_EVENTS) {
        logAt('debug', 'match.state.accepted', {
          roomCode: room.roomCode,
          playerId: player.playerId,
          t: payload.t,
          scroll: payload.scroll,
          normalizedY: payload.normalizedY,
          alive: payload.alive,
        });
      }

      const opponent = [...room.players.values()].find(
        (candidate) => candidate.playerId !== player.playerId
      );
      if (!opponent) return;

      io.to(opponent.socketId).emit('match:opponentState', {
        playerId: player.playerId,
        state: payload,
      });
    });

    socket.on('match:death', ({ score }) => {
      const linked = findRoomBySocket(socket.id);
      if (!linked || linked.room.state !== 'RUNNING') return;

      const { room, player } = linked;
      if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
        logAt('warn', 'match.death.rejected_invalid_score', {
          roomCode: room.roomCode,
          playerId: player.playerId,
          score,
        });
        return;
      }
      if (!player.alive) return;
      player.alive = false;

      const opponent = [...room.players.values()].find(
        (candidate) => candidate.playerId !== player.playerId
      );
      if (!opponent) return;

      runInBackground(
        endMatch(room, opponent.playerId, player.playerId, 'death'),
        'match.end.background_failed',
        {
          roomCode: room.roomCode,
          winnerPlayerId: opponent.playerId,
          loserPlayerId: player.playerId,
          reason: 'death',
        }
      );
      logAt('info', 'match.death.resolved', {
        roomCode: room.roomCode,
        loserPlayerId: player.playerId,
        winnerPlayerId: opponent.playerId,
        score,
      });
    });

    socket.on('session:heartbeat', () => {
      const linked = findRoomBySocket(socket.id);
      if (!linked) return;
      linked.player.lastSeenAt = Date.now();
      if (LOG_STATE_EVENTS) {
        logAt('debug', 'session.heartbeat', {
          roomCode: linked.room.roomCode,
          playerId: linked.player.playerId,
        });
      }
    });

    socket.on('disconnect', () => {
      const queuedEntry = removeQueueEntryBySocketId(socket.id);
      if (queuedEntry) {
        void paymentService
          .refundRealtimePaymentIntent(
            queuedEntry.walletPlayerId,
            queuedEntry.paymentIntentId,
            'Paid queue entry refunded after disconnect before match start'
          )
          .catch((error) => {
            logAt('warn', 'queue.disconnect.refund_failed', {
              queueEntryId: queuedEntry.id,
              message: error instanceof Error ? error.message : 'unknown',
            });
          });
      }

      const linked = findRoomBySocket(socket.id);
      if (!linked) {
        logAt('info', 'socket.disconnected_unlinked', { socketId: socket.id });
        return;
      }

      const { room, player } = linked;
      player.connected = false;
      logAt('warn', 'socket.disconnected', {
        socketId: socket.id,
        roomCode: room.roomCode,
        playerId: player.playerId,
        state: room.state,
      });

      if (room.state !== 'RUNNING') {
        if (room.roomKind === 'paid_private' || room.roomKind === 'paid_queue') {
          runInBackground(
            closePaidRoomBeforeStart(
              room,
              'PAID_ROOM_CANCELLED',
              'Paid room cancelled before the match started. Entry fees were refunded.'
            ),
            'room.cancelled_before_start.background_failed',
            {
              roomCode: room.roomCode,
              roomKind: room.roomKind,
              code: 'PAID_ROOM_CANCELLED',
            }
          );
          return;
        }

        pruneDisconnectedReadyPlayers(room.readyPlayerIds, room.players.values());
        if (room.state !== 'ENDED') {
          room.state = derivePreMatchState(room.players.size, room.readyPlayerIds.size);
        }
        emitRoomState(room);
        if (room.state !== 'ENDED' && room.players.size < 2) {
          scheduleRoomCleanup(room);
        }
        return;
      }

      beginReconnectWindow(room, player);
    });
  });

  setInterval(() => {
    const now = Date.now();
    for (const [roomCode, room] of rooms.entries()) {
      if (room.state === 'ENDED') continue;
      const connectedPlayerCount = [...room.players.values()].filter(
        (player) => player.connected
      ).length;
      if (
        now - room.createdAt > ROOM_TTL_MS &&
        room.state !== 'RUNNING' &&
        connectedPlayerCount < 2
      ) {
        if (room.roomKind === 'paid_private' || room.roomKind === 'paid_queue') {
          runInBackground(
            closePaidRoomBeforeStart(
              room,
              'PAID_ROOM_EXPIRED',
              'Paid room expired before the match started. Entry fees were refunded.'
            ),
            'room.cancelled_before_start.background_failed',
            {
              roomCode,
              roomKind: room.roomKind,
              code: 'PAID_ROOM_EXPIRED',
            }
          );
          continue;
        }
        for (const player of room.players.values()) {
          socketIndex.delete(player.socketId);
        }
        rooms.delete(roomCode);
        logAt('info', 'room.evicted_stale', { roomCode });
        continue;
      }

      let markedInactive = false;
      for (const player of room.players.values()) {
        if (player.connected && now - player.lastSeenAt > 15_000) {
          player.connected = false;
          markedInactive = true;
          logAt('warn', 'player.marked_inactive', {
            roomCode,
            playerId: player.playerId,
            idleMs: now - player.lastSeenAt,
          });
        }
      }

      if (markedInactive && room.state === 'RUNNING') {
        for (const player of room.players.values()) {
          beginReconnectWindow(room, player);
        }
        continue;
      }

      if (markedInactive && room.state !== 'RUNNING') {
        if (room.roomKind === 'paid_private' || room.roomKind === 'paid_queue') {
          runInBackground(
            closePaidRoomBeforeStart(
              room,
              'PAID_ROOM_CANCELLED',
              'Paid room cancelled before the match started. Entry fees were refunded.'
            ),
            'room.cancelled_before_start.background_failed',
            {
              roomCode,
              roomKind: room.roomKind,
              code: 'PAID_ROOM_CANCELLED',
            }
          );
          continue;
        }
        pruneDisconnectedReadyPlayers(room.readyPlayerIds, room.players.values());
        room.state = derivePreMatchState(room.players.size, room.readyPlayerIds.size);
        emitRoomState(room);
      }
    }
  }, 5_000);

  httpServer.listen(PORT, () => {
    logAt('info', 'server.started', {
      port: PORT,
      reconnectGraceMs: RECONNECT_GRACE_MS,
      roomTtlMs: ROOM_TTL_MS,
      logLevel: env.LOG_LEVEL,
      logStateEvents: LOG_STATE_EVENTS,
    });
  });

  return { app, httpServer, io };
};
