import { useMemo } from 'react';
import { Skia, createPicture, rect, useImage, useRSXformBuffer } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import type { Platform, TerrainTheme } from '../../types/game';
import { GAME_BACKGROUNDS } from '../../utils/backgrounds';
import {
  BACKGROUND_SCROLL_FACTOR,
  CHAR_SCALE,
  CHAR_SIZE,
  ENABLE_COLLIDER_DEBUG_UI,
  OPPONENT_X_FACTOR,
  PLAYER_X_FACTOR,
  tileSize,
} from './constants';
import type { SimulationRefs } from './types';

const TERRAIN_TILE_ASSETS: Record<
  TerrainTheme,
  {
    top: number;
    topLeft: number;
    topRight: number;
    left: number;
    center: number;
    right: number;
  }
> = {
  grass: {
    top: require('../../assets/game/terrain/default/terrain_grass_block_top.png'),
    topLeft: require('../../assets/game/terrain/default/terrain_grass_block_top_left.png'),
    topRight: require('../../assets/game/terrain/default/terrain_grass_block_top_right.png'),
    left: require('../../assets/game/terrain/default/terrain_grass_block_left.png'),
    center: require('../../assets/game/terrain/default/terrain_grass_block_center.png'),
    right: require('../../assets/game/terrain/default/terrain_grass_block_right.png'),
  },
  purple: {
    top: require('../../assets/game/terrain/default/terrain_purple_block_top.png'),
    topLeft: require('../../assets/game/terrain/default/terrain_purple_block_top_left.png'),
    topRight: require('../../assets/game/terrain/default/terrain_purple_block_top_right.png'),
    left: require('../../assets/game/terrain/default/terrain_purple_block_left.png'),
    center: require('../../assets/game/terrain/default/terrain_purple_block_center.png'),
    right: require('../../assets/game/terrain/default/terrain_purple_block_right.png'),
  },
  stone: {
    top: require('../../assets/game/terrain/default/terrain_stone_block_top.png'),
    topLeft: require('../../assets/game/terrain/default/terrain_stone_block_top_left.png'),
    topRight: require('../../assets/game/terrain/default/terrain_stone_block_top_right.png'),
    left: require('../../assets/game/terrain/default/terrain_stone_block_left.png'),
    center: require('../../assets/game/terrain/default/terrain_stone_block_center.png'),
    right: require('../../assets/game/terrain/default/terrain_stone_block_right.png'),
  },
};

interface UseWorldPicturesArgs {
  width: number;
  height: number;
  backgroundIndex: number;
  terrainTheme: TerrainTheme;
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
  terrainTheme,
  platforms,
  refs,
}: UseWorldPicturesArgs) => {
  const totalBackgrounds = GAME_BACKGROUNDS.length;
  const safeBackgroundIndex =
    totalBackgrounds > 0
      ? ((backgroundIndex % totalBackgrounds) + totalBackgrounds) % totalBackgrounds
      : 0;
  const backgroundSource = GAME_BACKGROUNDS[safeBackgroundIndex];
  const terrainAssets = TERRAIN_TILE_ASSETS[terrainTheme];

  const backgroundImage = useImage(backgroundSource);
  const backgroundTileWidth = useMemo(() => {
    if (!backgroundImage || height <= 0) return 0;
    const sourceHeight = backgroundImage.height();
    if (sourceHeight <= 0) return 0;
    const fitScale = height / sourceHeight;
    return backgroundImage.width() * fitScale;
  }, [backgroundImage, height]);
  const terrainTopImage = useImage(terrainAssets.top);
  const terrainTopLeftImage = useImage(terrainAssets.topLeft);
  const terrainTopRightImage = useImage(terrainAssets.topRight);
  const terrainLeftImage = useImage(terrainAssets.left);
  const terrainCenterImage = useImage(terrainAssets.center);
  const terrainRightImage = useImage(terrainAssets.right);
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
    const fitScale = height / sourceHeight;
    const tileWidth = sourceWidth * fitScale;
    const tileHeight = sourceHeight * fitScale;
    const srcRect = Skia.XYWHRect(0, 0, sourceWidth, sourceHeight);

    return createPicture(
      (canvas) => {
        for (let x = -tileWidth; x < width + tileWidth; x += tileWidth) {
          const dstRect = Skia.XYWHRect(x, 0, tileWidth, tileHeight);
          canvas.drawImageRect(backgroundImage, srcRect, dstRect, paint);
        }
      },
      Skia.XYWHRect(-tileWidth, 0, width + tileWidth * 2, height)
    );
  }, [backgroundImage, width, height]);

  const backgroundTransform = useDerivedValue(() => {
    if (backgroundTileWidth <= 0) return [{ translateX: 0 }];
    const offset = (refs.totalScroll.value * BACKGROUND_SCROLL_FACTOR) % backgroundTileWidth;
    return [{ translateX: -offset }];
  }, [backgroundTileWidth]);

  const platformsPicture = useMemo(() => {
    if (
      !terrainTopImage ||
      !terrainTopLeftImage ||
      !terrainTopRightImage ||
      !terrainLeftImage ||
      !terrainCenterImage ||
      !terrainRightImage ||
      width <= 0 ||
      height <= 0 ||
      platforms.length === 0
    )
      return null;
    const paint = Skia.Paint();
    paint.setAntiAlias(false);

    const topSrcRect = Skia.XYWHRect(0, 0, terrainTopImage.width(), terrainTopImage.height());
    const topLeftSrcRect = Skia.XYWHRect(
      0,
      0,
      terrainTopLeftImage.width(),
      terrainTopLeftImage.height()
    );
    const topRightSrcRect = Skia.XYWHRect(
      0,
      0,
      terrainTopRightImage.width(),
      terrainTopRightImage.height()
    );
    const leftSrcRect = Skia.XYWHRect(0, 0, terrainLeftImage.width(), terrainLeftImage.height());
    const centerSrcRect = Skia.XYWHRect(
      0,
      0,
      terrainCenterImage.width(),
      terrainCenterImage.height()
    );
    const rightSrcRect = Skia.XYWHRect(
      0,
      0,
      terrainRightImage.width(),
      terrainRightImage.height()
    );
    const margin = tileSize * 2;
    const maxX = Math.max(...platforms.map((p) => p.x + p.width), width * 3) + margin;
    return createPicture(
      (canvas) => {
        for (const p of platforms) {
          const y = Math.round(p.y);
          const cols = Math.ceil(p.width / tileSize);
          const rows = Math.ceil(p.height / tileSize);
          for (let row = 0; row < rows; row++) {
            const isSurface = p.surface === 'top' ? row === rows - 1 : row === 0;
            for (let col = 0; col < cols; col++) {
              const remainingWidth = p.width - col * tileSize;
              const drawWidth = Math.min(tileSize, remainingWidth);
              if (drawWidth <= 0) continue;

              const isOnlyCol = cols === 1;
              const isLeftEdge = col === 0;
              const isRightEdge = col === cols - 1;

              let sourceImage = terrainCenterImage;
              let srcRect = centerSrcRect;

              if (isSurface || (p.surface === 'pillar' && row === 0)) {
                if (isOnlyCol) {
                  sourceImage = terrainTopImage;
                  srcRect = topSrcRect;
                } else if (isLeftEdge) {
                  sourceImage = terrainTopLeftImage;
                  srcRect = topLeftSrcRect;
                } else if (isRightEdge) {
                  sourceImage = terrainTopRightImage;
                  srcRect = topRightSrcRect;
                } else {
                  sourceImage = terrainTopImage;
                  srcRect = topSrcRect;
                }
              } else if (!isOnlyCol) {
                if (isLeftEdge) {
                  sourceImage = terrainLeftImage;
                  srcRect = leftSrcRect;
                } else if (isRightEdge) {
                  sourceImage = terrainRightImage;
                  srcRect = rightSrcRect;
                }
              }

              const srcWidth = (drawWidth / tileSize) * srcRect.width;
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
                  sourceImage,
                  clippedSrcRect,
                  Skia.XYWHRect(0, 0, drawWidth, tileSize),
                  paint
                );
                canvas.restore();
              } else {
                canvas.drawImageRect(sourceImage, clippedSrcRect, dst, paint);
              }
            }
          }
        }
      },
      Skia.XYWHRect(0, 0, maxX, height)
    );
  }, [
    terrainCenterImage,
    terrainLeftImage,
    terrainRightImage,
    terrainTopImage,
    terrainTopLeftImage,
    terrainTopRightImage,
    height,
    width,
    platforms,
  ]);

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
