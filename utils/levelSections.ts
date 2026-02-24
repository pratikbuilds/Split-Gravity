import type { Platform } from '../types/game';

/**
 * Level section definitions for the section-based level generator.
 *
 * ## Section Taxonomy and Patterns
 *
 * **Section types** (pillars are optional):
 * - **pillar+pit**: Gap in floor and/or ceiling with pillar(s) in the gap. Player must land on pillar or fall.
 * - **ledge-only**: Top and/or bottom have gaps, no pillars. Jump/flip across ledges only.
 * - **variable-height**: Top depth (heightTiles 2 vs 3) or bottom lift (yTiles 0 vs 1) varies to create slopes, steps, squeeze zones.
 *
 * **Geometry patterns** (avoid "everything center"):
 * - **center**: Pillar(s) horizontally centered in gap.
 * - **left-bias** / **right-bias**: Pillar(s) or ledges asymmetric; one side longer.
 * - **zigzag**: Pillars alternate vertical position (e.g. 0.25, 0.75, 0.25) or horizontal (left, right, left).
 * - **stair**: Pillars step up or down (e.g. 0.2, 0.5, 0.8).
 * - **asymmetric**: Uneven ledges, pillar offset from center.
 *
 * Each section should have a clear type and pattern for variety and engagement.
 *
 * ## Section overview (LEVEL_SECTIONS order)
 *
 * | #  | Section           | Pillars | Variable height | Pattern        |
 * |----|-------------------|---------|-----------------|----------------|
 * | 1  | intro_squeeze     | 2       | yes (raised L)  | stair 0.2/0.8  |
 * | 2  | ledge_hop         | 1       | yes (raised R)  | left-bias      |
 * | 3  | cave_squeeze     | 3       | yes (raised R)  | zigzag             |
 * | 4  | left_anchor       | 1       | no              | left-bias          |
 * | 5  | broken_bridge     | 3       | yes (deep R)   | zigzag             |
 * | 6  | ceiling_trap      | 2       | yes (raised R) | high/low           |
 * | 7  | stair_climb       | 3       | no              | stair 0.2/0.5/0.8 |
 * | 8  | zigzag_escape     | 3       | no              | zigzag             |
 * | 9  | ceiling_drop     | 1       | no              | center             |
 * | 10 | recovery          | 1       | no              | center             |
 * | 11 | low_ceiling       | 1       | yes             | center             |
 * | 12 | raised_floor      | 2       | yes             | asymmetric         |
 * | 13 | corridor_squeeze | 1       | yes             | squeeze + pillar   |
 * | 14 | gauntlet          | 4       | no              | center             |
 *
 * ## Level Design Guide (for future sessions)
 *
 * ### Pits and pillars
 * Pillars alone (with full floor/ceiling) are too easy — the player can walk on the floor or ceiling.
 * **Pillar+pit sections**: Pair pillars with pits to force the player to land on the pillar or fall.
 * **Ledge-only sections**: Some sections have gaps but no pillars — player must jump/flip across (gap ≤4 tiles).
 *
 * ### Pit types
 * - **Bottom pit**: Gap in the floor — omit bottom platforms for that x range. Player must land on pillar or fall.
 * - **Top pit**: Gap in the ceiling — omit top platforms. Player (with flipped gravity) must land on pillar or hit ceiling.
 * - **Both**: Pit on floor AND ceiling around the pillar = maximum challenge.
 *
 * ### How to add pits
 * `buildCorridorSection` creates contiguous top+bottom for each beat — it cannot make gaps.
 * Use **manual sections** (like SECTION_3, SECTION_6, SECTION_8): define platforms as arrays with
 * explicit segments. Leave gaps by not placing platforms in certain x ranges.
 *
 * Example bottom pit: two bottom segments with a gap between:
 *   { surface: 'bottom', xTiles: 0, widthTiles: 8, ... },
 *   { surface: 'bottom', xTiles: 16, widthTiles: 8, ... },  // gap at x 8-15
 *
 * Example top pit: same pattern for surface: 'top'.
 *
 * ### Pillar vertical position
 * Use `yCorridorRatio` (0 = top, 0.5 = center, 1 = bottom) for device-independent placement.
 * Avoid `yTilesFromTop` — it breaks on different screen heights.
 *
 * ### Symmetry and readability
 * Left-right mirror (e.g. left ledge 6 tiles = right ledge 6 tiles) creates a cleaner look.
 * Uniform heights (2 for top/bottom) are easier to read. Keep sections fully playable.
 *
 * ### Varied heights (use sparingly)
 * - **Top**: heightTiles 2 = shallow, 3 = deeper
 * - **Bottom**: yTiles 0 = baseline, 1 = lifted; heightTiles = max(2, yTiles + 3)
 *
 * ### Constraints
 * - MIN_LANDING_WIDTH ≈ 48px (~1.5 tiles): pillars/ledges should be ≥2 tiles wide
 * - MAX_FLIP_HORIZONTAL ≈ 120px (~4 tiles): gaps should stay under ~4 tiles for reachability
 * - MAX_JUMPABLE_GAP_TILES = 3: gap from last pillar/ledge to next landing must be ≤3 tiles
 */
/** Max gap (tiles) from last pillar/ledge to next landing. 3 tiles = 96px < MAX_FLIP_HORIZONTAL (120px). */
const MAX_JUMPABLE_GAP_TILES = 3;

/** Validates that no section has unreachable gaps. Throws at load if faulty. */
function validateSectionReachability(section: LevelSection): void {
  const pillars = section.platforms.filter((p) => p.surface === 'pillar');
  const ledges = section.platforms.filter((p) => p.surface === 'top' || p.surface === 'bottom');

  if (pillars.length > 0) {
    const rightLedges = ledges.filter((p) => p.xTiles > 0);
    const leftmostRightLedge = rightLedges.length
      ? Math.min(...rightLedges.map((p) => p.xTiles))
      : section.widthTiles;
    const rightmostPillarEnd = Math.max(...pillars.map((p) => p.xTiles + p.widthTiles));
    const gap = leftmostRightLedge - rightmostPillarEnd;
    if (gap > MAX_JUMPABLE_GAP_TILES) {
      throw new Error(
        `Section ${section.id}: gap ${gap} tiles from last pillar (end ${rightmostPillarEnd}) to right ledge (start ${leftmostRightLedge}) exceeds max ${MAX_JUMPABLE_GAP_TILES}`
      );
    }
  } else {
    const ledgeRanges = ledges
      .filter((p) => p.surface === 'bottom')
      .map((p) => ({ start: p.xTiles, end: p.xTiles + p.widthTiles }))
      .sort((a, b) => a.start - b.start);
    for (let i = 1; i < ledgeRanges.length; i++) {
      const gap = ledgeRanges[i].start - ledgeRanges[i - 1].end;
      if (gap > MAX_JUMPABLE_GAP_TILES) {
        throw new Error(
          `Section ${section.id}: ledge-only gap ${gap} tiles exceeds max ${MAX_JUMPABLE_GAP_TILES}`
        );
      }
    }
  }
}

/**
 * Platform defined in tile coordinates. All values are in tiles (not pixels).
 *
 * **Coordinate system by surface:**
 * - `top`: xTiles = left edge, yTiles = rows from top of screen (0 = ceiling), width/height = extent
 * - `bottom`: xTiles = left edge, yTiles = rows above floor (0 = baseline, 1 = lifted), width/height = extent
 * - `pillar`: horizontal shelf in corridor. xTiles = left edge, yTiles = rows from top, widthTiles = horizontal span, heightTiles = vertical thickness (usually 1)
 */
export interface SectionPlatform {
  surface: Extract<Platform['surface'], 'bottom' | 'top' | 'pillar'>;
  xTiles: number;
  yTiles: number;
  widthTiles: number;
  heightTiles: number;
  /** For pillars only: vertical position as ratio of corridor (0=top, 0.5=center, 1=bottom). Overrides yTiles when set. */
  yCorridorRatio?: number;
}

export interface LevelSection {
  id: string;
  widthTiles: number;
  platforms: SectionPlatform[];
}

interface CorridorBeat {
  widthTiles: number;
  topDepthTiles: number;
  bottomLiftTiles: number;
}

/** @internal Used by buildCorridorSection */
interface PillarSpec {
  xTiles: number;
  yTiles: number;
  widthTiles: number;
  heightTiles: number;
  yCorridorRatio?: number;
}

/**
 * Semantic spec for a horizontal pillar (shelf) in the corridor.
 * Pillars extend left-to-right; they are NOT vertical columns.
 *
 * Use yCorridorRatio for device-independent vertical placement (0 = top of corridor, 1 = bottom).
 * If yCorridorRatio is set, yTilesFromTop is ignored.
 */
export interface HorizontalPillarSpec {
  /** Left edge in tiles (0 = section start) */
  xTiles: number;
  /** Rows from top of screen (only used when yCorridorRatio is not set) */
  yTilesFromTop?: number;
  /** Vertical position as ratio of corridor height: 0 = top, 0.5 = center, 1 = bottom. Takes precedence over yTilesFromTop. */
  yCorridorRatio?: number;
  /** Horizontal span in tiles (how wide the shelf is) */
  spanTiles: number;
  /** Vertical thickness in tiles (default 1) */
  thicknessTiles?: number;
}

/** Creates a PillarSpec from semantic horizontal pillar params. */
function toPillarSpec(spec: HorizontalPillarSpec): PillarSpec {
  return {
    xTiles: spec.xTiles,
    yTiles: spec.yTilesFromTop ?? 0,
    widthTiles: spec.spanTiles,
    heightTiles: spec.thicknessTiles ?? 1,
    yCorridorRatio: spec.yCorridorRatio,
  };
}

/**
 * Helper to create a centered horizontal pillar spec (device-independent vertical placement).
 * @param spanTiles - Horizontal extent in tiles
 * @param sectionWidthTiles - Section width (used to compute center)
 * @param yCorridorRatio - Vertical position: 0 = top, 0.5 = center, 1 = bottom
 * @param thicknessTiles - Vertical thickness (default 1)
 */
export function centeredHorizontalPillar(
  spanTiles: number,
  sectionWidthTiles: number,
  yCorridorRatio: number,
  thicknessTiles?: number
): HorizontalPillarSpec {
  const xTiles = Math.max(0, Math.floor((sectionWidthTiles - spanTiles) / 2));
  return { xTiles, yCorridorRatio, spanTiles, thicknessTiles };
}

/**
 * Builds a section with contiguous top/bottom per beat. Cannot create pits (gaps).
 * For pillar + pit sections, use manual LevelSection with explicit platform arrays.
 */
function buildCorridorSection(
  id: string,
  widthTiles: number,
  beats: CorridorBeat[],
  pillars: HorizontalPillarSpec[] = []
): LevelSection {
  const platforms: SectionPlatform[] = [];
  let cursorX = 0;

  for (const beat of beats) {
    const beatWidth = Math.max(1, Math.floor(beat.widthTiles));
    const topDepth = Math.max(1, Math.floor(beat.topDepthTiles));
    const bottomLift = Math.max(0, Math.floor(beat.bottomLiftTiles));

    platforms.push({
      surface: 'top',
      xTiles: cursorX,
      yTiles: 0,
      widthTiles: beatWidth,
      heightTiles: topDepth,
    });
    platforms.push({
      surface: 'bottom',
      xTiles: cursorX,
      yTiles: bottomLift,
      widthTiles: beatWidth,
      heightTiles: Math.max(2, bottomLift + 3),
    });
    cursorX += beatWidth;
  }

  if (cursorX !== widthTiles) {
    throw new Error(
      `Section ${id} beat widths (${cursorX}) do not match widthTiles (${widthTiles}).`
    );
  }

  for (const pillar of pillars) {
    const spec = toPillarSpec(pillar);
    const p: SectionPlatform = {
      surface: 'pillar',
      xTiles: spec.xTiles,
      yTiles: spec.yTiles,
      widthTiles: spec.widthTiles,
      heightTiles: spec.heightTiles,
    };
    if (spec.yCorridorRatio !== undefined) {
      p.yCorridorRatio = spec.yCorridorRatio;
    }
    platforms.push(p);
  }

  return { id, widthTiles, platforms };
}

// --- 1. intro_squeeze: Two pillars stair pattern + deeper ceiling in gap. ---
// Top: left/right heightTiles 2, middle gap has no top (pit). Bottom: left raised (yTiles 1), right baseline = asymmetry.
// Pillars: left high (0.2), right low (0.8) = stair pattern.
const SECTION_INTRO_SQUEEZE: LevelSection = {
  id: 'section_intro_squeeze',
  widthTiles: 24,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'top', xTiles: 18, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 1, widthTiles: 6, heightTiles: 4 },
    { surface: 'bottom', xTiles: 18, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    {
      surface: 'pillar',
      xTiles: 5,
      yTiles: 0,
      widthTiles: 5,
      heightTiles: 1,
      yCorridorRatio: 0.2,
    },
    {
      surface: 'pillar',
      xTiles: 11,
      yTiles: 0,
      widthTiles: 5,
      heightTiles: 1,
      yCorridorRatio: 0.8,
    },
  ],
};

// --- 2. cave_squeeze: Three pillars zigzag + raised right floor. Pattern: zigzag + variable height.
// Bottom: left ledge baseline, right ledge raised (yTiles 1). Last pillar extends into right ledge for safe landing.
const SECTION_CAVE_SQUEEZE: LevelSection = {
  id: 'section_cave_squeeze',
  widthTiles: 26,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'top', xTiles: 19, yTiles: 0, widthTiles: 7, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 19, yTiles: 1, widthTiles: 7, heightTiles: 4 },
    {
      surface: 'pillar',
      xTiles: 5,
      yTiles: 0,
      widthTiles: 5,
      heightTiles: 1,
      yCorridorRatio: 0.25,
    },
    {
      surface: 'pillar',
      xTiles: 11,
      yTiles: 0,
      widthTiles: 5,
      heightTiles: 1,
      yCorridorRatio: 0.75,
    },
    {
      surface: 'pillar',
      xTiles: 16,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.25,
    },
  ],
};

// --- 3. broken_bridge: Three pillars zigzag + low ceiling in gap. ---
// Top: deeper ceiling (heightTiles 3) on right ledge = squeeze. Pillars 0.25, 0.75, 0.25.
const SECTION_BROKEN_BRIDGE: LevelSection = {
  id: 'section_broken_bridge',
  widthTiles: 28,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'top', xTiles: 22, yTiles: 0, widthTiles: 6, heightTiles: 3 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 22, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    {
      surface: 'pillar',
      xTiles: 5,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.25,
    },
    {
      surface: 'pillar',
      xTiles: 12,
      yTiles: 0,
      widthTiles: 5,
      heightTiles: 1,
      yCorridorRatio: 0.75,
    },
    {
      surface: 'pillar',
      xTiles: 17,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.25,
    },
  ],
};

// --- 4. ceiling_trap: Two pillars + stepped floor. ---
// Bottom: left baseline, right raised (yTiles 1). Pillars high (0.2) and low (0.75).
const SECTION_CEILING_TRAP: LevelSection = {
  id: 'section_ceiling_trap',
  widthTiles: 26,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'top', xTiles: 20, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 8, heightTiles: 2 },
    { surface: 'bottom', xTiles: 18, yTiles: 1, widthTiles: 8, heightTiles: 4 },
    {
      surface: 'pillar',
      xTiles: 6,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.2,
    },
    {
      surface: 'pillar',
      xTiles: 11,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.75,
    },
  ],
};

// --- 5. stair_climb: Three pillars stepping down + raised right floor. Pattern: stair (0.2, 0.5, 0.8).
const SECTION_STAIR_CLIMB: LevelSection = {
  id: 'section_stair_climb',
  widthTiles: 28,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'top', xTiles: 22, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 22, yTiles: 1, widthTiles: 6, heightTiles: 4 },
    {
      surface: 'pillar',
      xTiles: 4,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.2,
    },
    {
      surface: 'pillar',
      xTiles: 11,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.5,
    },
    {
      surface: 'pillar',
      xTiles: 18,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.8,
    },
  ],
};

// --- 6. zigzag_escape: Three pillars zigzag + deeper left ceiling. Pattern: zigzag (0.25, 0.75, 0.25).
// Top: left ledge heightTiles 3 (low ceiling), right heightTiles 2.
const SECTION_ZIGZAG_ESCAPE: LevelSection = {
  id: 'section_zigzag_escape',
  widthTiles: 26,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 3 },
    { surface: 'top', xTiles: 20, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 20, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    {
      surface: 'pillar',
      xTiles: 4,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.25,
    },
    {
      surface: 'pillar',
      xTiles: 11,
      yTiles: 0,
      widthTiles: 5,
      heightTiles: 1,
      yCorridorRatio: 0.75,
    },
    {
      surface: 'pillar',
      xTiles: 16,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.25,
    },
  ],
};

// --- 7. recovery: Short breather + stepped floor. Left raised, right baseline.
const SECTION_RECOVERY: LevelSection = {
  id: 'section_recovery',
  widthTiles: 20,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'top', xTiles: 14, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 1, widthTiles: 6, heightTiles: 4 },
    { surface: 'bottom', xTiles: 14, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    {
      surface: 'pillar',
      xTiles: 4,
      yTiles: 0,
      widthTiles: 12,
      heightTiles: 1,
      yCorridorRatio: 0.5,
    },
  ],
};

// --- 8. gauntlet: Four pillars zigzag + stepped floor. Pattern: zigzag 0.25, 0.75, 0.25, 0.75.
// Bottom: left baseline, right raised (yTiles 1) for variety.
const SECTION_GAUNTLET: LevelSection = {
  id: 'section_gauntlet',
  widthTiles: 32,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'top', xTiles: 28, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'bottom', xTiles: 28, yTiles: 1, widthTiles: 4, heightTiles: 4 },
    {
      surface: 'pillar',
      xTiles: 2,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.25,
    },
    {
      surface: 'pillar',
      xTiles: 9,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.75,
    },
    {
      surface: 'pillar',
      xTiles: 16,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.25,
    },
    {
      surface: 'pillar',
      xTiles: 24,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.75,
    },
  ],
};

// --- 9. ledge_hop: Left-bias pillar + asymmetric floor. ---
// Bottom: left ledge baseline, right ledge raised (yTiles 1). Pillar left-of-center.
const SECTION_LEDGE_HOP: LevelSection = {
  id: 'section_ledge_hop',
  widthTiles: 24,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 8, heightTiles: 2 },
    { surface: 'top', xTiles: 16, yTiles: 0, widthTiles: 8, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 8, heightTiles: 2 },
    { surface: 'bottom', xTiles: 16, yTiles: 1, widthTiles: 8, heightTiles: 4 },
    {
      surface: 'pillar',
      xTiles: 7,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.6,
    },
  ],
};

// --- 10. left_anchor: Asymmetric pillar, left-of-center + raised right floor. ---
// Pillar spans most of gap (10-18) so max jump to right ledge is 2 tiles.
const SECTION_LEFT_ANCHOR: LevelSection = {
  id: 'section_left_anchor',
  widthTiles: 26,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 10, heightTiles: 2 },
    { surface: 'top', xTiles: 20, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 10, heightTiles: 2 },
    { surface: 'bottom', xTiles: 20, yTiles: 1, widthTiles: 6, heightTiles: 4 },
    {
      surface: 'pillar',
      xTiles: 10,
      yTiles: 0,
      widthTiles: 8,
      heightTiles: 1,
      yCorridorRatio: 0.6,
    },
  ],
};

// --- 11. ceiling_drop: Top gap + bottom raised middle + two pillars. ---
// Bottom: 0-8, 10-14 (raised), 16-22. Pillars bridge gaps 8-10 and 14-16; also help ceiling gap.
const SECTION_CEILING_DROP: LevelSection = {
  id: 'section_ceiling_drop',
  widthTiles: 22,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 9, heightTiles: 2 },
    { surface: 'top', xTiles: 13, yTiles: 0, widthTiles: 9, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 8, heightTiles: 2 },
    { surface: 'bottom', xTiles: 10, yTiles: 1, widthTiles: 4, heightTiles: 4 },
    { surface: 'bottom', xTiles: 16, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    {
      surface: 'pillar',
      xTiles: 7,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.25,
    },
    {
      surface: 'pillar',
      xTiles: 12,
      yTiles: 0,
      widthTiles: 5,
      heightTiles: 1,
      yCorridorRatio: 0.75,
    },
  ],
};

// --- 12. low_ceiling: Variable top depth (heightTiles 3) creates squeeze. Pattern: center.
// Type: variable-height + pillar. Deeper ceiling in gap forces precise pillar landings.
const SECTION_LOW_CEILING: LevelSection = {
  id: 'section_low_ceiling',
  widthTiles: 24,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'top', xTiles: 10, yTiles: 0, widthTiles: 4, heightTiles: 3 },
    { surface: 'top', xTiles: 18, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 18, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    {
      surface: 'pillar',
      xTiles: 8,
      yTiles: 0,
      widthTiles: 8,
      heightTiles: 1,
      yCorridorRatio: 0.5,
    },
  ],
};

// --- 13. raised_floor: Bottom lift (yTiles 1) with pillars bridging gaps. Type: variable-height.
// Zigzag 0.3/0.7 so player can flip between pillars.
const SECTION_RAISED_FLOOR: LevelSection = {
  id: 'section_raised_floor',
  widthTiles: 24,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 24, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 8, heightTiles: 2 },
    { surface: 'bottom', xTiles: 10, yTiles: 1, widthTiles: 4, heightTiles: 4 },
    { surface: 'bottom', xTiles: 16, yTiles: 0, widthTiles: 8, heightTiles: 2 },
    {
      surface: 'pillar',
      xTiles: 8,
      yTiles: 0,
      widthTiles: 2,
      heightTiles: 1,
      yCorridorRatio: 0.3,
    },
    {
      surface: 'pillar',
      xTiles: 14,
      yTiles: 0,
      widthTiles: 2,
      heightTiles: 1,
      yCorridorRatio: 0.7,
    },
  ],
};

// --- 14. corridor_squeeze: buildCorridorSection with variable beats + center pillar in squeeze. ---
// Middle beat has deeper top (3) and raised bottom (1). Pillar at center adds landing option.
const SECTION_CORRIDOR_SQUEEZE: LevelSection = buildCorridorSection(
  'section_corridor_squeeze',
  24,
  [
    { widthTiles: 8, topDepthTiles: 2, bottomLiftTiles: 0 },
    { widthTiles: 8, topDepthTiles: 3, bottomLiftTiles: 1 },
    { widthTiles: 8, topDepthTiles: 2, bottomLiftTiles: 0 },
  ],
  [{ xTiles: 9, yCorridorRatio: 0.5, spanTiles: 6 }]
);

// ========== CHALLENGING SECTIONS (adrenaline / harder) ==========

// --- 15. double_pit_narrow: Both top AND bottom pits, narrow pillars. Must land precisely.
// Last pillar extends to right ledge (gap ≤3 tiles).
const SECTION_DOUBLE_PIT_NARROW: LevelSection = {
  id: 'section_double_pit_narrow',
  widthTiles: 28,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'top', xTiles: 22, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'bottom', xTiles: 22, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    {
      surface: 'pillar',
      xTiles: 5,
      yTiles: 0,
      widthTiles: 3,
      heightTiles: 1,
      yCorridorRatio: 0.15,
    },
    {
      surface: 'pillar',
      xTiles: 11,
      yTiles: 0,
      widthTiles: 3,
      heightTiles: 1,
      yCorridorRatio: 0.85,
    },
    {
      surface: 'pillar',
      xTiles: 17,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.15,
    },
  ],
};

// --- 16. ledge_only_dash: No pillars — pure jump/flip across ~3-tile gap. Adrenaline.
const SECTION_LEDGE_ONLY_DASH: LevelSection = {
  id: 'section_ledge_only_dash',
  widthTiles: 21,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 5, heightTiles: 2 },
    { surface: 'top', xTiles: 8, yTiles: 0, widthTiles: 5, heightTiles: 2 },
    { surface: 'top', xTiles: 16, yTiles: 0, widthTiles: 5, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 5, heightTiles: 2 },
    { surface: 'bottom', xTiles: 8, yTiles: 0, widthTiles: 5, heightTiles: 2 },
    { surface: 'bottom', xTiles: 16, yTiles: 0, widthTiles: 5, heightTiles: 2 },
  ],
};

// --- 17. five_pillar_zigzag: Long sequence, rapid flip pattern.
const SECTION_FIVE_PILLAR_ZIGZAG: LevelSection = {
  id: 'section_five_pillar_zigzag',
  widthTiles: 36,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 3, heightTiles: 2 },
    { surface: 'top', xTiles: 33, yTiles: 0, widthTiles: 3, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 3, heightTiles: 2 },
    { surface: 'bottom', xTiles: 33, yTiles: 1, widthTiles: 3, heightTiles: 4 },
    { surface: 'pillar', xTiles: 2, yTiles: 0, widthTiles: 4, heightTiles: 1, yCorridorRatio: 0.2 },
    { surface: 'pillar', xTiles: 8, yTiles: 0, widthTiles: 4, heightTiles: 1, yCorridorRatio: 0.8 },
    {
      surface: 'pillar',
      xTiles: 14,
      yTiles: 0,
      widthTiles: 4,
      heightTiles: 1,
      yCorridorRatio: 0.2,
    },
    {
      surface: 'pillar',
      xTiles: 20,
      yTiles: 0,
      widthTiles: 4,
      heightTiles: 1,
      yCorridorRatio: 0.8,
    },
    {
      surface: 'pillar',
      xTiles: 26,
      yTiles: 0,
      widthTiles: 4,
      heightTiles: 1,
      yCorridorRatio: 0.2,
    },
  ],
};

// --- 18. squeeze_tunnel: Deep ceiling (3) + raised floor (1) = tight corridor.
// Zigzag 0.25/0.75 so player can flip between pillars.
const SECTION_SQUEEZE_TUNNEL: LevelSection = {
  id: 'section_squeeze_tunnel',
  widthTiles: 26,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 5, heightTiles: 3 },
    { surface: 'top', xTiles: 19, yTiles: 0, widthTiles: 7, heightTiles: 3 },
    { surface: 'bottom', xTiles: 0, yTiles: 1, widthTiles: 5, heightTiles: 4 },
    { surface: 'bottom', xTiles: 19, yTiles: 1, widthTiles: 7, heightTiles: 4 },
    { surface: 'pillar', xTiles: 6, yTiles: 0, widthTiles: 4, heightTiles: 1, yCorridorRatio: 0.25 },
    {
      surface: 'pillar',
      xTiles: 13,
      yTiles: 0,
      widthTiles: 7,
      heightTiles: 1,
      yCorridorRatio: 0.75,
    },
  ],
};

// --- 19. stair_dive: Stair down 0.1 → 0.5 → 0.9, requires gravity flips.
// Last pillar extends to right ledge (gap ≤3 tiles).
const SECTION_STAIR_DIVE: LevelSection = {
  id: 'section_stair_dive',
  widthTiles: 28,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 5, heightTiles: 2 },
    { surface: 'top', xTiles: 21, yTiles: 0, widthTiles: 7, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 5, heightTiles: 2 },
    { surface: 'bottom', xTiles: 21, yTiles: 0, widthTiles: 7, heightTiles: 2 },
    { surface: 'pillar', xTiles: 4, yTiles: 0, widthTiles: 4, heightTiles: 1, yCorridorRatio: 0.1 },
    {
      surface: 'pillar',
      xTiles: 10,
      yTiles: 0,
      widthTiles: 4,
      heightTiles: 1,
      yCorridorRatio: 0.5,
    },
    {
      surface: 'pillar',
      xTiles: 16,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.9,
    },
  ],
};

// --- 20. asymmetric_gauntlet: Left ledge short (3), right long (6). Unpredictable.
const SECTION_ASYMMETRIC_GAUNTLET: LevelSection = {
  id: 'section_asymmetric_gauntlet',
  widthTiles: 28,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 3, heightTiles: 2 },
    { surface: 'top', xTiles: 22, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 3, heightTiles: 2 },
    { surface: 'bottom', xTiles: 22, yTiles: 1, widthTiles: 6, heightTiles: 4 },
    {
      surface: 'pillar',
      xTiles: 3,
      yTiles: 0,
      widthTiles: 4,
      heightTiles: 1,
      yCorridorRatio: 0.75,
    },
    {
      surface: 'pillar',
      xTiles: 9,
      yTiles: 0,
      widthTiles: 4,
      heightTiles: 1,
      yCorridorRatio: 0.25,
    },
    {
      surface: 'pillar',
      xTiles: 15,
      yTiles: 0,
      widthTiles: 4,
      heightTiles: 1,
      yCorridorRatio: 0.75,
    },
  ],
};

// --- 21. ceiling_drop_hard: Top pit + bottom raised island. Two narrow pillars.
const SECTION_CEILING_DROP_HARD: LevelSection = {
  id: 'section_ceiling_drop_hard',
  widthTiles: 24,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'top', xTiles: 18, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 5, heightTiles: 2 },
    { surface: 'bottom', xTiles: 10, yTiles: 1, widthTiles: 4, heightTiles: 4 },
    { surface: 'bottom', xTiles: 20, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'pillar', xTiles: 5, yTiles: 0, widthTiles: 3, heightTiles: 1, yCorridorRatio: 0.2 },
    {
      surface: 'pillar',
      xTiles: 14,
      yTiles: 0,
      widthTiles: 3,
      heightTiles: 1,
      yCorridorRatio: 0.8,
    },
  ],
};

// --- 22. rapid_flip: Four pillars, tight spacing, alternating high/low.
// Last pillar extends to right ledge (gap ≤3 tiles).
const SECTION_RAPID_FLIP: LevelSection = {
  id: 'section_rapid_flip',
  widthTiles: 30,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'top', xTiles: 24, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'bottom', xTiles: 24, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    {
      surface: 'pillar',
      xTiles: 4,
      yTiles: 0,
      widthTiles: 3,
      heightTiles: 1,
      yCorridorRatio: 0.15,
    },
    {
      surface: 'pillar',
      xTiles: 9,
      yTiles: 0,
      widthTiles: 3,
      heightTiles: 1,
      yCorridorRatio: 0.85,
    },
    {
      surface: 'pillar',
      xTiles: 14,
      yTiles: 0,
      widthTiles: 3,
      heightTiles: 1,
      yCorridorRatio: 0.15,
    },
    {
      surface: 'pillar',
      xTiles: 19,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.85,
    },
  ],
};

// --- 23. double_pit_zigzag: Both pits + zigzag pillars. Maximum precision.
const SECTION_DOUBLE_PIT_ZIGZAG: LevelSection = {
  id: 'section_double_pit_zigzag',
  widthTiles: 30,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'top', xTiles: 26, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'bottom', xTiles: 26, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'pillar', xTiles: 5, yTiles: 0, widthTiles: 3, heightTiles: 1, yCorridorRatio: 0.2 },
    {
      surface: 'pillar',
      xTiles: 11,
      yTiles: 0,
      widthTiles: 3,
      heightTiles: 1,
      yCorridorRatio: 0.8,
    },
    {
      surface: 'pillar',
      xTiles: 17,
      yTiles: 0,
      widthTiles: 3,
      heightTiles: 1,
      yCorridorRatio: 0.2,
    },
    {
      surface: 'pillar',
      xTiles: 22,
      yTiles: 0,
      widthTiles: 3,
      heightTiles: 1,
      yCorridorRatio: 0.8,
    },
  ],
};

// --- 24. ledge_hop_tight: Single pillar bridges to right ledge (gap ≤3 tiles).
const SECTION_LEDGE_HOP_TIGHT: LevelSection = {
  id: 'section_ledge_hop_tight',
  widthTiles: 22,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'top', xTiles: 14, yTiles: 0, widthTiles: 8, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'bottom', xTiles: 14, yTiles: 1, widthTiles: 8, heightTiles: 4 },
    {
      surface: 'pillar',
      xTiles: 6,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.55,
    },
  ],
};

// --- 25. extreme_squeeze: Deep ceiling (3) + narrow pillar bridges to right ledge (gap ≤3 tiles).
const SECTION_EXTREME_SQUEEZE: LevelSection = {
  id: 'section_extreme_squeeze',
  widthTiles: 24,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 3 },
    { surface: 'top', xTiles: 14, yTiles: 0, widthTiles: 10, heightTiles: 3 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 14, yTiles: 0, widthTiles: 10, heightTiles: 2 },
    { surface: 'pillar', xTiles: 8, yTiles: 0, widthTiles: 5, heightTiles: 1, yCorridorRatio: 0.5 },
  ],
};

// --- 26. chaos_stair: Five pillars stair 0.1 → 0.3 → 0.5 → 0.7 → 0.9.
const SECTION_CHAOS_STAIR: LevelSection = {
  id: 'section_chaos_stair',
  widthTiles: 38,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'top', xTiles: 34, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'bottom', xTiles: 34, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'pillar', xTiles: 3, yTiles: 0, widthTiles: 4, heightTiles: 1, yCorridorRatio: 0.1 },
    { surface: 'pillar', xTiles: 9, yTiles: 0, widthTiles: 4, heightTiles: 1, yCorridorRatio: 0.3 },
    {
      surface: 'pillar',
      xTiles: 15,
      yTiles: 0,
      widthTiles: 4,
      heightTiles: 1,
      yCorridorRatio: 0.5,
    },
    {
      surface: 'pillar',
      xTiles: 21,
      yTiles: 0,
      widthTiles: 4,
      heightTiles: 1,
      yCorridorRatio: 0.7,
    },
    {
      surface: 'pillar',
      xTiles: 27,
      yTiles: 0,
      widthTiles: 4,
      heightTiles: 1,
      yCorridorRatio: 0.9,
    },
  ],
};

// --- 27. triple_gap: Three gaps (~3 tiles each), no pillars. Pure ledge hopping. Reachable.
const SECTION_TRIPLE_GAP: LevelSection = {
  id: 'section_triple_gap',
  widthTiles: 25,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'top', xTiles: 7, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'top', xTiles: 14, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'top', xTiles: 21, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'bottom', xTiles: 7, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'bottom', xTiles: 14, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'bottom', xTiles: 21, yTiles: 0, widthTiles: 4, heightTiles: 2 },
  ],
};

// --- 28. right_bias_gauntlet: Right-biased pillars, asymmetric floor.
const SECTION_RIGHT_BIAS_GAUNTLET: LevelSection = {
  id: 'section_right_bias_gauntlet',
  widthTiles: 30,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 8, heightTiles: 2 },
    { surface: 'top', xTiles: 22, yTiles: 0, widthTiles: 8, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 1, widthTiles: 6, heightTiles: 4 },
    { surface: 'bottom', xTiles: 24, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'pillar', xTiles: 8, yTiles: 0, widthTiles: 4, heightTiles: 1, yCorridorRatio: 0.7 },
    {
      surface: 'pillar',
      xTiles: 14,
      yTiles: 0,
      widthTiles: 4,
      heightTiles: 1,
      yCorridorRatio: 0.3,
    },
    {
      surface: 'pillar',
      xTiles: 20,
      yTiles: 0,
      widthTiles: 4,
      heightTiles: 1,
      yCorridorRatio: 0.7,
    },
  ],
};

// --- 29. micro_pillars: Four very narrow pillars (2 tiles). Precision landing.
const SECTION_MICRO_PILLARS: LevelSection = {
  id: 'section_micro_pillars',
  widthTiles: 28,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'top', xTiles: 24, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'bottom', xTiles: 24, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    {
      surface: 'pillar',
      xTiles: 5,
      yTiles: 0,
      widthTiles: 2,
      heightTiles: 1,
      yCorridorRatio: 0.25,
    },
    {
      surface: 'pillar',
      xTiles: 10,
      yTiles: 0,
      widthTiles: 2,
      heightTiles: 1,
      yCorridorRatio: 0.75,
    },
    {
      surface: 'pillar',
      xTiles: 15,
      yTiles: 0,
      widthTiles: 2,
      heightTiles: 1,
      yCorridorRatio: 0.25,
    },
    {
      surface: 'pillar',
      xTiles: 20,
      yTiles: 0,
      widthTiles: 2,
      heightTiles: 1,
      yCorridorRatio: 0.75,
    },
  ],
};

// --- 30. final_gauntlet: Six pillars, zigzag, double pit. Ultimate challenge.
const SECTION_FINAL_GAUNTLET: LevelSection = {
  id: 'section_final_gauntlet',
  widthTiles: 42,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 3, heightTiles: 2 },
    { surface: 'top', xTiles: 39, yTiles: 0, widthTiles: 3, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 3, heightTiles: 2 },
    { surface: 'bottom', xTiles: 39, yTiles: 0, widthTiles: 3, heightTiles: 2 },
    { surface: 'pillar', xTiles: 2, yTiles: 0, widthTiles: 4, heightTiles: 1, yCorridorRatio: 0.2 },
    { surface: 'pillar', xTiles: 8, yTiles: 0, widthTiles: 4, heightTiles: 1, yCorridorRatio: 0.8 },
    {
      surface: 'pillar',
      xTiles: 14,
      yTiles: 0,
      widthTiles: 4,
      heightTiles: 1,
      yCorridorRatio: 0.2,
    },
    {
      surface: 'pillar',
      xTiles: 20,
      yTiles: 0,
      widthTiles: 4,
      heightTiles: 1,
      yCorridorRatio: 0.8,
    },
    {
      surface: 'pillar',
      xTiles: 26,
      yTiles: 0,
      widthTiles: 4,
      heightTiles: 1,
      yCorridorRatio: 0.2,
    },
    {
      surface: 'pillar',
      xTiles: 32,
      yTiles: 0,
      widthTiles: 4,
      heightTiles: 1,
      yCorridorRatio: 0.8,
    },
  ],
};

export const LEVEL_SECTIONS: LevelSection[] = [
  SECTION_INTRO_SQUEEZE,
  // SECTION_LEDGE_HOP,
  // SECTION_CAVE_SQUEEZE,
  // SECTION_DOUBLE_PIT_NARROW,
  SECTION_LEDGE_ONLY_DASH,
  SECTION_FIVE_PILLAR_ZIGZAG,
  SECTION_SQUEEZE_TUNNEL,
  SECTION_STAIR_DIVE,
  SECTION_ASYMMETRIC_GAUNTLET,
  SECTION_CEILING_DROP_HARD,
  SECTION_RAPID_FLIP,
  SECTION_DOUBLE_PIT_ZIGZAG,
  SECTION_LEDGE_HOP_TIGHT,
  SECTION_EXTREME_SQUEEZE,
  SECTION_CHAOS_STAIR,
  SECTION_TRIPLE_GAP,
  SECTION_RIGHT_BIAS_GAUNTLET,
  SECTION_MICRO_PILLARS,
  SECTION_FINAL_GAUNTLET,
  SECTION_LEFT_ANCHOR,
  SECTION_BROKEN_BRIDGE,
  SECTION_CEILING_TRAP,
  SECTION_STAIR_CLIMB,
  SECTION_ZIGZAG_ESCAPE,
  SECTION_CEILING_DROP,
  SECTION_RECOVERY,
  SECTION_LOW_CEILING,
  SECTION_RAISED_FLOOR,
  SECTION_CORRIDOR_SQUEEZE,
  SECTION_GAUNTLET,
];

// Validate all sections at load — throws if any have unreachable gaps
LEVEL_SECTIONS.forEach(validateSectionReachability);
