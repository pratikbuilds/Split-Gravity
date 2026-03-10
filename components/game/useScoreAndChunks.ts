import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { useAnimatedReaction, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { Chunk, Platform } from '../../types/game';
import { generateLevelChunks, preGenerateLevelChunks } from '../../utils/levelGeneratorSections';
import { CHAR_SCALE, CHAR_SIZE, PLAYER_X_FACTOR, groundHeight, tileSize } from './constants';
import type { GravityDirection, SimulationRefs } from './types';

interface UseScoreAndChunksArgs {
  restartKey: number;
  levelSeed?: number;
  width: number;
  height: number;
  groundY: number;
  initialGravityDirection: GravityDirection;
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

export interface UseScoreAndChunksResult {
  scoreValue: SharedValue<number>;
  platforms: Platform[];
}

export const useScoreAndChunks = ({
  restartKey,
  levelSeed,
  width,
  height,
  groundY,
  initialGravityDirection,
  refs,
}: UseScoreAndChunksArgs): UseScoreAndChunksResult => {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const scoreValue = useSharedValue(0);
  const chunksRef = useRef<Chunk[]>([]);
  chunksRef.current = chunks;

  const platforms = useMemo(() => chunks.flatMap((c) => c.platforms), [chunks]);
  const lastSpawnRef = useRef(0);
  const lastSpawnAt = useSharedValue(0);

  useEffect(() => {
    if (height <= 0 || width <= 0) return;

    const spawnGravity: GravityDirection = initialGravityDirection === -1 ? -1 : 1;
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
    scoreValue.value = 0;

    const config = {
      groundY,
      tileSize,
      screenWidth: width,
      ...(levelSeed != null && { sectionOrderSeed: levelSeed }),
    };
    const initialChunks = preGenerateLevelChunks(config);
    setChunks(initialChunks);
  }, [
    groundY,
    height,
    initialGravityDirection,
    lastSpawnAt,
    levelSeed,
    refs,
    restartKey,
    scoreValue,
    width,
  ]);

  useEffect(() => {
    const rects: number[] = [];
    for (const p of platforms) {
      rects.push(p.x, p.y, p.width, p.height);
    }
    refs.platformRects.value = rects;
  }, [platforms, refs.platformRects]);

  const spawnChunks = useCallback(() => {
    const scroll = refs.totalScroll.value;
    if (scroll < lastSpawnRef.current) return;
    lastSpawnRef.current = scroll + 200;

    const currentChunks = chunksRef.current;
    const config = {
      groundY,
      tileSize,
      screenWidth: width,
      ...(levelSeed != null && { sectionOrderSeed: levelSeed }),
    };
    const newChunks = generateLevelChunks(config, scroll, currentChunks);
    const chunksChanged =
      newChunks.length !== currentChunks.length ||
      newChunks.some((chunk, index) => currentChunks[index]?.id !== chunk.id);
    if (chunksChanged) {
      setChunks(newChunks);
    }
  }, [groundY, levelSeed, refs.totalScroll, width]);

  // Score updates live on the UI thread via SharedValue — no React re-renders.
  // ScoreOverlay subscribes independently and only re-renders itself.
  useAnimatedReaction(
    () => {
      'worklet';
      return refs.totalScroll.value;
    },
    (scroll) => {
      'worklet';
      scoreValue.value = scroll;
      if (scroll > lastSpawnAt.value + 300) {
        lastSpawnAt.value = scroll;
        scheduleOnRN(spawnChunks);
      }
    }
  );

  return {
    scoreValue,
    platforms,
  };
};
