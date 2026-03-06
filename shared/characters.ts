export const CHARACTER_IDS = ['v3', 'pri', 'pixel', 'raj', 'tolymaster', 'elon'] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

export const DEFAULT_CHARACTER_ID: CharacterId = 'v3';

export const isCharacterId = (value: unknown): value is CharacterId => {
  return typeof value === 'string' && CHARACTER_IDS.includes(value as CharacterId);
};
