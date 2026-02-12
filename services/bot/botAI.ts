import type { Platform } from '../../types/game';
import type { BotState } from './botSimulation';
import {
  CHAR_SCALE,
  CHAR_SIZE,
  COYOTE_TIME_MS,
  EDGE_CONTACT_MARGIN,
  GROUNDED_EPSILON,
  SUPPORT_MIN_OVERLAP,
  groundHeight,
} from '../../components/game/constants';
import { FLAT_ZONE_LENGTH, MAX_FLIP_HORIZONTAL, SAFE_MARGIN } from '../../types/game';

// Flip this many px before running off the edge - ensures we have time to complete the flip arc
const FLIP_LEAD_PX = 35;
// Min distance to next platform to consider flipping (avoid flip when we can just walk)
const MIN_GAP_TO_FLIP = 25;
// Reaction delay so bot isn't frame-perfect
const BOT_REACTION_DELAY_MS = 20;

// JS-only grounded check (no worklet) - mirrors shared/game/physics.ts
function isGroundedJS({
  gravityDir,
  inFlatZone,
  posY,
  charH,
  groundY,
  flatTopY,
  rects,
  footLeft,
  footRight,
  supportMinOverlap,
  groundedEpsilon,
}: {
  gravityDir: 1 | -1;
  inFlatZone: boolean;
  posY: number;
  charH: number;
  groundY: number;
  flatTopY: number;
  rects: number[];
  footLeft: number;
  footRight: number;
  supportMinOverlap: number;
  groundedEpsilon: number;
}): boolean {
  if (gravityDir === 1) {
    const onBottomFlat = inFlatZone && Math.abs(posY - (groundY - charH)) <= groundedEpsilon;
    if (onBottomFlat) return true;
    for (let i = 0; i < rects.length; i += 4) {
      const px = rects[i];
      const py = rects[i + 1];
      const pw = rects[i + 2];
      const overlap = Math.min(footRight, px + pw) - Math.max(footLeft, px);
      if (overlap >= supportMinOverlap && Math.abs(posY - (py - charH)) <= groundedEpsilon) {
        return true;
      }
    }
    return false;
  }
  const onTopFlat = inFlatZone && Math.abs(posY - flatTopY) <= groundedEpsilon;
  if (onTopFlat) return true;
  for (let i = 0; i < rects.length; i += 4) {
    const px = rects[i];
    const py = rects[i + 1];
    const pw = rects[i + 2];
    const ph = rects[i + 3];
    const overlap = Math.min(footRight, px + pw) - Math.max(footLeft, px);
    if (overlap >= supportMinOverlap && Math.abs(posY - (py + ph)) <= groundedEpsilon) {
      return true;
    }
  }
  return false;
}

function isBottomLanePlatform(p: Platform, groundY: number): boolean {
  return p.surface === 'bottom' || p.y >= groundY - 80;
}

function isTopLanePlatform(p: Platform, groundY: number): boolean {
  return p.surface === 'top' || (p.y < groundY / 2 && p.surface !== 'bottom');
}

export interface BotAIContext {
  state: BotState;
  platforms: Platform[];
  groundY: number;
  charX: number;
  simTimeMs: number;
  shouldFlipSince: number;
}

/**
 * Finds the platform we're currently standing on (foot overlap + grounded).
 * Returns platform and its right edge x.
 */
function findCurrentPlatform(
  state: BotState,
  platforms: Platform[],
  groundY: number,
  charX: number,
  rects: number[],
  charH: number
): { platform: Platform; endX: number } | null {
  const charW = CHAR_SIZE * CHAR_SCALE;
  const charWorldX = state.scroll + charX;
  const footLeft = charWorldX + EDGE_CONTACT_MARGIN;
  const footRight = charWorldX + charW - EDGE_CONTACT_MARGIN;
  const inFlatZone = charWorldX < FLAT_ZONE_LENGTH;

  const grounded = isGroundedJS({
    gravityDir: state.gravityDir === -1 ? -1 : 1,
    inFlatZone,
    posY: state.posY,
    charH,
    groundY,
    flatTopY: groundHeight,
    rects,
    footLeft,
    footRight,
    supportMinOverlap: SUPPORT_MIN_OVERLAP,
    groundedEpsilon: GROUNDED_EPSILON,
  });

  if (!grounded) return null;

  if (inFlatZone) {
    return { platform: { x: 0, y: groundY, width: FLAT_ZONE_LENGTH, height: 32, tileType: 'grass', surface: 'bottom' } as Platform, endX: FLAT_ZONE_LENGTH };
  }

  for (const p of platforms) {
    const overlap = Math.min(footRight, p.x + p.width) - Math.max(footLeft, p.x);
    if (overlap < SUPPORT_MIN_OVERLAP) continue;
    const landingY = state.gravityDir === 1 ? p.y - charH : p.y + p.height;
    if (Math.abs(state.posY - landingY) > GROUNDED_EPSILON) continue;
    return { platform: p, endX: p.x + p.width };
  }
  return null;
}

/**
 * Finds the first platform we need to land on after current platform ends.
 * Excludes pillars for simplicity - we only consider top/bottom lane platforms.
 */
function findNextPlatform(
  currentEndX: number,
  platforms: Platform[],
  groundY: number,
  gravityDir: 1 | -1,
  charFrontX: number
): { platform: Platform; gapSize: number } | null {
  const maxReach = charFrontX + MAX_FLIP_HORIZONTAL + SAFE_MARGIN;
  let best: { platform: Platform; gapSize: number } | null = null;

  for (const p of platforms) {
    if (p.x + p.width <= currentEndX) continue;
    if (p.x > maxReach) continue;

    const gapSize = p.x - currentEndX;
    if (gapSize < MIN_GAP_TO_FLIP) continue;

    let needToFlip = false;
    if (p.surface === 'pillar') {
      needToFlip = true;
    } else {
      const nextIsBottom = isBottomLanePlatform(p, groundY);
      const nextIsTop = isTopLanePlatform(p, groundY);
      needToFlip = (gravityDir === 1 && nextIsTop) || (gravityDir === -1 && nextIsBottom);
    }

    if (!needToFlip) continue;

    if (!best || p.x < best.platform.x) {
      best = { platform: p, gapSize };
    }
  }
  return best;
}

/**
 * Returns whether the bot should flip this frame.
 * Core logic: flip only when (a) at edge of current platform, (b) next platform is opposite lane, (c) grounded/coyote.
 */
export function shouldBotFlip(
  ctx: BotAIContext
): { flip: boolean; newShouldFlipSince: number } {
  const { state, platforms, groundY, charX, simTimeMs, shouldFlipSince } = ctx;
  if (state.gameOver === 1 || state.dying === 1) {
    return { flip: false, newShouldFlipSince: 0 };
  }

  const charH = CHAR_SIZE * CHAR_SCALE;
  const charW = CHAR_SIZE * CHAR_SCALE;
  const rects = platforms.map((p) => [p.x, p.y, p.width, p.height]).flat();
  const charWorldX = state.scroll + charX;
  const footLeft = charWorldX + EDGE_CONTACT_MARGIN;
  const footRight = charWorldX + charW - EDGE_CONTACT_MARGIN;
  const inFlatZone = charWorldX < FLAT_ZONE_LENGTH;

  const grounded = isGroundedJS({
    gravityDir: state.gravityDir === -1 ? -1 : 1,
    inFlatZone,
    posY: state.posY,
    charH,
    groundY,
    flatTopY: groundHeight,
    rects,
    footLeft,
    footRight,
    supportMinOverlap: SUPPORT_MIN_OVERLAP,
    groundedEpsilon: GROUNDED_EPSILON,
  });

  const timeSinceGrounded = simTimeMs - state.lastGroundedAtMs;
  const canUseCoyote = timeSinceGrounded >= 0 && timeSinceGrounded <= COYOTE_TIME_MS;
  const canFlip = grounded || canUseCoyote;

  if (!canFlip) {
    return { flip: false, newShouldFlipSince: 0 };
  }

  const current = findCurrentPlatform(state, platforms, groundY, charX, rects, charH);
  const currentEndX = current?.endX ?? charWorldX + charW;
  const next = findNextPlatform(currentEndX, platforms, groundY, state.gravityDir, footRight);

  if (!next) return { flip: false, newShouldFlipSince: 0 };

  if (next.gapSize > MAX_FLIP_HORIZONTAL + SAFE_MARGIN) return { flip: false, newShouldFlipSince: 0 };

  const edgeThreshold = currentEndX - FLIP_LEAD_PX;
  const atEdge = footRight >= edgeThreshold;

  if (!atEdge) return { flip: false, newShouldFlipSince: 0 };

  const flipSince = shouldFlipSince > 0 ? shouldFlipSince : simTimeMs;
  const delayElapsed = simTimeMs - flipSince >= BOT_REACTION_DELAY_MS;

  if (delayElapsed) {
    return { flip: true, newShouldFlipSince: 0 };
  }

  return { flip: false, newShouldFlipSince: flipSince };
}
