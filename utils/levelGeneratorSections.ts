import type { Chunk, LevelGeneratorConfig, Platform } from '../types/game';
import { FLAT_ZONE_LENGTH } from '../types/game';
import type { LevelSection, SectionPlatform } from './levelSections';
import { LEVEL_SECTIONS } from './levelSections';

const PREGEN_DISTANCE = 7000;
const FALLBACK_SECTION_WIDTH_TILES = 20;

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

const DEFAULT_TOP_CEILING_TILES = 2;

/** Compute corridor bounds from section platforms for pillar placement. */
function getCorridorBounds(
  section: LevelSection,
  groundY: number,
  tileSize: number
): { corridorTop: number; corridorBottom: number } {
  let corridorTop = DEFAULT_TOP_CEILING_TILES * tileSize;
  let corridorBottom = groundY;

  for (const p of section.platforms) {
    if (p.surface === 'top') {
      const bottomEdge = (p.yTiles + p.heightTiles) * tileSize;
      corridorTop = Math.max(corridorTop, bottomEdge);
    } else if (p.surface === 'bottom') {
      const topEdge = groundY - p.yTiles * tileSize;
      corridorBottom = Math.min(corridorBottom, topEdge);
    }
  }

  return { corridorTop, corridorBottom };
}

function instantiatePlatform(
  p: SectionPlatform,
  startX: number,
  groundY: number,
  tileSize: number,
  corridorBounds?: { corridorTop: number; corridorBottom: number }
): Platform {
  const worldX = startX + p.xTiles * tileSize;
  const width = p.widthTiles * tileSize;
  const height = p.heightTiles * tileSize;

  let worldY: number;
  if (p.surface === 'bottom') {
    worldY = groundY - p.yTiles * tileSize;
  } else if (p.surface === 'pillar' && p.yCorridorRatio !== undefined) {
    const corridorTop = corridorBounds?.corridorTop ?? DEFAULT_TOP_CEILING_TILES * tileSize;
    const corridorBottom = corridorBounds?.corridorBottom ?? groundY;
    const corridorHeight = corridorBottom - corridorTop;
    const placementRange = Math.max(0, corridorHeight - height);
    const pillarTop = corridorTop + p.yCorridorRatio * placementRange;
    worldY = Math.round(pillarTop);
  } else {
    worldY = p.yTiles * tileSize;
  }

  return createPlatform(worldX, worldY, width, height, p.surface);
}

function buildIntroChunk(startX: number, groundY: number, tileSize: number): Chunk {
  const width = Math.max(tileSize, FLAT_ZONE_LENGTH - startX);
  const platformHeight = tileSize * 2;
  return {
    id: `chunk_intro_${Math.round(startX)}`,
    width,
    platforms: [
      createPlatform(startX, groundY, width, platformHeight, 'bottom'),
      createPlatform(startX, 0, width, platformHeight, 'top'),
    ],
    challenge: 0,
    phase: 'intro',
  };
}

function buildSectionChunk(
  section: LevelSection,
  sectionIndex: number,
  startX: number,
  config: LevelGeneratorConfig
): Chunk {
  const { groundY, tileSize } = config;
  const corridorBounds = getCorridorBounds(section, groundY, tileSize);
  const platforms: Platform[] = section.platforms.map((p) =>
    instantiatePlatform(p, startX, groundY, tileSize, corridorBounds)
  );
  const widthPx = section.widthTiles * tileSize;

  return {
    id: `chunk_section_${sectionIndex}_${Math.round(startX)}`,
    width: widthPx,
    platforms,
    challenge: 0,
    phase: 'main',
  };
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function isValidSectionPlatform(platform: SectionPlatform, sectionWidthTiles: number): boolean {
  if (!isNonNegativeFinite(platform.xTiles)) return false;
  if (!isNonNegativeFinite(platform.yTiles)) return false;
  if (!isPositiveFinite(platform.widthTiles)) return false;
  if (!isPositiveFinite(platform.heightTiles)) return false;
  if (platform.xTiles + platform.widthTiles > sectionWidthTiles) return false;
  return true;
}

function isValidSection(section: LevelSection): boolean {
  if (!isPositiveFinite(section.widthTiles)) return false;
  if (!Array.isArray(section.platforms) || section.platforms.length === 0) return false;
  return section.platforms.every((platform) => isValidSectionPlatform(platform, section.widthTiles));
}

function getValidatedSections(): LevelSection[] {
  return LEVEL_SECTIONS.filter(isValidSection);
}

const VALIDATED_SECTIONS = getValidatedSections();

function buildFallbackMainChunk(startX: number, config: LevelGeneratorConfig): Chunk {
  const width = Math.max(config.tileSize, FALLBACK_SECTION_WIDTH_TILES * config.tileSize);
  const platformHeight = config.tileSize * 2;
  return {
    id: `chunk_section_fallback_${Math.round(startX)}`,
    width,
    platforms: [
      createPlatform(startX, config.groundY, width, platformHeight, 'bottom'),
      createPlatform(startX, 0, width, platformHeight, 'top'),
    ],
    challenge: 0,
    phase: 'main',
  };
}

function generateChunk(startX: number, config: LevelGeneratorConfig): Chunk {
  if (startX < FLAT_ZONE_LENGTH) {
    return buildIntroChunk(startX, config.groundY, config.tileSize);
  }

  const validSections = VALIDATED_SECTIONS;
  if (validSections.length === 0) {
    return buildFallbackMainChunk(startX, config);
  }

  const sectionCycleWidthPx = validSections.reduce(
    (sum, section) => sum + section.widthTiles * config.tileSize,
    0
  );
  if (!isPositiveFinite(sectionCycleWidthPx)) {
    return buildFallbackMainChunk(startX, config);
  }

  const offsetFromMain = Math.max(0, startX - FLAT_ZONE_LENGTH);
  let offsetInCycle = offsetFromMain % sectionCycleWidthPx;
  let sectionIndex = 0;
  let section = validSections[0];
  for (let i = 0; i < validSections.length; i += 1) {
    const sectionWidthPx = validSections[i].widthTiles * config.tileSize;
    if (offsetInCycle < sectionWidthPx) {
      sectionIndex = i;
      section = validSections[i];
      break;
    }
    offsetInCycle -= sectionWidthPx;
  }

  return buildSectionChunk(section, sectionIndex, startX, config);
}

export function generateLevelChunks(
  config: LevelGeneratorConfig,
  totalScroll: number,
  existingChunks: Chunk[],
  options?: { disableTrim?: boolean }
): Chunk[] {
  const chunks = [...existingChunks];
  const spawnThreshold = totalScroll + config.screenWidth * 2;
  const maxChunkAddsPerTick = 6;
  let iterations = 0;

  while (iterations < maxChunkAddsPerTick) {
    const lastChunk = chunks[chunks.length - 1];
    const nextSpawnX = lastChunk ? getChunkEndX(lastChunk) : 0;
    if (nextSpawnX >= spawnThreshold) break;

    const chunk = generateChunk(nextSpawnX, config);
    chunks.push(chunk);
    iterations += 1;
  }

  if (options?.disableTrim) {
    return chunks;
  }

  const trimX = totalScroll - config.screenWidth * 2;
  return chunks.filter((chunk) => getChunkEndX(chunk) > trimX);
}

export function preGenerateLevelChunks(
  config: LevelGeneratorConfig,
  targetDistance: number = PREGEN_DISTANCE
): Chunk[] {
  let chunks: Chunk[] = [];
  const maxIterations = 80;

  for (let i = 0; i < maxIterations; i += 1) {
    const lastChunk = chunks[chunks.length - 1];
    const nextSpawnX = lastChunk ? getChunkEndX(lastChunk) : 0;
    if (nextSpawnX >= targetDistance) break;

    const simulatedScroll = Math.max(0, nextSpawnX - config.screenWidth * 2 + 100);
    const next = generateLevelChunks(config, simulatedScroll, chunks, {
      disableTrim: true,
    });
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
