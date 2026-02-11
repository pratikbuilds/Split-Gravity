import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { isGrounded } from '../../shared/game/physics';
import { FLAT_ZONE_LENGTH } from '../../types/game';
import {
  CHAR_SCALE,
  CHAR_SIZE,
  COYOTE_TIME_MS,
  EDGE_CONTACT_MARGIN,
  FLIP_ARC_FORWARD,
  GROUNDED_EPSILON,
  SUPPORT_MIN_OVERLAP,
  groundHeight,
} from './constants';
import type { SimulationRefs } from './types';

interface UseGameGesturesArgs {
  refs: Pick<
    SimulationRefs,
    | 'gameOver'
    | 'dying'
    | 'groundY'
    | 'gravityDirection'
    | 'totalScroll'
    | 'charX'
    | 'simTimeMs'
    | 'lastGroundedAtMs'
    | 'platformRects'
    | 'posY'
    | 'velocityY'
    | 'velocityX'
  >;
  triggerAudioEvent: (event: 'flip') => void;
  onFlipInput?: () => void;
}

export const useGameGestures = ({ refs, triggerAudioEvent, onFlipInput }: UseGameGesturesArgs) => {
  return useMemo(
    () =>
      Gesture.Tap().onEnd(() => {
        'worklet';
        if (refs.gameOver.value === 1 || refs.dying.value === 1) return;

        const gY = refs.groundY.value;
        const charH = CHAR_SIZE * CHAR_SCALE;
        const charW = CHAR_SIZE * CHAR_SCALE;
        const gDir = refs.gravityDirection.value;
        const charWorldX = refs.totalScroll.value + refs.charX.value;
        const inFlatZone = charWorldX < FLAT_ZONE_LENGTH;
        const footLeft = charWorldX + EDGE_CONTACT_MARGIN;
        const footRight = charWorldX + charW - EDGE_CONTACT_MARGIN;
        const timeSinceGrounded = refs.simTimeMs.value - refs.lastGroundedAtMs.value;
        const canUseCoyote = timeSinceGrounded >= 0 && timeSinceGrounded <= COYOTE_TIME_MS;

        const grounded = isGrounded({
          gravityDir: gDir === -1 ? -1 : 1,
          inFlatZone,
          posY: refs.posY.value,
          charH,
          groundY: gY,
          flatTopY: groundHeight,
          rects: refs.platformRects.value,
          footLeft,
          footRight,
          supportMinOverlap: SUPPORT_MIN_OVERLAP,
          groundedEpsilon: GROUNDED_EPSILON,
        });

        if (grounded || canUseCoyote) {
          scheduleOnRN(triggerAudioEvent, 'flip');
          if (onFlipInput) {
            scheduleOnRN(onFlipInput);
          }
          refs.gravityDirection.value = -gDir;
          refs.velocityY.value = 0;
          refs.velocityX.value = FLIP_ARC_FORWARD;
        }
      }),
    [onFlipInput, refs, triggerAudioEvent]
  );
};
