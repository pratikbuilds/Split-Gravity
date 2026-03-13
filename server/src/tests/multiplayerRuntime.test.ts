import assert from 'node:assert/strict';
import test from 'node:test';
import { resetPlayerRoundState } from '../multiplayer/runtime';
import type { ServerPlayer } from '../multiplayer/runtime';

test('resetPlayerRoundState clears stale round state before a new match', () => {
  const player = {
    alive: false,
    lastInputAt: 1234,
    lastState: {
      seq: 9,
      t: 5678,
      phase: 'running',
      pose: 'fall',
      normalizedY: 1.4,
      gravityDir: 1,
      scroll: 420,
      worldX: 452,
      alive: false,
      score: 420,
      frameIndex: 7,
      velocityY: 90,
      velocityX: 0,
      flipLocked: 1,
      countdownLocked: 0,
    },
  } as Pick<ServerPlayer, 'alive' | 'lastState' | 'lastInputAt'>;

  resetPlayerRoundState(player);

  assert.equal(player.alive, true);
  assert.equal(player.lastInputAt, undefined);
  assert.equal(player.lastState, undefined);
});
