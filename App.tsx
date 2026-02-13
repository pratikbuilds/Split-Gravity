import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GameCanvas } from 'components/GameCanvas';
import { HomeScreen } from 'components/HomeScreen';
import { LobbyScreen } from 'components/multiplayer/LobbyScreen';
import { getRandomBackgroundIndex } from './utils/backgrounds';
import type {
  GameAudioEvent,
  GameMode,
  GameResult,
  MultiplayerResult,
  TerrainTheme,
} from './types/game';
import {
  configureAudioMode,
  loadSounds,
  mapGameEventToSound,
  playSound,
  unloadSounds,
} from './utils/audio';
import {
  MultiplayerMatchController,
  type MultiplayerViewState,
} from './services/multiplayer/matchController';

import './global.css';

const TERRAIN_THEMES: TerrainTheme[] = ['grass', 'purple', 'stone'];

function getRandomTerrainTheme(previousTheme?: TerrainTheme): TerrainTheme {
  if (TERRAIN_THEMES.length === 1) return TERRAIN_THEMES[0];
  const candidates = previousTheme
    ? TERRAIN_THEMES.filter((theme) => theme !== previousTheme)
    : TERRAIN_THEMES;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export default function App() {
  const [screen, setScreen] = useState<'home' | 'lobby' | 'game'>('home');
  const [mode, setMode] = useState<GameMode>('single');
  const [gameKey, setGameKey] = useState(0);
  const [lastResult, setLastResult] = useState<GameResult | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [backgroundIndex, setBackgroundIndex] = useState(() => getRandomBackgroundIndex());
  const [terrainTheme, setTerrainTheme] = useState<TerrainTheme>(() => getRandomTerrainTheme());
  const [isMuted, setIsMuted] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [localMultiplayerDeathScore, setLocalMultiplayerDeathScore] = useState<number | null>(null);

  const multiplayerControllerRef = useRef<MultiplayerMatchController | null>(null);
  if (!multiplayerControllerRef.current) {
    multiplayerControllerRef.current = new MultiplayerMatchController();
  }
  const multiplayerController = multiplayerControllerRef.current;
  const [multiplayerState, setMultiplayerState] = useState<MultiplayerViewState>(
    multiplayerController.getState()
  );
  const localPlayerId = multiplayerState.localPlayer?.playerId ?? null;
  const opponentPlayerId = multiplayerState.opponent?.playerId ?? null;
  const hasMultiplayerPair = Boolean(localPlayerId && opponentPlayerId);
  const localStartsBottom =
    mode !== 'multi' || !localPlayerId || !opponentPlayerId
      ? true
      : localPlayerId.localeCompare(opponentPlayerId) <= 0;
  const localInitialGravityDirection: 1 | -1 = localStartsBottom ? 1 : -1;
  const opponentInitialGravityDirection: 1 | -1 = localStartsBottom ? -1 : 1;

  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  const soundsRef = useRef<Awaited<ReturnType<typeof loadSounds>> | null>(null);

  const triggerSound = useCallback(
    (event: GameAudioEvent) => {
      const loadedSounds = soundsRef.current;
      if (!loadedSounds || !audioReady) return;
      const soundKey = mapGameEventToSound(event);
      void playSound(loadedSounds, soundKey, isMutedRef.current);
    },
    [audioReady]
  );

  useEffect(() => {
    const unsubscribe = multiplayerController.subscribe((state) => {
      setMultiplayerState(state);
    });

    const heartbeat = setInterval(() => {
      multiplayerController.sendHeartbeat();
    }, 3000);

    return () => {
      clearInterval(heartbeat);
      unsubscribe();
      multiplayerController.disconnect();
    };
  }, [multiplayerController]);

  useEffect(() => {
    if (mode !== 'multi') return;
    if (multiplayerState.matchStatus !== 'running') return;
    if (!hasMultiplayerPair) return;

    triggerSound('run_start');
    setBackgroundIndex((previousIndex) => getRandomBackgroundIndex(previousIndex));
    setTerrainTheme((previousTheme) => getRandomTerrainTheme(previousTheme));
    setLocalMultiplayerDeathScore(null);
    setGameOver(false);
    setLastResult(null);
    setGameKey((k) => k + 1);
    setScreen('game');
  }, [hasMultiplayerPair, mode, multiplayerState.matchStatus, triggerSound]);

  useEffect(() => {
    let mounted = true;
    const setupAudio = async () => {
      try {
        await configureAudioMode();
        const sounds = await loadSounds();
        if (!mounted) {
          await unloadSounds(sounds);
          return;
        }
        soundsRef.current = sounds;
        setAudioReady(true);
      } catch (error) {
        console.warn('Audio setup failed:', error);
      }
    };

    setupAudio();
    return () => {
      mounted = false;
      const loadedSounds = soundsRef.current;
      soundsRef.current = null;
      if (loadedSounds) {
        void unloadSounds(loadedSounds);
      }
    };
  }, []);

  const handleSinglePlayerGameOver = (result: GameResult) => {
    if (mode !== 'single') return;
    setLastResult(result);
    setGameOver(true);
  };

  const handleRestart = () => {
    triggerSound('run_start');
    setGameOver(false);
    setBackgroundIndex((previousIndex) => getRandomBackgroundIndex(previousIndex));
    setTerrainTheme((previousTheme) => getRandomTerrainTheme(previousTheme));
    setGameKey((k) => k + 1);
  };

  const handleSinglePlay = () => {
    setMode('single');
    triggerSound('run_start');
    setGameOver(false);
    setLastResult(null);
    setBackgroundIndex((previousIndex) => getRandomBackgroundIndex(previousIndex));
    setTerrainTheme((previousTheme) => getRandomTerrainTheme(previousTheme));
    setGameKey((k) => k + 1);
    setScreen('game');
  };

  const handleMultiplay = () => {
    setMode('multi');
    setGameOver(false);
    setLastResult(null);
    setLocalMultiplayerDeathScore(null);
    multiplayerController.resetLobbyState();
    setScreen('lobby');
  };

  const handleExitToHome = () => {
    triggerSound('land');
    setGameOver(false);
    setLastResult(null);
    setLocalMultiplayerDeathScore(null);
    if (mode === 'multi') {
      multiplayerController.disconnect();
      multiplayerController.resetLobbyState();
      setMode('single');
    }
    setScreen('home');
  };

  const handleToggleMute = () => {
    setIsMuted((prev) => !prev);
  };

  const handleCreateRoom = useCallback(
    (nickname: string) => {
      multiplayerController.createRoom(nickname);
    },
    [multiplayerController]
  );

  const handleJoinRoom = useCallback(
    (roomCode: string, nickname: string) => {
      multiplayerController.joinRoom(roomCode, nickname);
    },
    [multiplayerController]
  );

  const handleReadyRoom = useCallback(() => {
    multiplayerController.readyUp();
  }, [multiplayerController]);

  const handleFlipInput = useCallback(() => {
    multiplayerController.sendInput('flip');
  }, [multiplayerController]);

  const handleLocalState = useCallback(
    (payload: {
      normalizedY: number;
      gravityDir: 1 | -1;
      scroll: number;
      alive: boolean;
      score: number;
    }) => {
      multiplayerController.sendState(payload);
    },
    [multiplayerController]
  );

  const handleLocalDeath = useCallback(
    (score: number) => {
      setLocalMultiplayerDeathScore(score);
      multiplayerController.reportDeath(score);
    },
    [multiplayerController]
  );

  const multiplayerResult: MultiplayerResult | null = multiplayerState.multiplayerResult;
  const didWin =
    multiplayerResult && localPlayerId ? multiplayerResult.winnerPlayerId === localPlayerId : false;

  return (
    <GestureHandlerRootView style={styles.root}>
      {screen === 'home' ? (
        <HomeScreen onSinglePlay={handleSinglePlay} onMultiplay={handleMultiplay} />
      ) : null}

      {screen === 'lobby' ? (
        <LobbyScreen
          state={multiplayerState}
          onBack={handleExitToHome}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onReady={handleReadyRoom}
        />
      ) : null}

      {screen === 'game' ? (
        <>
          <GameCanvas
            key={gameKey}
            onExit={handleExitToHome}
            onGameOver={handleSinglePlayerGameOver}
            onAudioEvent={triggerSound}
            backgroundIndex={backgroundIndex}
            terrainTheme={terrainTheme}
            initialGravityDirection={localInitialGravityDirection}
            opponentInitialGravityDirection={opponentInitialGravityDirection}
            opponentSnapshot={mode === 'multi' ? multiplayerState.opponentSnapshot : null}
            opponentName={mode === 'multi' ? multiplayerState.opponent?.nickname : undefined}
            opponentConnectionState={
              mode === 'multi' ? multiplayerState.connectionState : 'connected'
            }
            onFlipInput={mode === 'multi' ? handleFlipInput : undefined}
            onLocalState={mode === 'multi' ? handleLocalState : undefined}
            onLocalDeath={mode === 'multi' ? handleLocalDeath : undefined}
          />

          {mode === 'single' && gameOver && (
            <View style={styles.gameOverOverlay}>
              <View style={styles.gameOverBackdrop} />
              <View style={styles.gameOverModal}>
                <Text style={styles.gameOverTitle}>Game Over</Text>
                <Text style={styles.gameOverSubtitle}>You fell into the ditch!</Text>
                <Text style={styles.scoreText}>Score: {lastResult?.playerScore ?? 0}m</Text>
                <View style={styles.gameOverButtons}>
                  <Pressable style={styles.restartButton} onPress={handleRestart}>
                    <Text style={styles.buttonText}>Restart</Text>
                  </Pressable>
                  <Pressable style={styles.exitButton} onPress={handleExitToHome}>
                    <Text style={styles.buttonText}>Exit</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          {mode === 'multi' && (
            <>
              {localMultiplayerDeathScore !== null && !multiplayerResult && (
                <View style={styles.statusChipWrap}>
                  <View style={styles.statusChip}>
                    <Text style={styles.statusChipText}>
                      You are down. Waiting for server result…
                    </Text>
                  </View>
                </View>
              )}

              {multiplayerState.connectionState === 'forfeit_pending' &&
                multiplayerState.reconnectSecondsRemaining !== null && (
                  <View style={styles.statusChipWrap}>
                    <View style={styles.warningChip}>
                      <Text style={styles.statusChipText}>
                        Reconnect in {multiplayerState.reconnectSecondsRemaining}s or forfeit
                      </Text>
                    </View>
                  </View>
                )}

              {multiplayerResult && (
                <View style={styles.gameOverOverlay}>
                  <View style={styles.gameOverBackdrop} />
                  <View style={styles.gameOverModal}>
                    <Text style={styles.gameOverTitle}>{didWin ? 'You Win' : 'You Lose'}</Text>
                    <Text style={styles.gameOverSubtitle}>Reason: {multiplayerResult.reason}</Text>
                    <View style={styles.gameOverButtons}>
                      <Pressable
                        style={styles.restartButton}
                        onPress={() => {
                          multiplayerController.resetLobbyState();
                          setLocalMultiplayerDeathScore(null);
                          setScreen('lobby');
                        }}>
                        <Text style={styles.buttonText}>Lobby</Text>
                      </Pressable>
                      <Pressable style={styles.exitButton} onPress={handleExitToHome}>
                        <Text style={styles.buttonText}>Exit</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              )}
            </>
          )}
        </>
      ) : null}

      <View style={styles.audioControlWrapper}>
        <Pressable style={styles.audioToggleButton} onPress={handleToggleMute}>
          <Text style={styles.audioToggleText}>{isMuted ? 'SOUND OFF' : 'SOUND ON'}</Text>
        </Pressable>
      </View>

      <StatusBar style="auto" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gameOverOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  gameOverBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  gameOverModal: {
    backgroundColor: 'rgba(26,26,46,0.95)',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    minWidth: 280,
  },
  gameOverTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: '#e94560',
    marginBottom: 8,
  },
  gameOverSubtitle: {
    fontSize: 16,
    color: '#a0a0a0',
    marginBottom: 8,
  },
  scoreText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#ffffff',
  },
  gameOverButtons: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 20,
  },
  restartButton: {
    backgroundColor: '#e94560',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  exitButton: {
    backgroundColor: '#4a4a6a',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  statusChipWrap: {
    position: 'absolute',
    top: 96,
    alignSelf: 'center',
    zIndex: 25,
  },
  statusChip: {
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.9)',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  warningChip: {
    borderRadius: 999,
    backgroundColor: 'rgba(127,29,29,0.92)',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  statusChipText: {
    color: '#f1f5f9',
    fontWeight: '700',
    fontSize: 12,
  },
  audioControlWrapper: {
    position: 'absolute',
    right: 16,
    top: 52,
    zIndex: 20,
  },
  audioToggleButton: {
    minWidth: 120,
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(14, 18, 27, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  audioToggleText: {
    color: '#f5f7fb',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
