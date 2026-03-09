import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { GestureDetector } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';
import { useAnimatedReaction, useSharedValue } from 'react-native-reanimated';
import { Atlas, Canvas, Group, Line, Picture, Rect } from '@shopify/react-native-skia';
import { scheduleOnRN } from 'react-native-worklets';
import { FLAT_ZONE_LENGTH, type GameAudioEvent, type OpponentSnapshot } from '../types/game';
import {
  CHAR_SCALE,
  CHAR_SIZE,
  DEATH_MARGIN_FRACTION,
  EDGE_CONTACT_MARGIN,
  ENABLE_COLLIDER_DEBUG_UI,
  OPPONENT_X_FACTOR,
  groundHeight,
} from './game/constants';
import { useGameGestures } from './game/useGameGestures';
import { useGameSimulation } from './game/useGameSimulation';
import { useScoreAndChunks } from './game/useScoreAndChunks';

import type { GameCanvasProps, GravityDirection, SimulationRefs } from './game/types';
import { useWorldPictures } from './game/useWorldPictures';
import { COUNTDOWN_DIGIT_ASSETS } from './game/worldAssetSources';

const SCORE_DISPLAY_BUCKET = 10;
const OPPONENT_SCORE_DISPLAY_BUCKET = 10;
const DEBUG_OVERLAY_UPDATE_MS = 80;
type DebugOverlayState = {
  playerX: number;
  playerY: number;
  playerFootY: number;
  playerCenterX: number;
  playerCenterY: number;
  playerVelocityY: number;
  playerGravityY: number;
  opponentY: number;
  opponentFootY: number;
  flatZoneX: number;
};
type OpponentHudState = {
  visible: boolean;
  alive: boolean;
  score: number;
};

const ScoreOverlay = React.memo(({ scoreValue }: { scoreValue: SharedValue<number> }) => {
  const [display, setDisplay] = useState(0);

  useAnimatedReaction(
    () => Math.floor(scoreValue.value / SCORE_DISPLAY_BUCKET),
    (bucket, prev) => {
      'worklet';
      if (bucket !== prev) {
        scheduleOnRN(setDisplay, bucket * SCORE_DISPLAY_BUCKET);
      }
    }
  );

  return (
    <View style={styles.scoreWrapper}>
      <Text style={styles.scoreLabel}>SCORE</Text>
      <Text style={styles.scoreText}>{display}m</Text>
    </View>
  );
});

const OpponentOverlay = React.memo(
  ({
    snapshotValue,
    opponentConnectionState,
    opponentName,
  }: {
    snapshotValue: SharedValue<OpponentSnapshot | null>;
    opponentConnectionState: NonNullable<GameCanvasProps['opponentConnectionState']>;
    opponentName?: string;
  }) => {
    const [display, setDisplay] = useState<OpponentHudState>({
      visible: false,
      alive: false,
      score: 0,
    });

    useAnimatedReaction(
      () => {
        const snapshot = snapshotValue.value;
        if (!snapshot) return null;
        return {
          alive: snapshot.alive ? 1 : 0,
          scoreBucket: Math.floor(snapshot.score / OPPONENT_SCORE_DISPLAY_BUCKET),
        };
      },
      (next, prev) => {
        'worklet';
        if (!next) {
          if (prev !== null) {
            scheduleOnRN(setDisplay, {
              visible: false,
              alive: false,
              score: 0,
            });
          }
          return;
        }

        if (prev === null || next.alive !== prev.alive || next.scoreBucket !== prev.scoreBucket) {
          scheduleOnRN(setDisplay, {
            visible: true,
            alive: next.alive === 1,
            score: next.scoreBucket * OPPONENT_SCORE_DISPLAY_BUCKET,
          });
        }
      }
    );

    if (!display.visible) return null;
    return (
      <View style={styles.opponentHud}>
        <Text style={styles.opponentTitle}>{opponentName ?? 'Opponent'}</Text>
        <Text style={styles.opponentState}>{display.alive ? 'Alive' : 'Down'}</Text>
        <Text style={styles.opponentState}>Score: {display.score}m</Text>
        <Text style={styles.connectionState}>Net: {opponentConnectionState}</Text>
      </View>
    );
  }
);

type DebugOverlayProps = {
  refs: Pick<
    SimulationRefs,
    | 'charX'
    | 'posY'
    | 'velocityY'
    | 'gravityDirection'
    | 'opponentPosY'
    | 'opponentGravity'
    | 'totalScroll'
    | 'simTimeMs'
  >;
  width: number;
  height: number;
  charSize: number;
  stableGroundY: number;
  deathLineBottom: number;
  deathLineTop: number;
  opponentX: number;
};

const DebugOverlay = React.memo(
  ({
    refs,
    width,
    height,
    charSize,
    stableGroundY,
    deathLineBottom,
    deathLineTop,
    opponentX,
  }: DebugOverlayProps) => {
    const [overlay, setOverlay] = useState<DebugOverlayState | null>(null);

    useAnimatedReaction(
      () => Math.floor(refs.simTimeMs.value / DEBUG_OVERLAY_UPDATE_MS),
      () => {
        'worklet';
        const playerX = refs.charX.value;
        const playerY = refs.posY.value;
        const gravityDown = refs.gravityDirection.value !== -1;
        const playerFootY = gravityDown ? playerY + charSize : playerY;
        const playerCenterX = playerX + charSize / 2;
        const playerCenterY = playerY + charSize / 2;
        const playerVelocityY = playerCenterY + refs.velocityY.value * 0.06;
        const playerGravityY = playerCenterY + (gravityDown ? 26 : -26);
        const opponentY = refs.opponentPosY.value;
        const opponentFootY = refs.opponentGravity.value === -1 ? opponentY : opponentY + charSize;
        const flatZoneX = FLAT_ZONE_LENGTH - refs.totalScroll.value;
        scheduleOnRN(setOverlay, {
          playerX,
          playerY,
          playerFootY,
          playerCenterX,
          playerCenterY,
          playerVelocityY,
          playerGravityY,
          opponentY,
          opponentFootY,
          flatZoneX,
        });
      },
      [charSize, refs]
    );

    if (!overlay) return null;
    return (
      <>
        <Line p1={{ x: 0, y: groundHeight }} p2={{ x: width, y: groundHeight }} color="#f59e0b" />
        <Line p1={{ x: 0, y: stableGroundY }} p2={{ x: width, y: stableGroundY }} color="#f59e0b" />
        <Line
          p1={{ x: 0, y: deathLineBottom }}
          p2={{ x: width, y: deathLineBottom }}
          color="#ef4444"
        />
        <Line p1={{ x: 0, y: deathLineTop }} p2={{ x: width, y: deathLineTop }} color="#ef4444" />
        <Line
          p1={{ x: overlay.flatZoneX, y: 0 }}
          p2={{ x: overlay.flatZoneX, y: height }}
          color="#22c55e"
        />

        <Rect
          x={overlay.playerX}
          y={overlay.playerY}
          width={charSize}
          height={charSize}
          color="#10b981"
          style="stroke"
          strokeWidth={2}
        />
        <Line
          p1={{ x: overlay.playerX + EDGE_CONTACT_MARGIN, y: overlay.playerFootY }}
          p2={{ x: overlay.playerX + charSize - EDGE_CONTACT_MARGIN, y: overlay.playerFootY }}
          color="#fde047"
        />
        <Line
          p1={{ x: overlay.playerCenterX, y: overlay.playerCenterY }}
          p2={{ x: overlay.playerCenterX, y: overlay.playerVelocityY }}
          color="#38bdf8"
        />
        <Line
          p1={{ x: overlay.playerCenterX, y: overlay.playerCenterY }}
          p2={{ x: overlay.playerCenterX, y: overlay.playerGravityY }}
          color="#f472b6"
        />

        <Rect
          x={opponentX}
          y={overlay.opponentY}
          width={charSize}
          height={charSize}
          color="#fb923c"
          style="stroke"
          strokeWidth={2}
        />
        <Line
          p1={{ x: opponentX + EDGE_CONTACT_MARGIN, y: overlay.opponentFootY }}
          p2={{ x: opponentX + charSize - EDGE_CONTACT_MARGIN, y: overlay.opponentFootY }}
          color="#fdba74"
        />
      </>
    );
  }
);

export const GameCanvas = ({
  restartKey = 0,
  levelSeed,
  onExit,
  onGameOver,
  onAudioEvent,
  backgroundIndex = 0,
  terrainTheme = 'grass',
  initialGravityDirection = 1,
  characterId,
  opponentCharacterId,
  opponentInitialGravityDirection,
  opponentSnapshotValue,
  opponentConnectionState = 'connected',
  opponentName,
  onFlipInput,
  onLocalState,
  onLocalDeath,
}: GameCanvasProps) => {
  const [countdownDigit, setCountdownDigit] = useState<3 | 2 | 1 | null>(null);
  const { width, height } = useWindowDimensions();

  const groundY = useSharedValue(0);
  const posY = useSharedValue(0);
  const velocityY = useSharedValue(0);
  const gravityDirection = useSharedValue<GravityDirection>(1);
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
  const opponentFrameIndex = useSharedValue(0);
  const opponentVelocityY = useSharedValue(0);
  const opponentFlipLocked = useSharedValue(0);
  const opponentCountdownLocked = useSharedValue(0);

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
      opponentFrameIndex,
      opponentVelocityY,
      opponentFlipLocked,
      opponentCountdownLocked,
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
      opponentCountdownLocked,
      opponentFlipLocked,
      opponentFrameIndex,
      opponentGravity,
      opponentPosY,
      opponentVelocityY,
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
  const charSize = CHAR_SIZE * CHAR_SCALE;
  const { scoreValue, platforms } = useScoreAndChunks({
    restartKey,
    levelSeed,
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
    triggerAudioEvent,
    triggerGameOver,
    onLocalState,
    onLocalDeath,
  });

  const tapGesture = useGameGestures({
    refs,
    triggerAudioEvent,
    onFlipInput,
  });

  const {
    worldAssetsReady,
    characterImage,
    opponentImage,
    characterTransforms,
    characterRenderTransform,
    opponentTransforms,
    opponentRenderTransform,
    characterSprites,
    opponentSprites,
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
    characterId,
    opponentCharacterId,
    platforms,
    refs,
  });

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  }, []);

  useEffect(() => {
    const charH = charSize;
    const opponentSpawnGravity =
      opponentInitialGravityDirection ?? (initialGravityDirection === 1 ? -1 : 1);
    opponentGravity.value = opponentSpawnGravity;
    opponentPosY.value = opponentSpawnGravity === -1 ? groundHeight : stableGroundY - charH;
  }, [
    charSize,
    initialGravityDirection,
    opponentGravity,
    opponentInitialGravityDirection,
    opponentPosY,
    restartKey,
    stableGroundY,
  ]);

  useEffect(() => {
    countdownLocked.value = 1;
    refs.initialized.value = 0;
    refs.velocityX.value = 0;
    setCountdownDigit(null);

    if (!worldAssetsReady) {
      return;
    }

    setCountdownDigit(3);
    triggerAudioEvent('countdown_tick');

    let nextDigit: 3 | 2 | 1 | null = 3;
    const timer = setInterval(() => {
      if (nextDigit === 3) {
        nextDigit = 2;
        setCountdownDigit(2);
        triggerAudioEvent('countdown_tick');
        return;
      }
      if (nextDigit === 2) {
        nextDigit = 1;
        setCountdownDigit(1);
        triggerAudioEvent('countdown_tick');
        return;
      }
      clearInterval(timer);
      nextDigit = null;
      setCountdownDigit(null);
      countdownLocked.value = 0;
      refs.initialized.value = 1;
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [
    countdownLocked,
    refs.initialized,
    refs.velocityX,
    restartKey,
    triggerAudioEvent,
    worldAssetsReady,
  ]);

  const countdownImageSource = useMemo(() => {
    if (countdownDigit === 1) {
      return COUNTDOWN_DIGIT_ASSETS[1];
    }
    if (countdownDigit === 2) {
      return COUNTDOWN_DIGIT_ASSETS[2];
    }
    if (countdownDigit === 3) {
      return COUNTDOWN_DIGIT_ASSETS[3];
    }
    return null;
  }, [countdownDigit]);

  const fallbackOpponentSnapshotValue = useSharedValue<OpponentSnapshot | null>(null);
  const opponentSnapshotSignal = opponentSnapshotValue ?? fallbackOpponentSnapshotValue;

  useAnimatedReaction(
    () => opponentSnapshotSignal.value,
    (snapshot) => {
      'worklet';
      if (!snapshot) {
        opponentAlive.value = 0;
        return;
      }
      const laneSpan = Math.max(1, height - 2 * groundHeight - charSize);
      opponentPosY.value = groundHeight + snapshot.normalizedY * laneSpan;
      opponentGravity.value = snapshot.gravityDir;
      opponentAlive.value = snapshot.alive ? 1 : 0;
      opponentFrameIndex.value = snapshot.frameIndex;
      opponentVelocityY.value = snapshot.velocityY;
      opponentFlipLocked.value = snapshot.flipLocked;
      opponentCountdownLocked.value = snapshot.countdownLocked;
    },
    [
      charSize,
      height,
      opponentAlive,
      opponentCountdownLocked,
      opponentFlipLocked,
      opponentFrameIndex,
      opponentGravity,
      opponentPosY,
      opponentVelocityY,
      opponentSnapshotSignal,
    ]
  );

  const opponentX = width * OPPONENT_X_FACTOR;
  const deathLineBottom = stableGroundY + charSize * DEATH_MARGIN_FRACTION;
  const deathLineTop = -charSize * DEATH_MARGIN_FRACTION;

  return (
    <View style={[styles.container, { width, height }]}>
      <ScoreOverlay scoreValue={scoreValue} />

      <OpponentOverlay
        snapshotValue={opponentSnapshotSignal}
        opponentConnectionState={opponentConnectionState}
        opponentName={opponentName}
      />

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
            <Group transform={characterRenderTransform}>
              <Atlas
                image={characterImage}
                sprites={characterSprites}
                transforms={characterTransforms}
              />
            </Group>
          )}
          {opponentCharacterId && opponentImage ? (
            <Group transform={opponentRenderTransform}>
              <Atlas
                image={opponentImage}
                sprites={opponentSprites}
                transforms={opponentTransforms}
              />
            </Group>
          ) : null}
          {worldAssetsReady && ENABLE_COLLIDER_DEBUG_UI && (
            <DebugOverlay
              refs={refs}
              width={width}
              height={height}
              charSize={charSize}
              stableGroundY={stableGroundY}
              deathLineBottom={deathLineBottom}
              deathLineTop={deathLineTop}
              opponentX={opponentX}
            />
          )}
        </Canvas>
      </GestureDetector>

      {ENABLE_COLLIDER_DEBUG_UI && (
        <View pointerEvents="none" style={[styles.debugHud, { top: 8 }]}>
          <Text style={styles.debugHudText}>BOX COLLIDERS ON</Text>
        </View>
      )}

      {!worldAssetsReady && (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <ActivityIndicator color="#ffffff" size="large" />
          <Text style={styles.loadingText}>Loading game assets…</Text>
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
    backgroundColor: '#000000',
  },
  canvas: {
    flex: 1,
    backgroundColor: '#000000',
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
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  loadingText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
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
