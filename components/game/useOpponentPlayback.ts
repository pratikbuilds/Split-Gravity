import { useAnimatedReaction, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { FLAT_ZONE_LENGTH } from '../../types/game';
import { PLAYER_X_FACTOR, groundHeight, SUPPORT_MIN_OVERLAP } from './constants';
import { resolvePoseCode } from './multiplayerPose';
import type { SimulationRefs } from './types';
import type { OpponentSnapshot } from '../../types/game';

const OPPONENT_INTERPOLATION_DELAY_MS = 40;
const OPPONENT_MAX_EXTRAPOLATION_MS = 100;

const isFiniteNumber = (value: number) => {
  'worklet';
  return Number.isFinite(value);
};
const clamp = (value: number, min: number, max: number) => {
  'worklet';
  return Math.min(max, Math.max(min, value));
};
const lerp = (from: number, to: number, alpha: number) => {
  'worklet';
  return from + (to - from) * alpha;
};

const GROUNDED_VELOCITY_THRESHOLD = 80;
const SNAP_DISTANCE_PX = 24;

/** Snap opponent Y to nearest platform surface when grounded, so they respect colliders. */
const resolveOpponentSnapY = ({
  worldX,
  charW,
  charH,
  gravityDir,
  rawTargetY,
  velocityY,
  pose,
  rects,
  groundY,
  flatTopY,
}: {
  worldX: number;
  charW: number;
  charH: number;
  gravityDir: 1 | -1;
  rawTargetY: number;
  velocityY: number;
  pose: OpponentSnapshot['pose'];
  rects: number[];
  groundY: number;
  flatTopY: number;
}): number => {
  'worklet';
  const isLikelyGrounded =
    pose === 'run' || pose === 'idle' || Math.abs(velocityY) < GROUNDED_VELOCITY_THRESHOLD;
  if (!isLikelyGrounded) return rawTargetY;

  const footLeft = worldX;
  const footRight = worldX + charW;
  const inFlatZone = worldX < FLAT_ZONE_LENGTH;

  if (gravityDir === 1) {
    if (inFlatZone) {
      const groundSurfaceY = groundY - charH;
      if (Math.abs(rawTargetY - groundSurfaceY) < SNAP_DISTANCE_PX) return groundSurfaceY;
    }
    for (let i = 0; i < rects.length; i += 4) {
      const px = rects[i];
      const py = rects[i + 1];
      const pw = rects[i + 2];
      const overlap = Math.min(footRight, px + pw) - Math.max(footLeft, px);
      if (overlap >= SUPPORT_MIN_OVERLAP) {
        const surfaceY = py - charH;
        if (Math.abs(rawTargetY - surfaceY) < SNAP_DISTANCE_PX) return surfaceY;
      }
    }
  } else {
    if (inFlatZone) {
      if (Math.abs(rawTargetY - flatTopY) < SNAP_DISTANCE_PX) return flatTopY;
    }
    for (let i = 0; i < rects.length; i += 4) {
      const px = rects[i];
      const py = rects[i + 1];
      const pw = rects[i + 2];
      const ph = rects[i + 3];
      const overlap = Math.min(footRight, px + pw) - Math.max(footLeft, px);
      if (overlap >= SUPPORT_MIN_OVERLAP) {
        const surfaceY = py + ph;
        if (Math.abs(rawTargetY - surfaceY) < SNAP_DISTANCE_PX) return surfaceY;
      }
    }
  }
  return rawTargetY;
};

type UseOpponentPlaybackArgs = {
  width: number;
  height: number;
  charSize: number;
  refs: Pick<
    SimulationRefs,
    | 'totalScroll'
    | 'groundY'
    | 'platformRects'
    | 'opponentPosY'
    | 'opponentPosX'
    | 'opponentGravity'
    | 'opponentAlive'
    | 'opponentPoseCode'
    | 'opponentFrameIndex'
    | 'opponentVelocityY'
    | 'opponentVelocityX'
    | 'opponentFlipLocked'
    | 'opponentCountdownLocked'
  >;
  opponentSnapshotSignal: SharedValue<OpponentSnapshot | null>;
};

export const useOpponentPlayback = ({
  width,
  height,
  charSize,
  refs,
  opponentSnapshotSignal,
}: UseOpponentPlaybackArgs) => {
  const previousSnapshot = useSharedValue<OpponentSnapshot | null>(null);
  const currentSnapshot = useSharedValue<OpponentSnapshot | null>(null);
  const previousReceivedAt = useSharedValue(0);
  const currentReceivedAt = useSharedValue(0);

  useAnimatedReaction(
    () => {
      'worklet';
      return opponentSnapshotSignal.value;
    },
    (snapshot) => {
      'worklet';
      if (!snapshot) {
        previousSnapshot.value = null;
        currentSnapshot.value = null;
        previousReceivedAt.value = 0;
        currentReceivedAt.value = 0;
        refs.opponentAlive.value = 0;
        refs.opponentCountdownLocked.value = 1;
        return;
      }

      const now = Date.now();
      const current = currentSnapshot.value;

      if (snapshot.phase !== 'running' || snapshot.countdownLocked === 1) {
        previousSnapshot.value = null;
        currentSnapshot.value = snapshot;
        previousReceivedAt.value = 0;
        currentReceivedAt.value = now;
        return;
      }

      if (current) {
        if (current.playerId !== snapshot.playerId) {
          previousSnapshot.value = null;
          currentSnapshot.value = snapshot;
          previousReceivedAt.value = 0;
          currentReceivedAt.value = now;
          return;
        }

        if (current.phase !== 'running' || current.countdownLocked === 1) {
          previousSnapshot.value = null;
          currentSnapshot.value = snapshot;
          previousReceivedAt.value = 0;
          currentReceivedAt.value = now;
          return;
        }

        if (snapshot.seq <= current.seq) {
          return;
        }

        previousSnapshot.value = current;
        previousReceivedAt.value = currentReceivedAt.value;
      } else {
        previousSnapshot.value = null;
        previousReceivedAt.value = 0;
      }

      currentSnapshot.value = snapshot;
      currentReceivedAt.value = now;
    },
    [currentReceivedAt, currentSnapshot, previousReceivedAt, previousSnapshot, refs]
  );

  useFrameCallback(() => {
    'worklet';
    const current = currentSnapshot.value;
    if (!current) return;

    const prev = previousSnapshot.value;
    const currentAt = currentReceivedAt.value;
    const prevAt = previousReceivedAt.value;
    const renderAt = Date.now() - OPPONENT_INTERPOLATION_DELAY_MS;

    let sampledWorldX = current.worldX;
    let sampledNormalizedY = current.normalizedY;
    let sampledVelocityX = current.velocityX;
    let sampledVelocityY = current.velocityY;

    if (prev && prev.playerId === current.playerId && prev.seq < current.seq && prevAt > 0) {
      if (renderAt <= currentAt) {
        const spanMs = Math.max(1, currentAt - prevAt);
        const alpha = clamp((renderAt - prevAt) / spanMs, 0, 1);
        sampledWorldX = lerp(prev.worldX, current.worldX, alpha);
        sampledNormalizedY = lerp(prev.normalizedY, current.normalizedY, alpha);
        sampledVelocityX = lerp(prev.velocityX, current.velocityX, alpha);
        sampledVelocityY = lerp(prev.velocityY, current.velocityY, alpha);
      } else {
        const extrapolationMs = Math.min(renderAt - currentAt, OPPONENT_MAX_EXTRAPOLATION_MS);
        if (extrapolationMs > 0) {
          const spanMs = Math.max(1, currentAt - prevAt);
          const worldVelocityPerMs = (current.worldX - prev.worldX) / spanMs;
          const normalizedVelocityPerMs = (current.normalizedY - prev.normalizedY) / spanMs;
          sampledWorldX = current.worldX + worldVelocityPerMs * extrapolationMs;
          sampledNormalizedY = current.normalizedY + normalizedVelocityPerMs * extrapolationMs;
        }
      }
    }

    const laneSpan = Math.max(1, height - 2 * groundHeight - charSize);
    const normalizedY = clamp(
      isFiniteNumber(sampledNormalizedY) ? sampledNormalizedY : 0,
      0,
      1
    );
    const startAnchorX = width * PLAYER_X_FACTOR;
    const isSyntheticBaseline =
      current.seq === 0 &&
      current.phase === 'running' &&
      current.countdownLocked === 0;
    const effectiveWorldX = isSyntheticBaseline
      ? refs.totalScroll.value + startAnchorX
      : isFiniteNumber(sampledWorldX)
        ? sampledWorldX
        : refs.totalScroll.value + startAnchorX;
    const worldX = effectiveWorldX;
    const velocityX = isFiniteNumber(sampledVelocityX) ? sampledVelocityX : 0;
    const velocityY = isFiniteNumber(sampledVelocityY) ? sampledVelocityY : 0;
    const rawTargetY = groundHeight + normalizedY * laneSpan;
    const targetY = resolveOpponentSnapY({
      worldX,
      charW: charSize,
      charH: charSize,
      gravityDir: current.gravityDir,
      rawTargetY,
      velocityY,
      pose: current.pose,
      rects: refs.platformRects.value,
      groundY: refs.groundY.value,
      flatTopY: groundHeight,
    });
    const screenX = worldX - refs.totalScroll.value;

    refs.opponentGravity.value = current.gravityDir;
    refs.opponentFrameIndex.value = current.frameIndex;
    refs.opponentFlipLocked.value = current.flipLocked;
    refs.opponentCountdownLocked.value =
      current.phase === 'running' ? current.countdownLocked : 1;
    refs.opponentVelocityX.value = velocityX;
    refs.opponentVelocityY.value = velocityY;
    refs.opponentPoseCode.value = resolvePoseCode(current.pose);
    refs.opponentPosY.value = isFiniteNumber(targetY) ? targetY : groundHeight;
    refs.opponentPosX.value =
      current.phase === 'running' && current.countdownLocked === 0
        ? (isFiniteNumber(screenX) ? screenX : startAnchorX)
        : startAnchorX;
    refs.opponentAlive.value = current.alive ? 1 : 0;
  });
};
