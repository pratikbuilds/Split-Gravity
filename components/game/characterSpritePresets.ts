import {
  DEFAULT_CHARACTER_ID,
  isPresetCharacterId,
  type CharacterId,
  type PresetCharacterId,
} from '../../shared/characters';

export type SpriteFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
  anchorX?: number;
  anchorY?: number;
  referenceHeight?: number;
};

export type CharacterAction = 'idle' | 'run' | 'jump' | 'fall';

export type CharacterSpritePreset = {
  imageSource: number;
  renderScaleMultiplier: number;
  feetTrimPx: number;
  frameSlowdowns: Record<CharacterAction, number>;
  actions: Record<CharacterAction, readonly SpriteFrame[]>;
};

export type CharacterDefinition = {
  id: PresetCharacterId;
  displayName: string;
  previewOrder: number;
  spritePreset: CharacterSpritePreset;
};

// Shared sheet layout: design space 1024×571; gameplay sheets are downscaled to 1376×768
// to reduce decode time and memory pressure on mobile.
export const CHARACTER_SHEET_WIDTH = 1376;
export const CHARACTER_SHEET_HEIGHT = 768;

const BASE_SHEET_WIDTH = 1024;
const BASE_SHEET_HEIGHT = 571;
const X_SCALE = CHARACTER_SHEET_WIDTH / BASE_SHEET_WIDTH;
const Y_SCALE = CHARACTER_SHEET_HEIGHT / BASE_SHEET_HEIGHT;

const scaleFrame = (frame: SpriteFrame, xScale: number, yScale: number): SpriteFrame => ({
  x: Math.round(frame.x * xScale),
  y: Math.round(frame.y * yScale),
  width: Math.round(frame.width * xScale),
  height: Math.round(frame.height * yScale),
});

/** Base frame rects in 1024×571 design space; scaled to the normalized gameplay sheet size. */
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

const ACTIONS: Record<CharacterAction, readonly SpriteFrame[]> = {
  run: BASE_ACTIONS.run.map((f) => scaleFrame(f, X_SCALE, Y_SCALE)),
  jump: BASE_ACTIONS.jump.map((f) => scaleFrame(f, X_SCALE, Y_SCALE)),
  fall: BASE_ACTIONS.fall.map((f) => scaleFrame(f, X_SCALE, Y_SCALE)),
  idle: BASE_ACTIONS.idle.map((f) => scaleFrame(f, X_SCALE, Y_SCALE)),
};
const FEET_TRIM_PX = Math.round(8 * Y_SCALE);

type PresetOverrides = Partial<
  Pick<CharacterSpritePreset, 'renderScaleMultiplier' | 'feetTrimPx' | 'frameSlowdowns' | 'actions'>
>;

function createCharacterPreset(
  imageSource: number,
  overrides: PresetOverrides = {}
): CharacterSpritePreset {
  return {
    imageSource,
    renderScaleMultiplier: 1.25,
    feetTrimPx: FEET_TRIM_PX,
    frameSlowdowns: SHARED_FRAME_SLOWDOWNS,
    actions: ACTIONS,
    ...overrides,
  };
}

// export const PIXEL_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPreset(
//   require('../../assets/game/pixel.png')
// );

// export const RAJ_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPreset(
//   require('../../assets/game/raj.png')
// );

export const TRUMP_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPreset(
  require('../../assets/game/trump.png')
);

export const TOLYMASTER_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPreset(
  require('../../assets/game/tolytoday.png')
);

export const SKELI_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPreset(
  require('../../assets/game/skieli.png')
);

export const ELON_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPreset(
  require('../../assets/game/elon.png')
);

// Laddy sheet is 1024×571 (base design size) — use unscaled frame coords and transparent background.
const LAD_FEET_TRIM_PX = 8;
export const LAD_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPreset(
  require('../../assets/game/laddy.png'),
  { actions: BASE_ACTIONS, feetTrimPx: LAD_FEET_TRIM_PX }
);

// Degod sheet is 1024×571 (base design size), not 1376×768 — use unscaled frame coords.
const DEGOD_FEET_TRIM_PX = 8;
export const DEGOD_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPreset(
  require('../../assets/game/degod.png'),
  { actions: BASE_ACTIONS, feetTrimPx: DEGOD_FEET_TRIM_PX }
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
  {
    id: 'degod',
    displayName: 'Degod',
    previewOrder: 7,
    spritePreset: DEGOD_CHARACTER_PRESET,
  },
] as const;

export const CHARACTER_DEFINITIONS_BY_ID: Record<PresetCharacterId, CharacterDefinition> =
  CHARACTER_DEFINITIONS.reduce(
    (accumulator, definition) => {
      accumulator[definition.id] = definition;
      return accumulator;
    },
    {} as Record<PresetCharacterId, CharacterDefinition>
  );

export const getCharacterDefinition = (characterId: PresetCharacterId): CharacterDefinition => {
  return CHARACTER_DEFINITIONS_BY_ID[characterId];
};

export const getCharacterDefinitionOrDefault = (
  characterId: CharacterId | null | undefined | string
): CharacterDefinition => {
  if (isPresetCharacterId(characterId)) {
    return CHARACTER_DEFINITIONS_BY_ID[characterId];
  }
  return CHARACTER_DEFINITIONS_BY_ID[DEFAULT_CHARACTER_ID];
};

export const getCharacterPresetOrDefault = (
  characterId: CharacterId | null | undefined | string
): CharacterSpritePreset => {
  return getCharacterDefinitionOrDefault(characterId).spritePreset;
};

export { DEFAULT_CHARACTER_ID, type CharacterId, type PresetCharacterId };
