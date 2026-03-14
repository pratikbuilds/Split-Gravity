import { CHAR_SCALE, CHAR_SIZE, PLAYER_X_FACTOR, groundHeight } from './constants';
import type { GravityDirection } from './types';

export const resolveSpawnLayout = ({
  width,
  stableGroundY,
  gravityDirection,
}: {
  width: number;
  stableGroundY: number;
  gravityDirection: GravityDirection;
}) => {
  const charH = CHAR_SIZE * CHAR_SCALE;
  return {
    spawnX: width * PLAYER_X_FACTOR,
    spawnY: gravityDirection === -1 ? groundHeight : stableGroundY - charH,
  };
};
