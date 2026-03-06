import { useMemo } from 'react';
import { Skia, createPicture, rect, useImage, useRSXformBuffer } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import type { Platform, TerrainTheme } from '../../types/game';
import { isSurfaceEdgeGap } from '../../shared/game/terrainAutotile';
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
import { ACTIVE_CHARACTER_PRESET, type SpriteFrame } from './characterSpritePresets';
import type { SimulationRefs } from './types';

type SrcClipAnchor = 'start' | 'end';
const CHARACTER_RENDER_SCALE_MULTIPLIER = ACTIVE_CHARACTER_PRESET.renderScaleMultiplier;
const CHARACTER_FEET_TRIM_PX = ACTIVE_CHARACTER_PRESET.feetTrimPx;

const IDLE_FRAMES = ACTIVE_CHARACTER_PRESET.actions.idle;
const RUN_FRAMES = ACTIVE_CHARACTER_PRESET.actions.run;
const JUMP_FRAMES = ACTIVE_CHARACTER_PRESET.actions.jump;
const FALL_FRAMES = ACTIVE_CHARACTER_PRESET.actions.fall;
const IDLE_SLOWDOWN = ACTIVE_CHARACTER_PRESET.frameSlowdowns.idle;
const JUMP_SLOWDOWN = ACTIVE_CHARACTER_PRESET.frameSlowdowns.jump;
const FALL_SLOWDOWN = ACTIVE_CHARACTER_PRESET.frameSlowdowns.fall;
const AIRBORNE_VEL_THRESHOLD = 10;
const JUMP_SCALE_BOOST = 1.3;

const resolveCharacterFrame = (
  countdownLocked: number,
  flipLocked: number,
  velocityY: number,
  frameIndex: number
): SpriteFrame => {
  'worklet';
  if (countdownLocked === 1) {
    return IDLE_FRAMES[Math.floor(frameIndex / IDLE_SLOWDOWN) % IDLE_FRAMES.length];
  }
  if (flipLocked === 1) {
    return JUMP_FRAMES[Math.floor(frameIndex / JUMP_SLOWDOWN) % JUMP_FRAMES.length];
  }
  if (Math.abs(velocityY) > AIRBORNE_VEL_THRESHOLD) {
    return FALL_FRAMES[Math.floor(frameIndex / FALL_SLOWDOWN) % FALL_FRAMES.length];
  }
  return RUN_FRAMES[frameIndex % RUN_FRAMES.length];
};

const isAirborne = (flipLocked: number, velocityY: number): boolean => {
  'worklet';
  return flipLocked === 1 || Math.abs(velocityY) > AIRBORNE_VEL_THRESHOLD;
};

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
    | 'countdownLocked'
    | 'flipLockedUntilLanding'
    | 'velocityY'
    | 'charX'
    | 'posY'
    | 'gravityDirection'
    | 'opponentPosY'
    | 'opponentGravity'
    | 'opponentAlive'
    | 'opponentFrameIndex'
    | 'opponentVelocityY'
    | 'opponentFlipLocked'
    | 'opponentCountdownLocked'
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
  const middlePlatformLeftImage = useImage(
    require('../../assets/platform assets/Tiles/tile_0048.png')
  );
  const middlePlatformCenterImage = useImage(
    require('../../assets/platform assets/Tiles/tile_0049.png')
  );
  const middlePlatformRightImage = useImage(
    require('../../assets/platform assets/Tiles/tile_0050.png')
  );
  const characterImage = useImage(ACTIVE_CHARACTER_PRESET.imageSource);

  const characterTransforms = useRSXformBuffer(1, (val) => {
    'worklet';
    const frame = resolveCharacterFrame(
      refs.countdownLocked.value,
      refs.flipLockedUntilLanding.value,
      refs.velocityY.value,
      refs.frameIndex.value
    );
    const airborne = isAirborne(refs.flipLockedUntilLanding.value, refs.velocityY.value);
    const hitboxSize = CHAR_SIZE * CHAR_SCALE;
    const scaleBoost = airborne ? JUMP_SCALE_BOOST : 1;
    const targetRenderHeight = hitboxSize * CHARACTER_RENDER_SCALE_MULTIPLIER * scaleBoost;
    const scale = targetRenderHeight / frame.height;
    const feetTrim = CHARACTER_FEET_TRIM_PX * scale;
    const renderWidth = frame.width * scale;
    const renderHeight = frame.height * scale;
    const baseX = refs.charX.value + (hitboxSize - renderWidth) / 2;
    const gDir = refs.gravityDirection.value;
    const baseY =
      gDir === -1
        ? refs.posY.value - feetTrim
        : refs.posY.value + (hitboxSize - renderHeight) + feetTrim;
    val.set(scale, 0, baseX, baseY);
  });

  const opponentTransforms = useRSXformBuffer(1, (val) => {
    'worklet';
    if (refs.opponentAlive.value !== 1) {
      val.set(1, 0, -10_000, -10_000);
      return;
    }
    const frame = resolveCharacterFrame(
      refs.opponentCountdownLocked.value,
      refs.opponentFlipLocked.value,
      refs.opponentVelocityY.value,
      refs.opponentFrameIndex.value
    );
    const hitboxSize = CHAR_SIZE * CHAR_SCALE;
    const targetRenderHeight = hitboxSize * CHARACTER_RENDER_SCALE_MULTIPLIER;
    const scale = targetRenderHeight / frame.height;
    const feetTrim = CHARACTER_FEET_TRIM_PX * scale;
    const renderWidth = frame.width * scale;
    const renderHeight = frame.height * scale;
    const ox = width * OPPONENT_X_FACTOR;
    const baseX = ox + (hitboxSize - renderWidth) / 2;
    const gDir = refs.opponentGravity.value;
    const baseY =
      gDir === -1
        ? refs.opponentPosY.value - feetTrim
        : refs.opponentPosY.value + (hitboxSize - renderHeight) + feetTrim;
    val.set(scale, 0, baseX, baseY);
  });

  const characterRenderTransform = useDerivedValue(() => {
    const gDir = refs.gravityDirection.value;
    if (gDir !== -1) return [{ translateY: 0 }];

    const frame = resolveCharacterFrame(
      refs.countdownLocked.value,
      refs.flipLockedUntilLanding.value,
      refs.velocityY.value,
      refs.frameIndex.value
    );
    const airborne = isAirborne(refs.flipLockedUntilLanding.value, refs.velocityY.value);
    const hitboxSize = CHAR_SIZE * CHAR_SCALE;
    const scaleBoost = airborne ? JUMP_SCALE_BOOST : 1;
    const targetRenderHeight = hitboxSize * CHARACTER_RENDER_SCALE_MULTIPLIER * scaleBoost;
    const scale = targetRenderHeight / frame.height;
    const feetTrim = CHARACTER_FEET_TRIM_PX * scale;
    const renderHeight = frame.height * scale;
    const baseY = refs.posY.value - feetTrim;
    const pivotY = baseY + renderHeight / 2;

    return [{ translateY: pivotY }, { scaleY: -1 }, { translateY: -pivotY }];
  });

  const opponentRenderTransform = useDerivedValue(() => {
    const gDir = refs.opponentGravity.value;
    if (gDir !== -1) return [{ translateY: 0 }];

    const frame = resolveCharacterFrame(
      refs.opponentCountdownLocked.value,
      refs.opponentFlipLocked.value,
      refs.opponentVelocityY.value,
      refs.opponentFrameIndex.value
    );
    const hitboxSize = CHAR_SIZE * CHAR_SCALE;
    const targetRenderHeight = hitboxSize * CHARACTER_RENDER_SCALE_MULTIPLIER;
    const scale = targetRenderHeight / frame.height;
    const feetTrim = CHARACTER_FEET_TRIM_PX * scale;
    const renderHeight = frame.height * scale;
    const baseY = refs.opponentPosY.value - feetTrim;
    const pivotY = baseY + renderHeight / 2;

    return [{ translateY: pivotY }, { scaleY: -1 }, { translateY: -pivotY }];
  });

  const characterSprites = useDerivedValue(() => {
    const frame = resolveCharacterFrame(
      refs.countdownLocked.value,
      refs.flipLockedUntilLanding.value,
      refs.velocityY.value,
      refs.frameIndex.value
    );
    return [rect(frame.x, frame.y, frame.width, frame.height)];
  });

  const opponentSprites = useDerivedValue(() => {
    const frame = resolveCharacterFrame(
      refs.opponentCountdownLocked.value,
      refs.opponentFlipLocked.value,
      refs.opponentVelocityY.value,
      refs.opponentFrameIndex.value
    );
    return [rect(frame.x, frame.y, frame.width, frame.height)];
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
      !middlePlatformLeftImage ||
      !middlePlatformCenterImage ||
      !middlePlatformRightImage ||
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
    const middleLeftSrcRect = Skia.XYWHRect(
      0,
      0,
      middlePlatformLeftImage.width(),
      middlePlatformLeftImage.height()
    );
    const middleCenterSrcRect = Skia.XYWHRect(
      0,
      0,
      middlePlatformCenterImage.width(),
      middlePlatformCenterImage.height()
    );
    const middleRightSrcRect = Skia.XYWHRect(
      0,
      0,
      middlePlatformRightImage.width(),
      middlePlatformRightImage.height()
    );
    const rightSrcRect = Skia.XYWHRect(0, 0, terrainRightImage.width(), terrainRightImage.height());
    const margin = tileSize * 2;
    const maxX = Math.max(...platforms.map((p) => p.x + p.width), width * 3) + margin;

    const getClippedSrcRect = (
      srcRect: ReturnType<typeof Skia.XYWHRect>,
      drawWidth: number,
      anchor: SrcClipAnchor
    ) => {
      const srcWidth = (drawWidth / tileSize) * srcRect.width;
      const srcX = anchor === 'end' ? srcRect.x + (srcRect.width - srcWidth) : srcRect.x;
      return Skia.XYWHRect(srcX, srcRect.y, srcWidth, srcRect.height);
    };

    return createPicture(
      (canvas) => {
        const solidPlatforms = platforms.filter((platform) => platform.surface !== 'pillar');

        const isSolidAt = (x: number, y: number, current: Platform) => {
          return solidPlatforms.some((platform) => {
            if (platform === current) return false;
            return (
              x >= platform.x &&
              x < platform.x + platform.width &&
              y >= platform.y &&
              y < platform.y + platform.height
            );
          });
        };

        for (const p of platforms) {
          const cols = Math.ceil(p.width / tileSize);
          const rows = Math.ceil(p.height / tileSize);
          for (let row = 0; row < rows; row++) {
            const isSurface = p.surface === 'top' ? row === rows - 1 : row === 0;
            for (let col = 0; col < cols; col++) {
              const remainingWidth = p.width - col * tileSize;
              const drawWidth = Math.min(tileSize, remainingWidth);
              if (drawWidth <= 0) continue;
              const tileX = Math.floor(p.x + col * tileSize);
              const tileY = Math.floor(p.y + row * tileSize);

              const isOnlyCol = cols === 1;
              const isLeftEdge = col === 0;
              const isRightEdge = col === cols - 1;

              let sourceImage = terrainCenterImage;
              let srcRect = centerSrcRect;
              let srcClipAnchor: SrcClipAnchor = 'start';

              if (isSurface || (p.surface === 'pillar' && row === 0)) {
                if (isOnlyCol) {
                  sourceImage = terrainTopImage;
                  srcRect = topSrcRect;
                } else if (isLeftEdge) {
                  const hasGap = isSurfaceEdgeGap({
                    tileX,
                    tileY,
                    drawWidth,
                    tileSize,
                    edge: 'left',
                    isSolidAt: (x, y) => isSolidAt(x, y, p),
                  });
                  if (hasGap) {
                    sourceImage = terrainTopLeftImage;
                    srcRect = topLeftSrcRect;
                  } else {
                    sourceImage = terrainTopImage;
                    srcRect = topSrcRect;
                  }
                } else if (isRightEdge) {
                  const hasGap = isSurfaceEdgeGap({
                    tileX,
                    tileY,
                    drawWidth,
                    tileSize,
                    edge: 'right',
                    isSolidAt: (x, y) => isSolidAt(x, y, p),
                  });
                  if (hasGap) {
                    sourceImage = terrainTopRightImage;
                    srcRect = topRightSrcRect;
                    srcClipAnchor = 'end';
                  } else {
                    sourceImage = terrainTopImage;
                    srcRect = topSrcRect;
                  }
                } else {
                  sourceImage = terrainTopImage;
                  srcRect = topSrcRect;
                }
              } else if (!isOnlyCol) {
                if (isLeftEdge) {
                  const sideSampleX = tileX - 0.5;
                  const sideSampleY = tileY + tileSize * 0.5;
                  if (!isSolidAt(sideSampleX, sideSampleY, p)) {
                    sourceImage = terrainLeftImage;
                    srcRect = leftSrcRect;
                  }
                } else if (isRightEdge) {
                  const sideSampleX = tileX + drawWidth + 0.5;
                  const sideSampleY = tileY + tileSize * 0.5;
                  if (!isSolidAt(sideSampleX, sideSampleY, p)) {
                    sourceImage = terrainRightImage;
                    srcRect = rightSrcRect;
                    srcClipAnchor = 'end';
                  }
                }
              }

              // Middle lane uses fixed left/center/right tiles for stretchable platforms.
              if (p.surface === 'pillar') {
                if (isOnlyCol) {
                  sourceImage = middlePlatformCenterImage;
                  srcRect = middleCenterSrcRect;
                } else if (isLeftEdge) {
                  sourceImage = middlePlatformLeftImage;
                  srcRect = middleLeftSrcRect;
                } else if (isRightEdge) {
                  sourceImage = middlePlatformRightImage;
                  srcRect = middleRightSrcRect;
                  srcClipAnchor = 'end';
                } else {
                  sourceImage = middlePlatformCenterImage;
                  srcRect = middleCenterSrcRect;
                }
              }

              const clippedSrcRect = getClippedSrcRect(srcRect, drawWidth, srcClipAnchor);
              const dst = Skia.XYWHRect(tileX, tileY, drawWidth, tileSize);
              if (p.surface === 'top') {
                // Ceiling lane should mirror floor orientation.
                canvas.save();
                canvas.translate(tileX, tileY + tileSize);
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
    middlePlatformCenterImage,
    middlePlatformLeftImage,
    middlePlatformRightImage,
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
    opponentVisible,
    playerX: width * PLAYER_X_FACTOR,
  };
};
