import { useAnimatedReaction, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { OPPONENT_X_FACTOR, groundHeight } from './constants';
import { resolvePoseCode } from './multiplayerPose';
import type { SimulationRefs } from './types';
import type { OpponentSnapshot } from '../../types/game';
import opponentPlayback from '../../shared/opponentPlayback';
import type { TimedOpponentSnapshot } from '../../shared/opponentPlayback';

const OPPONENT_INTERPOLATION_DELAY_MS = 75;
const OPPONENT_MAX_EXTRAPOLATION_MS = 100;

type UseOpponentPlaybackArgs = {
  width: number;
  height: number;
  charSize: number;
  refs: Pick<
    SimulationRefs,
    | 'totalScroll'
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
  // The app package is transpiled as CJS for the shared root, so the server/app boundary
  // exposes these helpers through the default export in some toolchains.
  // eslint-disable-next-line import/no-named-as-default-member
  const { enqueueOpponentSnapshot, sampleOpponentSnapshot } = opponentPlayback;
  const playbackQueue = useSharedValue<TimedOpponentSnapshot[]>([]);

  useAnimatedReaction(
    () => {
      'worklet';
      return opponentSnapshotSignal.value;
    },
    (snapshot) => {
      'worklet';
      if (!snapshot) {
        playbackQueue.value = [];
        refs.opponentAlive.value = 0;
        refs.opponentCountdownLocked.value = 1;
        return;
      }

      playbackQueue.value = enqueueOpponentSnapshot(playbackQueue.value, snapshot, Date.now());
    },
    [opponentSnapshotSignal, playbackQueue, refs]
  );

  useFrameCallback(() => {
    'worklet';
    const queue = playbackQueue.value;
    if (queue.length === 0) return;

    const renderAt = Date.now() - OPPONENT_INTERPOLATION_DELAY_MS;
    const sampled = sampleOpponentSnapshot(queue, renderAt, OPPONENT_MAX_EXTRAPOLATION_MS);
    if (!sampled) return;

    const laneSpan = Math.max(1, height - 2 * groundHeight - charSize);
    const targetY = groundHeight + sampled.normalizedY * laneSpan;

    refs.opponentGravity.value = sampled.gravityDir;
    refs.opponentFrameIndex.value = sampled.frameIndex;
    refs.opponentFlipLocked.value = sampled.flipLocked;
    refs.opponentCountdownLocked.value =
      sampled.phase === 'running' ? sampled.countdownLocked : 1;
    refs.opponentVelocityX.value = sampled.velocityX;
    refs.opponentVelocityY.value = sampled.velocityY;
    refs.opponentPoseCode.value = resolvePoseCode(sampled.pose);
    refs.opponentPosY.value = targetY;
    refs.opponentPosX.value =
      sampled.phase === 'running' && sampled.countdownLocked === 0
        ? sampled.worldX - refs.totalScroll.value
        : sampled.worldX > 0
          ? sampled.worldX - refs.totalScroll.value
          : width * OPPONENT_X_FACTOR;
    refs.opponentAlive.value = 1;
  });
};
