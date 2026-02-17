import type { Platform } from '../types/game';

/**
 * Level section definitions for the section-based level generator.
 *
 * ## Level Design Guide (for future sessions)
 *
 * ### Pits are essential for challenge
 * Pillars alone (with full floor/ceiling) are too easy — the player can walk on the floor or ceiling.
 * **Always pair pillars with pits** to force the player to land on the pillar or fall.
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
 */

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

// Section 1 matches the original reference corridor pattern.
const SECTION_1: LevelSection = {
  id: 'section_1_ground_reference',
  widthTiles: 28,
  platforms: [
    // Top lane:
    // baseline depth = 2 tiles; notch depth = 3 tiles (one tile lower). Notches are 2 tiles wide.
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'top', xTiles: 6, yTiles: 0, widthTiles: 2, heightTiles: 3 },
    { surface: 'top', xTiles: 8, yTiles: 0, widthTiles: 2, heightTiles: 2 },
    { surface: 'top', xTiles: 10, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'top', xTiles: 16, yTiles: 0, widthTiles: 2, heightTiles: 3 },
    { surface: 'top', xTiles: 18, yTiles: 0, widthTiles: 2, heightTiles: 2 },
    { surface: 'top', xTiles: 20, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'top', xTiles: 24, yTiles: 0, widthTiles: 2, heightTiles: 3 },
    { surface: 'top', xTiles: 26, yTiles: 0, widthTiles: 2, heightTiles: 2 },

    // Bottom lane:
    // baseline top = yTiles 0; lifted notch top = yTiles 1 (one tile higher). Notches are 2 tiles wide.
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'bottom', xTiles: 4, yTiles: 1, widthTiles: 2, heightTiles: 3 },
    { surface: 'bottom', xTiles: 6, yTiles: 0, widthTiles: 2, heightTiles: 2 },
    { surface: 'bottom', xTiles: 8, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 14, yTiles: 1, widthTiles: 2, heightTiles: 3 },
    { surface: 'bottom', xTiles: 16, yTiles: 0, widthTiles: 2, heightTiles: 2 },
    { surface: 'bottom', xTiles: 18, yTiles: 0, widthTiles: 5, heightTiles: 2 },
    { surface: 'bottom', xTiles: 23, yTiles: 1, widthTiles: 2, heightTiles: 3 },
    { surface: 'bottom', xTiles: 25, yTiles: 0, widthTiles: 3, heightTiles: 2 },
  ],
};

// Section 2: Symmetric — left ledge 6, pit 8, right ledge 6. Pillar centered.
const SECTION_2: LevelSection = {
  id: 'section_2_center_pillar',
  widthTiles: 20,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 20, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 14, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    {
      surface: 'pillar',
      xTiles: 5,
      yTiles: 0,
      widthTiles: 10,
      heightTiles: 1,
      yCorridorRatio: 0.5,
    },
  ],
};

// Section 3: Symmetric — ledges 8-8, pit 8. Top gap 8. Pillar centered.
const SECTION_3: LevelSection = {
  id: 'section_3_pillar_over_pit',
  widthTiles: 24,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 8, heightTiles: 2 },
    { surface: 'top', xTiles: 16, yTiles: 0, widthTiles: 8, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 8, heightTiles: 2 },
    { surface: 'bottom', xTiles: 16, yTiles: 0, widthTiles: 8, heightTiles: 2 },
    {
      surface: 'pillar',
      xTiles: 7,
      yTiles: 0,
      widthTiles: 10,
      heightTiles: 1,
      yCorridorRatio: 0.5,
    },
  ],
};

// Section 4: Symmetric zigzag — two pillars, left high / right low. Ledges 6-6. Top gap 12.
const SECTION_4: LevelSection = {
  id: 'section_4_double_pillar_zigzag',
  widthTiles: 24,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'top', xTiles: 18, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 18, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    {
      surface: 'pillar',
      xTiles: 2,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.35,
    },
    {
      surface: 'pillar',
      xTiles: 16,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.65,
    },
  ],
};

// Section 5: Symmetric triple — three pillars alternating. Ledges 4-4. Top gap 20.
const SECTION_5: LevelSection = {
  id: 'section_5_triple_pillar_staggered',
  widthTiles: 28,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'top', xTiles: 24, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'bottom', xTiles: 24, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    {
      surface: 'pillar',
      xTiles: 2,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.35,
    },
    {
      surface: 'pillar',
      xTiles: 11,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.65,
    },
    {
      surface: 'pillar',
      xTiles: 20,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.35,
    },
  ],
};

// Section 6: Symmetric — ledges 6-6, wide pit 16. Top gap 16. Pillar centered.
const SECTION_6: LevelSection = {
  id: 'section_6_pillar_over_wide_pit',
  widthTiles: 28,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'top', xTiles: 22, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 22, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    {
      surface: 'pillar',
      xTiles: 6,
      yTiles: 0,
      widthTiles: 14,
      heightTiles: 1,
      yCorridorRatio: 0.5,
    },
  ],
};

// Section 7: Symmetric gauntlet — four pillars alternating. Ledges 4-4. Top gap 24.
const SECTION_7: LevelSection = {
  id: 'section_7_pillar_gauntlet',
  widthTiles: 32,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'top', xTiles: 28, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    { surface: 'bottom', xTiles: 28, yTiles: 0, widthTiles: 4, heightTiles: 2 },
    {
      surface: 'pillar',
      xTiles: 2,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.35,
    },
    {
      surface: 'pillar',
      xTiles: 10,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.65,
    },
    {
      surface: 'pillar',
      xTiles: 18,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.35,
    },
    {
      surface: 'pillar',
      xTiles: 26,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.65,
    },
  ],
};

// Section 8: Symmetric stepped — left 6, step 4, pit 4, step 4, right 6. Top gap 4 aligned with pit.
const SECTION_8: LevelSection = {
  id: 'section_8_pit_pillar_stepped',
  widthTiles: 24,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 10, heightTiles: 2 },
    { surface: 'top', xTiles: 14, yTiles: 0, widthTiles: 10, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 6, yTiles: 1, widthTiles: 4, heightTiles: 3 },
    { surface: 'bottom', xTiles: 14, yTiles: 1, widthTiles: 4, heightTiles: 3 },
    { surface: 'bottom', xTiles: 18, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    {
      surface: 'pillar',
      xTiles: 5,
      yTiles: 0,
      widthTiles: 10,
      heightTiles: 1,
      yCorridorRatio: 0.5,
    },
  ],
};

// Section 9: Symmetric hourglass — top 6-12-6, bottom 6-12-6. Pillar centered.
const SECTION_9: LevelSection = {
  id: 'section_9_hourglass',
  widthTiles: 24,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'top', xTiles: 18, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 6, yTiles: 1, widthTiles: 12, heightTiles: 3 },
    { surface: 'bottom', xTiles: 18, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    {
      surface: 'pillar',
      xTiles: 7,
      yTiles: 0,
      widthTiles: 10,
      heightTiles: 1,
      yCorridorRatio: 0.5,
    },
  ],
};

// Section 10: Symmetric double pit — top pit center, bottom pit center. Pillar bridges.
const SECTION_10: LevelSection = {
  id: 'section_10_double_pit',
  widthTiles: 24,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 8, heightTiles: 2 },
    { surface: 'top', xTiles: 16, yTiles: 0, widthTiles: 8, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 8, heightTiles: 2 },
    { surface: 'bottom', xTiles: 16, yTiles: 0, widthTiles: 8, heightTiles: 2 },
    {
      surface: 'pillar',
      xTiles: 7,
      yTiles: 0,
      widthTiles: 10,
      heightTiles: 1,
      yCorridorRatio: 0.5,
    },
  ],
};

// Section 11: Jagged steps — pillars at varying heights (low-high-low) over a center pit. Top gap 16.
const SECTION_11: LevelSection = {
  id: 'section_11_jagged_steps',
  widthTiles: 28,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'top', xTiles: 22, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'bottom', xTiles: 22, yTiles: 0, widthTiles: 6, heightTiles: 2 },
    { surface: 'pillar', xTiles: 2, yTiles: 0, widthTiles: 6, heightTiles: 1, yCorridorRatio: 0.7 },
    {
      surface: 'pillar',
      xTiles: 10,
      yTiles: 0,
      widthTiles: 8,
      heightTiles: 1,
      yCorridorRatio: 0.35,
    },
    {
      surface: 'pillar',
      xTiles: 20,
      yTiles: 0,
      widthTiles: 6,
      heightTiles: 1,
      yCorridorRatio: 0.7,
    },
  ],
};

// Section 12: Moderate pit — pit 7 tiles; top gap 7. Pillar supports passage.
const SECTION_12: LevelSection = {
  id: 'section_12_leap_of_faith',
  widthTiles: 21,
  platforms: [
    { surface: 'top', xTiles: 0, yTiles: 0, widthTiles: 7, heightTiles: 2 },
    { surface: 'top', xTiles: 14, yTiles: 0, widthTiles: 7, heightTiles: 2 },
    { surface: 'bottom', xTiles: 0, yTiles: 0, widthTiles: 7, heightTiles: 2 },
    { surface: 'bottom', xTiles: 14, yTiles: 0, widthTiles: 7, heightTiles: 2 },
    {
      surface: 'pillar',
      xTiles: 9,
      yTiles: 0,
      widthTiles: 3,
      heightTiles: 1,
      yCorridorRatio: 0.5,
    },
  ],
};

export const LEVEL_SECTIONS: LevelSection[] = [
  SECTION_1,
  SECTION_11,
  SECTION_12,
  SECTION_2,
  SECTION_3,
  SECTION_4,
  SECTION_5,
  SECTION_6,
  SECTION_7,
  SECTION_8,
  SECTION_9,
  SECTION_10,
];
