import assert from 'node:assert/strict';
import test from 'node:test';
import opponentPlayback from '../../../shared/opponentPlayback.ts';
import type { TimedOpponentSnapshot } from '../../../shared/opponentPlayback.ts';
import type { OpponentSnapshot } from '../../../types/game';

// eslint-disable-next-line import/no-named-as-default-member
const { enqueueOpponentSnapshot, sampleOpponentSnapshot } = opponentPlayback;

const buildSnapshot = (overrides: Partial<OpponentSnapshot> = {}): OpponentSnapshot => ({
  playerId: 'p1',
  nickname: 'Opponent',
  phase: 'running',
  pose: 'run',
  seq: 1,
  normalizedY: 0,
  gravityDir: 1,
  scroll: 0,
  worldX: 100,
  alive: true,
  score: 0,
  t: 1_000,
  frameIndex: 0,
  velocityY: 0,
  velocityX: 0,
  flipLocked: 0,
  countdownLocked: 0,
  ...overrides,
});

test('enqueueOpponentSnapshot drops stale snapshots and trims the queue', () => {
  let queue = enqueueOpponentSnapshot([], buildSnapshot({ seq: 1 }), 1_000, 2);
  queue = enqueueOpponentSnapshot(queue, buildSnapshot({ seq: 1, worldX: 120 }), 1_016, 2);
  queue = enqueueOpponentSnapshot(queue, buildSnapshot({ seq: 2, worldX: 140 }), 1_032, 2);
  queue = enqueueOpponentSnapshot(queue, buildSnapshot({ seq: 3, worldX: 160 }), 1_048, 2);

  assert.deepEqual(queue.map((entry) => entry.seq), [2, 3]);
  assert.deepEqual(queue.map((entry) => entry.worldX), [140, 160]);
});

test('enqueueOpponentSnapshot resets the queue for non-running phases', () => {
  const runningEntry: TimedOpponentSnapshot = {
    ...buildSnapshot({ seq: 4, worldX: 180 }),
    receivedAt: 1_064,
  };
  const queue = enqueueOpponentSnapshot(
    [runningEntry],
    buildSnapshot({ seq: 5, phase: 'countdown', countdownLocked: 1, worldX: 0 }),
    1_080
  );

  assert.equal(queue.length, 1);
  assert.equal(queue[0].phase, 'countdown');
});

test('sampleOpponentSnapshot interpolates between buffered snapshots', () => {
  const queue = [
    { ...buildSnapshot({ seq: 1, worldX: 100, normalizedY: 0.1 }), receivedAt: 1_000 },
    { ...buildSnapshot({ seq: 2, worldX: 200, normalizedY: 0.5 }), receivedAt: 1_100 },
  ];

  const sample = sampleOpponentSnapshot(queue, 1_050, 100);

  assert(sample);
  assert.equal(sample.worldX, 150);
  assert.ok(Math.abs(sample.normalizedY - 0.3) < 1e-9);
});

test('sampleOpponentSnapshot caps extrapolation beyond the latest packet', () => {
  const queue = [
    { ...buildSnapshot({ seq: 1, worldX: 100, normalizedY: 0.1 }), receivedAt: 1_000 },
    { ...buildSnapshot({ seq: 2, worldX: 200, normalizedY: 0.5 }), receivedAt: 1_100 },
  ];

  const sample = sampleOpponentSnapshot(queue, 1_260, 100);

  assert(sample);
  assert.equal(sample.worldX, 300);
  assert.equal(sample.normalizedY, 0.9);
});
