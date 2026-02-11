import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAnimatedReaction, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { Chunk } from '../../types/game';
import { generateLevelChunks, preGenerateLevelChunks } from '../../utils/levelGenerator';
import { CHAR_SCALE, CHAR_SIZE, PLAYER_X_FACTOR, tileSize } from './constants';
import type { SimulationRefs } from './types';

interface UseScoreAndChunksArgs {
  width: number;
  height: number;
  groundY: number;
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
    | 'platformRects'
    | 'lastGroundedAtMs'
  >;
}

export const useScoreAndChunks = ({ width, height, groundY, refs }: UseScoreAndChunksArgs) => {
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

    refs.groundY.value = groundY;
    refs.posY.value = groundY - CHAR_SIZE * CHAR_SCALE;
    refs.velocityY.value = 0;
    refs.gravityDirection.value = 1;
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

    const initialChunks = preGenerateLevelChunks(width, height, groundY, tileSize);
    setChunks(initialChunks);
    setScore(0);
  }, [groundY, height, lastScoreAt, lastSpawnAt, refs, width]);

  useEffect(() => {
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
    refs.platformRects.value = rects;
  }, [platforms, refs.platformRects]);

  const spawnChunks = useCallback(() => {
    const scroll = refs.totalScroll.value;
    if (scroll < lastSpawnRef.current) return;
    lastSpawnRef.current = scroll + 200;

    const currentChunks = chunksRef.current;
    const newChunks = generateLevelChunks(scroll, width, height, groundY, tileSize, currentChunks);
    const chunksChanged =
      newChunks.length !== currentChunks.length ||
      newChunks.some((chunk, index) => currentChunks[index]?.id !== chunk.id);
    if (chunksChanged) {
      setChunks(newChunks);
    }
  }, [groundY, height, refs.totalScroll, width]);

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
