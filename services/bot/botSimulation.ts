import type { Chunk, Platform } from '../../types/game';
import { generateLevelChunks, preGenerateLevelChunks } from '../../utils/levelGenerator';
import { FLAT_ZONE_LENGTH } from '../../types/game';
import { isGrounded, normalizeFrameStep, scanCollisionSurfaces } from '../../shared/game/physics';
import {
  CHAR_SCALE,
  CHAR_SIZE,
  DEATH_MARGIN_FRACTION,
  FLIP_ARC_DECAY,
  GRAVITY,
  GROUNDED_EPSILON,
  LANDING_MIN_OVERLAP,
  RUN_SPEED,
  SUPPORT_MIN_OVERLAP,
  EDGE_CONTACT_MARGIN,
  groundHeight,
  tileSize,
  FLIP_ARC_FORWARD,
} from '../../components/game/constants';

function resolveGroundSnapY({
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
}): number | null {
  let bestTarget: number | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  const tryTarget = (targetY: number) => {
    const delta = Math.abs(posY - targetY);
    if (delta <= groundedEpsilon && delta < bestDelta) {
      bestDelta = delta;
      bestTarget = targetY;
    }
  };
  if (gravityDir === 1) {
    if (inFlatZone) tryTarget(groundY - charH);
    for (let i = 0; i < rects.length; i += 4) {
      const px = rects[i];
      const py = rects[i + 1];
      const pw = rects[i + 2];
      const overlap = Math.min(footRight, px + pw) - Math.max(footLeft, px);
      if (overlap >= supportMinOverlap) tryTarget(py - charH);
    }
    return bestTarget;
  }
  if (inFlatZone) tryTarget(flatTopY);
  for (let i = 0; i < rects.length; i += 4) {
    const px = rects[i];
    const py = rects[i + 1];
    const pw = rects[i + 2];
    const ph = rects[i + 3];
    const overlap = Math.min(footRight, px + pw) - Math.max(footLeft, px);
    if (overlap >= supportMinOverlap) tryTarget(py + ph);
  }
  return bestTarget;
}

const BOT_DEBUG_ENABLED = (globalThis as { __BOT_DEBUG__?: boolean }).__BOT_DEBUG__ === true;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function botDebugLog(event: string, payload: Record<string, number | string | boolean>) {
  if (!BOT_DEBUG_ENABLED) return;
  console.debug(`[bot:${event}]`, payload);
}

export interface BotState {
  scroll: number;
  posY: number;
  velocityY: number;
  velocityX: number;
  gravityDir: 1 | -1;
  dying: 0 | 1;
  gameOver: 0 | 1;
  deathScore: number;
  simTimeMs: number;
  lastGroundedAtMs: number;
  lastFlipAtMs: number;
  wasGroundedLastStep: 0 | 1;
  leftSupportSinceFlip: 0 | 1;
}

export function createInitialBotState(groundY: number, initialGravityDir: 1 | -1): BotState {
  const charH = CHAR_SIZE * CHAR_SCALE;
  const posY = initialGravityDir === -1 ? groundHeight : groundY - charH;
  return {
    scroll: 0,
    posY,
    velocityY: 0,
    velocityX: 0,
    gravityDir: initialGravityDir,
    dying: 0,
    gameOver: 0,
    deathScore: 0,
    simTimeMs: 0,
    lastGroundedAtMs: 0,
    lastFlipAtMs: Number.NEGATIVE_INFINITY,
    wasGroundedLastStep: 1,
    leftSupportSinceFlip: 1,
  };
}

export function projectBotNormalizedY(posY: number, height: number, charH: number): number {
  const laneSpan = Math.max(1, height - 2 * groundHeight - charH);
  const normalizedY = (posY - groundHeight) / laneSpan;
  return clamp(normalizedY, 0, 1);
}

export function platformsToRects(platforms: Platform[]): number[] {
  const rects: number[] = [];
  for (const p of platforms) {
    const cols = Math.ceil(p.width / tileSize);
    const rows = Math.ceil(p.height / tileSize);
    for (let row = 0; row < rows; row++) {
      const remainingHeight = p.height - row * tileSize;
      const drawHeight = Math.min(tileSize, remainingHeight);
      if (drawHeight <= 0) continue;
      for (let col = 0; col < cols; col++) {
        const remainingWidth = p.width - col * tileSize;
        const drawWidth = Math.min(tileSize, remainingWidth);
        if (drawWidth <= 0) continue;
        rects.push(p.x + col * tileSize, p.y + row * tileSize, drawWidth, drawHeight);
      }
    }
  }
  return rects;
}

export function ensureBotChunks(
  scroll: number,
  width: number,
  height: number,
  groundY: number,
  existingChunks: Chunk[]
): Chunk[] {
  const newChunks = generateLevelChunks(scroll, width, height, groundY, tileSize, existingChunks);
  return newChunks;
}

export function stepBotPhysics(
  state: BotState,
  rects: number[],
  height: number,
  groundY: number,
  charX: number,
  rawDt: number
): BotState {
  if (state.gameOver === 1) return state;
  const charH = CHAR_SIZE * CHAR_SCALE;
  const charW = CHAR_SIZE * CHAR_SCALE;
  const { dt, stepCount, stepDt } = normalizeFrameStep(rawDt);
  let s = { ...state };
  s.simTimeMs += dt;

  for (let step = 0; step < stepCount; step++) {
    const gDir = s.gravityDir;
    const isDying = s.dying === 1;
    const prevTop = s.posY;
    const prevBottom = prevTop + charH;

    if (!isDying) {
      s = { ...s, scroll: s.scroll + RUN_SPEED * (stepDt / 1000) };
    }

    s = {
      ...s,
      velocityY: s.velocityY + gDir * GRAVITY * (stepDt / 1000),
      posY: s.posY + s.velocityY * (stepDt / 1000),
    };

    const charWorldX = s.scroll + charX;
    const inFlatZone = charWorldX < FLAT_ZONE_LENGTH;
    const charTop = s.posY;
    const charBottom = s.posY + charH;
    const footLeft = charWorldX + EDGE_CONTACT_MARGIN;
    const footRight = charWorldX + charW - EDGE_CONTACT_MARGIN;

    const { nearestDownSurface, nearestUpSurface } = scanCollisionSurfaces({
      rects,
      footLeft,
      footRight,
      prevTop,
      prevBottom,
      charTop,
      charBottom,
      landingMinOverlap: LANDING_MIN_OVERLAP,
      groundedEpsilon: GROUNDED_EPSILON,
    });

    if (BOT_DEBUG_ENABLED && gDir === 1 && nearestDownSurface < Number.POSITIVE_INFINITY) {
      const penetrationDepth = charBottom - nearestDownSurface;
      if (penetrationDepth > GROUNDED_EPSILON * 1.5) {
        botDebugLog('penetration', {
          t: s.simTimeMs,
          depth: penetrationDepth,
          posY: s.posY,
          nearestDownSurface,
        });
      }
    }

    if (!isDying) {
      if (gDir === 1 && s.velocityY >= 0 && nearestDownSurface < Number.POSITIVE_INFINITY) {
        s = {
          ...s,
          posY: nearestDownSurface - charH,
          velocityY: 0,
        };
      }
      if (gDir === -1 && s.velocityY <= 0 && nearestUpSurface > Number.NEGATIVE_INFINITY) {
        s = { ...s, posY: nearestUpSurface, velocityY: 0 };
      }
      if (gDir === 1 && inFlatZone && s.posY + charH >= groundY) {
        s = { ...s, posY: groundY - charH, velocityY: 0 };
      }
      if (gDir === -1 && inFlatZone && s.posY <= groundHeight) {
        s = { ...s, posY: groundHeight, velocityY: 0 };
      }

      const grounded = isGrounded({
        gravityDir: gDir === -1 ? -1 : 1,
        inFlatZone,
        posY: s.posY,
        charH,
        groundY,
        flatTopY: groundHeight,
        rects,
        footLeft,
        footRight,
        supportMinOverlap: SUPPORT_MIN_OVERLAP,
        groundedEpsilon: GROUNDED_EPSILON,
      });

      if (grounded) {
        const snapY = resolveGroundSnapY({
          gravityDir: gDir === -1 ? -1 : 1,
          inFlatZone,
          posY: s.posY,
          charH,
          groundY,
          flatTopY: groundHeight,
          rects,
          footLeft,
          footRight,
          supportMinOverlap: SUPPORT_MIN_OVERLAP,
          groundedEpsilon: GROUNDED_EPSILON,
        });
        if (snapY !== null) {
          const snapDelta = Math.abs(s.posY - snapY);
          if (snapDelta > GROUNDED_EPSILON * 1.5) {
            botDebugLog('snap-delta', {
              t: s.simTimeMs,
              delta: snapDelta,
              posY: s.posY,
              snapY,
              gDir,
            });
          }
          s = { ...s, posY: snapY };
        }
        s = {
          ...s,
          velocityY: 0,
          lastGroundedAtMs: s.simTimeMs,
          velocityX: 0,
          wasGroundedLastStep: 1,
        };
      } else if (s.velocityX > 0) {
        s = {
          ...s,
          scroll: s.scroll + s.velocityX * (stepDt / 1000),
          velocityX: Math.max(0, s.velocityX * FLIP_ARC_DECAY),
          wasGroundedLastStep: 0,
        };
        if (s.velocityX < 1) s = { ...s, velocityX: 0 };
        if (s.lastFlipAtMs > Number.NEGATIVE_INFINITY) {
          s = { ...s, leftSupportSinceFlip: 1 };
        }
      } else {
        s = {
          ...s,
          wasGroundedLastStep: 0,
          leftSupportSinceFlip:
            s.lastFlipAtMs > Number.NEGATIVE_INFINITY ? 1 : s.leftSupportSinceFlip,
        };
      }

      if (!inFlatZone && !grounded) {
        if (gDir === 1) {
          const deathThreshold = groundY + charH * DEATH_MARGIN_FRACTION;
          if (s.posY + charH > deathThreshold) {
            s = {
              ...s,
              dying: 1,
              deathScore: Math.floor(s.scroll),
              velocityX: 0,
            };
          }
        } else if (s.posY < -charH * DEATH_MARGIN_FRACTION) {
          s = {
            ...s,
            dying: 1,
            deathScore: Math.floor(s.scroll),
            velocityX: 0,
          };
        }
      }
    } else {
      s = { ...s, velocityX: 0 };
    }
  }

  if (s.dying === 1) {
    const offscreenDown = s.posY > height + charH;
    const offscreenUp = s.posY + charH < -charH;
    if ((s.gravityDir === 1 && offscreenDown) || (s.gravityDir === -1 && offscreenUp)) {
      s = { ...s, gameOver: 1 };
    }
  }

  return s;
}

export function applyBotFlip(state: BotState): BotState {
  if (state.gameOver === 1 || state.dying === 1) return state;
  return {
    ...state,
    gravityDir: -state.gravityDir as 1 | -1,
    velocityY: 0,
    velocityX: FLIP_ARC_FORWARD,
    lastFlipAtMs: state.simTimeMs,
    leftSupportSinceFlip: 0,
  };
}

export function preGenerateBotChunks(width: number, height: number, groundY: number): Chunk[] {
  return preGenerateLevelChunks(width, height, groundY, tileSize);
}
