import type {
  MatchRoomKind,
  MatchResult,
  MatchStatePacket,
  PlayerSession,
  QueueJoinPayload,
  RoomCreatePayload,
  RoomJoinPayload,
  RoomSnapshot,
} from '../../shared/multiplayer-contracts';
import type { CharacterId } from '../../shared/characters';
import type { MatchStatus, MultiplayerResult, OpponentSnapshot } from '../../types/game';
import { resolveConfiguredBackendUrl } from '../backend/config';
import { createMultiplayerSocket, type MultiplayerSocket } from './socketClient';

export type MultiplayerViewState = {
  connected: boolean;
  connectionState: 'connected' | 'reconnecting' | 'forfeit_pending';
  roomCode: string | null;
  localPlayer: PlayerSession | null;
  opponent: PlayerSession | null;
  matchStatus: MatchStatus;
  countdownStartAt: number | null;
  reconnectSecondsRemaining: number | null;
  opponentSnapshot: OpponentSnapshot | null;
  multiplayerResult: MultiplayerResult | null;
  errorMessage: string | null;
  serverUrl: string;
  pendingAction:
    | 'none'
    | 'creating_room'
    | 'joining_room'
    | 'readying'
    | 'queueing'
    | 'leaving_queue';
  localReady: boolean;
  opponentReady: boolean;
  roomKind: MatchRoomKind;
  tokenId: string | null;
  entryFeeTierId: string | null;
  localFunded: boolean;
  opponentFunded: boolean;
  queueStatus: 'idle' | 'queued' | 'matched';
  queueEntryId: string | null;
};

const initialViewState: MultiplayerViewState = {
  connected: false,
  connectionState: 'connected',
  roomCode: null,
  localPlayer: null,
  opponent: null,
  matchStatus: 'idle',
  countdownStartAt: null,
  reconnectSecondsRemaining: null,
  opponentSnapshot: null,
  multiplayerResult: null,
  errorMessage: null,
  serverUrl: '',
  pendingAction: 'none',
  localReady: false,
  opponentReady: false,
  roomKind: 'casual',
  tokenId: null,
  entryFeeTierId: null,
  localFunded: false,
  opponentFunded: false,
  queueStatus: 'idle',
  queueEntryId: null,
};

const CREATE_ROOM_DEBUG_TIMEOUT_MS = 10_000;
const MULTIPLAYER_DEBUG_PREFIX = '[multiplayer]';

export class MultiplayerMatchController {
  private socket: MultiplayerSocket;
  private serverUrl: string;
  private listeners = new Set<(state: MultiplayerViewState) => void>();
  private opponentListeners = new Set<(snapshot: OpponentSnapshot | null) => void>();
  private state: MultiplayerViewState = initialViewState;
  private clientId: string;
  private pendingCreate: RoomCreatePayload | null = null;
  private pendingJoin: RoomJoinPayload | null = null;
  private pendingQueueJoin: QueueJoinPayload | null = null;
  private lastStateSentAt = 0;
  private lastSentState: Omit<MatchStatePacket, 't'> | null = null;
  private countdownTimer: ReturnType<typeof setTimeout> | null = null;
  private createRoomDebugTimer: ReturnType<typeof setTimeout> | null = null;
  private createRoomTimeout: ReturnType<typeof setTimeout> | null = null;
  private intentionallyDisconnecting = false;
  private static readonly CREATE_ROOM_TIMEOUT_MS = 18_000;

  constructor(serverUrl = resolveConfiguredBackendUrl()) {
    this.serverUrl = serverUrl;
    this.socket = createMultiplayerSocket(serverUrl);
    this.clientId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    this.state = {
      ...this.state,
      serverUrl: this.serverUrl,
    };
    this.registerSocketHandlers();
  }

  private emitState() {
    const snapshot = this.getState();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private emitOpponentSnapshot(snapshot: OpponentSnapshot | null) {
    this.opponentListeners.forEach((listener) => listener(snapshot));
  }

  private logDebug(event: string, context?: Record<string, unknown>) {
    const payload = {
      ts: new Date().toISOString(),
      serverUrl: this.serverUrl,
      connected: this.socket.connected,
      pendingAction: this.state.pendingAction,
      roomCode: this.state.roomCode,
      ...context,
    };
    console.log(`${MULTIPLAYER_DEBUG_PREFIX} ${event}`, payload);
  }

  private setState(partial: Partial<MultiplayerViewState>) {
    this.state = { ...this.state, ...partial };
    this.emitState();
  }

  private leaveRoomIfNeeded() {
    if (!this.socket.connected || !this.state.roomCode) return;
    this.socket.emit('room:leave', { roomCode: this.state.roomCode });
  }

  private leaveQueueIfNeeded() {
    if (!this.socket.connected || !this.state.queueEntryId) return;
    this.socket.emit('queue:leave', { queueEntryId: this.state.queueEntryId });
  }

  private clearCreateRoomDebugTimer() {
    if (!this.createRoomDebugTimer) return;
    clearTimeout(this.createRoomDebugTimer);
    this.createRoomDebugTimer = null;
  }

  private scheduleCreateRoomDebugTimer() {
    this.clearCreateRoomDebugTimer();
    this.createRoomDebugTimer = setTimeout(() => {
      this.createRoomDebugTimer = null;
      if (this.state.pendingAction !== 'creating_room') return;
      this.logDebug('create_room.timeout', {
        clientId: this.clientId,
        hasPendingCreate: Boolean(this.pendingCreate),
        connectionState: this.state.connectionState,
        errorMessage: this.state.errorMessage,
      });
      this.setState({
        errorMessage:
          'Create room is still waiting on the multiplayer server. Check the console for [multiplayer] logs.',
      });
    }, CREATE_ROOM_DEBUG_TIMEOUT_MS);
  }

  private registerSocketHandlers() {
    this.socket.on('connect', () => {
      this.logDebug('socket.connect', { clientId: this.clientId });
      this.intentionallyDisconnecting = false;
      this.setState({
        connected: true,
        connectionState: 'connected',
        reconnectSecondsRemaining: null,
        errorMessage: null,
      });
      if (this.pendingCreate) {
        this.logDebug('socket.emit.room:create', {
          nickname: this.pendingCreate.nickname,
          characterId: this.pendingCreate.characterId,
          roomKind: this.pendingCreate.roomKind ?? 'casual',
          hasAccessToken: Boolean(this.pendingCreate.accessToken),
          hasPaymentIntentId: Boolean(this.pendingCreate.paymentIntentId),
        });
        this.socket.emit('room:create', this.pendingCreate);
        this.pendingCreate = null;
      }
      if (this.pendingJoin) {
        this.logDebug('socket.emit.room:join', {
          roomCode: this.pendingJoin.roomCode,
          nickname: this.pendingJoin.nickname,
          characterId: this.pendingJoin.characterId,
        });
        this.socket.emit('room:join', this.pendingJoin);
        this.pendingJoin = null;
      }
      if (this.pendingQueueJoin) {
        this.socket.emit('queue:join', this.pendingQueueJoin);
      }
      if (
        !this.pendingCreate &&
        !this.pendingJoin &&
        !this.pendingQueueJoin &&
        this.state.roomCode &&
        this.state.localPlayer
      ) {
        this.socket.emit('room:join', {
          roomCode: this.state.roomCode,
          nickname: this.state.localPlayer.nickname,
          clientId: this.clientId,
          characterId: this.state.localPlayer.characterId,
          customCharacterVersionId: this.state.localPlayer.customCharacterVersionId,
        });
      }
    });

    this.socket.on('disconnect', (reason) => {
      this.logDebug('socket.disconnect', { reason });
      this.clearCountdownTimer();
      this.clearCreateRoomDebugTimer();
      if (this.intentionallyDisconnecting) {
        this.intentionallyDisconnecting = false;
        this.setState({
          connected: false,
          connectionState: 'connected',
          reconnectSecondsRemaining: null,
          pendingAction: 'none',
        });
        return;
      }
      this.setState({ connected: false, connectionState: 'reconnecting' });
    });

    this.socket.on('connect_error', (error) => {
      this.logDebug('socket.connect_error', {
        message: error.message,
        name: error.name,
      });
      this.intentionallyDisconnecting = false;
      this.clearCreateRoomDebugTimer();
      this.clearCreateRoomTimeout();
      const reason = error.message || 'connection failed';
      this.setState({
        connected: false,
        connectionState: 'reconnecting',
        pendingAction: 'none',
        errorMessage: `Cannot reach server at ${this.serverUrl}. ${reason}`,
      });
    });

    this.socket.on('room:created', ({ roomCode, player, roomKind }) => {
      this.clearCreateRoomDebugTimer();
      this.clearCreateRoomTimeout();
      this.logDebug('socket.room:created', {
        roomCode,
        playerId: player.playerId,
        nickname: player.nickname,
        roomKind: roomKind ?? this.state.roomKind,
      });
      this.setState({
        roomCode,
        localPlayer: player,
        matchStatus: 'lobby',
        multiplayerResult: null,
        pendingAction: 'none',
        errorMessage: null,
        roomKind: roomKind ?? this.state.roomKind,
        queueStatus: roomKind === 'paid_queue' ? 'matched' : 'idle',
        queueEntryId: null,
      });
    });

    this.socket.on('room:state', (room) => {
      if (this.state.pendingAction === 'creating_room') {
        this.logDebug('socket.room:state_while_creating', {
          incomingRoomCode: room.roomCode,
          playerCount: room.players.length,
          state: room.state,
        });
      }
      this.syncRoomState(room);
    });

    this.socket.on('match:start', ({ startAt }) => {
      this.clearCountdownTimer();
      this.setState({
        matchStatus: 'countdown',
        countdownStartAt: startAt,
        multiplayerResult: null,
        pendingAction: 'none',
      });
      const delay = Math.max(0, startAt - Date.now());
      this.countdownTimer = setTimeout(() => {
        this.countdownTimer = null;
        this.setState({ matchStatus: 'running' });
      }, delay + 50);
    });

    this.socket.on('match:opponentState', ({ playerId, state }) => {
      const opponent = this.state.opponent;
      if (!opponent || opponent.playerId !== playerId) return;

      const snapshot: OpponentSnapshot = {
        playerId,
        nickname: opponent.nickname,
        normalizedY: state.normalizedY,
        gravityDir: state.gravityDir,
        scroll: state.scroll,
        alive: state.alive,
        score: state.score,
        t: state.t,
        frameIndex: state.frameIndex ?? 0,
        velocityY: state.velocityY ?? 0,
        flipLocked: state.flipLocked ?? 0,
        countdownLocked: state.countdownLocked ?? 0,
      };
      this.state = {
        ...this.state,
        opponentSnapshot: snapshot,
      };
      this.emitOpponentSnapshot(snapshot);
    });

    this.socket.on('match:result', (result: MatchResult) => {
      this.clearCountdownTimer();
      const localPlayerId = this.state.localPlayer?.playerId;
      const localizedReason: MultiplayerResult['reason'] =
        result.reason === 'disconnect_forfeit' &&
        Boolean(localPlayerId) &&
        result.winnerPlayerId === localPlayerId
          ? 'opponent_disconnect_forfeit'
          : result.reason;
      const localizedResult: MultiplayerResult = {
        ...result,
        reason: localizedReason,
      };
      this.setState({
        matchStatus: 'result',
        multiplayerResult: localizedResult,
        opponentSnapshot: null,
        reconnectSecondsRemaining: null,
        connectionState: this.state.connected ? 'connected' : this.state.connectionState,
      });
      this.emitOpponentSnapshot(null);
    });

    this.socket.on('session:reconnectWindow', ({ playerId, secondsRemaining }) => {
      const isLocal = this.state.localPlayer?.playerId === playerId;
      this.setState({
        reconnectSecondsRemaining: secondsRemaining,
        connectionState: isLocal ? 'forfeit_pending' : this.state.connectionState,
      });
    });

    this.socket.on('queue:state', ({ status, queueEntryId, tokenId, entryFeeTierId, message }) => {
      this.pendingQueueJoin = null;
      this.setState({
        pendingAction: 'none',
        queueStatus: status,
        queueEntryId: queueEntryId ?? null,
        tokenId: tokenId ?? this.state.tokenId,
        entryFeeTierId: entryFeeTierId ?? this.state.entryFeeTierId,
        errorMessage: message ?? null,
      });
    });

    this.socket.on('error', ({ code, message }) => {
      this.clearCreateRoomDebugTimer();
      this.clearCreateRoomTimeout();
      this.logDebug('socket.error', { code, message });
      if (code === 'PAID_ROOM_CANCELLED' || code === 'PAID_ROOM_EXPIRED') {
        this.clearCountdownTimer();
        this.pendingCreate = null;
        this.pendingJoin = null;
        this.pendingQueueJoin = null;
        this.state = {
          ...initialViewState,
          connected: this.socket.connected,
          serverUrl: this.serverUrl,
          errorMessage: message,
        };
        this.emitState();
        this.emitOpponentSnapshot(null);
        return;
      }

      this.setState({ errorMessage: message, pendingAction: 'none' });
    });
  }

  private clearCountdownTimer() {
    if (!this.countdownTimer) return;
    clearTimeout(this.countdownTimer);
    this.countdownTimer = null;
  }

  private clearCreateRoomTimeout() {
    if (!this.createRoomTimeout) return;
    clearTimeout(this.createRoomTimeout);
    this.createRoomTimeout = null;
  }

  private syncRoomState(room: RoomSnapshot) {
    const localByClientId =
      room.players.find((player) => player.clientId === this.clientId) ?? null;
    const localPlayer = localByClientId;
    if (!localPlayer) {
      return;
    }
    const opponent = localPlayer
      ? (room.players.find((player) => player.playerId !== localPlayer.playerId) ?? null)
      : null;

    const status: MatchStatus =
      room.state === 'RUNNING'
        ? 'running'
        : room.state === 'COUNTDOWN'
          ? 'countdown'
          : room.state === 'ENDED'
            ? 'result'
            : 'lobby';

    if (status !== 'countdown') {
      this.clearCountdownTimer();
    }
    if (status !== 'running' && this.state.opponentSnapshot) {
      this.emitOpponentSnapshot(null);
    }

    const clearReconnect =
      status !== 'running' || (localPlayer ? localPlayer.connected : this.state.connected);
    const nextConnectionState = this.state.connected
      ? clearReconnect
        ? 'connected'
        : this.state.connectionState
      : 'reconnecting';

    this.setState({
      roomCode: room.roomCode,
      roomKind: room.roomKind ?? 'casual',
      tokenId: room.tokenId ?? null,
      entryFeeTierId: room.entryFeeTierId ?? null,
      localPlayer,
      opponent,
      matchStatus: status,
      countdownStartAt: status === 'countdown' ? this.state.countdownStartAt : null,
      pendingAction: 'none',
      localReady: localPlayer ? room.readyPlayerIds.includes(localPlayer.playerId) : false,
      opponentReady: opponent ? room.readyPlayerIds.includes(opponent.playerId) : false,
      localFunded: localPlayer
        ? Boolean(room.fundedPlayerIds?.includes(localPlayer.playerId))
        : false,
      opponentFunded: opponent ? Boolean(room.fundedPlayerIds?.includes(opponent.playerId)) : false,
      queueStatus: room.roomKind === 'paid_queue' ? 'matched' : this.state.queueStatus,
      queueEntryId: room.roomKind === 'paid_queue' ? null : this.state.queueEntryId,
      opponentSnapshot: status === 'running' ? this.state.opponentSnapshot : null,
      reconnectSecondsRemaining: clearReconnect ? null : this.state.reconnectSecondsRemaining,
      connectionState: nextConnectionState,
      errorMessage: null,
    });
  }

  getState() {
    return { ...this.state };
  }

  subscribe(listener: (state: MultiplayerViewState) => void) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeOpponentSnapshot(listener: (snapshot: OpponentSnapshot | null) => void) {
    this.opponentListeners.add(listener);
    listener(this.state.opponentSnapshot);
    return () => {
      this.opponentListeners.delete(listener);
    };
  }

  connect() {
    if (!this.socket.connected) {
      this.logDebug('socket.connect_called', { clientId: this.clientId });
      this.socket.connect();
    }
  }

  disconnect() {
    this.clearCountdownTimer();
    this.clearCreateRoomDebugTimer();
    this.clearCreateRoomTimeout();
    this.pendingCreate = null;
    this.pendingJoin = null;
    this.pendingQueueJoin = null;
    this.leaveQueueIfNeeded();
    this.leaveRoomIfNeeded();
    if (!this.socket.connected) return;
    this.intentionallyDisconnecting = true;
    this.socket.disconnect();
  }

  createRoom(
    nickname: string,
    characterId: CharacterId,
    options?: {
      accessToken?: string;
      roomKind?: MatchRoomKind;
      tokenId?: string;
      entryFeeTierId?: string;
      paymentIntentId?: string;
      customCharacterVersionId?: string;
    }
  ) {
    const safeNickname = nickname.trim() || 'Player 1';
    const payload = {
      nickname: safeNickname,
      clientId: this.clientId,
      characterId,
      customCharacterVersionId: options?.customCharacterVersionId,
      accessToken: options?.accessToken,
      roomKind: options?.roomKind,
      tokenId: options?.tokenId,
      entryFeeTierId: options?.entryFeeTierId,
      paymentIntentId: options?.paymentIntentId,
    };
    this.pendingJoin = null;
    this.pendingQueueJoin = null;
    this.pendingCreate = payload;
    this.logDebug('create_room.requested', {
      nickname: safeNickname,
      characterId,
      roomKind: options?.roomKind ?? 'casual',
      hasAccessToken: Boolean(options?.accessToken),
      hasPaymentIntentId: Boolean(options?.paymentIntentId),
    });
    this.scheduleCreateRoomDebugTimer();
    this.leaveQueueIfNeeded();
    this.leaveRoomIfNeeded();
    this.setState({
      errorMessage: null,
      pendingAction: 'creating_room',
      roomCode: null,
      localPlayer: null,
      opponent: null,
      localReady: false,
      opponentReady: false,
      matchStatus: 'idle',
      multiplayerResult: null,
      reconnectSecondsRemaining: null,
      opponentSnapshot: null,
      roomKind: options?.roomKind ?? 'casual',
      tokenId: options?.tokenId ?? null,
      entryFeeTierId: options?.entryFeeTierId ?? null,
      localFunded: Boolean(options?.paymentIntentId),
      opponentFunded: false,
      queueStatus: 'idle',
      queueEntryId: null,
    });
    this.emitOpponentSnapshot(null);
    this.clearCreateRoomTimeout();
    this.connect();
    if (this.socket.connected) {
      this.logDebug('socket.emit.room:create.immediate', {
        nickname: payload.nickname,
        characterId: payload.characterId,
        roomKind: payload.roomKind ?? 'casual',
      });
      this.socket.emit('room:create', payload);
      this.pendingCreate = null;
    }
    this.createRoomTimeout = setTimeout(() => {
      this.createRoomTimeout = null;
      if (this.state.pendingAction !== 'creating_room') return;
      this.pendingCreate = null;
      this.setState({
        pendingAction: 'none',
        errorMessage: `Connection timed out. Check that ${this.serverUrl} is reachable.`,
      });
    }, MultiplayerMatchController.CREATE_ROOM_TIMEOUT_MS);
  }

  joinRoom(
    roomCode: string,
    nickname: string,
    characterId: CharacterId,
    options?: {
      accessToken?: string;
      roomKind?: MatchRoomKind;
      tokenId?: string;
      entryFeeTierId?: string;
      paymentIntentId?: string;
      customCharacterVersionId?: string;
    }
  ) {
    const safeNickname = nickname.trim() || 'Player';
    const normalizedCode = roomCode.trim().toUpperCase();
    const payload = {
      roomCode: normalizedCode,
      nickname: safeNickname,
      clientId: this.clientId,
      characterId,
      customCharacterVersionId: options?.customCharacterVersionId,
      accessToken: options?.accessToken,
      roomKind: options?.roomKind,
      tokenId: options?.tokenId,
      entryFeeTierId: options?.entryFeeTierId,
      paymentIntentId: options?.paymentIntentId,
    };
    this.pendingCreate = null;
    this.pendingQueueJoin = null;
    this.pendingJoin = payload;
    this.leaveQueueIfNeeded();
    this.leaveRoomIfNeeded();
    this.setState({
      errorMessage: null,
      pendingAction: 'joining_room',
      roomCode: null,
      localPlayer: null,
      opponent: null,
      localReady: false,
      opponentReady: false,
      matchStatus: 'idle',
      multiplayerResult: null,
      reconnectSecondsRemaining: null,
      opponentSnapshot: null,
      roomKind: options?.roomKind ?? 'casual',
      tokenId: options?.tokenId ?? null,
      entryFeeTierId: options?.entryFeeTierId ?? null,
      localFunded: Boolean(options?.paymentIntentId),
      opponentFunded: false,
      queueStatus: 'idle',
      queueEntryId: null,
    });
    this.emitOpponentSnapshot(null);
    this.connect();
    if (this.socket.connected) {
      this.socket.emit('room:join', payload);
      this.pendingJoin = null;
    }
  }

  joinPaidQueue(
    nickname: string,
    characterId: CharacterId,
    options: {
      accessToken: string;
      tokenId: string;
      entryFeeTierId: string;
      paymentIntentId: string;
      customCharacterVersionId?: string;
    }
  ) {
    const payload: QueueJoinPayload = {
      nickname: nickname.trim() || 'Player',
      clientId: this.clientId,
      characterId,
      customCharacterVersionId: options.customCharacterVersionId,
      accessToken: options.accessToken,
      tokenId: options.tokenId,
      entryFeeTierId: options.entryFeeTierId,
      paymentIntentId: options.paymentIntentId,
    };

    this.pendingCreate = null;
    this.pendingJoin = null;
    this.pendingQueueJoin = payload;
    this.leaveRoomIfNeeded();
    this.setState({
      errorMessage: null,
      pendingAction: 'queueing',
      roomCode: null,
      localPlayer: null,
      opponent: null,
      localReady: false,
      opponentReady: false,
      matchStatus: 'idle',
      multiplayerResult: null,
      reconnectSecondsRemaining: null,
      opponentSnapshot: null,
      roomKind: 'paid_queue',
      tokenId: options.tokenId,
      entryFeeTierId: options.entryFeeTierId,
      localFunded: true,
      opponentFunded: false,
      queueStatus: 'queued',
      queueEntryId: null,
    });
    this.emitOpponentSnapshot(null);
    this.connect();
    if (this.socket.connected) {
      this.socket.emit('queue:join', payload);
    }
  }

  leavePaidQueue() {
    if (!this.state.queueEntryId && !this.pendingQueueJoin) return;

    const queueEntryId = this.state.queueEntryId;
    this.pendingQueueJoin = null;
    this.setState({
      pendingAction: 'leaving_queue',
    });

    if (this.socket.connected) {
      this.socket.emit('queue:leave', { queueEntryId: queueEntryId ?? undefined });
    }
  }

  readyUp() {
    if (!this.state.roomCode || this.state.pendingAction === 'readying' || this.state.localReady)
      return;
    if (!this.socket.connected) return;
    this.setState({ pendingAction: 'readying' });
    this.socket.emit('room:ready', { roomCode: this.state.roomCode });
  }

  sendHeartbeat() {
    if (!this.socket.connected) return;
    this.socket.emit('session:heartbeat', { t: Date.now() });
  }

  sendInput(inputType: 'flip') {
    if (!this.socket.connected || this.state.matchStatus !== 'running') return;
    this.socket.emit('match:input', {
      t: Date.now(),
      inputType,
    });
  }

  sendState(payload: Omit<MatchStatePacket, 't'>) {
    if (!this.socket.connected || this.state.matchStatus !== 'running' || !this.state.roomCode) {
      return;
    }
    const now = Date.now();
    const minIntervalMs = 66; // ~15Hz uplink for mobile reliability
    const prev = this.lastSentState;
    const smallDelta =
      prev &&
      Math.abs(prev.normalizedY - payload.normalizedY) < 0.004 &&
      Math.abs(prev.scroll - payload.scroll) < 1.25 &&
      prev.gravityDir === payload.gravityDir &&
      prev.alive === payload.alive;
    if (now - this.lastStateSentAt < minIntervalMs && smallDelta) {
      return;
    }

    this.lastStateSentAt = now;
    this.lastSentState = payload;
    this.socket.emit('match:state', {
      ...payload,
      t: now,
    });
  }

  reportDeath(score: number) {
    if (!this.socket.connected || this.state.matchStatus !== 'running') return;
    this.socket.emit('match:death', {
      t: Date.now(),
      score,
    });
  }

  resetLobbyState() {
    this.clearCountdownTimer();
    this.clearCreateRoomDebugTimer();
    this.pendingCreate = null;
    this.pendingJoin = null;
    this.pendingQueueJoin = null;
    this.leaveQueueIfNeeded();
    this.leaveRoomIfNeeded();
    this.state = {
      ...initialViewState,
      connected: this.socket.connected,
      serverUrl: this.serverUrl,
      pendingAction: 'none',
      localReady: false,
      opponentReady: false,
    };
    this.lastSentState = null;
    this.lastStateSentAt = 0;
    this.emitState();
    this.emitOpponentSnapshot(null);
  }
}
