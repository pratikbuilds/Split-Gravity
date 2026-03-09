import type { SharedValue } from 'react-native-reanimated';
import type { CharacterId } from '../../shared/characters';
import type {
  Chunk,
  GameAudioEvent,
  GameResult,
  OpponentSnapshot,
  Platform,
  TerrainTheme,
} from '../../types/game';

export type GravityDirection = 1 | -1;

export type GameCanvasProps = {
  restartKey?: number;
  /** When set, shuffles level section order for variety (paid matches, etc.) */
  levelSeed?: number;
  onExit?: () => void;
  onGameOver?: (result: GameResult) => void;
  onAudioEvent?: (event: GameAudioEvent) => void;
  backgroundIndex?: number;
  terrainTheme?: TerrainTheme;
  initialGravityDirection?: GravityDirection;
  characterId?: CharacterId;
  characterCustomSpriteUrl?: string | null;
  opponentCharacterId?: CharacterId;
  opponentCustomSpriteUrl?: string | null;
  opponentInitialGravityDirection?: GravityDirection;
  opponentSnapshotValue?: SharedValue<OpponentSnapshot | null>;
  opponentConnectionState?: 'connected' | 'reconnecting' | 'forfeit_pending';
  opponentName?: string;
  onFlipInput?: () => void;
  onLocalState?: (payload: {
    normalizedY: number;
    gravityDir: GravityDirection;
    scroll: number;
    alive: boolean;
    score: number;
    frameIndex: number;
    velocityY: number;
    flipLocked: 0 | 1;
    countdownLocked: 0 | 1;
  }) => void;
  onLocalDeath?: (score: number) => void;
};

export interface SimulationRefs {
  groundY: SharedValue<number>;
  posY: SharedValue<number>;
  velocityY: SharedValue<number>;
  gravityDirection: SharedValue<GravityDirection>;
  flipLockedUntilLanding: SharedValue<number>;
  frameIndex: SharedValue<number>;
  elapsedMs: SharedValue<number>;
  gameOver: SharedValue<number>;
  dying: SharedValue<number>;
  deathScore: SharedValue<number>;
  velocityX: SharedValue<number>;
  totalScroll: SharedValue<number>;
  initialized: SharedValue<number>;
  countdownLocked: SharedValue<number>;
  charX: SharedValue<number>;
  simTimeMs: SharedValue<number>;
  lastGroundedAtMs: SharedValue<number>;
  platformRects: SharedValue<number[]>;
  opponentPosY: SharedValue<number>;
  opponentGravity: SharedValue<number>;
  opponentAlive: SharedValue<number>;
  opponentFrameIndex: SharedValue<number>;
  opponentVelocityY: SharedValue<number>;
  opponentFlipLocked: SharedValue<number>;
  opponentCountdownLocked: SharedValue<number>;
}

export interface ScoreChunkState {
  chunks: Chunk[];
  scoreValue: SharedValue<number>;
  platforms: Platform[];
  chunkRefs: React.MutableRefObject<Chunk[]>;
}
