export interface Platform {
  x: number; // world X (scroll space)
  y: number; // screen Y from top (top of platform)
  width: number;
  height: number;
  tileType: 'grass' | 'dirt' | 'crate';
  surface: 'bottom' | 'top' | 'pillar';
}

export interface Chunk {
  id: string;
  width: number;
  platforms: Platform[];
  difficulty: 'flat' | 'easy' | 'medium' | 'hard';
}

// Reachability constants (tune from physics)
export const MAX_FLIP_HORIZONTAL = 120; // px horizontal distance per flip arc
export const MIN_LANDING_WIDTH = 48; // min platform width to land safely
export const SAFE_MARGIN = 20; // conservative gap margin
export const FLAT_ZONE_LENGTH = 800; // px of continuous ground at start
