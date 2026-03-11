export const PRESET_CHARACTER_IDS = [
  'v3',
  'pri',
  'pixel',
  'raj',
  'tolymaster',
  'elon',
  'lad',
  'skieli',
  'degod',
] as const;

export const CHARACTER_IDS = [...PRESET_CHARACTER_IDS, 'custom'] as const;

export type PresetCharacterId = (typeof PRESET_CHARACTER_IDS)[number];
export type CharacterId = (typeof CHARACTER_IDS)[number];

export const DEFAULT_CHARACTER_ID: PresetCharacterId = 'v3';

export const isCharacterId = (value: unknown): value is CharacterId => {
  return typeof value === 'string' && CHARACTER_IDS.includes(value as CharacterId);
};

export const isPresetCharacterId = (value: unknown): value is PresetCharacterId => {
  return typeof value === 'string' && PRESET_CHARACTER_IDS.includes(value as PresetCharacterId);
};
