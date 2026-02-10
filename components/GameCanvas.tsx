import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  useAnimatedReaction,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
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
import type { Chunk } from '../types/game';
import { generateLevelChunks, preGenerateLevelChunks } from '../utils/levelGenerator';
import { GAME_BACKGROUNDS } from '../utils/backgrounds';
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
// Player must fully enter ditch before death-fall starts.
const DEATH_MARGIN_FRACTION = 1.0; // 1.0 = full character height below surface
const FLIP_ARC_FORWARD = 80; // horizontal boost (px) during flip arc
const FLIP_ARC_DECAY = 0.96; // per-frame decay of flip velocity
// Flip this to true when you want collider/probe debug visuals in the UI.
const ENABLE_COLLIDER_DEBUG_UI = true;
const COYOTE_TIME_MS = 140; // allow jump shortly after leaving an edge
const EDGE_CONTACT_MARGIN = 4; // shrink feet bounds to avoid 1px cling
const SUPPORT_MIN_OVERLAP = 6; // minimum overlap required to stay supported
const LANDING_MIN_OVERLAP = 2; // more forgiving overlap for snap-to-landing checks
const BACKGROUND_TILE_SCALE = 5;
const BACKGROUND_SCROLL_FACTOR = 0.2;

const tileSize = TILEMAP_SIZE * GROUND_SCALE;
const groundHeight = 2 * tileSize;

export const GameCanvas = ({ onExit, onGameOver, backgroundIndex = 0 }: GameCanvasProps) => {
  const { width, height } = useWindowDimensions();
  const totalBackgrounds = GAME_BACKGROUNDS.length;
  const safeBackgroundIndex =
    totalBackgrounds > 0
      ? ((backgroundIndex % totalBackgrounds) + totalBackgrounds) % totalBackgrounds
      : 0;
  const backgroundSource = GAME_BACKGROUNDS[safeBackgroundIndex];

  const backgroundImage = useImage(backgroundSource);
  const backgroundTileWidth = backgroundImage ? backgroundImage.width() * BACKGROUND_TILE_SCALE : 0;
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
  const dying = useSharedValue(0); // 0 = alive, 1 = death fall in progress
  const deathScore = useSharedValue(0);
  const velocityX = useSharedValue(0); // flip arc horizontal boost
  const totalScroll = useSharedValue(0); // cumulative world scroll (never wraps)
  const initialized = useSharedValue(0); // 0 = not yet, 1 = ready
  const charX = useSharedValue(0);
  const simTimeMs = useSharedValue(0);
  const lastGroundedAtMs = useSharedValue(0);

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
        scheduleOnRN(spawnChunks);
      }
      if (scroll - lastScoreAt.value >= 50) {
        lastScoreAt.value = scroll;
        scheduleOnRN(setScore, Math.floor(scroll));
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
    const charW = CHAR_SIZE * CHAR_SCALE;
    const gDir = gravityDirection.value;
    const isDying = dying.value === 1;
    const prevTop = posY.value;
    const prevBottom = prevTop + charH;
    simTimeMs.value += dt;

    if (dying.value === 0) {
      totalScroll.value += RUN_SPEED * (dt / 1000);
    }

    velocityY.value += gDir * GRAVITY * (dt / 1000);
    posY.value += velocityY.value * (dt / 1000);

    const charWorldX = totalScroll.value + charX.value;
    const rects = platformRects.value;
    const inFlatZone = charWorldX < FLAT_ZONE_LENGTH;
    const charTop = posY.value;
    const charBottom = posY.value + charH;
    const footLeft = charWorldX + EDGE_CONTACT_MARGIN;
    const footRight = charWorldX + charW - EDGE_CONTACT_MARGIN;

    let nearestDownSurface = Number.POSITIVE_INFINITY;
    let farthestDownSurface = Number.NEGATIVE_INFINITY;
    let nearestUpSurface = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < rects.length; i += 4) {
      const px = rects[i];
      const py = rects[i + 1];
      const pw = rects[i + 2];
      const ph = rects[i + 3];
      const overlap = Math.min(footRight, px + pw) - Math.max(footLeft, px);
      if (overlap < LANDING_MIN_OVERLAP) continue;

      // Ignore top lane surface for downward land/death checks.
      if (py >= groundHeight) {
        const crossedDown = prevBottom <= py + GROUNDED_EPSILON && charBottom >= py;
        const alreadyOnSurface = Math.abs(prevBottom - py) <= GROUNDED_EPSILON;
        if (py < nearestDownSurface && (crossedDown || alreadyOnSurface)) {
          nearestDownSurface = py;
        }
        if (py > farthestDownSurface) {
          farthestDownSurface = py;
        }
      }

      const bottomSurface = py + ph;
      const crossedUp = prevTop >= bottomSurface - GROUNDED_EPSILON && charTop <= bottomSurface;
      const alreadyOnCeiling = Math.abs(prevTop - bottomSurface) <= GROUNDED_EPSILON;
      if (
        bottomSurface > nearestUpSurface &&
        (crossedUp || alreadyOnCeiling)
      ) {
        nearestUpSurface = bottomSurface;
      }
    }

    if (!isDying) {
      if (gDir === 1 && velocityY.value > 0 && nearestDownSurface < Number.POSITIVE_INFINITY) {
        posY.value = nearestDownSurface - charH;
        velocityY.value = 0;
      }

      if (gDir === -1 && velocityY.value < 0 && nearestUpSurface > Number.NEGATIVE_INFINITY) {
        posY.value = nearestUpSurface;
        velocityY.value = 0;
      }

      if (gDir === 1 && inFlatZone && posY.value + charH >= gY) {
        posY.value = gY - charH;
        velocityY.value = 0;
      }
      if (gDir === -1 && inFlatZone && posY.value <= groundHeight) {
        posY.value = groundHeight;
        velocityY.value = 0;
      }

      // Flip arc: apply horizontal boost when in air, zero when grounded
      let onBottom = false;
      let onTop = false;
      if (gDir === 1) {
        onBottom = inFlatZone && Math.abs(posY.value - (gY - charH)) <= GROUNDED_EPSILON;
        if (!onBottom) {
          for (let i = 0; i < rects.length; i += 4) {
            const px = rects[i];
            const py = rects[i + 1];
            const pw = rects[i + 2];
            const overlap = Math.min(footRight, px + pw) - Math.max(footLeft, px);
            if (overlap >= SUPPORT_MIN_OVERLAP && py >= groundHeight) {
              if (Math.abs(posY.value - (py - charH)) <= GROUNDED_EPSILON) {
                onBottom = true;
                break;
              }
            }
          }
        }
      } else {
        onTop = inFlatZone && Math.abs(posY.value - groundHeight) <= GROUNDED_EPSILON;
        if (!onTop) {
          for (let i = 0; i < rects.length; i += 4) {
            const px = rects[i];
            const py = rects[i + 1];
            const pw = rects[i + 2];
            const ph = rects[i + 3];
            const overlap = Math.min(footRight, px + pw) - Math.max(footLeft, px);
            if (overlap >= SUPPORT_MIN_OVERLAP) {
              if (Math.abs(posY.value - (py + ph)) <= GROUNDED_EPSILON) {
                onTop = true;
                break;
              }
            }
          }
        }
      }

      const grounded = onBottom || onTop;
      if (grounded) {
        lastGroundedAtMs.value = simTimeMs.value;
        velocityX.value = 0;
      } else if (velocityX.value > 0) {
        totalScroll.value += velocityX.value * (dt / 1000);
        velocityX.value *= FLIP_ARC_DECAY;
        if (velocityX.value < 1) velocityX.value = 0;
      }

      if (!inFlatZone && !grounded) {
        if (gDir === 1) {
          const floorY = farthestDownSurface > Number.NEGATIVE_INFINITY ? farthestDownSurface : gY;
          const deathThreshold = floorY + charH * DEATH_MARGIN_FRACTION;
          if (posY.value + charH > deathThreshold) {
            dying.value = 1;
            deathScore.value = Math.floor(totalScroll.value);
            velocityX.value = 0;
          }
        } else if (posY.value < -charH * DEATH_MARGIN_FRACTION) {
          dying.value = 1;
          deathScore.value = Math.floor(totalScroll.value);
          velocityX.value = 0;
        }
      }
    } else {
      velocityX.value = 0;
    }

    if (dying.value === 1) {
      const offscreenDown = posY.value > height + charH;
      const offscreenUp = posY.value + charH < -charH;
      if ((gDir === 1 && offscreenDown) || (gDir === -1 && offscreenUp)) {
        gameOver.value = 1;
        scheduleOnRN(triggerGameOver, deathScore.value);
        return;
      }
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
        if (gameOver.value === 1 || dying.value === 1) return;

        const gY = groundY.value;
        const charH = CHAR_SIZE * CHAR_SCALE;
        const charW = CHAR_SIZE * CHAR_SCALE;
        const gDir = gravityDirection.value;
        const charWorldX = totalScroll.value + charX.value;
        const inFlatZone = charWorldX < FLAT_ZONE_LENGTH;
        const footLeft = charWorldX + EDGE_CONTACT_MARGIN;
        const footRight = charWorldX + charW - EDGE_CONTACT_MARGIN;
        const canUseCoyote = simTimeMs.value - lastGroundedAtMs.value <= COYOTE_TIME_MS;

        // Only allow flip when grounded (on floor, platform, or ceiling)
        let onBottom = false;
        if (gDir === 1) {
          onBottom = inFlatZone && Math.abs(posY.value - (gY - charH)) <= GROUNDED_EPSILON;
          if (!onBottom) {
            const rects = platformRects.value;
            for (let i = 0; i < rects.length; i += 4) {
              const px = rects[i];
              const py = rects[i + 1];
              const pw = rects[i + 2];
              const overlap = Math.min(footRight, px + pw) - Math.max(footLeft, px);
              if (overlap >= SUPPORT_MIN_OVERLAP && py >= groundHeight) {
                if (Math.abs(posY.value - (py - charH)) <= GROUNDED_EPSILON) {
                  onBottom = true;
                  break;
                }
              }
            }
          }
        }
        let onTop = false;
        if (gDir === -1) {
          onTop = inFlatZone && Math.abs(posY.value - groundHeight) <= GROUNDED_EPSILON;
          if (!onTop) {
            const rects = platformRects.value;
            for (let i = 0; i < rects.length; i += 4) {
              const px = rects[i];
              const py = rects[i + 1];
              const pw = rects[i + 2];
              const ph = rects[i + 3];
              const overlap = Math.min(footRight, px + pw) - Math.max(footLeft, px);
              if (overlap >= SUPPORT_MIN_OVERLAP) {
                if (Math.abs(posY.value - (py + ph)) <= GROUNDED_EPSILON) {
                  onTop = true;
                  break;
                }
              }
            }
          }
        }

        if (onBottom || onTop || canUseCoyote) {
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

  const backgroundPicture = useMemo(() => {
    if (!backgroundImage || width <= 0 || height <= 0) return null;

    const paint = Skia.Paint();
    paint.setAntiAlias(false);

    const sourceWidth = backgroundImage.width();
    const sourceHeight = backgroundImage.height();
    const tileWidth = sourceWidth * BACKGROUND_TILE_SCALE;
    const tileHeight = sourceHeight * BACKGROUND_TILE_SCALE;
    const srcRect = Skia.XYWHRect(0, 0, sourceWidth, sourceHeight);

    return createPicture(
      (canvas) => {
        for (let y = -tileHeight; y < height + tileHeight; y += tileHeight) {
          for (let x = -tileWidth; x < width + tileWidth; x += tileWidth) {
            const dstRect = Skia.XYWHRect(x, y, tileWidth, tileHeight);
            canvas.drawImageRect(backgroundImage, srcRect, dstRect, paint);
          }
        }
      },
      Skia.XYWHRect(-tileWidth, -tileHeight, width + tileWidth * 2, height + tileHeight * 2)
    );
  }, [backgroundImage, width, height]);
  const backgroundTransform = useDerivedValue(() => {
    if (backgroundTileWidth <= 0) return [{ translateX: 0 }];
    const offset = (totalScroll.value * BACKGROUND_SCROLL_FACTOR) % backgroundTileWidth;
    return [{ translateX: -offset }];
  }, [backgroundTileWidth]);

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
    const CENTER_PLATFORM_TOP = { left: 34, center: 35, right: 36 };
    const CENTER_PLATFORM_BOTTOM = { left: 34, center: 35, right: 36 };

    // When two platforms touch edge-to-edge, render center tiles at the shared seam
    // to avoid a dark "cap-to-cap" breaker line.
    const startEdges = new Set<string>();
    const endEdges = new Set<string>();
    for (const p of platforms) {
      const y = Math.round(p.y);
      const h = Math.round(p.height);
      startEdges.add(`${p.surface}:${y}:${h}:${Math.round(p.x)}`);
      endEdges.add(`${p.surface}:${y}:${h}:${Math.round(p.x + p.width)}`);
    }

    const margin = tileSize * 2;
    const maxX = Math.max(...platforms.map((p) => p.x + p.width), width * 3) + margin;
    return createPicture(
      (canvas) => {
        for (const p of platforms) {
          const y = Math.round(p.y);
          const h = Math.round(p.height);
          const hasLeftNeighbor = endEdges.has(`${p.surface}:${y}:${h}:${Math.round(p.x)}`);
          const hasRightNeighbor = startEdges.has(`${p.surface}:${y}:${h}:${Math.round(p.x + p.width)}`);
          const cols = Math.ceil(p.width / tileSize);
          const rows = Math.ceil(p.height / tileSize);
          for (let row = 0; row < rows; row++) {
            const isSurface = p.surface === 'top' ? row === rows - 1 : row === 0;
            const tiles =
              p.surface === 'pillar'
                ? row === 0
                  ? CENTER_PLATFORM_TOP
                  : CENTER_PLATFORM_BOTTOM
                : isSurface
                  ? GRASS
                  : DIRT;
            const leftTile = hasLeftNeighbor ? tiles.center : tiles.left;
            const rightTile = hasRightNeighbor ? tiles.center : tiles.right;
            for (let col = 0; col < cols; col++) {
              const remainingWidth = p.width - col * tileSize;
              const drawWidth = Math.min(tileSize, remainingWidth);
              if (drawWidth <= 0) continue;
              const tileIndex =
                col === 0 ? leftTile : col === cols - 1 ? rightTile : tiles.center;
              const srcRect = getSrcRect(tileIndex);
              const srcWidth = (drawWidth / tileSize) * TILEMAP_SIZE;
              const clippedSrcRect = Skia.XYWHRect(srcRect.x, srcRect.y, srcWidth, srcRect.height);
              const x = Math.floor(p.x + col * tileSize);
              const y = Math.floor(p.y + row * tileSize);
              const dst = Skia.XYWHRect(x, y, drawWidth, tileSize);
              canvas.drawImageRect(tilemapImage, clippedSrcRect, dst, paint);
            }
          }
        }
      },
      Skia.XYWHRect(0, 0, maxX, height)
    );
  }, [tilemapImage, height, width, platforms]);

  const colliderDebugPicture = useMemo(() => {
    if (!ENABLE_COLLIDER_DEBUG_UI || width <= 0 || height <= 0 || platforms.length === 0)
      return null;
    const stroke = Skia.Paint();
    stroke.setStyle(1);
    stroke.setStrokeWidth(2);
    stroke.setColor(Skia.Color('#00e5ff'));
    stroke.setAntiAlias(false);

    const topStroke = Skia.Paint();
    topStroke.setStyle(1);
    topStroke.setStrokeWidth(2);
    topStroke.setColor(Skia.Color('#ff4d4f'));
    topStroke.setAntiAlias(false);

    const maxX = Math.max(...platforms.map((p) => p.x + p.width), width * 3) + tileSize * 2;
    return createPicture(
      (canvas) => {
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
              const r = Skia.XYWHRect(
                p.x + col * tileSize,
                p.y + row * tileSize,
                drawWidth,
                drawHeight
              );
              canvas.drawRect(r, p.surface === 'top' ? topStroke : stroke);
            }
          }
        }
      },
      Skia.XYWHRect(0, 0, maxX, height)
    );
  }, [height, width, platforms]);

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
        </Canvas>
      </GestureDetector>
      {ENABLE_COLLIDER_DEBUG_UI && (
        <>
          <View pointerEvents="none" style={[styles.debugHud, { top: 8 }]}>
            <Text style={styles.debugHudText}>BOX COLLIDERS ON</Text>
          </View>
        </>
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
