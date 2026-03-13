import assert from 'node:assert/strict';
import test from 'node:test';
import type { MatchStatePacket } from '../shared/multiplayer-contracts';
import {
  MAX_CLIENT_ID_LENGTH,
  MAX_NICKNAME_LENGTH,
  derivePreMatchState,
  isValidClientId,
  isValidMatchStatePayload,
  normalizeRoomCode,
  pruneDisconnectedReadyPlayers,
  sanitizeNickname,
} from '../multiplayerGuards';

test('normalizeRoomCode trims and uppercases room input', () => {
  assert.equal(normalizeRoomCode(' ab12c '), 'AB12C');
});

test('sanitizeNickname trims and enforces max length', () => {
  assert.equal(sanitizeNickname('  Player One  ', 'Fallback'), 'Player One');
  const overlong = 'a'.repeat(40);
  assert.equal(sanitizeNickname(overlong, 'Fallback').length, MAX_NICKNAME_LENGTH);
  assert.equal(sanitizeNickname('   ', 'Fallback'), 'Fallback');
});

test('isValidClientId rejects empty and overly long ids', () => {
  assert.equal(isValidClientId('client-123'), true);
  assert.equal(isValidClientId('   '), false);
  assert.equal(isValidClientId('x'.repeat(MAX_CLIENT_ID_LENGTH + 1)), false);
  assert.equal(isValidClientId(42), false);
});

test('derivePreMatchState follows player and ready counts', () => {
  assert.equal(derivePreMatchState(0, 0), 'ROOM_OPEN');
  assert.equal(derivePreMatchState(1, 1), 'ROOM_OPEN');
  assert.equal(derivePreMatchState(2, 0), 'ROOM_FULL');
  assert.equal(derivePreMatchState(2, 1), 'ROOM_FULL');
  assert.equal(derivePreMatchState(2, 2), 'READY');
});

test('isValidMatchStatePayload validates runtime bounds', () => {
  const valid: MatchStatePacket = {
    seq: 1,
    t: Date.now(),
    phase: 'running',
    pose: 'run',
    normalizedY: 0.5,
    gravityDir: 1,
    scroll: 120,
    charX: 180,
    alive: true,
    score: 120,
    velocityX: 0,
  };
  assert.equal(isValidMatchStatePayload(valid), true);
  assert.equal(isValidMatchStatePayload({ ...valid, normalizedY: 3 }), false);
  assert.equal(isValidMatchStatePayload({ ...valid, gravityDir: 0 as 1 }), false);
  assert.equal(isValidMatchStatePayload({ ...valid, scroll: -5 }), false);
  assert.equal(isValidMatchStatePayload({ ...valid, charX: Number.POSITIVE_INFINITY }), false);
  assert.equal(isValidMatchStatePayload({ ...valid, seq: -1 }), false);
  assert.equal(isValidMatchStatePayload({ ...valid, pose: 'slide' as 'run' }), false);
  assert.equal(isValidMatchStatePayload({ ...valid, score: Number.POSITIVE_INFINITY }), false);
});

test('pruneDisconnectedReadyPlayers drops ready flags for disconnected players', () => {
  const ready = new Set(['a', 'b', 'c']);
  pruneDisconnectedReadyPlayers(ready, [
    { playerId: 'a', connected: true },
    { playerId: 'b', connected: false },
    { playerId: 'c', connected: false },
  ]);
  assert.deepEqual([...ready], ['a']);
});
