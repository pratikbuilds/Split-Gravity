import type { OpponentPose } from '../../types/game';

export type OpponentPoseCode = 0 | 1 | 2 | 3;

export const OPPONENT_POSE_IDLE: OpponentPoseCode = 0;
export const OPPONENT_POSE_RUN: OpponentPoseCode = 1;
export const OPPONENT_POSE_JUMP: OpponentPoseCode = 2;
export const OPPONENT_POSE_FALL: OpponentPoseCode = 3;

const AIRBORNE_VEL_THRESHOLD = 10;

export const resolvePoseFromPhysics = (
  countdownLocked: number,
  flipLocked: number,
  velocityY: number
): OpponentPose => {
  'worklet';
  if (countdownLocked === 1) return 'idle';
  if (flipLocked === 1) return 'jump';
  if (Math.abs(velocityY) > AIRBORNE_VEL_THRESHOLD) return 'fall';
  return 'run';
};

export const resolvePoseCode = (pose: OpponentPose): OpponentPoseCode => {
  'worklet';
  switch (pose) {
    case 'idle':
      return OPPONENT_POSE_IDLE;
    case 'jump':
      return OPPONENT_POSE_JUMP;
    case 'fall':
      return OPPONENT_POSE_FALL;
    case 'run':
    default:
      return OPPONENT_POSE_RUN;
  }
};
