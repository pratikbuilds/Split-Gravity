import type {
  MatchResult,
  MatchRoomKind,
  MatchState,
  PlayerSession,
  RoomSnapshot,
} from '../shared/multiplayer-contracts';
import type { CharacterId } from '../shared/characters';

export interface ServerPlayer extends PlayerSession {
  socketId: string;
  lastSeenAt: number;
  lastState?: import('../shared/multiplayer-contracts').MatchStatePacket;
  lastInputAt?: number;
  disconnectTimer?: ReturnType<typeof setTimeout>;
  reconnectInterval?: ReturnType<typeof setInterval>;
  walletPlayerId?: string;
  paymentIntentId?: string;
}

export const resetPlayerRoundState = (
  player: Pick<ServerPlayer, 'alive' | 'lastState' | 'lastInputAt'>
) => {
  player.alive = true;
  player.lastState = undefined;
  player.lastInputAt = undefined;
};

export interface Room {
  roomCode: string;
  state: MatchState;
  roomKind: MatchRoomKind;
  tokenId?: string;
  entryFeeTierId?: string;
  seed: number;
  createdAt: number;
  startedAt?: number;
  players: Map<string, ServerPlayer>;
  byClientId: Map<string, string>;
  readyPlayerIds: Set<string>;
  fundedPlayerIds: Set<string>;
  paymentIntentIdsByPlayerId: Map<string, string>;
  result?: MatchResult;
  settlementStatus?: 'pending' | 'settled' | 'refunded';
  cleanupTimer?: ReturnType<typeof setTimeout>;
}

export interface QueueEntry {
  id: string;
  socketId: string;
  clientId: string;
  nickname: string;
  characterId: CharacterId;
  customCharacterVersionId?: string;
  walletPlayerId: string;
  tokenId: string;
  entryFeeTierId: string;
  paymentIntentId: string;
}

export const createRoomCode = (rooms: Pick<Map<string, Room>, 'has'>) => {
  let roomCode = '';
  while (!roomCode || rooms.has(roomCode)) {
    roomCode = Math.random().toString(36).slice(2, 7).toUpperCase();
  }
  return roomCode;
};

export const queueBucketKey = (tokenId: string, entryFeeTierId: string) =>
  `${tokenId}:${entryFeeTierId}`;

export const getRoomOpponent = (room: Room, playerId: string) =>
  [...room.players.values()].find((candidate) => candidate.playerId !== playerId);

export const snapshotRoom = (room: Room): RoomSnapshot => ({
  roomCode: room.roomCode,
  state: room.state,
  roomKind: room.roomKind,
  tokenId: room.tokenId ?? null,
  entryFeeTierId: room.entryFeeTierId ?? null,
  startedAt: room.startedAt ?? null,
  players: [...room.players.values()].map((player) => ({
    playerId: player.playerId,
    clientId: player.clientId,
    nickname: player.nickname,
    characterId: player.characterId,
    customCharacterVersionId: player.customCharacterVersionId,
    alive: player.alive,
    connected: player.connected,
  })),
  readyPlayerIds: [...room.readyPlayerIds],
  fundedPlayerIds: [...room.fundedPlayerIds],
});

export const roomSummary = (room: Room) => ({
  roomCode: room.roomCode,
  roomKind: room.roomKind,
  tokenId: room.tokenId,
  entryFeeTierId: room.entryFeeTierId,
  state: room.state,
  players: [...room.players.values()].map((player) => ({
    playerId: player.playerId,
    nickname: player.nickname,
    characterId: player.characterId,
    customCharacterVersionId: player.customCharacterVersionId,
    alive: player.alive,
    connected: player.connected,
  })),
  readyCount: room.readyPlayerIds.size,
  fundedCount: room.fundedPlayerIds.size,
});
