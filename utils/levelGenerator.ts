import type { Chunk, Platform } from '../types/game';
import {
  FLAT_ZONE_LENGTH,
  MAX_FLIP_HORIZONTAL,
  MIN_LANDING_WIDTH,
  SAFE_MARGIN,
} from '../types/game';

type Difficulty = 'flat' | 'easy' | 'medium' | 'hard';
type StepPattern = {
  bottomWidthTiles: number;
  bottomGapTiles: number;
  topWidthTiles: number;
  topGapTiles: number;
};
type MidStepPattern = {
  widthTiles: number;
  gapTiles: number;
  lane: 0 | 1 | 2;
};

let chunkId = 0;

const CHUNK_LENGTH_TILES: Record<Exclude<Difficulty, 'flat'>, number> = {
  easy: 18,
  medium: 20,
  hard: 22,
};

// Deterministic handcrafted patterns (no random generation).
// Pattern alternates long/short ledges so they look like side extensions.
const PATTERNS: Record<Exclude<Difficulty, 'flat'>, StepPattern[]> = {
  easy: [
    { bottomWidthTiles: 6, bottomGapTiles: 2.2, topWidthTiles: 4, topGapTiles: 1.6 },
    { bottomWidthTiles: 4, bottomGapTiles: 1.7, topWidthTiles: 6, topGapTiles: 2.4 },
    { bottomWidthTiles: 5, bottomGapTiles: 2.1, topWidthTiles: 4, topGapTiles: 1.8 },
    { bottomWidthTiles: 4, bottomGapTiles: 1.8, topWidthTiles: 5, topGapTiles: 2.2 },
  ],
  medium: [
    { bottomWidthTiles: 5, bottomGapTiles: 2.6, topWidthTiles: 4, topGapTiles: 1.9 },
    { bottomWidthTiles: 4, bottomGapTiles: 2.1, topWidthTiles: 5, topGapTiles: 2.7 },
    { bottomWidthTiles: 4, bottomGapTiles: 2.8, topWidthTiles: 4, topGapTiles: 2.0 },
    { bottomWidthTiles: 5, bottomGapTiles: 2.2, topWidthTiles: 4, topGapTiles: 2.9 },
  ],
  hard: [
    { bottomWidthTiles: 4, bottomGapTiles: 3.0, topWidthTiles: 4, topGapTiles: 2.2 },
    { bottomWidthTiles: 4, bottomGapTiles: 2.4, topWidthTiles: 4, topGapTiles: 3.1 },
    { bottomWidthTiles: 4, bottomGapTiles: 3.2, topWidthTiles: 5, topGapTiles: 2.3 },
    { bottomWidthTiles: 5, bottomGapTiles: 2.2, topWidthTiles: 4, topGapTiles: 3.0 },
  ],
};
const MID_PATTERNS: Record<Exclude<Difficulty, 'flat'>, MidStepPattern[]> = {
  easy: [
    { widthTiles: 3.5, gapTiles: 6.2, lane: 1 },
    { widthTiles: 3.0, gapTiles: 5.8, lane: 0 },
    { widthTiles: 4.0, gapTiles: 6.6, lane: 2 },
  ],
  medium: [
    { widthTiles: 3.0, gapTiles: 5.0, lane: 1 },
    { widthTiles: 2.8, gapTiles: 4.6, lane: 0 },
    { widthTiles: 3.4, gapTiles: 5.4, lane: 2 },
  ],
  hard: [
    { widthTiles: 2.8, gapTiles: 4.4, lane: 1 },
    { widthTiles: 2.6, gapTiles: 4.0, lane: 0 },
    { widthTiles: 3.1, gapTiles: 4.8, lane: 2 },
  ],
};

function createPlatform(
  x: number,
  y: number,
  width: number,
  height: number,
  surface: Platform['surface']
): Platform {
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    tileType: 'grass',
    surface,
  };
}

function getChunkEndX(chunk: Chunk): number {
  return Math.max(...chunk.platforms.map((p) => p.x + p.width));
}

function appendLaneFromPattern(
  startX: number,
  endX: number,
  y: number,
  platformHeight: number,
  tileSize: number,
  pattern: StepPattern[],
  lane: 'bottom' | 'top',
  chunkIndex: number
): Platform[] {
  const platforms: Platform[] = [];
  let cursor = startX;
  let stepIndex = chunkIndex % pattern.length;

  while (cursor < endX - MIN_LANDING_WIDTH) {
    const step = pattern[stepIndex % pattern.length];
    const rawWidth =
      lane === 'bottom' ? step.bottomWidthTiles * tileSize : step.topWidthTiles * tileSize;
    const rawGap = lane === 'bottom' ? step.bottomGapTiles * tileSize : step.topGapTiles * tileSize;
    const minPlayableGap = tileSize * 2.25;
    const clampedGap = Math.max(
      minPlayableGap,
      Math.min(rawGap, MAX_FLIP_HORIZONTAL - SAFE_MARGIN)
    );
    const width = Math.max(MIN_LANDING_WIDTH, Math.min(rawWidth, endX - cursor));

    if (width >= MIN_LANDING_WIDTH) {
      platforms.push(createPlatform(cursor, y, width, platformHeight, lane));
    }

    cursor += width + clampedGap;
    stepIndex += 1;
  }

  return platforms;
}

function appendMiddlePlatformsFromPattern(
  startX: number,
  endX: number,
  groundY: number,
  platformHeight: number,
  tileSize: number,
  pattern: MidStepPattern[],
  chunkIndex: number
): Platform[] {
  const platforms: Platform[] = [];
  const topBuffer = tileSize * 3;
  const bottomBuffer = tileSize * 5;
  const laneTop = topBuffer;
  const laneBottom = groundY - bottomBuffer;
  if (laneBottom <= laneTop) return platforms;

  const middleSpan = laneBottom - laneTop;
  const laneYs = [
    Math.round(laneTop + middleSpan * 0.18),
    Math.round(laneTop + middleSpan * 0.5),
    Math.round(laneTop + middleSpan * 0.82),
  ] as const;

  let cursor = startX + tileSize * 1.5;
  let stepIndex = chunkIndex % pattern.length;
  while (cursor < endX - MIN_LANDING_WIDTH) {
    const step = pattern[stepIndex % pattern.length];
    const rawWidth = step.widthTiles * tileSize;
    const rawGap = step.gapTiles * tileSize;
    const width = Math.max(MIN_LANDING_WIDTH, Math.min(rawWidth, endX - cursor));
    const gap = Math.max(tileSize * 2.2, Math.min(rawGap, MAX_FLIP_HORIZONTAL + tileSize));

    if (width >= MIN_LANDING_WIDTH) {
      platforms.push(createPlatform(cursor, laneYs[step.lane], width, platformHeight, 'pillar'));
    }

    cursor += width + gap;
    stepIndex += 1;
  }

  return platforms;
}

function ensureSharedCoverage(
  platforms: Platform[],
  startX: number,
  endX: number,
  groundY: number,
  tileSize: number
) {
  const step = Math.max(8, Math.floor(tileSize / 2));
  const maxSharedVoid = MAX_FLIP_HORIZONTAL - SAFE_MARGIN;
  let voidStart: number | null = null;

  for (let x = startX; x <= endX; x += step) {
    const hasGround = platforms.some(
      (p) => p.surface !== 'pillar' && x >= p.x && x <= p.x + p.width
    );
    if (!hasGround && voidStart == null) {
      voidStart = x;
      continue;
    }

    if (hasGround && voidStart != null) {
      const voidWidth = x - voidStart;
      if (voidWidth > maxSharedVoid) {
        const bridgeWidth = Math.max(MIN_LANDING_WIDTH, tileSize * 4);
        const bridgeX = voidStart + (voidWidth - bridgeWidth) * 0.5;
        platforms.push(createPlatform(bridgeX, groundY, bridgeWidth, tileSize * 2, 'bottom'));
      }
      voidStart = null;
    }
  }
}

function generateChunk(
  startX: number,
  difficulty: Difficulty,
  groundY: number,
  tileSize: number
): Chunk | null {
  const platformHeight = tileSize * 2;
  const platforms: Platform[] = [];

  if (difficulty === 'flat') {
    const width = FLAT_ZONE_LENGTH;
    platforms.push(createPlatform(startX, groundY, width, platformHeight, 'bottom'));
    platforms.push(createPlatform(startX, 0, width, platformHeight, 'top'));
    return {
      id: `chunk_${chunkId++}`,
      width,
      platforms,
      difficulty: 'flat',
    };
  }

  const chunkLength = CHUNK_LENGTH_TILES[difficulty] * tileSize;
  const endX = startX + chunkLength;
  const chunkIndex = Math.floor(startX / chunkLength);
  const pattern = PATTERNS[difficulty];

  const bottomPlatforms = appendLaneFromPattern(
    startX,
    endX,
    groundY,
    platformHeight,
    tileSize,
    pattern,
    'bottom',
    chunkIndex
  );
  const topPlatforms = appendLaneFromPattern(
    startX,
    endX,
    0,
    platformHeight,
    tileSize,
    pattern,
    'top',
    chunkIndex + 2
  );
  const middlePlatforms = appendMiddlePlatformsFromPattern(
    startX,
    endX,
    groundY,
    platformHeight,
    tileSize,
    MID_PATTERNS[difficulty],
    chunkIndex + 1
  );

  platforms.push(...bottomPlatforms, ...topPlatforms, ...middlePlatforms);
  ensureSharedCoverage(platforms, startX, endX, groundY, tileSize);

  return {
    id: `chunk_${chunkId++}`,
    width: chunkLength,
    platforms,
    difficulty,
  };
}

export function getDifficultyForScroll(totalScroll: number): Difficulty {
  if (totalScroll < FLAT_ZONE_LENGTH) return 'flat';
  if (totalScroll < FLAT_ZONE_LENGTH + 1200) return 'easy';
  if (totalScroll < FLAT_ZONE_LENGTH + 2600) return 'medium';
  return 'hard';
}

const PREGEN_DISTANCE = 7000;

export function generateLevelChunks(
  totalScroll: number,
  screenWidth: number,
  _screenHeight: number,
  groundY: number,
  tileSize: number,
  existingChunks: Chunk[]
): Chunk[] {
  const chunks = [...existingChunks];
  const lastChunk = chunks[chunks.length - 1];
  const nextSpawnX = lastChunk ? getChunkEndX(lastChunk) : 0;

  const spawnThreshold = totalScroll + screenWidth * 2;
  if (nextSpawnX < spawnThreshold) {
    const difficulty = getDifficultyForScroll(nextSpawnX);
    const chunk = generateChunk(nextSpawnX, difficulty, groundY, tileSize);
    if (chunk) chunks.push(chunk);
  }

  const trimX = totalScroll - screenWidth * 2;
  return chunks.filter((c) => getChunkEndX(c) > trimX);
}

export function preGenerateLevelChunks(
  screenWidth: number,
  screenHeight: number,
  groundY: number,
  tileSize: number,
  targetDistance: number = PREGEN_DISTANCE
): Chunk[] {
  let chunks: Chunk[] = [];
  const maxIterations = 80;
  for (let i = 0; i < maxIterations; i++) {
    const lastChunk = chunks[chunks.length - 1];
    const nextSpawnX = lastChunk ? getChunkEndX(lastChunk) : 0;
    if (nextSpawnX >= targetDistance) break;

    const simulatedScroll = Math.max(0, nextSpawnX - screenWidth * 2 + 100);
    const next = generateLevelChunks(
      simulatedScroll,
      screenWidth,
      screenHeight,
      groundY,
      tileSize,
      chunks
    );
    if (next.length === chunks.length) break;
    chunks = [...chunks, next[next.length - 1]];
  }
  return chunks;
}

export function getVisiblePlatforms(
  platforms: Platform[],
  scrollOffset: number,
  screenWidth: number,
  margin: number = 100
): Platform[] {
  return platforms.filter(
    (p) => p.x + p.width > scrollOffset - margin && p.x < scrollOffset + screenWidth + margin
  );
}
