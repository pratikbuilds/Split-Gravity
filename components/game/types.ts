import type { SharedValue } from 'react-native-reanimated';
import type {
  Chunk,
  GameAudioEvent,
  GameResult,
  OpponentSnapshot,
  Platform,
  TerrainTheme,
} from '../../types/game';

export type GameCanvasProps = {
  onExit?: () => void;
  onGameOver?: (result: GameResult) => void;
  onAudioEvent?: (event: GameAudioEvent) => void;
  backgroundIndex?: number;
  terrainTheme?: TerrainTheme;
  initialGravityDirection?: 1 | -1;
  opponentInitialGravityDirection?: 1 | -1;
  opponentSnapshotValue?: SharedValue<OpponentSnapshot | null>;
  opponentConnectionState?: 'connected' | 'reconnecting' | 'forfeit_pending';
  opponentName?: string;
  onFlipInput?: () => void;
  onLocalState?: (payload: {
    normalizedY: number;
    gravityDir: 1 | -1;
    scroll: number;
    alive: boolean;
    score: number;
  }) => void;
  onLocalDeath?: (score: number) => void;
};

export interface SimulationRefs {
  groundY: SharedValue<number>;
  posY: SharedValue<number>;
  velocityY: SharedValue<number>;
  gravityDirection: SharedValue<number>;
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
}

export interface ScoreChunkState {
  chunks: Chunk[];
  scoreValue: SharedValue<number>;
  platforms: Platform[];
  chunkRefs: React.MutableRefObject<Chunk[]>;
}
