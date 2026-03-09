import type { CharacterId } from './characters';

export type MatchState = 'ROOM_OPEN' | 'ROOM_FULL' | 'READY' | 'COUNTDOWN' | 'RUNNING' | 'ENDED';
export type MatchRoomKind = 'casual' | 'paid_private' | 'paid_queue';

export type ConnectionState = 'connected' | 'reconnecting' | 'forfeit_pending';

export interface PlayerSession {
  playerId: string;
  clientId: string;
  nickname: string;
  characterId: CharacterId;
  customCharacterVersionId?: string;
  alive: boolean;
  connected: boolean;
}

export interface MatchConfig {
  reconnectGraceMs: number;
}

export interface RoomSnapshot {
  roomCode: string;
  state: MatchState;
  roomKind?: MatchRoomKind;
  tokenId?: string | null;
  entryFeeTierId?: string | null;
  players: PlayerSession[];
  readyPlayerIds: string[];
  fundedPlayerIds?: string[];
}

export interface MatchStatePacket {
  t: number;
  normalizedY: number;
  gravityDir: 1 | -1;
  scroll: number;
  alive: boolean;
  score: number;
  /** Animation state for opponent sprite (idle/run/jump/fall) */
  frameIndex?: number;
  velocityY?: number;
  flipLocked?: 0 | 1;
  countdownLocked?: 0 | 1;
}

export type MatchResultReason = 'death' | 'disconnect_forfeit' | 'opponent_disconnect_forfeit';

export interface MatchResult {
  winnerPlayerId: string;
  loserPlayerId: string;
  reason: MatchResultReason;
  endedAt: number;
  settlementTransactionSignature?: string | null;
}

export interface RoomCreatePayload {
  nickname: string;
  clientId: string;
  characterId: CharacterId;
  customCharacterVersionId?: string;
  accessToken?: string;
  roomKind?: MatchRoomKind;
  tokenId?: string;
  entryFeeTierId?: string;
  paymentIntentId?: string;
}

export interface RoomJoinPayload {
  roomCode: string;
  nickname: string;
  clientId: string;
  characterId: CharacterId;
  customCharacterVersionId?: string;
  accessToken?: string;
  roomKind?: MatchRoomKind;
  tokenId?: string;
  entryFeeTierId?: string;
  paymentIntentId?: string;
}

export interface RoomReadyPayload {
  roomCode: string;
}

export interface RoomLeavePayload {
  roomCode: string;
}

export interface MatchInputPayload {
  t: number;
  inputType: 'flip';
}

export interface MatchDeathPayload {
  t: number;
  score: number;
}

export interface HeartbeatPayload {
  t: number;
}

export interface QueueJoinPayload {
  nickname: string;
  clientId: string;
  characterId: CharacterId;
  customCharacterVersionId?: string;
  accessToken: string;
  tokenId: string;
  entryFeeTierId: string;
  paymentIntentId: string;
}

export interface QueueLeavePayload {
  queueEntryId?: string;
}

export interface QueueStatePayload {
  status: 'idle' | 'queued' | 'matched';
  queueEntryId?: string;
  tokenId?: string;
  entryFeeTierId?: string;
  message?: string;
}

export interface ReconnectWindowPayload {
  playerId: string;
  secondsRemaining: number;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface ClientToServerEvents {
  'room:create': (payload: RoomCreatePayload) => void;
  'room:join': (payload: RoomJoinPayload) => void;
  'room:ready': (payload: RoomReadyPayload) => void;
  'room:leave': (payload: RoomLeavePayload) => void;
  'match:input': (payload: MatchInputPayload) => void;
  'match:state': (payload: MatchStatePacket) => void;
  'match:death': (payload: MatchDeathPayload) => void;
  'session:heartbeat': (payload: HeartbeatPayload) => void;
  'queue:join': (payload: QueueJoinPayload) => void;
  'queue:leave': (payload: QueueLeavePayload) => void;
}

export interface ServerToClientEvents {
  'room:created': (payload: {
    roomCode: string;
    player: PlayerSession;
    roomKind?: MatchRoomKind;
  }) => void;
  'room:state': (payload: RoomSnapshot) => void;
  'match:start': (payload: {
    roomCode: string;
    seed: number;
    startAt: number;
    config: MatchConfig;
  }) => void;
  'match:opponentState': (payload: { playerId: string; state: MatchStatePacket }) => void;
  'match:result': (payload: MatchResult) => void;
  'session:reconnectWindow': (payload: ReconnectWindowPayload) => void;
  'queue:state': (payload: QueueStatePayload) => void;
  error: (payload: ErrorPayload) => void;
}
