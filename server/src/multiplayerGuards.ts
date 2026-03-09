import type { MatchState, MatchStatePacket } from './shared/multiplayer-contracts';

export const MAX_CLIENT_ID_LENGTH = 128;
export const MAX_NICKNAME_LENGTH = 24;
export const MAX_SCROLL = 1_000_000;
export const MAX_SCORE = 1_000_000;

export const normalizeRoomCode = (roomCode: string) => roomCode.trim().toUpperCase();

export const sanitizeNickname = (nickname: string, fallback: string) => {
  const sanitized = nickname.trim().slice(0, MAX_NICKNAME_LENGTH);
  return sanitized || fallback;
};

export const isValidClientId = (clientId: unknown): clientId is string => {
  return typeof clientId === 'string' && clientId.trim().length > 0 && clientId.length <= MAX_CLIENT_ID_LENGTH;
};

export const derivePreMatchState = (playerCount: number, readyCount: number): MatchState => {
  if (playerCount >= 2) {
    return readyCount >= 2 ? 'READY' : 'ROOM_FULL';
  }
  return 'ROOM_OPEN';
};

export const isValidMatchStatePayload = (payload: MatchStatePacket) => {
  const hasFinite = (value: number) => Number.isFinite(value);
  if (!hasFinite(payload.t) || payload.t <= 0) return false;
  if (!hasFinite(payload.normalizedY) || payload.normalizedY < -1 || payload.normalizedY > 2) return false;
  if (payload.gravityDir !== 1 && payload.gravityDir !== -1) return false;
  if (!hasFinite(payload.scroll) || payload.scroll < 0 || payload.scroll > MAX_SCROLL) return false;
  if (typeof payload.alive !== 'boolean') return false;
  if (!hasFinite(payload.score) || payload.score < 0 || payload.score > MAX_SCORE) return false;
  return true;
};

export const pruneDisconnectedReadyPlayers = (
  readyPlayerIds: Set<string>,
  players: Iterable<{ playerId: string; connected: boolean }>
) => {
  for (const player of players) {
    if (!player.connected) {
      readyPlayerIds.delete(player.playerId);
    }
  }
};
