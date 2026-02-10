import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedReaction,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import {
  Atlas,
  Canvas,
  Group,
  Picture,
  Skia,
  createPicture,
  rect,
  useImage,
  useRSXformBuffer,
} from '@shopify/react-native-skia';
import type { Chunk, Platform } from '../types/game';
import { generateLevelChunks, preGenerateLevelChunks } from '../utils/levelGenerator';
import { FLAT_ZONE_LENGTH } from '../types/game';

type GameCanvasProps = {
  onExit?: () => void;
  onGameOver?: (score: number) => void;
  backgroundIndex?: number;
};

const TILEMAP_SIZE = 16;
const TILEMAP_COLS = 22;
const GROUND_SCALE = 2;

// Physics
const GRAVITY = 2400;
const RUN_SPEED = 280;
const CHAR_SCALE = 1.5;
const CHAR_SIZE = 24;
const FRAME_INTERVAL_MS = 100;
const GROUNDED_EPSILON = 4;
// Player must fully enter ditch (entire character below surface) before game over
const DEATH_MARGIN_FRACTION = 1.0; // 1.0 = full character height below surface
const FLIP_ARC_FORWARD = 80; // horizontal boost (px) during flip arc
const FLIP_ARC_DECAY = 0.96; // per-frame decay of flip velocity

const tileSize = TILEMAP_SIZE * GROUND_SCALE;
const groundRows = 2;
const groundHeight = groundRows * tileSize;

export const GameCanvas = ({ onExit, onGameOver, backgroundIndex = 1 }: GameCanvasProps) => {
  const { width, height } = useWindowDimensions();

  const tilemapImage = useImage(require('../assets/game/terrain.png'));
  const characterImage = useImage(
    require('../assets/platform assets/Tilemap/tilemap-characters_packed.png')
  );

  const groundY = useSharedValue(0);
  const posY = useSharedValue(0);
  const velocityY = useSharedValue(0);
  const gravityDirection = useSharedValue(1); // 1 = down, -1 = up
  const frameIndex = useSharedValue(0);
  const elapsedMs = useSharedValue(0);
  const gameOver = useSharedValue(0); // 0 = playing, 1 = dead
  const velocityX = useSharedValue(0); // flip arc horizontal boost
  const totalScroll = useSharedValue(0); // cumulative world scroll (never wraps)
  const groundPictureWidthSv = useSharedValue(0);
  const initialized = useSharedValue(0); // 0 = not yet, 1 = ready
  const charX = useSharedValue(0);

  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [score, setScore] = useState(0);
  const chunksRef = useRef<Chunk[]>([]);
  chunksRef.current = chunks;
  const platforms = useMemo(() => chunks.flatMap((c) => c.platforms), [chunks]);
  const platformRects = useSharedValue<number[]>([]); // [x,y,w,h, ...] for worklet

  const onGameOverRef = useRef(onGameOver);
  onGameOverRef.current = onGameOver;
  const triggerGameOver = useCallback((score: number) => {
    onGameOverRef.current?.(score);
  }, []);

  useEffect(() => {
    if (height > 0 && width > 0) {
      const gY = height - groundHeight;
      groundY.value = gY;
      posY.value = gY - CHAR_SIZE * CHAR_SCALE;
      charX.value = width * 0.25;
      const initialChunks = preGenerateLevelChunks(width, height, gY, tileSize);
      setChunks(initialChunks);
      initialized.value = 1;
    }
  }, [height, width]);

  // Update platform rects for worklet when platforms change
  useEffect(() => {
    const rects = platforms.flatMap((p) => [p.x, p.y, p.width, p.height]);
    platformRects.value = rects;
  }, [platforms]);

  // Spawn chunks when totalScroll advances
  const lastSpawnRef = useRef(0);
  const spawnChunks = useCallback(() => {
    const scroll = totalScroll.value;
    if (scroll < lastSpawnRef.current) return;
    lastSpawnRef.current = scroll + 200;

    const gY = groundY.value;
    const currentChunks = chunksRef.current;
    const newChunks = generateLevelChunks(
      scroll,
      width,
      height,
      gY,
      tileSize,
      currentChunks
    );
    if (newChunks.length > currentChunks.length) {
      setChunks(newChunks);
    }
  }, [height, width]);

  const lastSpawnAt = useSharedValue(0);
  const lastScoreAt = useSharedValue(0);
  useAnimatedReaction(
    () => totalScroll.value,
    (scroll) => {
      if (scroll - lastSpawnAt.value >= 300) {
        lastSpawnAt.value = scroll;
        runOnJS(spawnChunks)();
      }
      if (scroll - lastScoreAt.value >= 50) {
        lastScoreAt.value = scroll;
        runOnJS(setScore)(Math.floor(scroll));
      }
    }
  );

  useFrameCallback((frameInfo) => {
    'worklet';
    if (gameOver.value === 1) return;

    if (initialized.value === 0) return;

    const gY = groundY.value;

    const dt = frameInfo.timeSincePreviousFrame ?? 16;
    const charH = CHAR_SIZE * CHAR_SCALE;
    const gDir = gravityDirection.value;

    totalScroll.value += RUN_SPEED * (dt / 1000);

    velocityY.value += gDir * GRAVITY * (dt / 1000);
    posY.value += velocityY.value * (dt / 1000);

    const charWorldX = totalScroll.value + charX.value;
    const rects = platformRects.value;
    const inFlatZone = charWorldX < FLAT_ZONE_LENGTH;

    // Flat zone: always use ground collision (original behavior - no death)
    if (inFlatZone) {
      if (gDir === 1 && posY.value + charH >= gY) {
        posY.value = gY - charH;
        velocityY.value = 0;
      }
    } else {
      // Easy+ zone: platform collision + death
      let lowestSurfaceY = gY;
      for (let i = 0; i < rects.length; i += 4) {
        const px = rects[i];
        const py = rects[i + 1];
        const pw = rects[i + 2];
        if (charWorldX >= px && charWorldX <= px + pw && py > lowestSurfaceY) {
          lowestSurfaceY = py;
        }
      }

      const deathThreshold = lowestSurfaceY + charH * DEATH_MARGIN_FRACTION;
      if (posY.value + charH > deathThreshold) {
        gameOver.value = 1;
        runOnJS(triggerGameOver)(Math.floor(totalScroll.value));
        return;
      }

      if (gDir === 1 && velocityY.value > 0) {
        let landed = false;
        for (let i = 0; i < rects.length; i += 4) {
          const px = rects[i];
          const py = rects[i + 1];
          const pw = rects[i + 2];
          if (charWorldX >= px && charWorldX <= px + pw && posY.value + charH >= py) {
            posY.value = py - charH;
            velocityY.value = 0;
            landed = true;
            break;
          }
        }
      }
    }

    // Top ground collision (falling up, gravity = -1)
    if (gDir === -1 && posY.value <= groundHeight) {
      posY.value = groundHeight;
      velocityY.value = 0;
    }

    // Flip arc: apply horizontal boost when in air, zero when grounded
    let onBottom = gDir === 1 && posY.value >= gY - charH - GROUNDED_EPSILON;
    if (gDir === 1 && !onBottom) {
      for (let i = 0; i < rects.length; i += 4) {
        const px = rects[i];
        const py = rects[i + 1];
        const pw = rects[i + 2];
        if (charWorldX >= px && charWorldX <= px + pw && posY.value >= py - charH - GROUNDED_EPSILON) {
          onBottom = true;
          break;
        }
      }
    }
    const onTop = gDir === -1 && posY.value <= groundHeight + GROUNDED_EPSILON;
    const grounded = onBottom || onTop;
    if (grounded) {
      velocityX.value = 0;
    } else if (velocityX.value > 0) {
      totalScroll.value += velocityX.value * (dt / 1000);
      velocityX.value *= FLIP_ARC_DECAY;
      if (velocityX.value < 1) velocityX.value = 0;
    }

    elapsedMs.value += dt;
    if (elapsedMs.value >= FRAME_INTERVAL_MS) {
      elapsedMs.value = 0;
      frameIndex.value = (frameIndex.value + 1) % 2;
    }
  });

  const tapGesture = useMemo(
    () =>
      Gesture.Tap().onEnd(() => {
        'worklet';
        if (gameOver.value === 1) return;

        const gY = groundY.value;
        const charH = CHAR_SIZE * CHAR_SCALE;
        const gDir = gravityDirection.value;
        const charWorldX = totalScroll.value + charX.value;

        // Only allow flip when grounded (on floor, platform, or ceiling)
        let onBottom = false;
        if (gDir === 1) {
          onBottom = posY.value >= gY - charH - GROUNDED_EPSILON;
          if (!onBottom) {
            const rects = platformRects.value;
            for (let i = 0; i < rects.length; i += 4) {
              const px = rects[i];
              const py = rects[i + 1];
              const pw = rects[i + 2];
              if (charWorldX >= px && charWorldX <= px + pw) {
                if (posY.value >= py - charH - GROUNDED_EPSILON) {
                  onBottom = true;
                  break;
                }
              }
            }
          }
        }
        const onTop = gDir === -1 && posY.value <= groundHeight + GROUNDED_EPSILON;

        if (onBottom || onTop) {
          gravityDirection.value = -gDir;
          velocityY.value = 0;
          velocityX.value = FLIP_ARC_FORWARD;
        }
      }),
    []
  );

  const characterTransforms = useRSXformBuffer(1, (val) => {
    'worklet';
    const gDir = gravityDirection.value;
    const cX = charX.value;
    if (gDir === -1) {
      val.set(-CHAR_SCALE, 0, cX + CHAR_SIZE * CHAR_SCALE, posY.value + CHAR_SIZE * CHAR_SCALE);
    } else {
      val.set(CHAR_SCALE, 0, cX, posY.value);
    }
  });
  const characterSprites = useDerivedValue(() => {
    const frame = Math.floor(frameIndex.value) % 2;
    return [rect(frame * CHAR_SIZE, 0, CHAR_SIZE, CHAR_SIZE)];
  });

  const topGroundPicture = useMemo(() => {
    if (!tilemapImage || width <= 0 || height <= 0) return null;
    // Wide strip + extra tile to avoid seam at wrap; use integer multiple of tileSize for clean repeat
    const groundWidth = Math.ceil((3 * width) / tileSize) * tileSize + tileSize;
    const cols = Math.ceil(groundWidth / tileSize) + 1;
    const paint = Skia.Paint();
    paint.setAntiAlias(false);
    const getSrcRect = (tileIndex: number) => {
      const col = tileIndex % TILEMAP_COLS;
      const row = Math.floor(tileIndex / TILEMAP_COLS);
      return Skia.XYWHRect(col * TILEMAP_SIZE, row * TILEMAP_SIZE, TILEMAP_SIZE, TILEMAP_SIZE);
    };
    // Terrain (16x16).png green set:
    // top row: r0 c6/c7/c8, fill row: r1 c6/c7/c8
    const GRASS = { left: 6, center: 7, right: 8 };
    const DIRT = { left: 28, center: 29, right: 30 };
    return createPicture(
      (canvas) => {
        // Flip vertically so grass faces downward (toward play area)
        canvas.save();
        canvas.translate(0, groundHeight);
        canvas.scale(1, -1);
        // Draw same layout as bottom ground: grass row 0, dirt row 1
        for (let row = 0; row < groundRows; row++) {
          const isSurface = row === 0;
          const tiles = isSurface ? GRASS : DIRT;
          for (let col = 0; col < cols; col++) {
            const tileIndex =
              col === 0 ? tiles.left : col === cols - 1 ? tiles.right : tiles.center;
            const srcRect = getSrcRect(tileIndex);
            const x = Math.floor(col * tileSize);
            const y = Math.floor(row * tileSize);
            const dst = Skia.XYWHRect(x, y, tileSize, tileSize);
            canvas.drawImageRect(tilemapImage, srcRect, dst, paint);
          }
        }
        canvas.restore();
      },
      Skia.XYWHRect(0, 0, groundWidth, groundHeight)
    );
  }, [tilemapImage, width, height]);

  const groundPictureWidth = useMemo(() => {
    const w = Math.ceil((3 * width) / tileSize) * tileSize + tileSize;
    return w;
  }, [width]);
  useEffect(() => {
    groundPictureWidthSv.value = groundPictureWidth;
  }, [groundPictureWidth]);
  const groundTransform = useDerivedValue(() => {
    'worklet';
    const w = groundPictureWidthSv.value || 1;
    const offset = totalScroll.value % w;
    return [{ translateX: -offset }];
  });

  const platformsPicture = useMemo(() => {
    if (!tilemapImage || width <= 0 || height <= 0 || platforms.length === 0) return null;
    const paint = Skia.Paint();
    paint.setAntiAlias(false);
    const getSrcRect = (tileIndex: number) => {
      const col = tileIndex % TILEMAP_COLS;
      const row = Math.floor(tileIndex / TILEMAP_COLS);
      return Skia.XYWHRect(col * TILEMAP_SIZE, row * TILEMAP_SIZE, TILEMAP_SIZE, TILEMAP_SIZE);
    };
    const GRASS = { left: 6, center: 7, right: 8 };
    const DIRT = { left: 28, center: 29, right: 30 };

    // When two platforms touch edge-to-edge, render center tiles at the shared seam
    // to avoid a dark "cap-to-cap" breaker line.
    const startEdges = new Set<string>();
    const endEdges = new Set<string>();
    for (const p of platforms) {
      const y = Math.round(p.y);
      const h = Math.round(p.height);
      startEdges.add(`${y}:${h}:${Math.round(p.x)}`);
      endEdges.add(`${y}:${h}:${Math.round(p.x + p.width)}`);
    }

    const margin = tileSize * 2;
    const maxX = Math.max(...platforms.map((p) => p.x + p.width), width * 3) + margin;
    return createPicture(
      (canvas) => {
        for (const p of platforms) {
          const y = Math.round(p.y);
          const h = Math.round(p.height);
          const hasLeftNeighbor = endEdges.has(`${y}:${h}:${Math.round(p.x)}`);
          const hasRightNeighbor = startEdges.has(`${y}:${h}:${Math.round(p.x + p.width)}`);
          const cols = Math.ceil(p.width / tileSize);
          const rows = Math.ceil(p.height / tileSize);
          for (let row = 0; row < rows; row++) {
            const isSurface = row === 0;
            const tiles = isSurface ? GRASS : DIRT;
            const leftTile = hasLeftNeighbor ? tiles.center : tiles.left;
            const rightTile = hasRightNeighbor ? tiles.center : tiles.right;
            for (let col = 0; col < cols; col++) {
              const tileIndex =
                col === 0 ? leftTile : col === cols - 1 ? rightTile : tiles.center;
              const srcRect = getSrcRect(tileIndex);
              const x = Math.floor(p.x + col * tileSize);
              const y = Math.floor(p.y + row * tileSize);
              const dst = Skia.XYWHRect(x, y, tileSize, tileSize);
              canvas.drawImageRect(tilemapImage, srcRect, dst, paint);
            }
          }
        }
      },
      Skia.XYWHRect(0, 0, maxX, height)
    );
  }, [tilemapImage, height, width, platforms]);

  const platformsTransform = useDerivedValue(() => {
    return [{ translateX: -totalScroll.value }];
  });

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => {
      ScreenOrientation.unlockAsync();
    };
  }, []);

  return (
    <View style={[styles.container, { width, height }]}>
      <View style={styles.scoreWrapper}>
        <Text style={styles.scoreText}>{score}m</Text>
      </View>
      <GestureDetector gesture={tapGesture}>
        <Canvas style={styles.canvas}>
          {topGroundPicture && (
            <Group transform={groundTransform}>
              <Picture picture={topGroundPicture} />
            </Group>
          )}
          {platformsPicture && (
            <Group transform={platformsTransform}>
              <Picture picture={platformsPicture} />
            </Group>
          )}
          {characterImage && (
            <Atlas
              image={characterImage}
              sprites={characterSprites}
              transforms={characterTransforms}
            />
          )}
        </Canvas>
      </GestureDetector>
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
  scoreText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2b2b2b',
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
});
