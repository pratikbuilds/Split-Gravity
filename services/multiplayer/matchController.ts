import type {
  CharacterPose,
  MatchPhase,
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

type PendingAction = MultiplayerViewState['pendingAction'];
type ActivePendingAction = Exclude<PendingAction, 'none'>;

const PENDING_ACTION_TIMEOUT_MS = 10_000;

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
  private lastSentState: Omit<MatchStatePacket, 't' | 'seq'> | null = null;
  private lastSentSeq = 0;
  private countdownTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRequestTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionallyDisconnecting = false;

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

  private debugLog(event: string, details?: Record<string, unknown>) {
    if (typeof __DEV__ === 'undefined' || !__DEV__) return;
    if (details) {
      console.info(`[multiplayer] ${event}`, details);
      return;
    }
    console.info(`[multiplayer] ${event}`);
  }

  private buildBaselineOpponentSnapshot(
    phase: MatchPhase,
    options?: {
      t?: number;
      pose?: CharacterPose;
      localPlayer?: PlayerSession | null;
      opponent?: PlayerSession | null;
    }
  ): OpponentSnapshot | null {
    const localPlayer = options?.localPlayer ?? this.state.localPlayer;
    const opponent = options?.opponent ?? this.state.opponent;
    if (!localPlayer || !opponent) return null;
    const localStartsBottom = localPlayer.playerId.localeCompare(opponent.playerId) <= 0;
    const opponentGravityDir: 1 | -1 = localStartsBottom ? -1 : 1;
    const existing = this.state.opponentSnapshot;
    const defaultPose: CharacterPose = phase === 'running' ? 'run' : 'idle';

    return {
      playerId: opponent.playerId,
      nickname: opponent.nickname,
      phase,
      pose: options?.pose ?? defaultPose,
      seq: existing?.playerId === opponent.playerId ? existing.seq : 0,
      normalizedY: opponentGravityDir === -1 ? 0 : 1,
      gravityDir: opponentGravityDir,
      scroll: phase === 'running' ? (existing?.scroll ?? 0) : 0,
      charX: existing?.playerId === opponent.playerId ? existing.charX : 0,
      alive: phase === 'result' ? Boolean(opponent.alive) : true,
      score: phase === 'running' ? (existing?.score ?? 0) : 0,
      t: options?.t ?? Date.now(),
      frameIndex: existing?.playerId === opponent.playerId ? existing.frameIndex : 0,
      velocityY: 0,
      velocityX: 0,
      flipLocked: 0,
      countdownLocked: phase === 'running' ? 0 : 1,
    };
  }

  private isGameplayActive(now = Date.now()) {
    if (this.state.matchStatus === 'running') return true;
    return (
      this.state.matchStatus === 'countdown' &&
      this.state.countdownStartAt != null &&
      now >= this.state.countdownStartAt
    );
  }

  private promoteOpponentSnapshotToRunning(snapshot: OpponentSnapshot | null): OpponentSnapshot | null {
    if (!snapshot) return null;
    if (snapshot.phase === 'running' && snapshot.countdownLocked === 0) {
      return snapshot;
    }
    const promoted: OpponentSnapshot = {
      ...snapshot,
      phase: 'running',
      pose: snapshot.alive ? (snapshot.pose === 'idle' ? 'run' : snapshot.pose) : 'fall',
      countdownLocked: 0,
      t: Math.max(snapshot.t, Date.now()),
    };
    return promoted;
  }

  private resetOutgoingStateTracking() {
    this.lastSentState = null;
    this.lastStateSentAt = 0;
    this.lastSentSeq = 0;
  }

  private setState(partial: Partial<MultiplayerViewState>) {
    this.state = { ...this.state, ...partial };
    this.emitState();
  }

  private clearPendingRequestTimer() {
    if (!this.pendingRequestTimer) return;
    clearTimeout(this.pendingRequestTimer);
    this.pendingRequestTimer = null;
  }

  private clearPendingPayloads(action?: ActivePendingAction) {
    if (!action || action === 'creating_room') {
      this.pendingCreate = null;
    }
    if (!action || action === 'joining_room') {
      this.pendingJoin = null;
    }
    if (!action || action === 'queueing' || action === 'leaving_queue') {
      this.pendingQueueJoin = null;
    }
  }

  private getPendingTimeoutMessage(action: ActivePendingAction) {
    switch (action) {
      case 'creating_room':
        return 'Room creation timed out. Check the connection and try again.';
      case 'joining_room':
        return 'Joining the room timed out. Check the room code and try again.';
      case 'queueing':
        return 'Queue join timed out. Try again in a moment.';
      case 'leaving_queue':
        return 'Leaving the queue timed out. Try again in a moment.';
      case 'readying':
        return 'Ready confirmation timed out. Try again.';
    }
  }

  private getPendingRollbackState(action?: ActivePendingAction): Partial<MultiplayerViewState> {
    if (action === 'queueing') {
      return {
        queueStatus: 'idle',
        queueEntryId: null,
      };
    }
    if (action === 'leaving_queue') {
      return {
        queueStatus: this.state.queueEntryId ? 'queued' : 'idle',
      };
    }
    return {};
  }

  private beginPendingRequest(action: ActivePendingAction) {
    this.clearPendingRequestTimer();
    this.pendingRequestTimer = setTimeout(() => {
      if (this.state.pendingAction !== action) return;

      this.debugLog('request.timeout', {
        action,
        serverUrl: this.serverUrl,
        connected: this.socket.connected,
      });
      this.clearPendingPayloads(action);
      this.setState({
        pendingAction: 'none',
        errorMessage: this.getPendingTimeoutMessage(action),
        ...this.getPendingRollbackState(action),
      });
    }, PENDING_ACTION_TIMEOUT_MS);
  }

  private resolvePendingRequest(action?: ActivePendingAction) {
    this.clearPendingRequestTimer();
    this.clearPendingPayloads(action);
  }

  private leaveRoomIfNeeded() {
    if (!this.socket.connected || !this.state.roomCode) return;
    this.socket.emit('room:leave', { roomCode: this.state.roomCode });
  }

  private leaveQueueIfNeeded() {
    if (!this.socket.connected || !this.state.queueEntryId) return;
    this.socket.emit('queue:leave', { queueEntryId: this.state.queueEntryId });
  }

  private registerSocketHandlers() {
    this.socket.on('connect', () => {
      this.intentionallyDisconnecting = false;
      this.debugLog('socket.connected', { serverUrl: this.serverUrl });
      this.setState({
        connected: true,
        connectionState: 'connected',
        reconnectSecondsRemaining: null,
        errorMessage: null,
      });
      if (this.pendingCreate) {
        this.debugLog('room.create.emit', { roomKind: this.pendingCreate.roomKind ?? 'casual' });
        this.socket.emit('room:create', this.pendingCreate);
      }
      if (this.pendingJoin) {
        this.debugLog('room.join.emit', { roomCode: this.pendingJoin.roomCode });
        this.socket.emit('room:join', this.pendingJoin);
      }
      if (this.pendingQueueJoin) {
        this.debugLog('queue.join.emit', {
          tokenId: this.pendingQueueJoin.tokenId,
          entryFeeTierId: this.pendingQueueJoin.entryFeeTierId,
        });
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

    this.socket.on('disconnect', () => {
      this.clearCountdownTimer();
      this.debugLog('socket.disconnected', {
        intentional: this.intentionallyDisconnecting,
        pendingAction: this.state.pendingAction,
      });
      if (this.intentionallyDisconnecting) {
        this.intentionallyDisconnecting = false;
        this.resolvePendingRequest();
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
      this.intentionallyDisconnecting = false;
      const reason = error.message || 'connection failed';
      const pendingAction =
        this.state.pendingAction !== 'none' ? this.state.pendingAction : undefined;
      this.debugLog('socket.connect_error', {
        message: reason,
        pendingAction: this.state.pendingAction,
      });
      this.resolvePendingRequest();
      this.setState({
        connected: false,
        connectionState: 'reconnecting',
        pendingAction: 'none',
        errorMessage: `Cannot reach server at ${this.serverUrl}. ${reason}`,
        ...this.getPendingRollbackState(pendingAction),
      });
    });

    this.socket.on('room:created', ({ roomCode, player, roomKind }) => {
      this.debugLog('room.created', { roomCode, roomKind: roomKind ?? this.state.roomKind });
      this.resolvePendingRequest(
        this.state.pendingAction !== 'none' ? this.state.pendingAction : undefined
      );
      this.setState({
        roomCode,
        localPlayer: player,
        matchStatus: 'lobby',
        countdownStartAt: null,
        multiplayerResult: null,
        pendingAction: 'none',
        errorMessage: null,
        roomKind: roomKind ?? this.state.roomKind,
        queueStatus: roomKind === 'paid_queue' ? 'matched' : 'idle',
        queueEntryId: null,
      });
    });

    this.socket.on('room:state', (room) => {
      this.debugLog('room.state', {
        roomCode: room.roomCode,
        state: room.state,
        players: room.players.length,
      });
      this.syncRoomState(room);
    });

    this.socket.on('match:start', ({ startAt }) => {
      this.clearCountdownTimer();
      this.resolvePendingRequest();
      this.resetOutgoingStateTracking();
      const initialOpponentSnapshot = this.buildBaselineOpponentSnapshot('countdown', {
        t: startAt,
        pose: 'idle',
      });
      this.setState({
        matchStatus: 'countdown',
        countdownStartAt: startAt,
        opponentSnapshot: initialOpponentSnapshot,
        multiplayerResult: null,
        pendingAction: 'none',
      });
      this.emitOpponentSnapshot(initialOpponentSnapshot);
      const delay = Math.max(0, startAt - Date.now());
      this.countdownTimer = setTimeout(() => {
        this.countdownTimer = null;
        const runningSnapshot = this.promoteOpponentSnapshotToRunning(this.state.opponentSnapshot);
        this.setState({
          matchStatus: 'running',
          opponentSnapshot: runningSnapshot,
        });
        this.emitOpponentSnapshot(runningSnapshot);
      }, delay);
    });

    this.socket.on('match:opponentInput', ({ playerId, inputType, t }) => {
      const opponent = this.state.opponent;
      const snapshot = this.state.opponentSnapshot;
      if (!opponent || opponent.playerId !== playerId || !snapshot || !snapshot.alive) return;
      if (inputType !== 'flip' || (snapshot.phase !== 'running' && !this.isGameplayActive())) {
        return;
      }

      const optimisticSnapshot: OpponentSnapshot = {
        ...snapshot,
        phase: 'running',
        gravityDir: snapshot.gravityDir === 1 ? -1 : 1,
        pose: 'jump',
        velocityY: 0,
        velocityX: snapshot.velocityX > 0 ? snapshot.velocityX : 80,
        flipLocked: 1,
        countdownLocked: 0,
        t: Math.max(snapshot.t, t),
      };

      this.state = {
        ...this.state,
        opponentSnapshot: optimisticSnapshot,
      };
      this.emitOpponentSnapshot(optimisticSnapshot);
    });

    this.socket.on('match:opponentState', ({ playerId, state }) => {
      const opponent = this.state.opponent;
      if (!opponent || opponent.playerId !== playerId) return;
      if (
        this.state.opponentSnapshot &&
        this.state.opponentSnapshot.playerId === playerId &&
        state.seq < this.state.opponentSnapshot.seq
      ) {
        return;
      }

      const snapshot: OpponentSnapshot = {
        playerId,
        nickname: opponent.nickname,
        phase: state.phase,
        pose: state.pose,
        seq: state.seq,
        normalizedY: state.normalizedY,
        gravityDir: state.gravityDir,
        scroll: state.scroll,
        charX: state.charX,
        alive: state.alive,
        score: state.score,
        t: state.t,
        frameIndex: state.frameIndex ?? 0,
        velocityY: state.velocityY ?? 0,
        velocityX: state.velocityX ?? 0,
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
        countdownStartAt: null,
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
      this.debugLog('queue.state', { status, queueEntryId });
      this.resolvePendingRequest(
        this.state.pendingAction === 'queueing' || this.state.pendingAction === 'leaving_queue'
          ? this.state.pendingAction
          : undefined
      );
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
      const pendingAction =
        this.state.pendingAction !== 'none' ? this.state.pendingAction : undefined;
      this.debugLog('server.error', { code, message });
      if (code === 'PAID_ROOM_CANCELLED' || code === 'PAID_ROOM_EXPIRED') {
        this.clearCountdownTimer();
        this.resolvePendingRequest();
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

      this.resolvePendingRequest();
      this.setState({
        errorMessage: message,
        pendingAction: 'none',
        ...this.getPendingRollbackState(pendingAction),
      });
    });
  }

  private clearCountdownTimer() {
    if (!this.countdownTimer) return;
    clearTimeout(this.countdownTimer);
    this.countdownTimer = null;
  }

  private syncRoomState(room: RoomSnapshot) {
    const localByClientId =
      room.players.find((player) => player.clientId === this.clientId) ?? null;
    const localPlayer = localByClientId;
    if (!localPlayer) {
      return;
    }
    this.resolvePendingRequest(
      this.state.pendingAction !== 'none' ? this.state.pendingAction : undefined
    );
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

    let nextOpponentSnapshot: OpponentSnapshot | null = null;
    if (opponent) {
      if (status === 'lobby') {
        nextOpponentSnapshot = this.buildBaselineOpponentSnapshot('lobby', {
          t: room.startedAt ?? Date.now(),
          pose: 'idle',
          localPlayer,
          opponent,
        });
      } else if (status === 'countdown') {
        nextOpponentSnapshot = this.buildBaselineOpponentSnapshot('countdown', {
          t: room.startedAt ?? Date.now(),
          pose: 'idle',
          localPlayer,
          opponent,
        });
      } else if (status === 'running') {
        nextOpponentSnapshot =
          this.state.opponentSnapshot?.playerId === opponent.playerId
            ? {
                ...this.state.opponentSnapshot,
                phase: 'running',
                countdownLocked: 0,
              }
            : this.buildBaselineOpponentSnapshot('running', {
                localPlayer,
                opponent,
              });
      }
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
      countdownStartAt:
        status === 'countdown' || status === 'running'
          ? (room.startedAt ?? this.state.countdownStartAt)
          : null,
      pendingAction: 'none',
      localReady: localPlayer ? room.readyPlayerIds.includes(localPlayer.playerId) : false,
      opponentReady: opponent ? room.readyPlayerIds.includes(opponent.playerId) : false,
      localFunded: localPlayer
        ? Boolean(room.fundedPlayerIds?.includes(localPlayer.playerId))
        : false,
      opponentFunded: opponent ? Boolean(room.fundedPlayerIds?.includes(opponent.playerId)) : false,
      queueStatus: room.roomKind === 'paid_queue' ? 'matched' : this.state.queueStatus,
      queueEntryId: room.roomKind === 'paid_queue' ? null : this.state.queueEntryId,
      opponentSnapshot: nextOpponentSnapshot,
      reconnectSecondsRemaining: clearReconnect ? null : this.state.reconnectSecondsRemaining,
      connectionState: nextConnectionState,
      errorMessage: null,
    });
    this.emitOpponentSnapshot(nextOpponentSnapshot);
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
      this.socket.connect();
    }
  }

  disconnect() {
    this.clearCountdownTimer();
    this.clearPendingRequestTimer();
    this.clearPendingPayloads();
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
    this.resetOutgoingStateTracking();
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
      countdownStartAt: null,
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
    this.debugLog('room.create.requested', {
      roomKind: payload.roomKind ?? 'casual',
      connected: this.socket.connected,
    });
    this.emitOpponentSnapshot(null);
    this.connect();
    if (this.socket.connected) {
      this.debugLog('room.create.emit', {
        roomKind: payload.roomKind ?? 'casual',
        immediate: true,
      });
      this.socket.emit('room:create', payload);
    }
    this.beginPendingRequest('creating_room');
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
    this.resetOutgoingStateTracking();
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
      countdownStartAt: null,
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
    this.debugLog('room.join.requested', {
      roomCode: payload.roomCode,
      connected: this.socket.connected,
    });
    this.emitOpponentSnapshot(null);
    this.connect();
    if (this.socket.connected) {
      this.debugLog('room.join.emit', { roomCode: payload.roomCode, immediate: true });
      this.socket.emit('room:join', payload);
    }
    this.beginPendingRequest('joining_room');
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
    this.resetOutgoingStateTracking();
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
      countdownStartAt: null,
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
    this.debugLog('queue.join.requested', {
      tokenId: payload.tokenId,
      entryFeeTierId: payload.entryFeeTierId,
      connected: this.socket.connected,
    });
    this.emitOpponentSnapshot(null);
    this.connect();
    if (this.socket.connected) {
      this.debugLog('queue.join.emit', {
        tokenId: payload.tokenId,
        entryFeeTierId: payload.entryFeeTierId,
        immediate: true,
      });
      this.socket.emit('queue:join', payload);
    }
    this.beginPendingRequest('queueing');
  }

  leavePaidQueue() {
    if (!this.state.queueEntryId && !this.pendingQueueJoin) return;

    const queueEntryId = this.state.queueEntryId;
    this.pendingQueueJoin = null;
    this.setState({
      pendingAction: 'leaving_queue',
    });
    this.debugLog('queue.leave.requested', {
      queueEntryId,
      connected: this.socket.connected,
    });
    this.beginPendingRequest('leaving_queue');

    if (this.socket.connected) {
      this.socket.emit('queue:leave', { queueEntryId: queueEntryId ?? undefined });
    }
  }

  readyUp() {
    if (!this.state.roomCode || this.state.pendingAction === 'readying' || this.state.localReady)
      return;
    if (!this.socket.connected) return;
    this.setState({ pendingAction: 'readying' });
    this.debugLog('room.ready.requested', { roomCode: this.state.roomCode });
    this.beginPendingRequest('readying');
    this.socket.emit('room:ready', { roomCode: this.state.roomCode });
  }

  sendHeartbeat() {
    if (!this.socket.connected) return;
    this.socket.emit('session:heartbeat', { t: Date.now() });
  }

  sendInput(inputType: 'flip') {
    if (!this.socket.connected || !this.isGameplayActive()) return;
    this.socket.emit('match:input', {
      t: Date.now(),
      inputType,
    });
  }

  sendState(payload: Omit<MatchStatePacket, 't' | 'seq' | 'phase'>) {
    if (!this.socket.connected || !this.isGameplayActive() || !this.state.roomCode) {
      return;
    }
    const now = Date.now();
    const minIntervalMs = 16; // 60Hz uplink gives the remote replay path enough data to stay attached to platforms
    const nextPayload = {
      ...payload,
      phase: 'running' as const,
    };
    const prev = this.lastSentState;
    const smallDelta =
      prev &&
      Math.abs(prev.normalizedY - nextPayload.normalizedY) < 0.002 &&
      Math.abs(prev.scroll - nextPayload.scroll) < 0.5 &&
      Math.abs(prev.charX - nextPayload.charX) < 0.5 &&
      prev.gravityDir === nextPayload.gravityDir &&
      prev.alive === nextPayload.alive &&
      prev.pose === nextPayload.pose &&
      Math.abs((prev.velocityX ?? 0) - (nextPayload.velocityX ?? 0)) < 0.5 &&
      prev.flipLocked === nextPayload.flipLocked &&
      prev.countdownLocked === nextPayload.countdownLocked;
    if (now - this.lastStateSentAt < minIntervalMs && smallDelta) {
      return;
    }

    this.lastStateSentAt = now;
    this.lastSentState = nextPayload;
    this.lastSentSeq += 1;
    this.socket.emit('match:state', {
      ...nextPayload,
      seq: this.lastSentSeq,
      t: now,
    });
  }

  reportDeath(score: number) {
    if (!this.socket.connected || !this.isGameplayActive()) return;
    this.socket.emit('match:death', {
      t: Date.now(),
      score,
    });
  }

  /** Clear match result and stay in room (for rematch flow). */
  dismissResult() {
    if (this.state.multiplayerResult == null) return;
    this.setState({ multiplayerResult: null });
    this.emitState();
  }

  cancelPendingAction() {
    if (this.state.pendingAction === 'none') return;
    const pendingAction = this.state.pendingAction;
    this.debugLog('request.cancelled', { action: this.state.pendingAction });
    this.resolvePendingRequest();
    this.setState({
      pendingAction: 'none',
      errorMessage: null,
      ...this.getPendingRollbackState(pendingAction),
    });
  }

  resetLobbyState() {
    this.clearCountdownTimer();
    this.clearPendingRequestTimer();
    this.clearPendingPayloads();
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
    this.resetOutgoingStateTracking();
    this.emitState();
    this.emitOpponentSnapshot(null);
  }
}
