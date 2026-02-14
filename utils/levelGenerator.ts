import type { Chunk, Platform } from '../types/game';
import {
  FLAT_ZONE_LENGTH,
  MAX_FLIP_HORIZONTAL,
  MIN_LANDING_WIDTH,
  SAFE_MARGIN,
} from '../types/game';

type Difficulty = 'flat' | 'easy' | 'medium' | 'hard';

type LanePattern = {
  platformTiles: number[];
  gapTiles: number[];
};

type DifficultyLayout = {
  chunkLengthTiles: number;
  lanePattern: LanePattern;
  laneElevationRows: number[];
  lanePhaseOffset: number;
  middlePillar: {
    widthTiles: number[];
    extensionTiles: number;
    maxSpanTiles: number;
    topGapY: number;
    bottomGapY: number;
    minSpacingTiles: number;
  };
};

type GapWindow = {
  startX: number;
  endX: number;
  lane: 'top' | 'bottom';
};

const CHUNK_LAYOUT: Record<Exclude<Difficulty, 'flat'>, DifficultyLayout> = {
  easy: {
    chunkLengthTiles: 18,
    lanePattern: {
      // Long wall runs with short openings, matching the reference layout cadence.
      platformTiles: [8.2, 5.4, 7.6, 5.2],
      gapTiles: [2.3, 2.7, 2.4, 2.8],
    },
    laneElevationRows: [0, 1, 2, 1, 0, 1],
    lanePhaseOffset: 2,
    middlePillar: {
      widthTiles: [2.8, 3.4],
      extensionTiles: 1.25,
      maxSpanTiles: 6.8,
      topGapY: 0.3,
      bottomGapY: 0.72,
      minSpacingTiles: 4.5,
    },
  },
  medium: {
    chunkLengthTiles: 20,
    lanePattern: {
      platformTiles: [7.4, 4.8, 7.0, 4.6],
      gapTiles: [2.6, 3.0, 2.8, 3.2],
    },
    laneElevationRows: [0, 1, 2, 1, 0, 2],
    lanePhaseOffset: 2,
    middlePillar: {
      widthTiles: [2.6, 3.1],
      extensionTiles: 1.35,
      maxSpanTiles: 6.4,
      topGapY: 0.28,
      bottomGapY: 0.74,
      minSpacingTiles: 4.0,
    },
  },
  hard: {
    chunkLengthTiles: 22,
    lanePattern: {
      platformTiles: [6.8, 4.2, 6.4, 4.0],
      gapTiles: [3.0, 3.4, 3.2, 3.6],
    },
    laneElevationRows: [1, 2, 1, 0, 2, 1],
    lanePhaseOffset: 2,
    middlePillar: {
      widthTiles: [2.4, 2.8],
      extensionTiles: 1.45,
      maxSpanTiles: 6.0,
      topGapY: 0.26,
      bottomGapY: 0.76,
      minSpacingTiles: 3.8,
    },
  },
};

function chunkIdFor(startX: number, difficulty: Difficulty): string {
  return `chunk_${difficulty}_${Math.round(startX)}`;
}

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
    surface,
  };
}

function getChunkEndX(chunk: Chunk): number {
  if (chunk.platforms.length === 0) return 0;
  return Math.max(...chunk.platforms.map((p) => p.x + p.width));
}

function clampGap(rawGap: number, tileSize: number): number {
  const minPlayableGap = tileSize * 2.2;
  return Math.max(minPlayableGap, Math.min(rawGap, MAX_FLIP_HORIZONTAL - SAFE_MARGIN));
}

function appendLaneFromConfig(
  startX: number,
  endX: number,
  baseY: number,
  platformHeight: number,
  tileSize: number,
  pattern: LanePattern,
  elevationRows: number[],
  lane: 'bottom' | 'top',
  phase: number
): {
  platforms: Platform[];
  gaps: GapWindow[];
} {
  const platforms: Platform[] = [];
  const gaps: GapWindow[] = [];
  let cursor = startX;
  let stepIndex = phase;

  while (cursor < endX - 1) {
    const widthTiles = pattern.platformTiles[stepIndex % pattern.platformTiles.length];
    const gapTiles = pattern.gapTiles[stepIndex % pattern.gapTiles.length];
    const rawElevationRows = elevationRows[stepIndex % elevationRows.length] ?? 0;
    const clampedElevationRows = Math.max(0, Math.min(2, Math.round(rawElevationRows)));
    const elevationPx = clampedElevationRows * tileSize;
    // Keep stepped surfaces while filling terrain volume back to the base lane.
    const platformY = lane === 'bottom' ? baseY - elevationPx : baseY;
    const platformHeightPx = platformHeight + elevationPx;

    const rawWidth = widthTiles * tileSize;
    const width = Math.max(MIN_LANDING_WIDTH, Math.min(rawWidth, endX - cursor));

    if (width >= MIN_LANDING_WIDTH) {
      platforms.push(createPlatform(cursor, platformY, width, platformHeightPx, lane));
    }

    cursor += width;
    if (cursor >= endX) break;

    const rawGap = gapTiles * tileSize;
    const gapLength = clampGap(rawGap, tileSize);
    const gapStartX = cursor;
    const gapEndX = Math.min(endX, cursor + gapLength);

    if (gapEndX > gapStartX) {
      gaps.push({ startX: gapStartX, endX: gapEndX, lane });
    }

    cursor = gapEndX;
    stepIndex += 1;
  }

  return { platforms, gaps };
}

function appendMiddlePlatformsFromGaps(
  startX: number,
  endX: number,
  groundY: number,
  tileSize: number,
  gaps: GapWindow[],
  layout: DifficultyLayout,
  phase: number
): Platform[] {
  const platforms: Platform[] = [];
  const topBuffer = tileSize * 3;
  const bottomBuffer = tileSize * 5;
  const laneTop = topBuffer;
  const laneBottom = groundY - bottomBuffer;
  if (laneBottom <= laneTop) return platforms;

  const middleSpan = laneBottom - laneTop;
  const yForGap = (lane: GapWindow['lane']) => {
    const ratio = lane === 'top' ? layout.middlePillar.topGapY : layout.middlePillar.bottomGapY;
    return Math.round(laneTop + middleSpan * ratio);
  };

  const sortedGaps = [...gaps]
    .filter((gap) => gap.endX > startX && gap.startX < endX)
    .sort((a, b) => a.startX - b.startX);

  const minSpacing = layout.middlePillar.minSpacingTiles * tileSize;
  let lastPillarX = -Infinity;

  for (let i = 0; i < sortedGaps.length; i += 1) {
    const gap = sortedGaps[i];
    const gapWidth = gap.endX - gap.startX;

    const widthTiles =
      layout.middlePillar.widthTiles[(phase + i) % layout.middlePillar.widthTiles.length];
    const extension = layout.middlePillar.extensionTiles * tileSize;
    const targetWidth = Math.max(widthTiles * tileSize, gapWidth + extension * 2);
    const width = Math.max(
      MIN_LANDING_WIDTH,
      Math.min(targetWidth, layout.middlePillar.maxSpanTiles * tileSize)
    );
    if (width < MIN_LANDING_WIDTH) continue;

    const centerX = gap.startX + gapWidth * 0.5;
    const unclampedX = centerX - width * 0.5;
    const x = Math.max(startX, Math.min(unclampedX, endX - width));
    if (x - lastPillarX < minSpacing) continue;

    platforms.push(createPlatform(x, yForGap(gap.lane), width, tileSize, 'pillar'));
    lastPillarX = x;
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

  if (voidStart != null) {
    const voidWidth = endX - voidStart;
    if (voidWidth > maxSharedVoid) {
      const bridgeWidth = Math.max(MIN_LANDING_WIDTH, tileSize * 4);
      const bridgeX = voidStart + (voidWidth - bridgeWidth) * 0.5;
      platforms.push(createPlatform(bridgeX, groundY, bridgeWidth, tileSize * 2, 'bottom'));
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
      id: chunkIdFor(startX, difficulty),
      width,
      platforms,
      difficulty: 'flat',
    };
  }

  const layout = CHUNK_LAYOUT[difficulty];
  const chunkLength = layout.chunkLengthTiles * tileSize;
  const endX = startX + chunkLength;
  const chunkIndex = Math.floor(startX / chunkLength);

  const bottomLane = appendLaneFromConfig(
    startX,
    endX,
    groundY,
    platformHeight,
    tileSize,
    layout.lanePattern,
    layout.laneElevationRows,
    'bottom',
    chunkIndex
  );

  const topLane = appendLaneFromConfig(
    startX,
    endX,
    0,
    platformHeight,
    tileSize,
    layout.lanePattern,
    layout.laneElevationRows,
    'top',
    chunkIndex + layout.lanePhaseOffset
  );

  const middlePlatforms = appendMiddlePlatformsFromGaps(
    startX,
    endX,
    groundY,
    tileSize,
    [...bottomLane.gaps, ...topLane.gaps],
    layout,
    chunkIndex + 1
  );

  platforms.push(...bottomLane.platforms, ...topLane.platforms, ...middlePlatforms);
  ensureSharedCoverage(platforms, startX, endX, groundY, tileSize);

  return {
    id: chunkIdFor(startX, difficulty),
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
  existingChunks: Chunk[],
  options?: {
    disableTrim?: boolean;
  }
): Chunk[] {
  const chunks = [...existingChunks];
  const spawnThreshold = totalScroll + screenWidth * 2;
  const maxChunkAddsPerTick = 6;
  let iterations = 0;

  while (iterations < maxChunkAddsPerTick) {
    const lastChunk = chunks[chunks.length - 1];
    const nextSpawnX = lastChunk ? getChunkEndX(lastChunk) : 0;
    if (nextSpawnX >= spawnThreshold) break;

    const difficulty = getDifficultyForScroll(nextSpawnX);
    const chunk = generateChunk(nextSpawnX, difficulty, groundY, tileSize);
    if (!chunk) break;
    chunks.push(chunk);
    iterations += 1;
  }

  if (options?.disableTrim) {
    return chunks;
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
      chunks,
      { disableTrim: true }
    );
    if (next.length === chunks.length) break;
    chunks = next;
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
