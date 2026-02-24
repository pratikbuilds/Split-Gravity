export type SpriteFrame = { x: number; y: number; width: number; height: number };

export type CharacterAction = 'idle' | 'run' | 'jump' | 'fall';

export type CharacterSpritePreset = {
  imageSource: number;
  renderScaleMultiplier: number;
  feetTrimPx: number;
  frameSlowdowns: Record<CharacterAction, number>;
  actions: Record<CharacterAction, readonly SpriteFrame[]>;
};

// --- Shared sheet layout (all character assets use same size/proportions) ---
const BASE_SHEET_WIDTH = 1024;
const BASE_SHEET_HEIGHT = 571;
const SHEET_WIDTH = 5504;
const SHEET_HEIGHT = 3072;
const X_SCALE = SHEET_WIDTH / BASE_SHEET_WIDTH;
const Y_SCALE = SHEET_HEIGHT / BASE_SHEET_HEIGHT;

const scaleFrame = (frame: SpriteFrame): SpriteFrame => ({
  x: Math.round(frame.x * X_SCALE),
  y: Math.round(frame.y * Y_SCALE),
  width: Math.round(frame.width * X_SCALE),
  height: Math.round(frame.height * Y_SCALE),
});

/** Base frame rects (1024x571 design), scaled to sheet size. Reused by all same-layout assets. */
const SHARED_ACTIONS: Record<CharacterAction, readonly SpriteFrame[]> = {
  run: [
    { x: 32, y: 12, width: 107, height: 160 },
    { x: 198, y: 12, width: 117, height: 160 },
    { x: 375, y: 12, width: 101, height: 160 },
    { x: 528, y: 12, width: 142, height: 160 },
    { x: 720, y: 12, width: 93, height: 160 },
    { x: 860, y: 12, width: 147, height: 160 },
  ].map(scaleFrame),
  jump: [
    { x: 25, y: 193, width: 138, height: 180 },
    { x: 206, y: 193, width: 104, height: 180 },
    { x: 375, y: 196, width: 101, height: 175 },
  ].map(scaleFrame),
  fall: [
    { x: 552, y: 196, width: 88, height: 170 },
    { x: 721, y: 196, width: 92, height: 170 },
  ].map(scaleFrame),
  idle: [
    { x: 198, y: 390, width: 117, height: 170 },
    { x: 392, y: 392, width: 73, height: 168 },
  ].map(scaleFrame),
};

const SHARED_FRAME_SLOWDOWNS: Record<CharacterAction, number> = {
  idle: 4,
  run: 1,
  jump: 3,
  fall: 2,
};

const DEFAULT_FEET_TRIM_PX = Math.round(8 * Y_SCALE);

type PresetOverrides = Partial<
  Pick<CharacterSpritePreset, 'renderScaleMultiplier' | 'feetTrimPx' | 'frameSlowdowns'>
>;

/** Creates a preset for assets that use the shared sheet layout. Add new characters by image only. */
function createCharacterPreset(
  imageSource: number,
  overrides: PresetOverrides = {}
): CharacterSpritePreset {
  return {
    imageSource,
    renderScaleMultiplier: 1.25,
    feetTrimPx: DEFAULT_FEET_TRIM_PX,
    frameSlowdowns: SHARED_FRAME_SLOWDOWNS,
    actions: SHARED_ACTIONS,
    ...overrides,
  };
}

// --- Presets (one per asset; override only when needed) ---
export const DOG_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPreset(
  require('../../assets/game/dog_character.png')
);

export const PRI_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPreset(
  require('../../assets/game/pri.png')
);

export const TRUMP_CHARACTER_PRESET: CharacterSpritePreset = createCharacterPreset(
  require('../../assets/game/v3.png')
);

/** Switch active character: TRUMP_CHARACTER_PRESET | DOG_CHARACTER_PRESET | PRI_CHARACTER_PRESET */
export const ACTIVE_CHARACTER_PRESET: CharacterSpritePreset = TRUMP_CHARACTER_PRESET;
