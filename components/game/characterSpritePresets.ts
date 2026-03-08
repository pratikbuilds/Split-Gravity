import { DEFAULT_CHARACTER_ID, type CharacterId } from '../../shared/characters';

export type SpriteFrame = { x: number; y: number; width: number; height: number };

export type CharacterAction = 'idle' | 'run' | 'jump' | 'fall';

export type CharacterSpritePreset = {
  imageSource: number;
  renderScaleMultiplier: number;
  feetTrimPx: number;
  frameSlowdowns: Record<CharacterAction, number>;
  actions: Record<CharacterAction, readonly SpriteFrame[]>;
};

export type CharacterDefinition = {
  id: CharacterId;
  displayName: string;
  previewOrder: number;
  spritePreset: CharacterSpritePreset;
};

// --- Shared sheet layout: design space 1024×571; all character assets are 2K: 2752×1536 ---
export const CHARACTER_SHEET_WIDTH = 2752;
export const CHARACTER_SHEET_HEIGHT = 1536;

const BASE_SHEET_WIDTH = 1024;
const BASE_SHEET_HEIGHT = 571;
const X_SCALE_2K = CHARACTER_SHEET_WIDTH / BASE_SHEET_WIDTH;
const Y_SCALE_2K = CHARACTER_SHEET_HEIGHT / BASE_SHEET_HEIGHT;

const scaleFrame = (frame: SpriteFrame, xScale: number, yScale: number): SpriteFrame => ({
  x: Math.round(frame.x * xScale),
  y: Math.round(frame.y * yScale),
  width: Math.round(frame.width * xScale),
  height: Math.round(frame.height * yScale),
});

/** Base frame rects in 1024×571 design space; scaled to 2752×1536 for all character sheets. */
const BASE_ACTIONS: Record<CharacterAction, readonly SpriteFrame[]> = {
  run: [
    { x: 32, y: 12, width: 107, height: 160 },
    { x: 198, y: 12, width: 117, height: 160 },
    { x: 375, y: 12, width: 101, height: 160 },
    { x: 528, y: 12, width: 142, height: 160 },
    { x: 720, y: 12, width: 93, height: 160 },
    { x: 860, y: 12, width: 147, height: 160 },
  ],
  jump: [
    { x: 25, y: 193, width: 138, height: 180 },
    { x: 206, y: 193, width: 104, height: 180 },
    { x: 375, y: 196, width: 101, height: 175 },
  ],
  fall: [
    { x: 552, y: 196, width: 88, height: 170 },
    { x: 721, y: 196, width: 92, height: 170 },
  ],
  idle: [
    { x: 198, y: 390, width: 117, height: 170 },
    { x: 392, y: 392, width: 73, height: 168 },
  ],
};

const SHARED_FRAME_SLOWDOWNS: Record<CharacterAction, number> = {
  idle: 4,
  run: 1,
  jump: 3,
  fall: 2,
};

/** 2K sheet: frames scaled to CHARACTER_SHEET_WIDTH × CHARACTER_SHEET_HEIGHT (2752×1536). */
const ACTIONS_2K: Record<CharacterAction, readonly SpriteFrame[]> = {
  run: BASE_ACTIONS.run.map((f) => scaleFrame(f, X_SCALE_2K, Y_SCALE_2K)),
  jump: BASE_ACTIONS.jump.map((f) => scaleFrame(f, X_SCALE_2K, Y_SCALE_2K)),
  fall: BASE_ACTIONS.fall.map((f) => scaleFrame(f, X_SCALE_2K, Y_SCALE_2K)),
  idle: BASE_ACTIONS.idle.map((f) => scaleFrame(f, X_SCALE_2K, Y_SCALE_2K)),
};
const FEET_TRIM_2K_PX = Math.round(8 * Y_SCALE_2K);

type PresetOverrides = Partial<
  Pick<CharacterSpritePreset, 'renderScaleMultiplier' | 'feetTrimPx' | 'frameSlowdowns' | 'actions'>
>;

/** Creates a preset for 2K character assets (2752×1536). All character sprites must use this size. */
function createCharacterPreset2K(
  imageSource: number,
  overrides: PresetOverrides = {}
): CharacterSpritePreset {
  return {
    imageSource,
    renderScaleMultiplier: 1.25,
    feetTrimPx: FEET_TRIM_2K_PX,
    frameSlowdowns: SHARED_FRAME_SLOWDOWNS,
    actions: ACTIONS_2K,
    ...overrides,
  };
}

// export const PIXEL_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPreset2K(
//   require('../../assets/game/pixel.png')
// );

// export const RAJ_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPreset2K(
//   require('../../assets/game/raj.png')
// );

export const TRUMP_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPreset2K(
  require('../../assets/game/trump.png')
);

export const TOLYMASTER_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPreset2K(
  require('../../assets/game/tolytoday.png')
);

export const SKELI_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPreset2K(
  require('../../assets/game/skieli.png')
);

export const ELON_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPreset2K(
  require('../../assets/game/elon.png')
);

export const LAD_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPreset2K(
  require('../../assets/game/laddy.png')
);

export const CHARACTER_DEFINITIONS: readonly CharacterDefinition[] = [
  {
    id: 'v3',
    displayName: 'Trump',
    previewOrder: 0,
    spritePreset: TRUMP_CHARACTER_PRESET,
  },
  {
    id: 'skieli',
    displayName: 'Skieli',
    previewOrder: 3,
    spritePreset: SKELI_CHARACTER_PRESET,
  },
  {
    id: 'tolymaster',
    displayName: 'Tolymaster',
    previewOrder: 4,
    spritePreset: TOLYMASTER_CHARACTER_PRESET,
  },
  {
    id: 'elon',
    displayName: 'Elon',
    previewOrder: 5,
    spritePreset: ELON_CHARACTER_PRESET,
  },
  {
    id: 'lad',
    displayName: 'Mad Lad',
    previewOrder: 6,
    spritePreset: LAD_CHARACTER_PRESET,
  },
] as const;

export const CHARACTER_DEFINITIONS_BY_ID: Record<CharacterId, CharacterDefinition> =
  CHARACTER_DEFINITIONS.reduce(
    (accumulator, definition) => {
      accumulator[definition.id] = definition;
      return accumulator;
    },
    {} as Record<CharacterId, CharacterDefinition>
  );

export const getCharacterDefinition = (characterId: CharacterId): CharacterDefinition => {
  return CHARACTER_DEFINITIONS_BY_ID[characterId];
};

export const getCharacterDefinitionOrDefault = (
  characterId: CharacterId | null | undefined | string
): CharacterDefinition => {
  if (
    characterId &&
    Object.prototype.hasOwnProperty.call(CHARACTER_DEFINITIONS_BY_ID, characterId)
  ) {
    return CHARACTER_DEFINITIONS_BY_ID[characterId as CharacterId];
  }
  return CHARACTER_DEFINITIONS_BY_ID[DEFAULT_CHARACTER_ID];
};

export const getCharacterPresetOrDefault = (
  characterId: CharacterId | null | undefined | string
): CharacterSpritePreset => {
  return getCharacterDefinitionOrDefault(characterId).spritePreset;
};

export { DEFAULT_CHARACTER_ID, type CharacterId };
