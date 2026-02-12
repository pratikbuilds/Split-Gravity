import type {
  MatchResult,
  MatchStatePacket,
  PlayerSession,
  RoomSnapshot,
} from '../../shared/multiplayer-contracts';
import { NativeModules, Platform } from 'react-native';
import type { MatchStatus, MultiplayerResult, OpponentSnapshot } from '../../types/game';
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
  pendingAction: 'none' | 'creating_room' | 'joining_room' | 'readying';
  localReady: boolean;
  opponentReady: boolean;
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
};

const FALLBACK_SERVER_PORT = 4100;
const DEFAULT_MULTIPLAYER_SERVER_URL =
  'https://gravity-jump-production.up.railway.app';

const resolveConfiguredServerUrl = () => {
  const configuredUrl = process.env.EXPO_PUBLIC_MULTIPLAYER_URL?.trim();
  if (configuredUrl) return configuredUrl;
  return DEFAULT_MULTIPLAYER_SERVER_URL || resolveDefaultServerUrl();
};

const resolveDefaultServerUrl = () => {
  const sourceUrl: string | undefined = NativeModules?.SourceCode?.scriptURL;
  if (sourceUrl) {
    try {
      const parsed = new URL(sourceUrl);
      if (parsed.hostname) {
        return `http://${parsed.hostname}:${FALLBACK_SERVER_PORT}`;
      }
    } catch {
      // Ignore parse errors and fallback below.
    }
  }

  if (Platform.OS === 'android') {
    // Android emulator loopback to host machine.
    return `http://10.0.2.2:${FALLBACK_SERVER_PORT}`;
  }

  return `http://localhost:${FALLBACK_SERVER_PORT}`;
};

export class MultiplayerMatchController {
  private socket: MultiplayerSocket;
  private serverUrl: string;
  private listeners = new Set<(state: MultiplayerViewState) => void>();
  private state: MultiplayerViewState = initialViewState;
  private clientId: string;
  private pendingCreate: { nickname: string; clientId: string } | null = null;
  private pendingJoin: { roomCode: string; nickname: string; clientId: string } | null = null;
  private lastStateSentAt = 0;
  private lastSentState: Omit<MatchStatePacket, 't'> | null = null;
  private countdownTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(serverUrl = resolveConfiguredServerUrl()) {
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

  private setState(partial: Partial<MultiplayerViewState>) {
    this.state = { ...this.state, ...partial };
    this.emitState();
  }

  private registerSocketHandlers() {
    this.socket.on('connect', () => {
      this.setState({
        connected: true,
        connectionState: 'connected',
        reconnectSecondsRemaining: null,
        errorMessage: null,
      });
      if (this.pendingCreate) {
        this.socket.emit('room:create', this.pendingCreate);
        this.pendingCreate = null;
      }
      if (this.pendingJoin) {
        this.socket.emit('room:join', this.pendingJoin);
        this.pendingJoin = null;
      }
    });

    this.socket.on('disconnect', () => {
      this.clearCountdownTimer();
      this.setState({ connected: false, connectionState: 'reconnecting' });
    });

    this.socket.on('connect_error', (error) => {
      const reason = error.message || 'connection failed';
      this.setState({
        connected: false,
        connectionState: 'reconnecting',
        pendingAction: 'none',
        errorMessage: `Cannot reach server at ${this.serverUrl}. ${reason}`,
      });
    });

    this.socket.on('room:created', ({ roomCode, player }) => {
      this.setState({
        roomCode,
        localPlayer: player,
        matchStatus: 'lobby',
        multiplayerResult: null,
        pendingAction: 'none',
        errorMessage: null,
      });
    });

    this.socket.on('room:state', (room) => {
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
      };
      this.setState({ opponentSnapshot: snapshot });
    });

    this.socket.on('match:result', (result: MatchResult) => {
      this.clearCountdownTimer();
      this.setState({
        matchStatus: 'result',
        multiplayerResult: result,
        opponentSnapshot: null,
        reconnectSecondsRemaining: null,
        connectionState: this.state.connected ? 'connected' : this.state.connectionState,
      });
    });

    this.socket.on('session:reconnectWindow', ({ playerId, secondsRemaining }) => {
      const isLocal = this.state.localPlayer?.playerId === playerId;
      this.setState({
        reconnectSecondsRemaining: secondsRemaining,
        connectionState: isLocal ? 'forfeit_pending' : this.state.connectionState,
      });
    });

    this.socket.on('error', ({ message }) => {
      this.setState({ errorMessage: message, pendingAction: 'none' });
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
    const localPlayer = this.state.localPlayer ?? localByClientId;
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

    const clearReconnect =
      status !== 'running' || (localPlayer ? localPlayer.connected : this.state.connected);
    const nextConnectionState = this.state.connected
      ? clearReconnect
        ? 'connected'
        : this.state.connectionState
      : 'reconnecting';

    this.setState({
      roomCode: room.roomCode,
      localPlayer,
      opponent,
      matchStatus: status,
      countdownStartAt: status === 'countdown' ? this.state.countdownStartAt : null,
      pendingAction: 'none',
      localReady: localPlayer ? room.readyPlayerIds.includes(localPlayer.playerId) : false,
      opponentReady: opponent ? room.readyPlayerIds.includes(opponent.playerId) : false,
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

  connect() {
    if (!this.socket.connected) {
      this.socket.connect();
    }
  }

  disconnect() {
    this.clearCountdownTimer();
    this.pendingCreate = null;
    this.pendingJoin = null;
    this.socket.disconnect();
  }

  createRoom(nickname: string) {
    const safeNickname = nickname.trim() || 'Player 1';
    const payload = {
      nickname: safeNickname,
      clientId: this.clientId,
    };
    this.pendingJoin = null;
    this.pendingCreate = payload;
    this.setState({ errorMessage: null, pendingAction: 'creating_room' });
    this.connect();
    if (this.socket.connected) {
      this.socket.emit('room:create', payload);
      this.pendingCreate = null;
    }
  }

  joinRoom(roomCode: string, nickname: string) {
    const safeNickname = nickname.trim() || 'Player';
    const normalizedCode = roomCode.trim().toUpperCase();
    const payload = {
      roomCode: normalizedCode,
      nickname: safeNickname,
      clientId: this.clientId,
    };
    this.pendingCreate = null;
    this.pendingJoin = payload;
    this.setState({ errorMessage: null, pendingAction: 'joining_room' });
    this.connect();
    if (this.socket.connected) {
      this.socket.emit('room:join', payload);
      this.pendingJoin = null;
    }
  }

  readyUp() {
    if (!this.state.roomCode || this.state.pendingAction === 'readying' || this.state.localReady)
      return;
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
    this.socket.emit('match:death', {
      t: Date.now(),
      score,
    });
  }

  resetLobbyState() {
    this.clearCountdownTimer();
    this.pendingCreate = null;
    this.pendingJoin = null;
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
  }
}
