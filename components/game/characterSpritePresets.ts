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

// --- Shared sheet layout: design space 1024×571; 4K assets are 5504×3072 ---
const BASE_SHEET_WIDTH = 1024;
const BASE_SHEET_HEIGHT = 571;
const SHEET_4K_WIDTH = 5504;
const SHEET_4K_HEIGHT = 3072;
const X_SCALE_4K = SHEET_4K_WIDTH / BASE_SHEET_WIDTH;
const Y_SCALE_4K = SHEET_4K_HEIGHT / BASE_SHEET_HEIGHT;

const scaleFrame = (frame: SpriteFrame, xScale: number, yScale: number): SpriteFrame => ({
  x: Math.round(frame.x * xScale),
  y: Math.round(frame.y * yScale),
  width: Math.round(frame.width * xScale),
  height: Math.round(frame.height * yScale),
});

/** Base frame rects in 1024×571 design space. 1K assets use as-is; 4K use scaled. */
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

/** 4K sheet: frames scaled to 5504×3072; feet trim in 4K pixels. */
const ACTIONS_4K: Record<CharacterAction, readonly SpriteFrame[]> = {
  run: BASE_ACTIONS.run.map((f) => scaleFrame(f, X_SCALE_4K, Y_SCALE_4K)),
  jump: BASE_ACTIONS.jump.map((f) => scaleFrame(f, X_SCALE_4K, Y_SCALE_4K)),
  fall: BASE_ACTIONS.fall.map((f) => scaleFrame(f, X_SCALE_4K, Y_SCALE_4K)),
  idle: BASE_ACTIONS.idle.map((f) => scaleFrame(f, X_SCALE_4K, Y_SCALE_4K)),
};
const FEET_TRIM_4K_PX = Math.round(8 * Y_SCALE_4K);

type PresetOverrides = Partial<
  Pick<CharacterSpritePreset, 'renderScaleMultiplier' | 'feetTrimPx' | 'frameSlowdowns' | 'actions'>
>;

/** Creates a preset for 4K assets (5504×3072). */
function createCharacterPreset4K(
  imageSource: number,
  overrides: PresetOverrides = {}
): CharacterSpritePreset {
  return {
    imageSource,
    renderScaleMultiplier: 1.25,
    feetTrimPx: FEET_TRIM_4K_PX,
    frameSlowdowns: SHARED_FRAME_SLOWDOWNS,
    actions: ACTIONS_4K,
    ...overrides,
  };
}

/**
 * Creates a preset for assets with a custom sheet size. Base layout (1024×571) is scaled to
 * sheetWidth×sheetHeight so frame rects match the actual image pixels.
 */
function createCharacterPresetCustomSheet(
  imageSource: number,
  sheetWidth: number,
  sheetHeight: number,
  overrides: PresetOverrides = {}
): CharacterSpritePreset {
  const xScale = sheetWidth / BASE_SHEET_WIDTH;
  const yScale = sheetHeight / BASE_SHEET_HEIGHT;
  const actions: Record<CharacterAction, readonly SpriteFrame[]> = {
    run: BASE_ACTIONS.run.map((f) => scaleFrame(f, xScale, yScale)),
    jump: BASE_ACTIONS.jump.map((f) => scaleFrame(f, xScale, yScale)),
    fall: BASE_ACTIONS.fall.map((f) => scaleFrame(f, xScale, yScale)),
    idle: BASE_ACTIONS.idle.map((f) => scaleFrame(f, xScale, yScale)),
  };
  const feetTrimPx = Math.round(8 * yScale);
  return {
    imageSource,
    renderScaleMultiplier: 1.25,
    feetTrimPx,
    frameSlowdowns: SHARED_FRAME_SLOWDOWNS,
    actions,
    ...overrides,
  };
}

export const PRI_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPreset4K(
  require('../../assets/game/pri.png')
);

export const V3_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPreset4K(
  require('../../assets/game/v3.png')
);

export const PIXEL_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPreset4K(
  require('../../assets/game/pixel.png')
);

/** raj.png is 1376×768 — use custom sheet so frame rects match image pixels. */
export const RAJ_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPresetCustomSheet(
  require('../../assets/game/raj.png'),
  1376,
  768
);

/** tolymaster.png and elon.png are 1376×768 — same layout as raj. */
export const TOLYMASTER_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPresetCustomSheet(
  require('../../assets/game/tolymaster.png'),
  1376,
  768
);

export const ELON_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPresetCustomSheet(
  require('../../assets/game/elon.png'),
  1376,
  768
);

export const CHARACTER_DEFINITIONS: readonly CharacterDefinition[] = [
  {
    id: 'v3',
    displayName: 'V3',
    previewOrder: 0,
    spritePreset: V3_CHARACTER_PRESET,
  },
  {
    id: 'pri',
    displayName: 'Pri',
    previewOrder: 1,
    spritePreset: PRI_CHARACTER_PRESET,
  },
  {
    id: 'pixel',
    displayName: 'Pixel',
    previewOrder: 2,
    spritePreset: PIXEL_CHARACTER_PRESET,
  },
  {
    id: 'raj',
    displayName: 'Raj',
    previewOrder: 3,
    spritePreset: RAJ_CHARACTER_PRESET,
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
