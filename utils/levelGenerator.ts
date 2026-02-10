import type { Chunk, Platform } from '../types/game';
import {
  FLAT_ZONE_LENGTH,
  MAX_FLIP_HORIZONTAL,
  MIN_LANDING_WIDTH,
  SAFE_MARGIN,
} from '../types/game';

let chunkId = 0;

function generateChunk(
  startX: number,
  difficulty: 'flat' | 'easy' | 'medium' | 'hard',
  prevPlatform: { x: number; y: number; width: number } | null,
  screenHeight: number,
  groundY: number,
  tileSize: number
): Chunk | null {
  const platforms: Platform[] = [];
  const platformHeight = tileSize * 2; // 2 rows of tiles

  if (difficulty === 'flat') {
    // Continuous ground - one long platform
    const width = FLAT_ZONE_LENGTH;
    platforms.push({
      x: startX,
      y: groundY,
      width,
      height: platformHeight,
      tileType: 'grass',
    });
    return {
      id: `chunk_${chunkId++}`,
      width,
      platforms,
      difficulty: 'flat',
    };
  }

  // Easy/medium/hard: platforms with gaps
  const maxGap =
    difficulty === 'easy'
      ? MAX_FLIP_HORIZONTAL * 0.5
      : difficulty === 'medium'
        ? MAX_FLIP_HORIZONTAL * 0.9
        : MAX_FLIP_HORIZONTAL - SAFE_MARGIN;

  const minGap = difficulty === 'easy' ? 40 : 60;
  const platformWidth =
    difficulty === 'hard' ? Math.max(MIN_LANDING_WIDTH, tileSize * 2) : tileSize * 4;

  let x = startX;
  const numPlatforms = difficulty === 'hard' ? 4 : 3;

  for (let i = 0; i < numPlatforms; i++) {
    // Connect to previous platform
    if (prevPlatform && i === 0) {
      x = prevPlatform.x + prevPlatform.width;
    }

    const gap = i > 0 ? minGap + Math.random() * (maxGap - minGap) : 0;
    x += gap;

    platforms.push({
      x,
      y: groundY,
      width: platformWidth,
      height: platformHeight,
      tileType: 'grass',
    });
    x += platformWidth;
  }

  // Validate reachability
  for (let i = 1; i < platforms.length; i++) {
    const gap = platforms[i].x - (platforms[i - 1].x + platforms[i - 1].width);
    if (gap > MAX_FLIP_HORIZONTAL) {
      return null; // Regenerate with flat fallback
    }
    if (platforms[i].width < MIN_LANDING_WIDTH) {
      return null;
    }
  }

  return {
    id: `chunk_${chunkId++}`,
    width: x - startX,
    platforms,
    difficulty,
  };
}

export function getDifficultyForScroll(totalScroll: number): 'flat' | 'easy' | 'medium' | 'hard' {
  if (totalScroll < FLAT_ZONE_LENGTH) return 'flat';
  if (totalScroll < FLAT_ZONE_LENGTH + 1200) return 'easy';
  if (totalScroll < FLAT_ZONE_LENGTH + 2400) return 'medium';
  return 'hard';
}

/** How far ahead to generate level (px) so level is ready before player reaches it */
const PREGEN_DISTANCE = 7000;

export function generateLevelChunks(
  totalScroll: number,
  screenWidth: number,
  screenHeight: number,
  groundY: number,
  tileSize: number,
  existingChunks: Chunk[]
): Chunk[] {
  const chunks = [...existingChunks];
  const lastChunk = chunks[chunks.length - 1];
  const lastPlatform = lastChunk?.platforms[lastChunk.platforms.length - 1] ?? null;
  const nextSpawnX = lastPlatform ? lastPlatform.x + lastPlatform.width : 0;

  // Spawn when we're within 2 screens of the end
  const spawnThreshold = totalScroll + screenWidth * 2;
  if (nextSpawnX < spawnThreshold) {
    const difficulty = getDifficultyForScroll(nextSpawnX);
    const prevPlatform = lastPlatform
      ? { x: lastPlatform.x, y: lastPlatform.y, width: lastPlatform.width }
      : null;

    let chunk = generateChunk(
      nextSpawnX,
      difficulty,
      prevPlatform,
      screenHeight,
      groundY,
      tileSize
    );

    if (!chunk && difficulty !== 'flat') {
      chunk = generateChunk(nextSpawnX, 'flat', prevPlatform, screenHeight, groundY, tileSize);
    }

    if (chunk) {
      chunks.push(chunk);
    }
  }

  // Trim chunks far behind to save memory
  const trimX = totalScroll - screenWidth * 2;
  return chunks.filter(
    (c) => c.platforms[c.platforms.length - 1].x + c.platforms[c.platforms.length - 1].width > trimX
  );
}

/** Pre-generate many chunks so the level is fully built before the player runs. */
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
    const lastPlatform = lastChunk?.platforms[lastChunk.platforms.length - 1] ?? null;
    const nextSpawnX = lastPlatform ? lastPlatform.x + lastPlatform.width : 0;
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
    // Only append the new chunk. generateLevelChunks trims old chunks; we must not use that trimmed
    // list or we lose the flat zone and start of level (empty screen at launch).
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
