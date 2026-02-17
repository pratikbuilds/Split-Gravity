import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAnimatedReaction, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { Chunk } from '../../types/game';
import { generateLevelChunks, preGenerateLevelChunks } from '../../utils/levelGeneratorSections';
import { CHAR_SCALE, CHAR_SIZE, PLAYER_X_FACTOR, groundHeight, tileSize } from './constants';
import type { SimulationRefs } from './types';

interface UseScoreAndChunksArgs {
  width: number;
  height: number;
  groundY: number;
  initialGravityDirection: 1 | -1;
  refs: Pick<
    SimulationRefs,
    | 'groundY'
    | 'posY'
    | 'velocityY'
    | 'gravityDirection'
    | 'velocityX'
    | 'totalScroll'
    | 'gameOver'
    | 'dying'
    | 'deathScore'
    | 'simTimeMs'
    | 'elapsedMs'
    | 'frameIndex'
    | 'charX'
    | 'initialized'
    | 'flipLockedUntilLanding'
    | 'platformRects'
    | 'lastGroundedAtMs'
  >;
}

export const useScoreAndChunks = ({
  width,
  height,
  groundY,
  initialGravityDirection,
  refs,
}: UseScoreAndChunksArgs) => {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [score, setScore] = useState(0);
  const chunksRef = useRef<Chunk[]>([]);
  chunksRef.current = chunks;

  const platforms = useMemo(() => chunks.flatMap((c) => c.platforms), [chunks]);
  const lastSpawnRef = useRef(0);
  const lastSpawnAt = useSharedValue(0);
  const lastScoreAt = useSharedValue(0);

  useEffect(() => {
    if (height <= 0 || width <= 0) return;

    const spawnGravity = initialGravityDirection === -1 ? -1 : 1;
    const charH = CHAR_SIZE * CHAR_SCALE;

    refs.groundY.value = groundY;
    refs.posY.value = spawnGravity === -1 ? groundHeight : groundY - charH;
    refs.velocityY.value = 0;
    refs.gravityDirection.value = spawnGravity;
    refs.flipLockedUntilLanding.value = 0;
    refs.velocityX.value = 0;
    refs.totalScroll.value = 0;
    refs.gameOver.value = 0;
    refs.dying.value = 0;
    refs.deathScore.value = 0;
    refs.simTimeMs.value = 0;
    refs.lastGroundedAtMs.value = 0;
    refs.elapsedMs.value = 0;
    refs.frameIndex.value = 0;
    refs.charX.value = width * PLAYER_X_FACTOR;
    refs.initialized.value = 1;
    lastSpawnRef.current = 0;
    lastSpawnAt.value = 0;
    lastScoreAt.value = 0;

    const config = { groundY, tileSize, screenWidth: width };
    const initialChunks = preGenerateLevelChunks(config);
    setChunks(initialChunks);
    setScore(0);
  }, [groundY, height, initialGravityDirection, lastScoreAt, lastSpawnAt, refs, width]);

  useEffect(() => {
    const rects: number[] = [];
    for (const p of platforms) {
      // Physics colliders should represent only exposed platform surfaces.
      // Using a single rect per platform prevents internal tile seams from
      // being interpreted as valid landing/ceiling collision planes.
      rects.push(p.x, p.y, p.width, p.height);
    }
    refs.platformRects.value = rects;
  }, [platforms, refs.platformRects]);

  const spawnChunks = useCallback(() => {
    const scroll = refs.totalScroll.value;
    if (scroll < lastSpawnRef.current) return;
    lastSpawnRef.current = scroll + 200;

    const currentChunks = chunksRef.current;
    const config = { groundY, tileSize, screenWidth: width };
    const newChunks = generateLevelChunks(config, scroll, currentChunks);
    const chunksChanged =
      newChunks.length !== currentChunks.length ||
      newChunks.some((chunk, index) => currentChunks[index]?.id !== chunk.id);
    if (chunksChanged) {
      setChunks(newChunks);
    }
  }, [groundY, refs.totalScroll, width]);

  useAnimatedReaction(
    () => refs.totalScroll.value,
    (scroll) => {
      if (scroll - lastSpawnAt.value >= 300) {
        lastSpawnAt.value = scroll;
        scheduleOnRN(spawnChunks);
      }
      if (scroll - lastScoreAt.value >= 50) {
        lastScoreAt.value = scroll;
        scheduleOnRN(setScore, Math.floor(scroll));
      }
    }
  );

  return {
    chunks,
    score,
    platforms,
  };
};
