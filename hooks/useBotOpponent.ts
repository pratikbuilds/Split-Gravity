import { useCallback, useEffect, useRef, useState } from 'react';
import type { Chunk, OpponentSnapshot } from '../types/game';
import {
  applyBotFlip,
  createInitialBotState,
  ensureBotChunks,
  platformsToRects,
  projectBotNormalizedY,
  preGenerateBotChunks,
  stepBotPhysics,
} from '../services/bot/botSimulation';
import { shouldBotFlip } from '../services/bot/botAI';
import { CHAR_SCALE, CHAR_SIZE, groundHeight, PLAYER_X_FACTOR } from '../components/game/constants';

const BOT_PLAYER_ID = 'bot';
const BOT_NICKNAME = 'Bot';
const BOT_DEBUG_ENABLED = (globalThis as { __BOT_DEBUG__?: boolean }).__BOT_DEBUG__ === true;
const SNAPSHOT_SMOOTHING_ALPHA = 0.4;

export interface UseBotOpponentArgs {
  width: number;
  height: number;
  initialGravityDirection: 1 | -1;
  active: boolean;
  onBotDeath?: (score: number) => void;
}

export function useBotOpponent({
  width,
  height,
  initialGravityDirection,
  active,
  onBotDeath,
}: UseBotOpponentArgs) {
  const groundY = height - groundHeight;
  const charX = width * PLAYER_X_FACTOR;
  const charH = CHAR_SIZE * CHAR_SCALE;

  const [snapshot, setSnapshot] = useState<OpponentSnapshot | null>(null);
  const stateRef = useRef(createInitialBotState(groundY, initialGravityDirection));
  const chunksRef = useRef<Chunk[]>([]);
  const lastSpawnRef = useRef(0);
  const shouldFlipSinceRef = useRef(0);
  const onBotDeathRef = useRef(onBotDeath);
  const smoothedNormalizedYRef = useRef(0);
  onBotDeathRef.current = onBotDeath;

  useEffect(() => {
    if (!active) return;
    stateRef.current = createInitialBotState(groundY, initialGravityDirection);
    chunksRef.current = preGenerateBotChunks(width, height, groundY);
    lastSpawnRef.current = 0;
    shouldFlipSinceRef.current = 0;
    smoothedNormalizedYRef.current = 0;
  }, [active, groundY, height, initialGravityDirection, width]);

  // Run bot simulation on JS thread via requestAnimationFrame
  useEffect(() => {
    if (!active || width <= 0 || height <= 0) return;

    let rafId: number;
    let lastTime = performance.now();

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(64, now - lastTime);
      lastTime = now;

      const state = stateRef.current;
      if (state.gameOver === 1) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      // Spawn chunks for bot's scroll - spawn well ahead so AI always sees next platforms
      if (state.scroll >= lastSpawnRef.current - 100) {
        lastSpawnRef.current = state.scroll + 400;
        chunksRef.current = ensureBotChunks(
          state.scroll,
          width,
          height,
          groundY,
          chunksRef.current
        );
      }

      const platforms = chunksRef.current.flatMap((c) => c.platforms);
      const rects = platformsToRects(platforms);

      // AI: should we flip?
      const { flip, newShouldFlipSince, reason } = shouldBotFlip({
        state,
        platforms,
        rects,
        groundY,
        charX,
        simTimeMs: state.simTimeMs,
        shouldFlipSince: shouldFlipSinceRef.current,
      });
      shouldFlipSinceRef.current = newShouldFlipSince;

      let nextState = state;
      if (flip) {
        nextState = applyBotFlip(nextState);
        if (BOT_DEBUG_ENABLED) {
          console.debug('[bot:flip]', {
            t: nextState.simTimeMs,
            reason,
            scroll: nextState.scroll,
            posY: nextState.posY,
          });
        }
      }
      nextState = stepBotPhysics(nextState, rects, height, groundY, charX, dt);

      const prevGameOver = stateRef.current.gameOver;
      stateRef.current = nextState;

      if (prevGameOver === 0 && nextState.gameOver === 1) {
        onBotDeathRef.current?.(nextState.deathScore);
      }

      const clampedNormalizedY = projectBotNormalizedY(nextState.posY, height, charH);
      const prevSmoothed = smoothedNormalizedYRef.current;
      const smoothedNormalizedY =
        prevSmoothed + (clampedNormalizedY - prevSmoothed) * SNAPSHOT_SMOOTHING_ALPHA;
      smoothedNormalizedYRef.current = smoothedNormalizedY;
      setSnapshot({
        playerId: BOT_PLAYER_ID,
        nickname: BOT_NICKNAME,
        normalizedY: smoothedNormalizedY,
        gravityDir: nextState.gravityDir,
        scroll: nextState.scroll,
        alive: nextState.dying === 0 && nextState.gameOver === 0,
        score: Math.floor(nextState.scroll),
        t: nextState.simTimeMs,
      });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active, width, height, groundY, charX, charH]);

  const reset = useCallback(() => {
    stateRef.current = createInitialBotState(groundY, initialGravityDirection);
    chunksRef.current = preGenerateBotChunks(width, height, groundY);
    lastSpawnRef.current = 0;
    shouldFlipSinceRef.current = 0;
    smoothedNormalizedYRef.current = 0;
    setSnapshot(null);
  }, [groundY, height, initialGravityDirection, width]);

  return { snapshot, reset };
}
