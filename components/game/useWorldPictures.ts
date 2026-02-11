import { useMemo } from 'react';
import { Skia, createPicture, rect, useImage, useRSXformBuffer } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import type { Platform } from '../../types/game';
import { GAME_BACKGROUNDS } from '../../utils/backgrounds';
import {
  BACKGROUND_SCROLL_FACTOR,
  BACKGROUND_TILE_SCALE,
  CHAR_SCALE,
  CHAR_SIZE,
  ENABLE_COLLIDER_DEBUG_UI,
  OPPONENT_X_FACTOR,
  PLAYER_X_FACTOR,
  TILEMAP_COLS,
  TILEMAP_SIZE,
  tileSize,
} from './constants';
import type { SimulationRefs } from './types';

interface UseWorldPicturesArgs {
  width: number;
  height: number;
  backgroundIndex: number;
  platforms: Platform[];
  refs: Pick<
    SimulationRefs,
    | 'totalScroll'
    | 'frameIndex'
    | 'charX'
    | 'posY'
    | 'gravityDirection'
    | 'opponentPosY'
    | 'opponentGravity'
    | 'opponentAlive'
  >;
}

export const useWorldPictures = ({
  width,
  height,
  backgroundIndex,
  platforms,
  refs,
}: UseWorldPicturesArgs) => {
  const totalBackgrounds = GAME_BACKGROUNDS.length;
  const safeBackgroundIndex =
    totalBackgrounds > 0
      ? ((backgroundIndex % totalBackgrounds) + totalBackgrounds) % totalBackgrounds
      : 0;
  const backgroundSource = GAME_BACKGROUNDS[safeBackgroundIndex];

  const backgroundImage = useImage(backgroundSource);
  const backgroundTileWidth = backgroundImage ? backgroundImage.width() * BACKGROUND_TILE_SCALE : 0;
  const tilemapImage = useImage(require('../../assets/game/terrain.png'));
  const characterImage = useImage(
    require('../../assets/platform assets/Tilemap/tilemap-characters_packed.png')
  );

  const characterTransforms = useRSXformBuffer(1, (val) => {
    'worklet';
    const gDir = refs.gravityDirection.value;
    const cX = refs.charX.value;
    if (gDir === -1) {
      val.set(
        -CHAR_SCALE,
        0,
        cX + CHAR_SIZE * CHAR_SCALE,
        refs.posY.value + CHAR_SIZE * CHAR_SCALE
      );
    } else {
      val.set(CHAR_SCALE, 0, cX, refs.posY.value);
    }
  });

  const opponentTransforms = useRSXformBuffer(1, (val) => {
    'worklet';
    const ox = width * OPPONENT_X_FACTOR;
    const gDir = refs.opponentGravity.value;
    if (gDir === -1) {
      val.set(
        -CHAR_SCALE,
        0,
        ox + CHAR_SIZE * CHAR_SCALE,
        refs.opponentPosY.value + CHAR_SIZE * CHAR_SCALE
      );
    } else {
      val.set(CHAR_SCALE, 0, ox, refs.opponentPosY.value);
    }
  });

  const characterSprites = useDerivedValue(() => {
    const frame = Math.floor(refs.frameIndex.value) % 2;
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
    const offset = (refs.totalScroll.value * BACKGROUND_SCROLL_FACTOR) % backgroundTileWidth;
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
          const hasRightNeighbor = startEdges.has(
            `${p.surface}:${y}:${h}:${Math.round(p.x + p.width)}`
          );
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
              const tileIndex = col === 0 ? leftTile : col === cols - 1 ? rightTile : tiles.center;
              const srcRect = getSrcRect(tileIndex);
              const srcWidth = (drawWidth / tileSize) * TILEMAP_SIZE;
              const clippedSrcRect = Skia.XYWHRect(srcRect.x, srcRect.y, srcWidth, srcRect.height);
              const x = Math.floor(p.x + col * tileSize);
              const y = Math.floor(p.y + row * tileSize);
              const dst = Skia.XYWHRect(x, y, drawWidth, tileSize);
              if (p.surface === 'top') {
                // Ceiling lane should mirror floor orientation.
                canvas.save();
                canvas.translate(x, y + tileSize);
                canvas.scale(1, -1);
                canvas.drawImageRect(
                  tilemapImage,
                  clippedSrcRect,
                  Skia.XYWHRect(0, 0, drawWidth, tileSize),
                  paint
                );
                canvas.restore();
              } else {
                canvas.drawImageRect(tilemapImage, clippedSrcRect, dst, paint);
              }
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
    return [{ translateX: -refs.totalScroll.value }];
  });

  const opponentVisible = useDerivedValue(() => refs.opponentAlive.value === 1);

  return {
    characterImage,
    characterTransforms,
    opponentTransforms,
    characterSprites,
    backgroundPicture,
    backgroundTransform,
    platformsPicture,
    colliderDebugPicture,
    platformsTransform,
    opponentVisible,
    playerX: width * PLAYER_X_FACTOR,
  };
};
