import { isPresetCharacterId, type CharacterId } from '../../shared/characters';
import type { TerrainTheme } from '../../types/game';
import { GAME_BACKGROUNDS } from '../../utils/backgrounds';
import { CHARACTER_DEFINITIONS, getCharacterDefinitionOrDefault } from './characterSpritePresets';

const GRASS_TERRAIN_ASSETS = {
  top: require('../../assets/game/terrain/default/terrain_grass_block_top.png'),
  topLeft: require('../../assets/game/terrain/default/terrain_grass_block_top_left.png'),
  topRight: require('../../assets/game/terrain/default/terrain_grass_block_top_right.png'),
  left: require('../../assets/game/terrain/default/terrain_grass_block_left.png'),
  center: require('../../assets/game/terrain/default/terrain_grass_block_center.png'),
  right: require('../../assets/game/terrain/default/terrain_grass_block_right.png'),
} as const;

const PURPLE_TERRAIN_ASSETS = {
  top: require('../../assets/game/terrain/default/terrain_purple_block_top.png'),
  topLeft: require('../../assets/game/terrain/default/terrain_purple_block_top_left.png'),
  topRight: require('../../assets/game/terrain/default/terrain_purple_block_top_right.png'),
  left: require('../../assets/game/terrain/default/terrain_purple_block_left.png'),
  center: require('../../assets/game/terrain/default/terrain_purple_block_center.png'),
  right: require('../../assets/game/terrain/default/terrain_purple_block_right.png'),
} as const;

const STONE_TERRAIN_ASSETS = {
  top: require('../../assets/game/terrain/default/terrain_stone_block_top.png'),
  topLeft: require('../../assets/game/terrain/default/terrain_stone_block_top_left.png'),
  topRight: require('../../assets/game/terrain/default/terrain_stone_block_top_right.png'),
  left: require('../../assets/game/terrain/default/terrain_stone_block_left.png'),
  center: require('../../assets/game/terrain/default/terrain_stone_block_center.png'),
  right: require('../../assets/game/terrain/default/terrain_stone_block_right.png'),
} as const;

export const TERRAIN_TILE_ASSETS: Record<
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
  grass: GRASS_TERRAIN_ASSETS,
  purple: PURPLE_TERRAIN_ASSETS,
  stone: STONE_TERRAIN_ASSETS,
};

export const MIDDLE_PLATFORM_ASSETS = {
  left: require('../../assets/platform assets/Tiles/tile_0048.png'),
  center: require('../../assets/platform assets/Tiles/tile_0049.png'),
  right: require('../../assets/platform assets/Tiles/tile_0050.png'),
} as const;

export const COUNTDOWN_DIGIT_ASSETS: Record<1 | 2 | 3, number> = {
  1: require('../../assets/game/hud/hud_character_1.png'),
  2: require('../../assets/game/hud/hud_character_2.png'),
  3: require('../../assets/game/hud/hud_character_3.png'),
};

const TERRAIN_STARTUP_ASSETS = [
  GRASS_TERRAIN_ASSETS.top,
  GRASS_TERRAIN_ASSETS.topLeft,
  GRASS_TERRAIN_ASSETS.topRight,
  GRASS_TERRAIN_ASSETS.left,
  GRASS_TERRAIN_ASSETS.center,
  GRASS_TERRAIN_ASSETS.right,
  PURPLE_TERRAIN_ASSETS.top,
  PURPLE_TERRAIN_ASSETS.topLeft,
  PURPLE_TERRAIN_ASSETS.topRight,
  PURPLE_TERRAIN_ASSETS.left,
  PURPLE_TERRAIN_ASSETS.center,
  PURPLE_TERRAIN_ASSETS.right,
  STONE_TERRAIN_ASSETS.top,
  STONE_TERRAIN_ASSETS.topLeft,
  STONE_TERRAIN_ASSETS.topRight,
  STONE_TERRAIN_ASSETS.left,
  STONE_TERRAIN_ASSETS.center,
  STONE_TERRAIN_ASSETS.right,
];

export const CHARACTER_STARTUP_ASSETS = CHARACTER_DEFINITIONS.map(
  ({ spritePreset }) => spritePreset.imageSource
);

export const GAME_ENVIRONMENT_ASSETS: number[] = Array.from(
  new Set([
    ...GAME_BACKGROUNDS,
    ...TERRAIN_STARTUP_ASSETS,
    MIDDLE_PLATFORM_ASSETS.left,
    MIDDLE_PLATFORM_ASSETS.center,
    MIDDLE_PLATFORM_ASSETS.right,
    COUNTDOWN_DIGIT_ASSETS[1],
    COUNTDOWN_DIGIT_ASSETS[2],
    COUNTDOWN_DIGIT_ASSETS[3],
  ])
);

export const getCharacterAssets = (
  characterIds: readonly (CharacterId | null | undefined)[]
): number[] => {
  return Array.from(
    new Set(
      characterIds
        .filter(
          (characterId): characterId is CharacterId =>
            characterId != null && isPresetCharacterId(characterId)
        )
        .map((characterId) => getCharacterDefinitionOrDefault(characterId).spritePreset.imageSource)
    )
  );
};
