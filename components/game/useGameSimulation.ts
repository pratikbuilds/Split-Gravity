import { useFrameCallback } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  isGrounded,
  normalizeFrameStep,
  resolveSideBlock,
  scanCollisionSurfaces,
} from '../../shared/game/physics';
import { FLAT_ZONE_LENGTH } from '../../types/game';
import {
  CHAR_SCALE,
  CHAR_SIZE,
  DEATH_MARGIN_FRACTION,
  FLIP_ARC_DECAY,
  FRAME_INTERVAL_MS,
  GRAVITY,
  GROUNDED_EPSILON,
  LANDING_MIN_OVERLAP,
  MULTIPLAYER_STATE_INTERVAL_MS,
  RUN_SPEED,
  SUPPORT_MIN_OVERLAP,
  EDGE_CONTACT_MARGIN,
  groundHeight,
} from './constants';
import type { SimulationRefs } from './types';

const resolveGroundSnapY = ({
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
}) => {
  'worklet';
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
    if (inFlatZone) {
      tryTarget(groundY - charH);
    }
    for (let i = 0; i < rects.length; i += 4) {
      const px = rects[i];
      const py = rects[i + 1];
      const pw = rects[i + 2];
      const overlap = Math.min(footRight, px + pw) - Math.max(footLeft, px);
      if (overlap >= supportMinOverlap) {
        tryTarget(py - charH);
      }
    }
    return bestTarget;
  }

  if (inFlatZone) {
    tryTarget(flatTopY);
  }
  for (let i = 0; i < rects.length; i += 4) {
    const px = rects[i];
    const py = rects[i + 1];
    const pw = rects[i + 2];
    const ph = rects[i + 3];
    const overlap = Math.min(footRight, px + pw) - Math.max(footLeft, px);
    if (overlap >= supportMinOverlap) {
      tryTarget(py + ph);
    }
  }
  return bestTarget;
};

interface UseGameSimulationArgs {
  width: number;
  height: number;
  refs: Pick<
    SimulationRefs,
    | 'groundY'
    | 'posY'
    | 'velocityY'
    | 'gravityDirection'
    | 'flipLockedUntilLanding'
    | 'frameIndex'
    | 'elapsedMs'
    | 'gameOver'
    | 'dying'
    | 'deathScore'
    | 'velocityX'
    | 'totalScroll'
    | 'initialized'
    | 'countdownLocked'
    | 'charX'
    | 'simTimeMs'
    | 'lastGroundedAtMs'
    | 'platformRects'
    | 'lastMultiplayerStateAtMs'
  >;
  triggerAudioEvent: (event: 'game_over') => void;
  triggerGameOver: (score: number) => void;
  onLocalState?: (payload: {
    normalizedY: number;
    gravityDir: 1 | -1;
    scroll: number;
    alive: boolean;
    score: number;
    frameIndex: number;
    velocityY: number;
    flipLocked: 0 | 1;
    countdownLocked: 0 | 1;
  }) => void;
  onLocalDeath?: (score: number) => void;
}

export const useGameSimulation = ({
  height,
  refs,
  triggerAudioEvent,
  triggerGameOver,
  onLocalState,
  onLocalDeath,
}: UseGameSimulationArgs) => {
  useFrameCallback((frameInfo) => {
    'worklet';
    if (refs.gameOver.value === 1) return;
    if (refs.initialized.value === 0) return;
    if (refs.countdownLocked.value === 1) return;

    const gY = refs.groundY.value;
    const rawDt = frameInfo.timeSincePreviousFrame ?? 16;
    const { dt, stepCount, stepDt } = normalizeFrameStep(rawDt);
    const charH = CHAR_SIZE * CHAR_SCALE;
    const charW = CHAR_SIZE * CHAR_SCALE;
    refs.simTimeMs.value += dt;

    for (let step = 0; step < stepCount; step += 1) {
      const prevTotalScroll = refs.totalScroll.value;
      const gDir = refs.gravityDirection.value;
      const isDying = refs.dying.value === 1;
      const prevTop = refs.posY.value;
      const prevBottom = prevTop + charH;

      if (!isDying) {
        refs.totalScroll.value += RUN_SPEED * (stepDt / 1000);
      }

      refs.velocityY.value += gDir * GRAVITY * (stepDt / 1000);
      refs.posY.value += refs.velocityY.value * (stepDt / 1000);

      let charWorldX = refs.totalScroll.value + refs.charX.value;
      const rects = refs.platformRects.value;
      let inFlatZone = charWorldX < FLAT_ZONE_LENGTH;
      const prevLeft = prevTotalScroll + refs.charX.value;
      const prevRight = prevLeft + charW;
      const charLeft = charWorldX;
      const charRight = charWorldX + charW;
      const charTop = refs.posY.value;
      const charBottom = refs.posY.value + charH;

      const blockedLeft = resolveSideBlock({
        rects,
        prevLeft,
        prevRight,
        prevTop,
        prevBottom,
        charLeft,
        charRight,
        charTop,
        charBottom,
        groundedEpsilon: GROUNDED_EPSILON,
      });
      if (blockedLeft !== null) {
        refs.totalScroll.value = blockedLeft - refs.charX.value;
        refs.velocityX.value = 0;
        charWorldX = refs.totalScroll.value + refs.charX.value;
        inFlatZone = charWorldX < FLAT_ZONE_LENGTH;
      }

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

      if (!isDying) {
        if (
          gDir === 1 &&
          refs.velocityY.value >= 0 &&
          nearestDownSurface < Number.POSITIVE_INFINITY
        ) {
          refs.posY.value = nearestDownSurface - charH;
          refs.velocityY.value = 0;
        }

        if (
          gDir === -1 &&
          refs.velocityY.value <= 0 &&
          nearestUpSurface > Number.NEGATIVE_INFINITY
        ) {
          refs.posY.value = nearestUpSurface;
          refs.velocityY.value = 0;
        }

        if (gDir === 1 && inFlatZone && refs.posY.value + charH >= gY) {
          refs.posY.value = gY - charH;
          refs.velocityY.value = 0;
        }
        if (gDir === -1 && inFlatZone && refs.posY.value <= groundHeight) {
          refs.posY.value = groundHeight;
          refs.velocityY.value = 0;
        }

        const grounded = isGrounded({
          gravityDir: gDir === -1 ? -1 : 1,
          inFlatZone,
          posY: refs.posY.value,
          charH,
          groundY: gY,
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
            posY: refs.posY.value,
            charH,
            groundY: gY,
            flatTopY: groundHeight,
            rects,
            footLeft,
            footRight,
            supportMinOverlap: SUPPORT_MIN_OVERLAP,
            groundedEpsilon: GROUNDED_EPSILON,
          });
          if (snapY !== null) {
            refs.posY.value = snapY;
          }
          refs.velocityY.value = 0;
          refs.flipLockedUntilLanding.value = 0;
          refs.lastGroundedAtMs.value = refs.simTimeMs.value;
          refs.velocityX.value = 0;
        } else if (refs.velocityX.value > 0) {
          refs.totalScroll.value += refs.velocityX.value * (stepDt / 1000);
          refs.velocityX.value *= FLIP_ARC_DECAY;
          if (refs.velocityX.value < 1) refs.velocityX.value = 0;
        }

        if (!inFlatZone && !grounded) {
          if (gDir === 1) {
            // Downward gravity only dies once the player truly drops below the main bottom lane.
            // This prevents false deaths near mid-air/pillar platforms.
            const deathThreshold = gY + charH * DEATH_MARGIN_FRACTION;
            if (refs.posY.value + charH > deathThreshold) {
              refs.dying.value = 1;
              refs.deathScore.value = Math.floor(refs.totalScroll.value);
              refs.velocityX.value = 0;
              if (onLocalDeath) {
                scheduleOnRN(onLocalDeath, refs.deathScore.value);
              }
            }
          } else if (refs.posY.value < -charH * DEATH_MARGIN_FRACTION) {
            refs.dying.value = 1;
            refs.deathScore.value = Math.floor(refs.totalScroll.value);
            refs.velocityX.value = 0;
            if (onLocalDeath) {
              scheduleOnRN(onLocalDeath, refs.deathScore.value);
            }
          }
        }
      } else {
        refs.velocityX.value = 0;
      }
    }

    if (refs.dying.value === 1) {
      const gDir = refs.gravityDirection.value;
      const offscreenDown = refs.posY.value > height + charH;
      const offscreenUp = refs.posY.value + charH < -charH;
      if ((gDir === 1 && offscreenDown) || (gDir === -1 && offscreenUp)) {
        refs.gameOver.value = 1;
        scheduleOnRN(triggerAudioEvent, 'game_over');
        scheduleOnRN(triggerGameOver, refs.deathScore.value);
        return;
      }
    }

    refs.elapsedMs.value += dt;
    while (refs.elapsedMs.value >= FRAME_INTERVAL_MS) {
      refs.elapsedMs.value -= FRAME_INTERVAL_MS;
      refs.frameIndex.value = (refs.frameIndex.value + 1) % 360;
    }

    if (
      onLocalState &&
      refs.simTimeMs.value - refs.lastMultiplayerStateAtMs.value >= MULTIPLAYER_STATE_INTERVAL_MS
    ) {
      refs.lastMultiplayerStateAtMs.value = refs.simTimeMs.value;
      const laneSpan = Math.max(1, height - 2 * groundHeight - charH);
      const normalizedY = (refs.posY.value - groundHeight) / laneSpan;
      scheduleOnRN(onLocalState, {
        normalizedY,
        gravityDir: refs.gravityDirection.value === -1 ? -1 : 1,
        scroll: refs.totalScroll.value,
        alive: refs.dying.value === 0 && refs.gameOver.value === 0,
        score: Math.floor(refs.totalScroll.value),
        frameIndex: refs.frameIndex.value,
        velocityY: refs.velocityY.value,
        flipLocked: (refs.flipLockedUntilLanding.value === 1 ? 1 : 0) as 0 | 1,
        countdownLocked: (refs.countdownLocked.value === 1 ? 1 : 0) as 0 | 1,
      });
    }
  });
};
