import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { Atlas, Canvas, Group, Picture } from '@shopify/react-native-skia';
import type { GameAudioEvent } from '../types/game';
import { CHAR_SCALE, CHAR_SIZE, ENABLE_COLLIDER_DEBUG_UI, groundHeight } from './game/constants';
import { useGameGestures } from './game/useGameGestures';
import { useGameSimulation } from './game/useGameSimulation';
import { useScoreAndChunks } from './game/useScoreAndChunks';
import type { GameCanvasProps } from './game/types';
import { useWorldPictures } from './game/useWorldPictures';

export const GameCanvas = ({
  onExit,
  onGameOver,
  onAudioEvent,
  backgroundIndex = 0,
  terrainTheme = 'grass',
  initialGravityDirection = 1,
  opponentInitialGravityDirection,
  opponentSnapshot,
  opponentConnectionState = 'connected',
  opponentName,
  onFlipInput,
  onLocalState,
  onLocalDeath,
}: GameCanvasProps) => {
  const [countdownDigit, setCountdownDigit] = useState<3 | 2 | 1 | null>(3);
  const { width, height } = useWindowDimensions();

  const groundY = useSharedValue(0);
  const posY = useSharedValue(0);
  const velocityY = useSharedValue(0);
  const gravityDirection = useSharedValue(1);
  const flipLockedUntilLanding = useSharedValue(0);
  const frameIndex = useSharedValue(0);
  const elapsedMs = useSharedValue(0);
  const gameOver = useSharedValue(0);
  const dying = useSharedValue(0);
  const deathScore = useSharedValue(0);
  const velocityX = useSharedValue(0);
  const totalScroll = useSharedValue(0);
  const initialized = useSharedValue(0);
  const countdownLocked = useSharedValue(1);
  const charX = useSharedValue(0);
  const simTimeMs = useSharedValue(0);
  const lastGroundedAtMs = useSharedValue(0);
  const platformRects = useSharedValue<number[]>([]);
  const opponentPosY = useSharedValue(0);
  const opponentGravity = useSharedValue(1);
  const opponentAlive = useSharedValue(0);

  const refs = useMemo(
    () => ({
      groundY,
      posY,
      velocityY,
      gravityDirection,
      flipLockedUntilLanding,
      frameIndex,
      elapsedMs,
      gameOver,
      dying,
      deathScore,
      velocityX,
      totalScroll,
      initialized,
      countdownLocked,
      charX,
      simTimeMs,
      lastGroundedAtMs,
      platformRects,
      opponentPosY,
      opponentGravity,
      opponentAlive,
    }),
    [
      charX,
      deathScore,
      dying,
      elapsedMs,
      frameIndex,
      gameOver,
      flipLockedUntilLanding,
      gravityDirection,
      groundY,
      initialized,
      countdownLocked,
      lastGroundedAtMs,
      opponentAlive,
      opponentGravity,
      opponentPosY,
      platformRects,
      posY,
      simTimeMs,
      totalScroll,
      velocityX,
      velocityY,
    ]
  );

  const triggerGameOverRef = useRef(onGameOver);
  triggerGameOverRef.current = onGameOver;
  const triggerAudioRef = useRef(onAudioEvent);
  triggerAudioRef.current = onAudioEvent;

  const triggerGameOver = useCallback((playerScore: number) => {
    triggerGameOverRef.current?.({ playerScore });
  }, []);

  const triggerAudioEvent = useCallback((event: GameAudioEvent) => {
    triggerAudioRef.current?.(event);
  }, []);

  const stableGroundY = height - groundHeight;
  const { score, platforms } = useScoreAndChunks({
    width,
    height,
    groundY: stableGroundY,
    initialGravityDirection,
    refs,
  });

  useGameSimulation({
    width,
    height,
    refs,
    triggerAudioEvent: (event) => triggerAudioEvent(event),
    triggerGameOver,
    onLocalState,
    onLocalDeath,
  });

  const tapGesture = useGameGestures({
    refs,
    triggerAudioEvent: (event) => triggerAudioEvent(event),
    onFlipInput,
  });

  const {
    characterImage,
    characterTransforms,
    opponentTransforms,
    characterSprites,
    backgroundPicture,
    backgroundTransform,
    platformsPicture,
    colliderDebugPicture,
    platformsTransform,
  } = useWorldPictures({
    width,
    height,
    backgroundIndex,
    terrainTheme,
    platforms,
    refs,
  });

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  }, []);

  useEffect(() => {
    const charH = CHAR_SIZE * CHAR_SCALE;
    const opponentSpawnGravity =
      opponentInitialGravityDirection ?? (initialGravityDirection === 1 ? -1 : 1);
    opponentGravity.value = opponentSpawnGravity;
    opponentPosY.value = opponentSpawnGravity === -1 ? groundHeight : stableGroundY - charH;
  }, [
    initialGravityDirection,
    opponentGravity,
    opponentInitialGravityDirection,
    opponentPosY,
    stableGroundY,
  ]);

  useEffect(() => {
    countdownLocked.value = 1;
    refs.initialized.value = 0;
    refs.velocityX.value = 0;
    setCountdownDigit(3);

    let nextDigit: 3 | 2 | 1 | null = 3;
    const timer = setInterval(() => {
      if (nextDigit === 3) {
        nextDigit = 2;
        setCountdownDigit(2);
        return;
      }
      if (nextDigit === 2) {
        nextDigit = 1;
        setCountdownDigit(1);
        return;
      }
      clearInterval(timer);
      nextDigit = null;
      setCountdownDigit(null);
      countdownLocked.value = 0;
      refs.initialized.value = 1;
      triggerAudioEvent('run_start');
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [countdownLocked, refs.initialized, refs.velocityX, triggerAudioEvent]);

  const countdownImageSource = useMemo(() => {
    if (countdownDigit === 1) {
      return require('../assets/game/hud/hud_character_1.png');
    }
    if (countdownDigit === 2) {
      return require('../assets/game/hud/hud_character_2.png');
    }
    if (countdownDigit === 3) {
      return require('../assets/game/hud/hud_character_3.png');
    }
    return null;
  }, [countdownDigit]);

  useEffect(() => {
    if (!opponentSnapshot) {
      opponentAlive.value = 0;
      return;
    }

    const charH = CHAR_SIZE * CHAR_SCALE;
    const laneSpan = Math.max(1, height - 2 * groundHeight - charH);
    opponentPosY.value = groundHeight + opponentSnapshot.normalizedY * laneSpan;
    opponentGravity.value = opponentSnapshot.gravityDir;
    opponentAlive.value = opponentSnapshot.alive ? 1 : 0;
  }, [height, opponentAlive, opponentGravity, opponentPosY, opponentSnapshot]);

  return (
    <View style={[styles.container, { width, height }]}>
      <View style={styles.scoreWrapper}>
        <Text style={styles.scoreLabel}>SCORE</Text>
        <Text style={styles.scoreText}>{score}m</Text>
      </View>

      {opponentSnapshot && (
        <View style={styles.opponentHud}>
          <Text style={styles.opponentTitle}>{opponentName ?? 'Opponent'}</Text>
          <Text style={styles.opponentState}>{opponentSnapshot.alive ? 'Alive' : 'Down'}</Text>
          <Text style={styles.opponentState}>Score: {opponentSnapshot.score}m</Text>
          <Text style={styles.connectionState}>Net: {opponentConnectionState}</Text>
        </View>
      )}

      <GestureDetector gesture={tapGesture}>
        <Canvas style={styles.canvas}>
          {backgroundPicture && (
            <Group transform={backgroundTransform}>
              <Picture picture={backgroundPicture} />
            </Group>
          )}
          {platformsPicture && (
            <Group transform={platformsTransform}>
              <Picture picture={platformsPicture} />
            </Group>
          )}
          {colliderDebugPicture && (
            <Group transform={platformsTransform}>
              <Picture picture={colliderDebugPicture} />
            </Group>
          )}
          {characterImage && (
            <Atlas
              image={characterImage}
              sprites={characterSprites}
              transforms={characterTransforms}
            />
          )}
          {characterImage && opponentSnapshot?.alive ? (
            <Atlas
              image={characterImage}
              sprites={characterSprites}
              transforms={opponentTransforms}
            />
          ) : null}
        </Canvas>
      </GestureDetector>

      {ENABLE_COLLIDER_DEBUG_UI && (
        <View pointerEvents="none" style={[styles.debugHud, { top: 8 }]}>
          <Text style={styles.debugHudText}>BOX COLLIDERS ON</Text>
        </View>
      )}

      {countdownImageSource && (
        <View pointerEvents="none" style={styles.countdownOverlay}>
          <Text style={styles.countdownLabel}>Game starts in</Text>
          <Image source={countdownImageSource} style={styles.countdownDigit} resizeMode="contain" />
        </View>
      )}

      {onExit && (
        <View style={styles.exitWrapper}>
          <Pressable onPress={onExit} style={styles.exitButton}>
            <Text style={styles.exitText}>EXIT</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#add8e6',
  },
  canvas: {
    flex: 1,
  },
  scoreWrapper: {
    position: 'absolute',
    left: 24,
    top: 24,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    zIndex: 10,
  },
  scoreLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#687080',
    letterSpacing: 1.2,
  },
  scoreText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2b2b2b',
  },
  opponentHud: {
    position: 'absolute',
    left: 24,
    top: 96,
    zIndex: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(11,18,32,0.88)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  opponentTitle: {
    color: '#e2e8f0',
    fontWeight: '700',
    fontSize: 13,
  },
  opponentState: {
    color: '#cbd5e1',
    fontSize: 12,
  },
  connectionState: {
    color: '#93c5fd',
    fontSize: 11,
    marginTop: 2,
  },
  exitWrapper: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitButton: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  exitText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2b2b2b',
    letterSpacing: 2,
  },
  debugHud: {
    position: 'absolute',
    left: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    zIndex: 10,
  },
  debugHudText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(4,12,20,0.3)',
  },
  countdownLabel: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 14,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  countdownDigit: {
    width: 88,
    height: 88,
  },
});
