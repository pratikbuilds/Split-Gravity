import type { Chunk, Platform } from '../types/game';
import {
  FLAT_ZONE_LENGTH,
  MAX_FLIP_HORIZONTAL,
  MIN_LANDING_WIDTH,
  SAFE_MARGIN,
} from '../types/game';

type ChunkPhase = Chunk['phase'];

type GapWindow = {
  startX: number;
  endX: number;
  lane: 'top' | 'bottom';
};

type LaneSegment = {
  platformTiles: number;
  gapTiles: number;
  elevationRowDelta: number;
};

type RhythmTemplate = {
  segments: LaneSegment[];
  startRow: number;
  endRow: number;
};

type LaneBuildResult = {
  platforms: Platform[];
  gaps: GapWindow[];
  gapWidths: number[];
};

type ChallengeProfile = {
  challenge: number;
  phase: ChunkPhase;
};

type ChallengeParams = {
  targetGapTiles: number;
  targetPlatformTiles: number;
  pillarChance: number;
  pillarWidthTiles: number;
  pillarExtensionTiles: number;
  pillarMaxSpanTiles: number;
  pillarSpacingTiles: number;
  minSegmentsBetweenElevationChanges: number;
};

const TAU = Math.PI * 2;
const PREGEN_DISTANCE = 7000;
const POST_INTRO_CHUNK_TILES = 20;
const SEGMENTS_PER_CHUNK = 5;
const MAX_TEMPLATE_RETRIES = 3;
const MAX_PLAYABLE_GAP = MAX_FLIP_HORIZONTAL - SAFE_MARGIN;
const MAX_CLASS_GAP_THRESHOLD = MAX_PLAYABLE_GAP * 0.88;
const STRESS_GAP_THRESHOLD = MAX_PLAYABLE_GAP * 0.82;
const MIN_PILLAR_CLEARANCE_TILES = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hash01(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
  return x - Math.floor(x);
}

function seeded(seedA: number, seedB: number, seedC = 0): number {
  return hash01(seedA * 1013.37 + seedB * 173.11 + seedC * 19.97);
}

function chunkIdFor(startX: number, phase: ChunkPhase): string {
  return `chunk_${phase}_${Math.round(startX)}`;
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
  return clamp(rawGap, minPlayableGap, MAX_PLAYABLE_GAP);
}

export function getChallengeForScroll(totalScroll: number): ChallengeProfile {
  if (totalScroll < FLAT_ZONE_LENGTH) {
    return { challenge: 0, phase: 'intro' };
  }

  const base = clamp((totalScroll - FLAT_ZONE_LENGTH) / 20000, 0, 1);
  const wave =
    0.12 * Math.sin((TAU * totalScroll) / 2400) - 0.08 * Math.sin((TAU * totalScroll) / 5200);
  const challenge = clamp(base + wave, 0, 1);
  const phase: ChunkPhase = wave < -0.06 ? 'recovery' : 'main';

  return { challenge, phase };
}

function getChallengeParams(challenge: number, phase: ChunkPhase): ChallengeParams {
  const recoveryNerf = phase === 'recovery' ? 0.16 : 0;
  return {
    targetGapTiles: lerp(2.3, 3.6, challenge),
    targetPlatformTiles: lerp(8.0, 4.8, challenge),
    pillarChance: clamp(0.36 + challenge * 0.3 - recoveryNerf, 0.15, 0.72),
    pillarWidthTiles: lerp(3.4, 2.4, challenge),
    pillarExtensionTiles: lerp(1.2, 1.45, challenge),
    pillarMaxSpanTiles: lerp(7.2, 6.0, challenge),
    pillarSpacingTiles: lerp(4.8, 3.8, challenge) + (phase === 'recovery' ? 0.6 : 0),
    minSegmentsBetweenElevationChanges: phase === 'recovery' ? 2 : 1,
  };
}

function buildRhythmTemplate(
  chunkIndex: number,
  challenge: number,
  attempt: number,
  params: ChallengeParams
): RhythmTemplate {
  const startRoll = seeded(chunkIndex, attempt, 91);
  let startRow = 0;
  const row2Chance = 0.04 + challenge * 0.12;
  const row1Chance = 0.2 + challenge * 0.22;
  if (startRoll < row2Chance) {
    startRow = 2;
  } else if (startRoll < row2Chance + row1Chance) {
    startRow = 1;
  }
  let row = startRow;
  const segments: LaneSegment[] = [];
  let lastElevationChangeAt = -10;

  for (let i = 0; i < SEGMENTS_PER_CHUNK; i += 1) {
    const platformNoise = (seeded(chunkIndex, attempt, i * 11 + 7) - 0.5) * 1.6;
    const gapNoise = (seeded(chunkIndex, attempt, i * 11 + 13) - 0.5) * 0.7;

    const platformTiles = clamp(params.targetPlatformTiles + platformNoise, 4.4, 8.8);
    const gapTiles = clamp(params.targetGapTiles + gapNoise, 2.3, 3.8);

    const elevationActivity = lerp(0.18, 0.46, challenge);
    const elevationRoll = seeded(chunkIndex, attempt, i * 11 + 23);
    let delta = 0;
    const canChangeElevation =
      i - lastElevationChangeAt > params.minSegmentsBetweenElevationChanges;
    if (canChangeElevation && elevationRoll < elevationActivity) {
      delta = seeded(chunkIndex, attempt, i * 11 + 29) < 0.5 ? -1 : 1;
    }

    const nextRow = clamp(row + delta, 0, 2);
    const elevationRowDelta = nextRow - row;
    if (elevationRowDelta !== 0) {
      lastElevationChangeAt = i;
    }
    row = nextRow;

    segments.push({
      platformTiles,
      gapTiles,
      elevationRowDelta,
    });
  }

  return {
    segments,
    startRow,
    endRow: row,
  };
}

function mirrorSegments(template: RhythmTemplate, chunkIndex: number, attempt: number): RhythmTemplate {
  const segments = [...template.segments].reverse().map((segment, i) => {
    const platformJitter = (seeded(chunkIndex, attempt, i * 17 + 301) - 0.5) * 0.5;
    const gapJitter = (seeded(chunkIndex, attempt, i * 17 + 311) - 0.5) * 0.5;
    return {
      platformTiles: clamp(segment.platformTiles + platformJitter, 4.4, 8.8),
      gapTiles: clamp(segment.gapTiles + gapJitter, 2.3, 3.8),
      elevationRowDelta: -segment.elevationRowDelta,
    };
  });

  return {
    segments,
    startRow: template.endRow,
    endRow: template.startRow,
  };
}

function appendLaneFromSegments(
  startX: number,
  endX: number,
  baseY: number,
  platformHeight: number,
  tileSize: number,
  lane: 'bottom' | 'top',
  template: RhythmTemplate
): LaneBuildResult {
  const platforms: Platform[] = [];
  const gaps: GapWindow[] = [];
  const gapWidths: number[] = [];
  let cursor = startX;
  let row = template.startRow;

  for (let i = 0; i < template.segments.length && cursor < endX - 1; i += 1) {
    row = clamp(row + template.segments[i].elevationRowDelta, 0, 2);
    const elevationPx = row * tileSize;
    const platformY = lane === 'bottom' ? baseY - elevationPx : baseY;
    const platformHeightPx = platformHeight + elevationPx;

    const remainingWidth = endX - cursor;
    const width = Math.max(
      MIN_LANDING_WIDTH,
      Math.min(template.segments[i].platformTiles * tileSize, remainingWidth)
    );

    if (width >= MIN_LANDING_WIDTH) {
      platforms.push(createPlatform(cursor, platformY, width, platformHeightPx, lane));
    }

    cursor += width;
    if (cursor >= endX) {
      break;
    }

    const gapLength = clampGap(template.segments[i].gapTiles * tileSize, tileSize);
    const gapStartX = cursor;
    const gapEndX = Math.min(endX, cursor + gapLength);

    if (gapEndX > gapStartX) {
      gaps.push({ startX: gapStartX, endX: gapEndX, lane });
      gapWidths.push(gapEndX - gapStartX);
    }

    cursor = gapEndX;
  }

  return { platforms, gaps, gapWidths };
}

function appendMiddlePlatformsFromGaps(
  startX: number,
  endX: number,
  groundY: number,
  tileSize: number,
  gaps: GapWindow[],
  params: ChallengeParams,
  bottomLanePlatforms: Platform[],
  topLanePlatforms: Platform[],
  chunkIndex: number,
  attempt: number
): Platform[] {
  const platforms: Platform[] = [];
  const topBuffer = tileSize * 3;
  const bottomBuffer = tileSize * 5;
  const laneTop = topBuffer;
  const laneBottom = groundY - bottomBuffer;
  if (laneBottom <= laneTop) return platforms;

  const middleSpan = laneBottom - laneTop;
  const sortedGaps = [...gaps]
    .filter((gap) => gap.endX > startX && gap.startX < endX)
    .sort((a, b) => a.startX - b.startX);

  const minSpacing = params.pillarSpacingTiles * tileSize;
  const minClearance = MIN_PILLAR_CLEARANCE_TILES * tileSize;
  let lastPillarX = -Infinity;

  for (let i = 0; i < sortedGaps.length; i += 1) {
    const gap = sortedGaps[i];
    const spawnRoll = seeded(chunkIndex, attempt, 401 + i * 7);
    if (spawnRoll > params.pillarChance) continue;

    const gapWidth = gap.endX - gap.startX;
    const extension = params.pillarExtensionTiles * tileSize;
    const targetWidth = Math.max(params.pillarWidthTiles * tileSize, gapWidth + extension * 2);
    const width = Math.max(
      MIN_LANDING_WIDTH,
      Math.min(targetWidth, params.pillarMaxSpanTiles * tileSize)
    );

    const centerX = gap.startX + gapWidth * 0.5;
    const unclampedX = centerX - width * 0.5;
    const x = Math.max(startX, Math.min(unclampedX, endX - width));
    if (x - lastPillarX < minSpacing) continue;

    const yRatioBase = gap.lane === 'top' ? 0.3 : 0.72;
    const yRatioJitter = (seeded(chunkIndex, attempt, 433 + i * 7) - 0.5) * 0.04;
    const preferredY = Math.round(laneTop + middleSpan * clamp(yRatioBase + yRatioJitter, 0.2, 0.8));

    const overlappingBottom = bottomLanePlatforms.filter(
      (platform) => platform.x < x + width && platform.x + platform.width > x
    );
    const overlappingTop = topLanePlatforms.filter(
      (platform) => platform.x < x + width && platform.x + platform.width > x
    );
    if (overlappingBottom.length === 0 || overlappingTop.length === 0) continue;

    const closestBottomSurfaceY = Math.min(...overlappingBottom.map((platform) => platform.y));
    const closestTopSurfaceY = Math.max(
      ...overlappingTop.map((platform) => platform.y + platform.height)
    );

    const minY = Math.max(laneTop, closestTopSurfaceY + minClearance);
    const maxY = Math.min(laneBottom - tileSize, closestBottomSurfaceY - minClearance - tileSize);
    if (maxY < minY) continue;

    const y = clamp(preferredY, minY, maxY);

    platforms.push(createPlatform(x, y, width, tileSize, 'pillar'));
    lastPillarX = x;
  }

  return platforms;
}

function hasConsecutiveAbove(gapWidths: number[], threshold: number): boolean {
  let streak = 0;
  for (const width of gapWidths) {
    if (width >= threshold) {
      streak += 1;
      if (streak >= 2) return true;
    } else {
      streak = 0;
    }
  }
  return false;
}

function hasViableLanePath(gapWidths: number[]): boolean {
  return !hasConsecutiveAbove(gapWidths, STRESS_GAP_THRESHOLD);
}

function validateChunkPattern(
  bottomLane: LaneBuildResult,
  topLane: LaneBuildResult,
  middlePlatforms: Platform[]
): boolean {
  const hasConsecutiveMaxClass =
    hasConsecutiveAbove(bottomLane.gapWidths, MAX_CLASS_GAP_THRESHOLD) ||
    hasConsecutiveAbove(topLane.gapWidths, MAX_CLASS_GAP_THRESHOLD);
  if (hasConsecutiveMaxClass) return false;

  const hasLanePath = hasViableLanePath(bottomLane.gapWidths) || hasViableLanePath(topLane.gapWidths);
  if (hasLanePath) return true;

  return middlePlatforms.length > 0;
}

function ensureSharedCoverage(
  platforms: Platform[],
  startX: number,
  endX: number,
  groundY: number,
  tileSize: number
) {
  const step = Math.max(8, Math.floor(tileSize / 2));
  const maxSharedVoid = MAX_PLAYABLE_GAP;
  let voidStart: number | null = null;

  for (let x = startX; x <= endX; x += step) {
    const hasGround = platforms.some(
      (platform) =>
        platform.surface !== 'pillar' && x >= platform.x && x <= platform.x + platform.width
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

function buildProceduralChunk(
  startX: number,
  groundY: number,
  tileSize: number,
  profile: ChallengeProfile,
  chunkIndex: number,
  attempt: number
): {
  chunk: Chunk;
  bottomLane: LaneBuildResult;
  topLane: LaneBuildResult;
} {
  const params = getChallengeParams(profile.challenge, profile.phase);
  const platformHeight = tileSize * 2;
  const chunkLength = POST_INTRO_CHUNK_TILES * tileSize;
  const endX = startX + chunkLength;

  const baseTemplate = buildRhythmTemplate(chunkIndex, profile.challenge, attempt, params);
  const topTemplate = mirrorSegments(baseTemplate, chunkIndex, attempt);

  const bottomLane = appendLaneFromSegments(
    startX,
    endX,
    groundY,
    platformHeight,
    tileSize,
    'bottom',
    baseTemplate
  );

  const topLane = appendLaneFromSegments(
    startX,
    endX,
    0,
    platformHeight,
    tileSize,
    'top',
    topTemplate
  );

  const middlePlatforms = appendMiddlePlatformsFromGaps(
    startX,
    endX,
    groundY,
    tileSize,
    [...bottomLane.gaps, ...topLane.gaps],
    params,
    bottomLane.platforms,
    topLane.platforms,
    chunkIndex,
    attempt
  );

  const platforms: Platform[] = [
    ...bottomLane.platforms,
    ...topLane.platforms,
    ...middlePlatforms,
  ];

  ensureSharedCoverage(platforms, startX, endX, groundY, tileSize);

  return {
    chunk: {
      id: chunkIdFor(startX, profile.phase),
      width: chunkLength,
      platforms,
      challenge: profile.challenge,
      phase: profile.phase,
    },
    bottomLane,
    topLane,
  };
}

function generateChunk(startX: number, groundY: number, tileSize: number): Chunk {
  const introEnd = FLAT_ZONE_LENGTH;
  const platformHeight = tileSize * 2;

  if (startX < introEnd) {
    const width = Math.max(tileSize, introEnd - startX);
    return {
      id: chunkIdFor(startX, 'intro'),
      width,
      platforms: [
        createPlatform(startX, groundY, width, platformHeight, 'bottom'),
        createPlatform(startX, 0, width, platformHeight, 'top'),
      ],
      challenge: 0,
      phase: 'intro',
    };
  }

  const profile = getChallengeForScroll(startX);
  const chunkLength = POST_INTRO_CHUNK_TILES * tileSize;
  const chunkIndex = Math.floor((startX - introEnd) / chunkLength);

  for (let attempt = 0; attempt < MAX_TEMPLATE_RETRIES; attempt += 1) {
    const built = buildProceduralChunk(startX, groundY, tileSize, profile, chunkIndex, attempt);
    const middlePlatforms = built.chunk.platforms.filter((platform) => platform.surface === 'pillar');
    if (validateChunkPattern(built.bottomLane, built.topLane, middlePlatforms)) {
      return built.chunk;
    }
  }

  const fallbackProfile: ChallengeProfile = {
    challenge: Math.min(profile.challenge, 0.24),
    phase: 'recovery',
  };
  return buildProceduralChunk(
    startX,
    groundY,
    tileSize,
    fallbackProfile,
    chunkIndex,
    MAX_TEMPLATE_RETRIES + 1
  ).chunk;
}

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

    const chunk = generateChunk(nextSpawnX, groundY, tileSize);
    chunks.push(chunk);
    iterations += 1;
  }

  if (options?.disableTrim) {
    return chunks;
  }

  const trimX = totalScroll - screenWidth * 2;
  return chunks.filter((chunk) => getChunkEndX(chunk) > trimX);
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

  for (let i = 0; i < maxIterations; i += 1) {
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
    (platform) =>
      platform.x + platform.width > scrollOffset - margin &&
      platform.x < scrollOffset + screenWidth + margin
  );
}
