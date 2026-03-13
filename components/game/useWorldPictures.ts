import { useMemo } from 'react';
import { Skia, createPicture, rect, useImage, useRSXformBuffer } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import type { GeneratedSpriteAnimationDescriptor } from '../../shared/character-generation-contracts';
import type { Platform, TerrainTheme } from '../../types/game';
import type { CharacterId } from '../../shared/characters';
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
import {
  getCharacterPresetOrDefault,
  type CharacterSpritePreset,
  type SpriteFrame,
} from './characterSpritePresets';
import {
  resolveSpriteBasePosition,
  resolveGeneratedSpriteActions,
  resolveSpriteReferenceHeight,
} from './generatedSpriteSheet';
import { OPPONENT_POSE_FALL, OPPONENT_POSE_IDLE, OPPONENT_POSE_JUMP } from './multiplayerPose';
import { useSkiaImageAsset } from './skiaImageCache';
import type { SimulationRefs } from './types';
import { MIDDLE_PLATFORM_ASSETS, TERRAIN_TILE_ASSETS } from './worldAssetSources';

type SrcClipAnchor = 'start' | 'end';
const AIRBORNE_VEL_THRESHOLD = 10;
const JUMP_SCALE_BOOST = 1.3;

const resolveAnimatedFrame = (
  frames: readonly SpriteFrame[],
  slowdown: number,
  frameIndex: number
): SpriteFrame => {
  'worklet';
  return frames[Math.floor(frameIndex / slowdown) % frames.length];
};

const resolveCharacterFrame = (
  preset: CharacterSpritePreset,
  countdownLocked: number,
  flipLocked: number,
  velocityY: number,
  frameIndex: number
): SpriteFrame => {
  'worklet';
  if (countdownLocked === 1) {
    return resolveAnimatedFrame(preset.actions.idle, preset.frameSlowdowns.idle, frameIndex);
  }
  if (flipLocked === 1) {
    return resolveAnimatedFrame(preset.actions.jump, preset.frameSlowdowns.jump, frameIndex);
  }
  if (Math.abs(velocityY) > AIRBORNE_VEL_THRESHOLD) {
    return resolveAnimatedFrame(preset.actions.fall, preset.frameSlowdowns.fall, frameIndex);
  }
  return preset.actions.run[frameIndex % preset.actions.run.length];
};

const resolveCharacterFrameForPoseCode = (
  preset: CharacterSpritePreset,
  poseCode: number,
  frameIndex: number
): SpriteFrame => {
  'worklet';
  if (poseCode === OPPONENT_POSE_IDLE) {
    return resolveAnimatedFrame(preset.actions.idle, preset.frameSlowdowns.idle, frameIndex);
  }
  if (poseCode === OPPONENT_POSE_JUMP) {
    return resolveAnimatedFrame(preset.actions.jump, preset.frameSlowdowns.jump, frameIndex);
  }
  if (poseCode === OPPONENT_POSE_FALL) {
    return resolveAnimatedFrame(preset.actions.fall, preset.frameSlowdowns.fall, frameIndex);
  }
  return preset.actions.run[frameIndex % preset.actions.run.length];
};

const isAirborne = (flipLocked: number, velocityY: number): boolean => {
  'worklet';
  return flipLocked === 1 || Math.abs(velocityY) > AIRBORNE_VEL_THRESHOLD;
};

const resolveRenderMetrics = (
  preset: CharacterSpritePreset,
  frame: SpriteFrame,
  hitboxSize: number,
  scaleBoost: number
) => {
  'worklet';
  const targetRenderHeight = hitboxSize * preset.renderScaleMultiplier * scaleBoost;
  const scale = targetRenderHeight / resolveSpriteReferenceHeight(frame);
  const feetTrim = preset.feetTrimPx * scale;
  const renderWidth = frame.width * scale;
  const renderHeight = frame.height * scale;
  return {
    scale,
    feetTrim,
    renderWidth,
    renderHeight,
  };
};

interface UseWorldPicturesArgs {
  width: number;
  height: number;
  backgroundIndex: number;
  terrainTheme: TerrainTheme;
  characterId?: CharacterId;
  characterCustomSpriteUrl?: string | null;
  characterCustomSpriteAnimation?: GeneratedSpriteAnimationDescriptor | null;
  opponentCharacterId?: CharacterId;
  opponentCustomSpriteUrl?: string | null;
  opponentCustomSpriteAnimation?: GeneratedSpriteAnimationDescriptor | null;
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
    | 'opponentPoseCode'
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
  characterId,
  characterCustomSpriteUrl,
  characterCustomSpriteAnimation,
  opponentCharacterId,
  opponentCustomSpriteUrl,
  opponentCustomSpriteAnimation,
  platforms,
  refs,
}: UseWorldPicturesArgs) => {
  const resolveGeneratedPreset = (
    imageWidth: number,
    imageHeight: number,
    animation?: GeneratedSpriteAnimationDescriptor | null
  ): CharacterSpritePreset => ({
    imageSource: 0,
    renderScaleMultiplier: 1.2,
    feetTrimPx: 0,
    frameSlowdowns: {
      idle: 4,
      run: 1,
      jump: 2,
      fall: 2,
    },
    actions: resolveGeneratedSpriteActions(imageWidth, imageHeight, animation),
  });

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
  const middlePlatformLeftImage = useImage(MIDDLE_PLATFORM_ASSETS.left);
  const middlePlatformCenterImage = useImage(MIDDLE_PLATFORM_ASSETS.center);
  const middlePlatformRightImage = useImage(MIDDLE_PLATFORM_ASSETS.right);
  const fallbackCharacterPreset = getCharacterPresetOrDefault(characterId);
  const hasOpponentCharacter = opponentCharacterId != null;
  const fallbackOpponentPreset = getCharacterPresetOrDefault(opponentCharacterId);
  const characterImage = useSkiaImageAsset(
    characterCustomSpriteUrl ?? fallbackCharacterPreset.imageSource
  );
  const opponentImage = useSkiaImageAsset(
    hasOpponentCharacter ? (opponentCustomSpriteUrl ?? fallbackOpponentPreset.imageSource) : null
  );
  const characterPreset = useMemo(() => {
    if (characterCustomSpriteUrl && characterImage) {
      return resolveGeneratedPreset(
        characterImage.width(),
        characterImage.height(),
        characterCustomSpriteAnimation
      );
    }
    return fallbackCharacterPreset;
  }, [
    characterCustomSpriteAnimation,
    characterCustomSpriteUrl,
    characterImage,
    fallbackCharacterPreset,
  ]);
  const opponentPreset = useMemo(() => {
    if (opponentCustomSpriteUrl && opponentImage) {
      return resolveGeneratedPreset(
        opponentImage.width(),
        opponentImage.height(),
        opponentCustomSpriteAnimation
      );
    }
    return fallbackOpponentPreset;
  }, [
    fallbackOpponentPreset,
    opponentCustomSpriteAnimation,
    opponentCustomSpriteUrl,
    opponentImage,
  ]);

  const characterTransforms = useRSXformBuffer(1, (val) => {
    'worklet';
    const frame = resolveCharacterFrame(
      characterPreset,
      refs.countdownLocked.value,
      refs.flipLockedUntilLanding.value,
      refs.velocityY.value,
      refs.frameIndex.value
    );
    const airborne = isAirborne(refs.flipLockedUntilLanding.value, refs.velocityY.value);
    const hitboxSize = CHAR_SIZE * CHAR_SCALE;
    const scaleBoost = airborne ? JUMP_SCALE_BOOST : 1;
    const { scale, feetTrim } = resolveRenderMetrics(
      characterPreset,
      frame,
      hitboxSize,
      scaleBoost
    );
    const gDir = refs.gravityDirection.value;
    const { x, y } = resolveSpriteBasePosition({
      frame,
      scale,
      gravityDirection: gDir,
      worldAnchorX: refs.charX.value + hitboxSize / 2,
      worldAnchorY:
        gDir === -1 ? refs.posY.value - feetTrim : refs.posY.value + hitboxSize + feetTrim,
    });
    val.set(scale, 0, x, y);
  });

  const opponentTransforms = useRSXformBuffer(1, (val) => {
    'worklet';
    if (refs.opponentAlive.value !== 1) {
      val.set(1, 0, -10_000, -10_000);
      return;
    }
    const frame = resolveCharacterFrameForPoseCode(
      opponentPreset,
      refs.opponentPoseCode.value,
      refs.opponentFrameIndex.value
    );
    const hitboxSize = CHAR_SIZE * CHAR_SCALE;
    const { scale, feetTrim } = resolveRenderMetrics(opponentPreset, frame, hitboxSize, 1);
    const ox = width * OPPONENT_X_FACTOR;
    const gDir = refs.opponentGravity.value;
    const { x, y } = resolveSpriteBasePosition({
      frame,
      scale,
      gravityDirection: gDir === -1 ? -1 : 1,
      worldAnchorX: ox + hitboxSize / 2,
      worldAnchorY:
        gDir === -1
          ? refs.opponentPosY.value - feetTrim
          : refs.opponentPosY.value + hitboxSize + feetTrim,
    });
    val.set(scale, 0, x, y);
  });

  const opponentRenderTransform = useDerivedValue(() => {
    'worklet';
    const gDir = refs.opponentGravity.value;
    if (gDir !== -1) return [{ translateY: 0 }];

    const frame = resolveCharacterFrameForPoseCode(
      opponentPreset,
      refs.opponentPoseCode.value,
      refs.opponentFrameIndex.value
    );
    const hitboxSize = CHAR_SIZE * CHAR_SCALE;
    const { feetTrim, renderHeight } = resolveRenderMetrics(opponentPreset, frame, hitboxSize, 1);
    const baseY = refs.opponentPosY.value - feetTrim;
    const pivotY = baseY + renderHeight / 2;

    return [{ translateY: pivotY }, { scaleY: -1 }, { translateY: -pivotY }];
  });

  const characterRenderTransform = useDerivedValue(() => {
    'worklet';
    const gDir = refs.gravityDirection.value;
    if (gDir !== -1) return [{ translateY: 0 }];

    const frame = resolveCharacterFrame(
      characterPreset,
      refs.countdownLocked.value,
      refs.flipLockedUntilLanding.value,
      refs.velocityY.value,
      refs.frameIndex.value
    );
    const airborne = isAirborne(refs.flipLockedUntilLanding.value, refs.velocityY.value);
    const hitboxSize = CHAR_SIZE * CHAR_SCALE;
    const scaleBoost = airborne ? JUMP_SCALE_BOOST : 1;
    const { feetTrim, renderHeight } = resolveRenderMetrics(
      characterPreset,
      frame,
      hitboxSize,
      scaleBoost
    );
    const baseY = refs.posY.value - feetTrim;
    const pivotY = baseY + renderHeight / 2;

    return [{ translateY: pivotY }, { scaleY: -1 }, { translateY: -pivotY }];
  });

  const characterSprites = useDerivedValue(() => {
    'worklet';
    const frame = resolveCharacterFrame(
      characterPreset,
      refs.countdownLocked.value,
      refs.flipLockedUntilLanding.value,
      refs.velocityY.value,
      refs.frameIndex.value
    );
    return [rect(frame.x, frame.y, frame.width, frame.height)];
  });

  const opponentSprites = useDerivedValue(() => {
    'worklet';
    const frame = resolveCharacterFrameForPoseCode(
      opponentPreset,
      refs.opponentPoseCode.value,
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
    'worklet';
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
    'worklet';
    return [{ translateX: -refs.totalScroll.value }];
  });

  const opponentVisible = useDerivedValue(() => {
    'worklet';
    return refs.opponentAlive.value === 1;
  });
  const worldAssetsReady =
    backgroundPicture !== null &&
    platformsPicture !== null &&
    characterImage !== null &&
    (!hasOpponentCharacter || opponentImage !== null) &&
    width > 0 &&
    height > 0;

  return {
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
    opponentVisible,
    playerX: width * PLAYER_X_FACTOR,
  };
};
