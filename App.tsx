import { useCallback, useEffect, useRef, useState } from 'react';
import { Asset } from 'expo-asset';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { InteractionManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { AppProviders } from 'components/AppProviders';
import { CharacterSelectScreen } from 'components/CharacterSelectScreen';
import { GameCanvas } from 'components/GameCanvas';
import { MultiplayerModeSelectScreen } from 'components/MultiplayerModeSelectScreen';
import { PaidModeSetupScreen } from 'components/PaidModeSetupScreen';
import {
  CHARACTER_STARTUP_ASSETS,
  GAME_ENVIRONMENT_ASSETS,
  getCharacterAssets,
} from 'components/game/worldAssetSources';
import { HomeScreen } from 'components/HomeScreen';
import { LobbyScreen } from 'components/multiplayer/LobbyScreen';
import { SingleModeSelectScreen } from 'components/SingleModeSelectScreen';
import { WalletDebugScreen } from 'components/wallet/WalletDebugScreen';
import { DEFAULT_CHARACTER_ID, isCharacterId, type CharacterId } from './shared/characters';
import { backendApi } from './services/backend/api';
import { getRandomBackgroundIndex } from './utils/backgrounds';
import type {
  GameAudioEvent,
  GameMode,
  GameResult,
  MultiplayerResult,
  OpponentSnapshot,
  TerrainTheme,
} from './types/game';
import type {
  HomeScreenRoute,
  MultiplayerMenuMode,
  PaidSetupResult,
  SinglePlayerMenuMode,
} from './types/payments';
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
const SELECTED_CHARACTER_STORAGE_KEY = 'my-expo-app:selected-character-id';

function getRandomTerrainTheme(previousTheme?: TerrainTheme): TerrainTheme {
  if (TERRAIN_THEMES.length === 1) return TERRAIN_THEMES[0];
  const candidates = previousTheme
    ? TERRAIN_THEMES.filter((theme) => theme !== previousTheme)
    : TERRAIN_THEMES;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function AppContent() {
  const [screen, setScreen] = useState<HomeScreenRoute>('home');
  const [mode, setMode] = useState<GameMode>('single_practice');
  const [gameKey, setGameKey] = useState(0);
  const [lastResult, setLastResult] = useState<GameResult | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [backgroundIndex, setBackgroundIndex] = useState(() => getRandomBackgroundIndex());
  const [terrainTheme, setTerrainTheme] = useState<TerrainTheme>(() => getRandomTerrainTheme());
  const [selectedCharacterId, setSelectedCharacterId] = useState<CharacterId>(DEFAULT_CHARACTER_ID);
  const [isMuted, setIsMuted] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [localMultiplayerDeathScore, setLocalMultiplayerDeathScore] = useState<number | null>(null);
  const [pendingPaidSession, setPendingPaidSession] = useState<PaidSetupResult | null>(null);
  const [paidRunSubmissionPending, setPaidRunSubmissionPending] = useState(false);
  const [paidRunSubmissionError, setPaidRunSubmissionError] = useState<string | null>(null);

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
    !mode.startsWith('multi_') || !localPlayerId || !opponentPlayerId
      ? true
      : localPlayerId.localeCompare(opponentPlayerId) <= 0;
  const localInitialGravityDirection: 1 | -1 = localStartsBottom ? 1 : -1;
  const opponentInitialGravityDirection: 1 | -1 = localStartsBottom ? -1 : 1;
  const opponentSnapshotValue = useSharedValue<OpponentSnapshot | null>(null);

  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  const audioReadyRef = useRef(audioReady);
  audioReadyRef.current = audioReady;
  const soundsRef = useRef<Awaited<ReturnType<typeof loadSounds>> | null>(null);
  const audioSetupPromiseRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);
  const assetPreloadPromisesRef = useRef(new Map<number, Promise<void>>());

  const preloadAssets = useCallback(async (sources: readonly number[]) => {
    const uniqueSources = Array.from(new Set(sources));
    const pendingSources = uniqueSources.filter(
      (source) => !assetPreloadPromisesRef.current.has(source)
    );

    if (pendingSources.length > 0) {
      const loadPromise = Asset.loadAsync(pendingSources)
        .then(() => undefined)
        .catch((error) => {
          pendingSources.forEach((source) => {
            assetPreloadPromisesRef.current.delete(source);
          });
          throw error;
        });

      pendingSources.forEach((source) => {
        assetPreloadPromisesRef.current.set(source, loadPromise);
      });
    }

    try {
      await Promise.all(
        uniqueSources
          .map((source) => assetPreloadPromisesRef.current.get(source))
          .filter((promise): promise is Promise<void> => promise != null)
      );
    } catch (error) {
      console.warn('Asset preload failed:', error);
    }
  }, []);

  const preloadGameEnvironment = useCallback(() => {
    void preloadAssets(GAME_ENVIRONMENT_ASSETS);
  }, [preloadAssets]);

  const preloadCharacters = useCallback(
    (characterIds: readonly (CharacterId | null | undefined)[]) => {
      const characterAssets = getCharacterAssets(characterIds);
      if (characterAssets.length === 0) return;
      void preloadAssets(characterAssets);
    },
    [preloadAssets]
  );

  const ensureAudioReady = useCallback(async () => {
    if (soundsRef.current) {
      if (!audioReadyRef.current && mountedRef.current) {
        audioReadyRef.current = true;
        setAudioReady(true);
      }
      return;
    }

    if (!audioSetupPromiseRef.current) {
      audioSetupPromiseRef.current = (async () => {
        await configureAudioMode();
        const sounds = await loadSounds();
        if (!mountedRef.current) {
          await unloadSounds(sounds);
          return;
        }
        soundsRef.current = sounds;
        audioReadyRef.current = true;
        setAudioReady(true);
      })().catch((error) => {
        audioSetupPromiseRef.current = null;
        audioReadyRef.current = false;
        throw error;
      });
    }

    try {
      await audioSetupPromiseRef.current;
    } catch (error) {
      console.warn('Audio setup failed:', error);
    }
  }, []);

  const triggerSound = useCallback(
    (event: GameAudioEvent) => {
      const loadedSounds = soundsRef.current;
      if (!loadedSounds || !audioReadyRef.current) {
        void ensureAudioReady();
        return;
      }
      const soundKey = mapGameEventToSound(event);
      void playSound(loadedSounds, soundKey, isMutedRef.current);
    },
    [ensureAudioReady]
  );

  useEffect(() => {
    preloadGameEnvironment();
  }, [preloadGameEnvironment]);

  useEffect(() => {
    preloadCharacters([selectedCharacterId]);
  }, [preloadCharacters, selectedCharacterId]);

  useEffect(() => {
    let active = true;

    const hydrateSelectedCharacter = async () => {
      try {
        const storedCharacterId = await AsyncStorage.getItem(SELECTED_CHARACTER_STORAGE_KEY);
        if (!active || !storedCharacterId) return;

        if (isCharacterId(storedCharacterId)) {
          setSelectedCharacterId(storedCharacterId);
          return;
        }

        await AsyncStorage.setItem(SELECTED_CHARACTER_STORAGE_KEY, DEFAULT_CHARACTER_ID);
      } catch (error) {
        console.warn('Character selection storage unavailable:', error);
      }
    };

    void hydrateSelectedCharacter();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = multiplayerController.subscribe((state) => {
      setMultiplayerState(state);
    });
    const unsubscribeOpponent = multiplayerController.subscribeOpponentSnapshot((snapshot) => {
      opponentSnapshotValue.value = snapshot;
    });

    const heartbeat = setInterval(() => {
      multiplayerController.sendHeartbeat();
    }, 3000);

    return () => {
      clearInterval(heartbeat);
      unsubscribeOpponent();
      unsubscribe();
      multiplayerController.disconnect();
      opponentSnapshotValue.value = null;
    };
  }, [multiplayerController, opponentSnapshotValue]);

  useEffect(() => {
    preloadCharacters([
      multiplayerState.localPlayer?.characterId,
      multiplayerState.opponent?.characterId,
    ]);
  }, [
    multiplayerState.localPlayer?.characterId,
    multiplayerState.opponent?.characterId,
    preloadCharacters,
  ]);

  useEffect(() => {
    if (screen !== 'character_select') return;

    const task = InteractionManager.runAfterInteractions(() => {
      void preloadAssets(CHARACTER_STARTUP_ASSETS);
    });

    return () => {
      task.cancel();
    };
  }, [preloadAssets, screen]);

  useEffect(() => {
    if (!mode.startsWith('multi_')) return;
    if (multiplayerState.matchStatus !== 'running') return;
    if (!hasMultiplayerPair) return;

    preloadGameEnvironment();
    preloadCharacters([selectedCharacterId, multiplayerState.opponent?.characterId]);
    void ensureAudioReady();
    setBackgroundIndex((previousIndex) => getRandomBackgroundIndex(previousIndex));
    setTerrainTheme((previousTheme) => getRandomTerrainTheme(previousTheme));
    setLocalMultiplayerDeathScore(null);
    setGameOver(false);
    setLastResult(null);
    setGameKey((k) => k + 1);
    setScreen('game');
  }, [
    hasMultiplayerPair,
    mode,
    multiplayerState.matchStatus,
    multiplayerState.opponent?.characterId,
    ensureAudioReady,
    preloadGameEnvironment,
    preloadCharacters,
    selectedCharacterId,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    void ensureAudioReady();

    return () => {
      mountedRef.current = false;
      audioSetupPromiseRef.current = null;
      audioReadyRef.current = false;
      const loadedSounds = soundsRef.current;
      soundsRef.current = null;
      if (loadedSounds) {
        void unloadSounds(loadedSounds);
      }
    };
  }, [ensureAudioReady]);

  const submitPaidRunResult = useCallback(
    async (result: GameResult) => {
      if (
        mode !== 'single_paid_contest' ||
        !pendingPaidSession?.runSessionId ||
        !pendingPaidSession.accessToken
      ) {
        return;
      }

      setPaidRunSubmissionPending(true);
      setPaidRunSubmissionError(null);

      const delays = [0, 750, 2_000];
      let lastError: unknown;
      for (const delay of delays) {
        if (delay > 0) {
          await wait(delay);
        }

        try {
          await backendApi.submitRunResult(
            pendingPaidSession.accessToken,
            pendingPaidSession.runSessionId,
            {
              distance: result.playerScore,
              finishedAt: new Date().toISOString(),
            }
          );
          setPaidRunSubmissionPending(false);
          setPaidRunSubmissionError(null);
          return;
        } catch (error) {
          lastError = error;
        }
      }

      setPaidRunSubmissionPending(false);
      setPaidRunSubmissionError(
        lastError instanceof Error ? lastError.message : 'Paid run submission failed.'
      );
    },
    [mode, pendingPaidSession]
  );

  const handleSinglePlayerGameOver = (result: GameResult) => {
    if (!mode.startsWith('single_')) return;
    setLastResult(result);
    setGameOver(true);
    setPaidRunSubmissionError(null);

    if (
      mode === 'single_paid_contest' &&
      pendingPaidSession?.runSessionId &&
      pendingPaidSession.accessToken
    ) {
      void submitPaidRunResult(result);
      return;
    }

    setPaidRunSubmissionPending(false);
  };

  const handleRestart = () => {
    if (mode === 'single_paid_contest' && pendingPaidSession) {
      return;
    }
    preloadGameEnvironment();
    preloadCharacters([selectedCharacterId]);
    void ensureAudioReady();
    setGameOver(false);
    setBackgroundIndex((previousIndex) => getRandomBackgroundIndex(previousIndex));
    setTerrainTheme((previousTheme) => getRandomTerrainTheme(previousTheme));
    setGameKey((k) => k + 1);
  };

  const handleSinglePlay = useCallback(() => {
    preloadGameEnvironment();
    preloadCharacters([selectedCharacterId]);
    void ensureAudioReady();
    setMode('single_practice');
    setGameOver(false);
    setLastResult(null);
    setPendingPaidSession(null);
    setPaidRunSubmissionPending(false);
    setPaidRunSubmissionError(null);
    setBackgroundIndex((previousIndex) => getRandomBackgroundIndex(previousIndex));
    setTerrainTheme((previousTheme) => getRandomTerrainTheme(previousTheme));
    setGameKey((k) => k + 1);
    setScreen('game');
  }, [ensureAudioReady, preloadCharacters, preloadGameEnvironment, selectedCharacterId]);

  const handleMultiplay = () => {
    setScreen('multi_mode_select');
  };

  const handleOpenCharacterSelect = useCallback(() => {
    setScreen('character_select');
  }, []);

  const handleReturnHome = useCallback(() => {
    setScreen('home');
  }, []);

  const handleConfirmCharacter = useCallback(async (characterId: CharacterId) => {
    setSelectedCharacterId(characterId);
    setScreen('home');
    try {
      await AsyncStorage.setItem(SELECTED_CHARACTER_STORAGE_KEY, characterId);
    } catch (error) {
      console.warn('Persisting character selection failed:', error);
    }
  }, []);

  const handleExitToHome = () => {
    triggerSound('land');
    setGameOver(false);
    setLastResult(null);
    setLocalMultiplayerDeathScore(null);
    setPaidRunSubmissionPending(false);
    setPaidRunSubmissionError(null);
    if (mode.startsWith('multi_')) {
      multiplayerController.disconnect();
      multiplayerController.resetLobbyState();
      setMode('single_practice');
    }
    setPendingPaidSession(null);
    setScreen('home');
  };

  const handleToggleMute = () => {
    setIsMuted((prev) => !prev);
  };

  const handleCreateRoom = useCallback(
    (nickname: string) => {
      multiplayerController.createRoom(nickname, selectedCharacterId, {
        accessToken: pendingPaidSession?.accessToken,
        roomKind: mode === 'multi_paid_private' ? 'paid_private' : 'casual',
        tokenId: pendingPaidSession?.selection.token.id,
        entryFeeTierId: pendingPaidSession?.selection.entryFeeTier.id,
        paymentIntentId: pendingPaidSession?.paymentIntentId,
      });
    },
    [mode, multiplayerController, pendingPaidSession, selectedCharacterId]
  );

  const handleJoinRoom = useCallback(
    (roomCode: string, nickname: string) => {
      multiplayerController.joinRoom(roomCode, nickname, selectedCharacterId, {
        accessToken: pendingPaidSession?.accessToken,
        roomKind: mode === 'multi_paid_private' ? 'paid_private' : 'casual',
        tokenId: pendingPaidSession?.selection.token.id,
        entryFeeTierId: pendingPaidSession?.selection.entryFeeTier.id,
        paymentIntentId: pendingPaidSession?.paymentIntentId,
      });
    },
    [mode, multiplayerController, pendingPaidSession, selectedCharacterId]
  );

  const handleReadyRoom = useCallback(() => {
    multiplayerController.readyUp();
  }, [multiplayerController]);

  const handleJoinPaidQueue = useCallback(
    (nickname: string) => {
      if (!pendingPaidSession?.accessToken) return;
      multiplayerController.joinPaidQueue(nickname, selectedCharacterId, {
        accessToken: pendingPaidSession.accessToken,
        tokenId: pendingPaidSession.selection.token.id,
        entryFeeTierId: pendingPaidSession.selection.entryFeeTier.id,
        paymentIntentId: pendingPaidSession.paymentIntentId,
      });
    },
    [multiplayerController, pendingPaidSession, selectedCharacterId]
  );

  const handleLeavePaidQueue = useCallback(() => {
    multiplayerController.leavePaidQueue();
  }, [multiplayerController]);

  const openSingleModeSelect = useCallback(() => {
    setScreen('single_mode_select');
  }, []);

  const handleSingleModeSelect = useCallback(
    (nextMode: SinglePlayerMenuMode) => {
      if (nextMode === 'practice') {
        handleSinglePlay();
        return;
      }

      setScreen('single_paid_setup');
    },
    [handleSinglePlay]
  );

  const handleMultiplayerModeSelect = useCallback(
    (nextMode: MultiplayerMenuMode) => {
      if (nextMode === 'casual_room') {
        setMode('multi_casual');
        setPendingPaidSession(null);
        setGameOver(false);
        setLastResult(null);
        setLocalMultiplayerDeathScore(null);
        multiplayerController.resetLobbyState();
        setScreen('lobby');
        return;
      }

      setMode(nextMode === 'paid_private_room' ? 'multi_paid_private' : 'multi_paid_queue');
      setScreen('multi_paid_setup');
    },
    [multiplayerController]
  );

  const handlePaidSetupComplete = useCallback(
    (result: PaidSetupResult) => {
      setPendingPaidSession(result);
      setGameOver(false);
      setLastResult(null);
      setLocalMultiplayerDeathScore(null);
      setPaidRunSubmissionPending(false);
      setPaidRunSubmissionError(null);

      if (result.selection.purpose === 'single_paid_contest') {
        preloadGameEnvironment();
        preloadCharacters([selectedCharacterId]);
        void ensureAudioReady();
        setMode('single_paid_contest');
        setBackgroundIndex((previousIndex) => getRandomBackgroundIndex(previousIndex));
        setTerrainTheme((previousTheme) => getRandomTerrainTheme(previousTheme));
        setGameKey((k) => k + 1);
        setScreen('game');
        return;
      }

      multiplayerController.resetLobbyState();
      setScreen('lobby');
    },
    [
      ensureAudioReady,
      multiplayerController,
      preloadCharacters,
      preloadGameEnvironment,
      selectedCharacterId,
    ]
  );

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
      frameIndex: number;
      velocityY: number;
      flipLocked: 0 | 1;
      countdownLocked: 0 | 1;
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
  const isPaidContestRun = mode === 'single_paid_contest' && Boolean(pendingPaidSession);
  const handleRetryPaidSubmission = useCallback(() => {
    if (!lastResult) return;
    void submitPaidRunResult(lastResult);
  }, [lastResult, submitPaidRunResult]);

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.root}>
        {screen === 'home' ? (
          <HomeScreen
            selectedCharacterId={selectedCharacterId}
            onSinglePlay={openSingleModeSelect}
            onMultiplay={handleMultiplay}
            onOpenCharacterSelect={handleOpenCharacterSelect}
            onOpenWalletDebug={__DEV__ ? () => setScreen('wallet_debug') : undefined}
          />
        ) : null}

        {screen === 'character_select' ? (
          <CharacterSelectScreen
            selectedCharacterId={selectedCharacterId}
            onBack={handleReturnHome}
            onConfirm={handleConfirmCharacter}
          />
        ) : null}

        {screen === 'wallet_debug' ? <WalletDebugScreen onBack={handleReturnHome} /> : null}

        {screen === 'single_mode_select' ? (
          <SingleModeSelectScreen onBack={handleReturnHome} onSelect={handleSingleModeSelect} />
        ) : null}

        {screen === 'multi_mode_select' ? (
          <MultiplayerModeSelectScreen
            onBack={handleReturnHome}
            onSelect={handleMultiplayerModeSelect}
          />
        ) : null}

        {screen === 'single_paid_setup' ? (
          <PaidModeSetupScreen
            purpose="single_paid_contest"
            onBack={() => setScreen('single_mode_select')}
            onComplete={handlePaidSetupComplete}
          />
        ) : null}

        {screen === 'multi_paid_setup' ? (
          <PaidModeSetupScreen
            purpose={mode === 'multi_paid_queue' ? 'multi_paid_queue' : 'multi_paid_private'}
            onBack={() => setScreen('multi_mode_select')}
            onComplete={handlePaidSetupComplete}
          />
        ) : null}

        {screen === 'lobby' ? (
          <LobbyScreen
            state={multiplayerState}
            onBack={handleExitToHome}
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            onJoinQueue={handleJoinPaidQueue}
            onLeaveQueue={handleLeavePaidQueue}
            onReady={handleReadyRoom}
            mode={mode}
            paidSession={pendingPaidSession}
          />
        ) : null}

        {screen === 'game' ? (
          <>
            <GameCanvas
              restartKey={gameKey}
              onExit={handleExitToHome}
              onGameOver={handleSinglePlayerGameOver}
              onAudioEvent={triggerSound}
              backgroundIndex={backgroundIndex}
              terrainTheme={terrainTheme}
              initialGravityDirection={localInitialGravityDirection}
              characterId={selectedCharacterId}
              opponentCharacterId={
                mode.startsWith('multi_') ? multiplayerState.opponent?.characterId : undefined
              }
              opponentInitialGravityDirection={opponentInitialGravityDirection}
              opponentSnapshotValue={mode.startsWith('multi_') ? opponentSnapshotValue : undefined}
              opponentName={
                mode.startsWith('multi_') ? multiplayerState.opponent?.nickname : undefined
              }
              opponentConnectionState={
                mode.startsWith('multi_') ? multiplayerState.connectionState : 'connected'
              }
              onFlipInput={mode.startsWith('multi_') ? handleFlipInput : undefined}
              onLocalState={mode.startsWith('multi_') ? handleLocalState : undefined}
              onLocalDeath={mode.startsWith('multi_') ? handleLocalDeath : undefined}
            />

            {mode.startsWith('single_') && gameOver && (
              <View style={styles.gameOverOverlay}>
                <View style={styles.gameOverBackdrop} />
                <View style={styles.gameOverModal}>
                  <Text style={styles.gameOverTitle}>Game Over</Text>
                  <Text style={styles.gameOverSubtitle}>You fell into the ditch!</Text>
                  <Text style={styles.scoreText}>Score: {lastResult?.playerScore ?? 0}m</Text>
                  {isPaidContestRun && paidRunSubmissionPending ? (
                    <Text style={styles.gameOverSubtitle}>Submitting paid run...</Text>
                  ) : null}
                  {isPaidContestRun && paidRunSubmissionError ? (
                    <Text style={styles.gameOverErrorText}>{paidRunSubmissionError}</Text>
                  ) : null}
                  <View style={styles.gameOverButtons}>
                    {mode === 'single_practice' ? (
                      <Pressable style={styles.restartButton} onPress={handleRestart}>
                        <Text style={styles.buttonText}>Restart</Text>
                      </Pressable>
                    ) : paidRunSubmissionError ? (
                      <Pressable style={styles.restartButton} onPress={handleRetryPaidSubmission}>
                        <Text style={styles.buttonText}>Retry Submission</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        style={[
                          styles.restartButton,
                          paidRunSubmissionPending ? styles.disabledButton : null,
                        ]}
                        disabled={paidRunSubmissionPending}
                        onPress={() => {
                          setPendingPaidSession(null);
                          setPaidRunSubmissionPending(false);
                          setPaidRunSubmissionError(null);
                          setScreen('single_mode_select');
                        }}>
                        <Text style={styles.buttonText}>
                          {paidRunSubmissionPending ? 'Submitting...' : 'Play Again'}
                        </Text>
                      </Pressable>
                    )}
                    <Pressable style={styles.exitButton} onPress={handleExitToHome}>
                      <Text style={styles.buttonText}>Exit</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}

            {mode.startsWith('multi_') && (
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
                      <Text style={styles.gameOverSubtitle}>
                        Reason: {multiplayerResult.reason}
                      </Text>
                      {multiplayerResult.settlementTransactionSignature ? (
                        <Text style={styles.gameOverSubtitle}>
                          Tx: {multiplayerResult.settlementTransactionSignature.slice(0, 12)}...
                        </Text>
                      ) : null}
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

        {screen !== 'character_select' ? (
          <View pointerEvents="box-none" style={styles.audioControlWrapper}>
            <Pressable style={styles.audioToggleButton} onPress={handleToggleMute}>
              <Text style={styles.audioToggleText}>{isMuted ? 'SOUND OFF' : 'SOUND ON'}</Text>
            </Pressable>
          </View>
        ) : null}

        <StatusBar style="auto" />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
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
  gameOverErrorText: {
    marginTop: 8,
    color: '#fecaca',
    textAlign: 'center',
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
  disabledButton: {
    opacity: 0.7,
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
