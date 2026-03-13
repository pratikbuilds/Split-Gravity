export const WORLD_TILE_SIZE = 32;

export const GRAVITY = 2400;
export const RUN_SPEED = 280;
export const CHAR_SCALE = 1.5;
export const CHAR_SIZE = 24;
export const FRAME_INTERVAL_MS = 100;
export const MULTIPLAYER_STATE_INTERVAL_MS = 16;
/** Vertical tolerance (px) to count as on a surface; slightly generous for reliable landing. */
export const GROUNDED_EPSILON = 6;
export const DEATH_MARGIN_FRACTION = 1.0;
export const FLIP_ARC_FORWARD = 80;
export const FLIP_ARC_DECAY = 0.96;
export const ENABLE_COLLIDER_DEBUG_UI = false;
export const COYOTE_TIME_MS = 140;
export const EDGE_CONTACT_MARGIN = 4;
/** Min horizontal overlap (px) to count as supported; allows narrow pillars to register. */
export const SUPPORT_MIN_OVERLAP = 5;
/** Min overlap for considering a surface when scanning for landing (prevents 1px grazes). */
export const LANDING_MIN_OVERLAP = 4;
export const BACKGROUND_SCROLL_FACTOR = 0.2;
export const PLAYER_X_FACTOR = 0.2;
export const OPPONENT_X_FACTOR = 0.34;
export const OPPONENT_LERP_SPEED = 18;

export const tileSize = WORLD_TILE_SIZE;
export const groundHeight = 2 * tileSize;
