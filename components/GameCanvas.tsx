import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { Atlas, Canvas, Group, Picture } from '@shopify/react-native-skia';
import type { GameAudioEvent } from '../types/game';
import { groundHeight, ENABLE_COLLIDER_DEBUG_UI } from './game/constants';
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
  opponentSnapshot,
  opponentConnectionState = 'connected',
  opponentName,
  onFlipInput,
  onLocalState,
  onLocalDeath,
}: GameCanvasProps) => {
  const { width, height } = useWindowDimensions();

  const groundY = useSharedValue(0);
  const posY = useSharedValue(0);
  const velocityY = useSharedValue(0);
  const gravityDirection = useSharedValue(1);
  const frameIndex = useSharedValue(0);
  const elapsedMs = useSharedValue(0);
  const gameOver = useSharedValue(0);
  const dying = useSharedValue(0);
  const deathScore = useSharedValue(0);
  const velocityX = useSharedValue(0);
  const totalScroll = useSharedValue(0);
  const initialized = useSharedValue(0);
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
      frameIndex,
      elapsedMs,
      gameOver,
      dying,
      deathScore,
      velocityX,
      totalScroll,
      initialized,
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
      gravityDirection,
      groundY,
      initialized,
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
    platforms,
    refs,
  });

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  }, []);

  useEffect(() => {
    if (!opponentSnapshot) {
      opponentAlive.value = 0;
      return;
    }

    opponentPosY.value = opponentSnapshot.posY;
    opponentGravity.value = opponentSnapshot.gravityDir;
    opponentAlive.value = opponentSnapshot.alive ? 1 : 0;
  }, [opponentAlive, opponentGravity, opponentPosY, opponentSnapshot]);

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
});
