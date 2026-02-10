import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import {
  Atlas,
  Canvas,
  Fill,
  Group,
  Picture,
  Skia,
  createPicture,
  rect,
  useImage,
  useRSXformBuffer,
} from '@shopify/react-native-skia';

type GameCanvasProps = {
  onExit?: () => void;
  backgroundIndex?: number;
};

const TILE_WIDTH = 64;
const TILE_HEIGHT = 72;
const TILE_COUNT = 3;
const BACKGROUND_PARALLAX = 0.5; // background scrolls slower than ground
const TILEMAP_SIZE = 18;
const TILEMAP_COLS = 20;
const GROUND_SCALE = 2;

// Physics
const GRAVITY = 2400;
const RUN_SPEED = 280;
const CHAR_SCALE = 1.5;
const CHAR_SIZE = 24;
const FRAME_INTERVAL_MS = 100;
const GROUNDED_EPSILON = 4;

const tileSize = TILEMAP_SIZE * GROUND_SCALE;
const groundRows = 2;
const groundHeight = groundRows * tileSize;

export const GameCanvas = ({ onExit, backgroundIndex = 1 }: GameCanvasProps) => {
  const { width, height } = useWindowDimensions();

  const backgroundImage = useImage(require('../assets/game/backgrounds_tilesheet.png'));
  const tilemapImage = useImage(require('../assets/game/tilemap_packed.png'));
  const characterImage = useImage(
    require('../assets/platform assets/Tilemap/tilemap-characters_packed.png')
  );

  const groundY = useSharedValue(0);
  const posY = useSharedValue(0);
  const velocityY = useSharedValue(0);
  const gravityDirection = useSharedValue(1); // 1 = down, -1 = up
  const scrollOffset = useSharedValue(0);
  const frameIndex = useSharedValue(0);
  const elapsedMs = useSharedValue(0);

  useEffect(() => {
    if (height > 0) {
      groundY.value = height - groundHeight;
      posY.value = height - groundHeight - CHAR_SIZE * CHAR_SCALE;
    }
  }, [height]);

  useFrameCallback((frameInfo) => {
    'worklet';
    const dt = frameInfo.timeSincePreviousFrame ?? 16;
    const gY = groundY.value;
    const charH = CHAR_SIZE * CHAR_SCALE;
    const gDir = gravityDirection.value;

    scrollOffset.value += RUN_SPEED * (dt / 1000);
    if (scrollOffset.value >= width) {
      scrollOffset.value -= width;
    }

    velocityY.value += gDir * GRAVITY * (dt / 1000);
    posY.value += velocityY.value * (dt / 1000);

    // Bottom ground collision (falling down, gravity = 1)
    if (gDir === 1 && posY.value + charH >= gY) {
      posY.value = gY - charH;
      velocityY.value = 0;
    }

    // Top ground collision (falling up, gravity = -1)
    if (gDir === -1 && posY.value <= groundHeight) {
      posY.value = groundHeight;
      velocityY.value = 0;
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
        const gY = groundY.value;
        const charH = CHAR_SIZE * CHAR_SCALE;
        const gDir = gravityDirection.value;

        // Only allow flip when grounded
        const onBottom = gDir === 1 && posY.value >= gY - charH - GROUNDED_EPSILON;
        const onTop = gDir === -1 && posY.value <= groundHeight + GROUNDED_EPSILON;

        if (onBottom || onTop) {
          // Flip gravity direction - character falls to the other ground
          gravityDirection.value = -gDir;
          velocityY.value = 0;
        }
      }),
    []
  );

  const charX = width * 0.25;
  const characterTransforms = useRSXformBuffer(1, (val) => {
    'worklet';
    const gDir = gravityDirection.value;
    if (gDir === -1) {
      // On ceiling: flip character vertically (negative scale, offset to keep in place)
      val.set(-CHAR_SCALE, 0, charX + CHAR_SIZE * CHAR_SCALE, posY.value + CHAR_SIZE * CHAR_SCALE);
    } else {
      val.set(CHAR_SCALE, 0, charX, posY.value);
    }
  });
  const characterSprites = useDerivedValue(() => {
    const frame = Math.floor(frameIndex.value) % 2;
    return [rect(frame * CHAR_SIZE, 0, CHAR_SIZE, CHAR_SIZE)];
  });

  const backgroundPicture = useMemo(() => {
    if (!backgroundImage || width <= 0 || height <= 0) return null;
    const bgPanelWidth = TILE_WIDTH * TILE_COUNT; // 192px
    const cols = Math.ceil((2 * width) / bgPanelWidth) + 1;
    const paint = Skia.Paint();
    return createPicture((canvas) => {
      for (let col = 0; col < cols; col++) {
        const panelIndex = col % TILE_COUNT;
        const srcRect = Skia.XYWHRect(
          panelIndex * TILE_WIDTH,
          0,
          TILE_WIDTH,
          TILE_HEIGHT
        );
        const dstRect = Skia.XYWHRect(col * bgPanelWidth, 0, bgPanelWidth, height);
        canvas.drawImageRect(backgroundImage, srcRect, dstRect, paint);
      }
    }, Skia.XYWHRect(0, 0, cols * bgPanelWidth, height));
  }, [backgroundImage, height, width]);

  const groundPicture = useMemo(() => {
    if (!tilemapImage || width <= 0 || height <= 0) return null;
    const groundWidth = 2 * width;
    const cols = Math.ceil(groundWidth / tileSize) + 1;
    const groundYVal = Math.floor(height - groundHeight);
    const paint = Skia.Paint();
    paint.setAntiAlias(false);
    const getSrcRect = (tileIndex: number) => {
      const col = tileIndex % TILEMAP_COLS;
      const row = Math.floor(tileIndex / TILEMAP_COLS);
      return Skia.XYWHRect(col * TILEMAP_SIZE, row * TILEMAP_SIZE, TILEMAP_SIZE, TILEMAP_SIZE);
    };
    const GRASS = { left: 23, center: 22, right: 21 };
    const DIRT = { left: 123, center: 122, right: 121 };
    return createPicture((canvas) => {
      for (let row = 0; row < groundRows; row++) {
        const isSurface = row === 0;
        const tiles = isSurface ? GRASS : DIRT;
        for (let col = 0; col < cols; col++) {
          const tileIndex = col === 0 ? tiles.left : col === cols - 1 ? tiles.right : tiles.center;
          const srcRect = getSrcRect(tileIndex);
          const x = Math.floor(col * tileSize);
          const y = Math.floor(groundYVal + row * tileSize);
          const dst = Skia.XYWHRect(x, y, tileSize, tileSize);
          canvas.drawImageRect(tilemapImage, srcRect, dst, paint);
        }
      }
    }, Skia.XYWHRect(0, 0, groundWidth, height));
  }, [tilemapImage, height, width]);

  const topGroundPicture = useMemo(() => {
    if (!tilemapImage || width <= 0 || height <= 0) return null;
    const groundWidth = 2 * width;
    const cols = Math.ceil(groundWidth / tileSize) + 1;
    const paint = Skia.Paint();
    paint.setAntiAlias(false);
    const getSrcRect = (tileIndex: number) => {
      const col = tileIndex % TILEMAP_COLS;
      const row = Math.floor(tileIndex / TILEMAP_COLS);
      return Skia.XYWHRect(col * TILEMAP_SIZE, row * TILEMAP_SIZE, TILEMAP_SIZE, TILEMAP_SIZE);
    };
    const GRASS = { left: 23, center: 22, right: 21 };
    const DIRT = { left: 123, center: 122, right: 121 };
    return createPicture((canvas) => {
      // Flip vertically so grass faces downward (toward play area)
      canvas.save();
      canvas.translate(0, groundHeight);
      canvas.scale(1, -1);
      // Draw same layout as bottom ground: grass row 0, dirt row 1
      for (let row = 0; row < groundRows; row++) {
        const isSurface = row === 0;
        const tiles = isSurface ? GRASS : DIRT;
        for (let col = 0; col < cols; col++) {
          const tileIndex = col === 0 ? tiles.left : col === cols - 1 ? tiles.right : tiles.center;
          const srcRect = getSrcRect(tileIndex);
          const x = Math.floor(col * tileSize);
          const y = Math.floor(row * tileSize);
          const dst = Skia.XYWHRect(x, y, tileSize, tileSize);
          canvas.drawImageRect(tilemapImage, srcRect, dst, paint);
        }
      }
      canvas.restore();
    }, Skia.XYWHRect(0, 0, groundWidth, groundHeight));
  }, [tilemapImage, width, height]);

  const groundTransform = useDerivedValue(() => {
    return [{ translateX: -scrollOffset.value }];
  });

  const bgPanelWidth = TILE_WIDTH * TILE_COUNT;
  const backgroundTransform = useDerivedValue(() => {
    const parallaxOffset = scrollOffset.value * BACKGROUND_PARALLAX;
    const loopOffset = parallaxOffset % bgPanelWidth;
    return [{ translateX: -loopOffset }];
  });

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => {
      ScreenOrientation.unlockAsync();
    };
  }, []);

  return (
    <View style={[styles.container, { width, height }]}>
      <GestureDetector gesture={tapGesture}>
        <Canvas style={styles.canvas}>
          {backgroundPicture ? (
            <Group transform={backgroundTransform}>
              <Picture picture={backgroundPicture} />
            </Group>
          ) : (
            <Fill color="#add8e6" />
          )}
          {topGroundPicture && (
            <Group transform={groundTransform}>
              <Picture picture={topGroundPicture} />
            </Group>
          )}
          {groundPicture && (
            <Group transform={groundTransform}>
              <Picture picture={groundPicture} />
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
