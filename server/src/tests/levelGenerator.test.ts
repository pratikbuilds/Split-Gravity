import test from 'node:test';
import assert from 'node:assert/strict';
import * as levelGeneratorModule from '../../../utils/levelGenerator';
import * as gameTypesModule from '../../../types/game';
import type { Chunk, Platform } from '../../../types/game';

const levelGeneratorCjs = levelGeneratorModule as typeof import('../../../utils/levelGenerator') & {
  default?: typeof import('../../../utils/levelGenerator');
};
const gameTypesCjs = gameTypesModule as typeof import('../../../types/game') & {
  default?: typeof import('../../../types/game');
};
const levelGenerator = levelGeneratorCjs.default ?? levelGeneratorCjs;
const gameTypes = gameTypesCjs.default ?? gameTypesCjs;

const SCREEN_WIDTH = 480;
const SCREEN_HEIGHT = 270;
const GROUND_Y = 206;
const TILE_SIZE = 32;

function stripChunkIds(chunks: Chunk[]) {
  return chunks.map(({ id: _id, ...rest }) => rest);
}

function chunkBounds(chunk: Chunk) {
  const start = Math.min(...chunk.platforms.map((platform) => platform.x));
  const end = Math.max(...chunk.platforms.map((platform) => platform.x + platform.width));
  return { start, end };
}

function maxSharedVoid(platforms: Platform[], startX: number, endX: number): number {
  const step = 8;
  let maxVoid = 0;
  let currentVoid = 0;
  for (let x = startX; x <= endX; x += step) {
    const hasGround = platforms.some(
      (platform) =>
        platform.surface !== 'pillar' && x >= platform.x && x <= platform.x + platform.width
    );
    if (hasGround) {
      maxVoid = Math.max(maxVoid, currentVoid);
      currentVoid = 0;
    } else {
      currentVoid += step;
    }
  }
  return Math.max(maxVoid, currentVoid);
}

test('preGenerateLevelChunks is deterministic for same inputs', () => {
  const first = levelGenerator.preGenerateLevelChunks(
    SCREEN_WIDTH,
    SCREEN_HEIGHT,
    GROUND_Y,
    TILE_SIZE,
    5000
  );
  const second = levelGenerator.preGenerateLevelChunks(
    SCREEN_WIDTH,
    SCREEN_HEIGHT,
    GROUND_Y,
    TILE_SIZE,
    5000
  );

  assert.deepEqual(stripChunkIds(first), stripChunkIds(second));
});

test('generateLevelChunks catches up with bounded chunk additions', () => {
  const seedChunks = levelGenerator.preGenerateLevelChunks(
    SCREEN_WIDTH,
    SCREEN_HEIGHT,
    GROUND_Y,
    TILE_SIZE,
    1800
  );
  const chunks = levelGenerator.generateLevelChunks(
    5200,
    SCREEN_WIDTH,
    SCREEN_HEIGHT,
    GROUND_Y,
    TILE_SIZE,
    seedChunks
  );

  assert.ok(chunks.length > 0, 'expected chunk generation to keep a playable window');
  assert.ok(chunks.length <= seedChunks.length + 6, 'expected bounded chunk creation per call');
});

test('generated chunks stitch contiguously and maintain reachable shared void limits', () => {
  const chunks = levelGenerator.preGenerateLevelChunks(
    SCREEN_WIDTH,
    SCREEN_HEIGHT,
    GROUND_Y,
    TILE_SIZE,
    7000
  );
  assert.ok(chunks.length > 0);

  for (let i = 1; i < chunks.length; i += 1) {
    const prev = chunkBounds(chunks[i - 1]);
    const next = chunkBounds(chunks[i]);
    assert.equal(next.start, prev.end);
  }

  const maxAllowedVoid = gameTypes.MAX_FLIP_HORIZONTAL - gameTypes.SAFE_MARGIN;
  for (const chunk of chunks) {
    const { start, end } = chunkBounds(chunk);
    const voidWidth = maxSharedVoid(chunk.platforms, start, end);
    assert.ok(voidWidth <= maxAllowedVoid + 8);
  }
});

test('difficulty progression thresholds are monotonic', () => {
  assert.equal(levelGenerator.getDifficultyForScroll(0), 'flat');
  assert.equal(levelGenerator.getDifficultyForScroll(900), 'easy');
  assert.equal(levelGenerator.getDifficultyForScroll(2500), 'medium');
  assert.equal(levelGenerator.getDifficultyForScroll(5000), 'hard');
});

test('non-flat chunks include stepped ground elevations up to two rows', () => {
  const chunks = levelGenerator.preGenerateLevelChunks(
    SCREEN_WIDTH,
    SCREEN_HEIGHT,
    GROUND_Y,
    TILE_SIZE,
    4200
  );
  const nonFlatPlatforms = chunks
    .filter((chunk) => chunk.difficulty !== 'flat')
    .flatMap((chunk) => chunk.platforms);
  assert.ok(nonFlatPlatforms.length > 0);

  const bottomYs = new Set(
    nonFlatPlatforms.filter((platform) => platform.surface === 'bottom').map((platform) => platform.y)
  );
  assert.ok(bottomYs.has(GROUND_Y), 'expected baseline ground platforms');
  assert.ok(bottomYs.has(GROUND_Y - TILE_SIZE), 'expected +1 row raised platforms');
  assert.ok(bottomYs.has(GROUND_Y - TILE_SIZE * 2), 'expected +2 row raised platforms');
  assert.ok(Math.min(...bottomYs) >= GROUND_Y - TILE_SIZE * 2, 'ground should not rise above 2 rows');

  const topYs = new Set(
    nonFlatPlatforms.filter((platform) => platform.surface === 'top').map((platform) => platform.y)
  );
  assert.ok(topYs.has(0), 'expected ceiling terrain to remain anchored to top edge');

  const topSurfaceYs = new Set(
    nonFlatPlatforms
      .filter((platform) => platform.surface === 'top')
      .map((platform) => platform.y + platform.height)
  );
  assert.ok(topSurfaceYs.has(TILE_SIZE * 2), 'expected baseline ceiling collision surface');
  assert.ok(topSurfaceYs.has(TILE_SIZE * 3), 'expected +1 row lowered ceiling collision surface');
  assert.ok(topSurfaceYs.has(TILE_SIZE * 4), 'expected +2 row lowered ceiling collision surface');
  assert.ok(
    Math.max(...topSurfaceYs) <= TILE_SIZE * 4,
    'ceiling should not lower by more than 2 rows'
  );
});
