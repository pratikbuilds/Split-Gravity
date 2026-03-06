import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import type { CharacterId } from '../../shared/characters';
import type {
  ClientToServerEvents,
  MatchResult,
  MatchState,
  MatchStatePacket,
  PlayerSession,
  RoomSnapshot,
  ServerToClientEvents,
} from '../../shared/multiplayer-contracts';
import {
  MAX_SCORE,
  derivePreMatchState,
  isValidClientId,
  isValidMatchStatePayload,
  normalizeRoomCode,
  pruneDisconnectedReadyPlayers,
  sanitizeNickname,
} from './multiplayerGuards';

const PORT = Number(process.env.PORT || 4100);
const RECONNECT_GRACE_MS = 10_000;
const ROOM_TTL_MS = 2 * 60 * 1000;
const START_COUNTDOWN_MS = 2_000;
const MAX_DELTA_SCROLL_PER_MS = 0.5;
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
const LOG_STATE_EVENTS = process.env.LOG_STATE_EVENTS === '1';
const SUPPORTED_CHARACTER_IDS: readonly CharacterId[] = [
  'v3',
  'pri',
  'pixel',
  'raj',
  'tolymaster',
  'elon',
];
const DEFAULT_CHARACTER_ID: CharacterId = 'v3';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';
const LOG_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const isCharacterId = (value: unknown): value is CharacterId => {
  return typeof value === 'string' && SUPPORTED_CHARACTER_IDS.includes(value as CharacterId);
};

const logAt = (level: LogLevel, event: string, context?: Record<string, unknown>) => {
  if (LOG_PRIORITY[level] > LOG_PRIORITY[LOG_LEVEL]) return;
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...context,
  };
  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
};

interface ServerPlayer extends PlayerSession {
  socketId: string;
  lastSeenAt: number;
  lastState?: MatchStatePacket;
  lastInputAt?: number;
  disconnectTimer?: ReturnType<typeof setTimeout>;
  reconnectInterval?: ReturnType<typeof setInterval>;
}

interface Room {
  roomCode: string;
  state: MatchState;
  seed: number;
  createdAt: number;
  startedAt?: number;
  players: Map<string, ServerPlayer>;
  byClientId: Map<string, string>;
  readyPlayerIds: Set<string>;
  result?: MatchResult;
  cleanupTimer?: ReturnType<typeof setTimeout>;
}

const app = express();
app.use(cors());
app.get('/health', (_req: unknown, res: { json: (payload: { ok: boolean }) => void }) => {
  res.json({ ok: true });
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: '*',
  },
});

const rooms = new Map<string, Room>();

const createRoomCode = () => {
  let roomCode = '';
  while (!roomCode || rooms.has(roomCode)) {
    roomCode = Math.random().toString(36).slice(2, 7).toUpperCase();
  }
  return roomCode;
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

const snapshotRoom = (room: Room): RoomSnapshot => ({
  roomCode: room.roomCode,
  state: room.state,
  players: [...room.players.values()].map((player) => ({
    playerId: player.playerId,
    clientId: player.clientId,
    nickname: player.nickname,
    characterId: player.characterId,
    alive: player.alive,
    connected: player.connected,
  })),
  readyPlayerIds: [...room.readyPlayerIds],
});

const roomSummary = (room: Room) => ({
  roomCode: room.roomCode,
  state: room.state,
  players: [...room.players.values()].map((player) => ({
    playerId: player.playerId,
    nickname: player.nickname,
    characterId: player.characterId,
    alive: player.alive,
    connected: player.connected,
  })),
  readyCount: room.readyPlayerIds.size,
});

const emitRoomState = (room: Room) => {
  io.to(room.roomCode).emit('room:state', snapshotRoom(room));
  logAt('debug', 'room.state.emitted', roomSummary(room));
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
    rooms.delete(room.roomCode);
    logAt('info', 'room.cleanup.executed', { roomCode: room.roomCode });
  }, delayMs);
};

const removePlayerFromRoom = (room: Room, playerId: string) => {
  const player = room.players.get(playerId);
  if (!player) return;

  clearPlayerTimers(player);
  room.players.delete(playerId);
  room.byClientId.delete(player.clientId);
  room.readyPlayerIds.delete(playerId);

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

const endMatch = (
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
  for (const room of rooms.values()) {
    for (const player of room.players.values()) {
      if (player.socketId === socketId) {
        return { room, player };
      }
    }
  }
  return null;
};

io.on('connection', (socket) => {
  logAt('info', 'socket.connected', { socketId: socket.id });

  socket.on('room:create', ({ nickname, clientId, characterId }) => {
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

    const roomCode = createRoomCode();
    const playerId = randomUUID();
    const safeCharacterId = isCharacterId(characterId) ? characterId : DEFAULT_CHARACTER_ID;
    const room: Room = {
      roomCode,
      state: 'ROOM_OPEN',
      seed: Math.floor(Math.random() * 1_000_000_000),
      createdAt: Date.now(),
      players: new Map(),
      byClientId: new Map(),
      readyPlayerIds: new Set(),
    };

    const player: ServerPlayer = {
      playerId,
      clientId,
      nickname: sanitizeNickname(nickname, 'Player 1'),
      characterId: safeCharacterId,
      alive: true,
      connected: true,
      socketId: socket.id,
      lastSeenAt: Date.now(),
    };

    room.players.set(playerId, player);
    room.byClientId.set(clientId, playerId);
    rooms.set(roomCode, room);
    clearRoomCleanup(room);

    socket.join(roomCode);
    socket.emit('room:created', {
      roomCode,
      player,
    });
    logAt('info', 'room.created', {
      roomCode,
      playerId,
      clientId,
      nickname: player.nickname,
      characterId: player.characterId,
      socketId: socket.id,
    });
    emitRoomState(room);
  });

  socket.on('room:join', ({ roomCode, nickname, clientId, characterId }) => {
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

    let playerId = room.byClientId.get(clientId);
    let player = playerId ? room.players.get(playerId) : undefined;
    const safeCharacterId = isCharacterId(characterId) ? characterId : DEFAULT_CHARACTER_ID;

    if (player) {
      player.socketId = socket.id;
      player.connected = true;
      player.lastSeenAt = Date.now();
      player.nickname = sanitizeNickname(nickname, player.nickname);
      player.characterId = safeCharacterId;
      clearPlayerTimers(player);
      if (room.state !== 'RUNNING') {
        room.state = derivePreMatchState(room.players.size, room.readyPlayerIds.size);
      }
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

    playerId = randomUUID();
    player = {
      playerId,
      clientId,
      nickname: sanitizeNickname(nickname, 'Player 2'),
      characterId: safeCharacterId,
      alive: true,
      connected: true,
      socketId: socket.id,
      lastSeenAt: Date.now(),
    };

    room.players.set(playerId, player);
    room.byClientId.set(clientId, playerId);
    room.state = 'ROOM_FULL';

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
      const opponent = [...room.players.values()].find(
        (candidate) => candidate.playerId !== player.playerId
      );
      if (!opponent) {
        removePlayerFromRoom(room, player.playerId);
        return;
      }
      player.connected = false;
      endMatch(room, opponent.playerId, player.playerId, 'disconnect_forfeit');
      logAt('warn', 'room.left.running_forfeit', {
        roomCode: room.roomCode,
        loserPlayerId: player.playerId,
      });
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

  socket.on('match:state', (payload) => {
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

    endMatch(room, opponent.playerId, player.playerId, 'death');
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

    emitRoomState(room);

    const opponent = [...room.players.values()].find(
      (candidate) => candidate.playerId !== player.playerId
    );
    if (!opponent) {
      return;
    }

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
      endMatch(room, opponent.playerId, player.playerId, 'disconnect_forfeit');
      logAt('warn', 'match.disconnect_forfeit', {
        roomCode: room.roomCode,
        loserPlayerId: player.playerId,
      });
    }, RECONNECT_GRACE_MS);
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

    if (markedInactive && room.state !== 'RUNNING') {
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
    logLevel: LOG_LEVEL,
    logStateEvents: LOG_STATE_EVENTS,
  });
});
