export type TerrainTheme = 'grass' | 'purple' | 'stone';

export interface Platform {
  x: number; // world X (scroll space)
  y: number; // screen Y from top (top of platform)
  width: number;
  height: number;
  surface: 'bottom' | 'top' | 'pillar';
}

export interface Chunk {
  id: string;
  width: number;
  platforms: Platform[];
  challenge: number;
  phase: 'intro' | 'main' | 'recovery';
}

export interface GameResult {
  playerScore: number;
}

export type GameMode =
  | 'single_practice'
  | 'single_paid_contest'
  | 'multi_casual'
  | 'multi_paid_private'
  | 'multi_paid_queue';

export type MatchStatus = 'idle' | 'lobby' | 'countdown' | 'running' | 'result';

export interface OpponentSnapshot {
  playerId: string;
  nickname: string;
  normalizedY: number;
  gravityDir: 1 | -1;
  scroll: number;
  alive: boolean;
  score: number;
  t: number;
  /** Animation state for opponent sprite */
  frameIndex: number;
  velocityY: number;
  flipLocked: 0 | 1;
  countdownLocked: 0 | 1;
}

export type MultiplayerResultReason =
  | 'death'
  | 'disconnect_forfeit'
  | 'opponent_disconnect_forfeit';

export interface MultiplayerResult {
  winnerPlayerId: string;
  loserPlayerId: string;
  reason: MultiplayerResultReason;
  endedAt: number;
  settlementTransactionSignature?: string | null;
}

export type GameAudioEvent = 'flip' | 'countdown_tick' | 'game_over' | 'land' | 'near_miss';

// Level generator config (used by section-based generator)
export interface LevelGeneratorConfig {
  groundY: number;
  tileSize: number;
  screenWidth: number;
}

// Reachability constants (tune from physics)
export const MAX_FLIP_HORIZONTAL = 120; // px horizontal distance per flip arc
export const MIN_LANDING_WIDTH = 48; // min platform width to land safely
export const SAFE_MARGIN = 20; // conservative gap margin
export const FLAT_ZONE_LENGTH = 400; // px of continuous ground at start
