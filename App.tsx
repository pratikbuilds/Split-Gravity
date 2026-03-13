import { useCallback, useEffect, useRef, useState } from 'react';
import { Asset } from 'expo-asset';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { InteractionManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { AppProviders } from 'components/AppProviders';
import { CharacterGenerationScreen } from 'components/CharacterGenerationScreen';
import { CharacterSelectScreen } from 'components/CharacterSelectScreen';
import { GameCanvas } from 'components/GameCanvas';
import { MultiplayerModeSelectScreen } from 'components/MultiplayerModeSelectScreen';
import { PaidModeSetupScreen } from 'components/PaidModeSetupScreen';
import { PostPaymentSuccessScreen } from 'components/PostPaymentSuccessScreen';
import {
  CHARACTER_STARTUP_ASSETS,
  GAME_ENVIRONMENT_ASSETS,
  getCharacterAssets,
} from 'components/game/worldAssetSources';
import { preloadSkiaImages } from 'components/game/skiaImageCache';
import { HomeScreen } from 'components/HomeScreen';
import { LeaderboardScreen } from 'components/LeaderboardScreen';
import { LobbyScreen } from 'components/multiplayer/LobbyScreen';
import { SingleModeSelectScreen } from 'components/SingleModeSelectScreen';
import { WalletDebugScreen } from 'components/wallet/WalletDebugScreen';
import { DEFAULT_CHARACTER_ID, isCharacterId, type CharacterId } from './shared/characters';
import type {
  CustomCharacterSummary,
  CustomCharacterVersionSummary,
} from './shared/character-generation-contracts';
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
  PostPaymentHandoff,
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
import { useWalletSession } from './hooks/useWalletSession';

import './global.css';

const TERRAIN_THEMES: TerrainTheme[] = ['grass', 'purple', 'stone'];
const SELECTED_CHARACTER_STORAGE_KEY = 'my-expo-app:selected-character-id';
const SELECTED_CUSTOM_CHARACTER_STORAGE_KEY = 'my-expo-app:selected-custom-character';

type StoredSelectedCustomCharacter = {
  character: CustomCharacterSummary;
  walletAddress: string;
};

const parseStoredSelectedCustomCharacter = (raw: string): StoredSelectedCustomCharacter | null => {
  try {
    const parsed = JSON.parse(raw) as StoredSelectedCustomCharacter | CustomCharacterSummary;
    if ('character' in parsed && 'walletAddress' in parsed) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
};

const serializeStoredSelectedCustomCharacter = (
  character: CustomCharacterSummary,
  walletAddress: string
) =>
  JSON.stringify({
    character,
    walletAddress,
  } satisfies StoredSelectedCustomCharacter);

function getRandomTerrainTheme(previousTheme?: TerrainTheme): TerrainTheme {
  if (TERRAIN_THEMES.length === 1) return TERRAIN_THEMES[0];
  const candidates = previousTheme
    ? TERRAIN_THEMES.filter((theme) => theme !== previousTheme)
    : TERRAIN_THEMES;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function hashStringToSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const buildPostPaymentHandoff = (result: PaidSetupResult): PostPaymentHandoff => {
  switch (result.selection.purpose) {
    case 'single_paid_contest':
      return {
        kind: 'single_paid_contest',
        eyebrow: 'Payment Received',
        title: 'Your Run Is Locked In',
        subtitle: result.selection.contest?.title
          ? `${result.selection.contest.title} is ready for you. Take a breath, then launch when you are ready.`
          : 'Your paid contest entry is secured. Take a breath, then launch when you are ready.',
        primaryActionLabel: 'Start Run',
        primaryHelperText:
          'We will open your contest run only after you tap start. Until then, this entry stays refundable.',
        refundLabel: 'Refund Entry',
        refundHelperText: 'Back out before the run begins and your funded entry will be returned.',
      };
    case 'multi_paid_private':
      return {
        kind: 'multi_paid_private',
        eyebrow: 'Stake Secured',
        title: 'You Are Funded For A Duel',
        subtitle:
          'Your private match stake is confirmed. Head into the lobby when you are ready to create or join a room.',
        primaryActionLabel: 'Enter Lobby',
        primaryHelperText:
          'Next you will choose your room flow and ready up once both players are funded.',
        refundLabel: 'Refund Stake',
        refundHelperText:
          'If the duel is off, back out now and reclaim the entry before the match starts.',
      };
    case 'multi_paid_queue':
      return {
        kind: 'multi_paid_queue',
        eyebrow: 'Queue Ticket Secured',
        title: 'You Are Ready For Matchmaking',
        subtitle:
          'Your public matchmaking stake is confirmed. Continue when you are ready to set your nickname and join the live queue.',
        primaryActionLabel: 'Continue To Matchmaking',
        primaryHelperText:
          'The next screen will take you into the queue flow so you can join a funded match with confidence.',
        refundLabel: 'Refund Stake',
        refundHelperText: 'Need to step away? Refund now before you enter matchmaking.',
      };
  }

  throw new Error(`Unsupported post-payment purpose: ${String(result.selection.purpose)}`);
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

function AppContent() {
  const walletSession = useWalletSession();
  const [screen, setScreen] = useState<HomeScreenRoute>('home');
  const [mode, setMode] = useState<GameMode>('single_practice');
  const [gameKey, setGameKey] = useState(0);
  const [levelSeed, setLevelSeed] = useState<number | undefined>(undefined);
  const [lastResult, setLastResult] = useState<GameResult | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [backgroundIndex, setBackgroundIndex] = useState(() => getRandomBackgroundIndex());
  const [terrainTheme, setTerrainTheme] = useState<TerrainTheme>(() => getRandomTerrainTheme());
  const [selectedCharacterId, setSelectedCharacterId] = useState<CharacterId>(DEFAULT_CHARACTER_ID);
  const [selectedCustomCharacter, setSelectedCustomCharacter] =
    useState<CustomCharacterSummary | null>(null);
  const [opponentCustomCharacter, setOpponentCustomCharacter] =
    useState<CustomCharacterVersionSummary | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [localMultiplayerDeathScore, setLocalMultiplayerDeathScore] = useState<number | null>(null);
  const [pendingPaidSession, setPendingPaidSession] = useState<PaidSetupResult | null>(null);
  const [postPaymentHandoff, setPostPaymentHandoff] = useState<PostPaymentHandoff | null>(null);
  const [postPaymentActionPending, setPostPaymentActionPending] = useState(false);
  const [postPaymentRefundPending, setPostPaymentRefundPending] = useState(false);
  const [postPaymentError, setPostPaymentError] = useState<string | null>(null);
  const [paidRunSubmissionPending, setPaidRunSubmissionPending] = useState(false);
  const [paidRunSubmissionError, setPaidRunSubmissionError] = useState<string | null>(null);

  const multiplayerControllerRef = useRef<MultiplayerMatchController | null>(null);
  const activeMultiplayerStartAtRef = useRef<number | null>(null);
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
  const singlePlayLaunchRequestRef = useRef(0);

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
    return preloadAssets(GAME_ENVIRONMENT_ASSETS);
  }, [preloadAssets]);

  const preloadCharacters = useCallback(
    (characterIds: readonly (CharacterId | null | undefined)[]) => {
      const characterAssets = getCharacterAssets(characterIds);
      if (characterAssets.length === 0) return Promise.resolve();
      return Promise.all([preloadAssets(characterAssets), preloadSkiaImages(characterAssets)]).then(
        () => undefined
      );
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
    const task = InteractionManager.runAfterInteractions(() => {
      void Promise.all([
        preloadAssets(CHARACTER_STARTUP_ASSETS),
        preloadSkiaImages(CHARACTER_STARTUP_ASSETS),
      ]);
    });

    return () => {
      task.cancel();
    };
  }, [preloadAssets]);

  useEffect(() => {
    let active = true;

    const hydrateSelectedCharacter = async () => {
      if (walletSession.loading) {
        return;
      }

      try {
        const storedCharacterId = await AsyncStorage.getItem(SELECTED_CHARACTER_STORAGE_KEY);
        const storedCustomCharacter = await AsyncStorage.getItem(
          SELECTED_CUSTOM_CHARACTER_STORAGE_KEY
        );
        if (!active || !storedCharacterId) return;

        if (isCharacterId(storedCharacterId)) {
          if (storedCharacterId === 'custom') {
            const parsedCustomCharacter = storedCustomCharacter
              ? parseStoredSelectedCustomCharacter(storedCustomCharacter)
              : null;
            const currentWalletAddress = walletSession.storedSession?.walletAddress ?? null;

            if (
              !parsedCustomCharacter ||
              !currentWalletAddress ||
              parsedCustomCharacter.walletAddress !== currentWalletAddress
            ) {
              await AsyncStorage.removeItem(SELECTED_CUSTOM_CHARACTER_STORAGE_KEY);
              await AsyncStorage.setItem(SELECTED_CHARACTER_STORAGE_KEY, DEFAULT_CHARACTER_ID);
              if (active) {
                setSelectedCharacterId(DEFAULT_CHARACTER_ID);
                setSelectedCustomCharacter(null);
              }
              return;
            }
          }

          setSelectedCharacterId(storedCharacterId);
          if (storedCharacterId === 'custom' && storedCustomCharacter) {
            const parsedCustomCharacter = parseStoredSelectedCustomCharacter(storedCustomCharacter);
            if (parsedCustomCharacter) {
              setSelectedCustomCharacter(parsedCustomCharacter.character);
            }
          }
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
  }, [walletSession.loading, walletSession.storedSession?.walletAddress]);

  useEffect(() => {
    const currentWalletAddress = walletSession.storedSession?.walletAddress ?? null;
    if (selectedCharacterId !== 'custom') return;
    if (!selectedCustomCharacter || !currentWalletAddress) {
      setSelectedCharacterId(DEFAULT_CHARACTER_ID);
      setSelectedCustomCharacter(null);
      void AsyncStorage.setItem(SELECTED_CHARACTER_STORAGE_KEY, DEFAULT_CHARACTER_ID);
      void AsyncStorage.removeItem(SELECTED_CUSTOM_CHARACTER_STORAGE_KEY);
    }
  }, [selectedCharacterId, selectedCustomCharacter, walletSession.storedSession?.walletAddress]);

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
    if (typeof __DEV__ === 'undefined' || !__DEV__) return;
    console.info('[app] multiplayer.view', {
      screen,
      pendingAction: multiplayerState.pendingAction,
      roomCode: multiplayerState.roomCode,
      localPlayerId: multiplayerState.localPlayer?.playerId ?? null,
      opponentPlayerId: multiplayerState.opponent?.playerId ?? null,
      matchStatus: multiplayerState.matchStatus,
    });
  }, [
    screen,
    multiplayerState.pendingAction,
    multiplayerState.roomCode,
    multiplayerState.localPlayer?.playerId,
    multiplayerState.opponent?.playerId,
    multiplayerState.matchStatus,
  ]);

  // Preload game assets as soon as both players are in lobby so they're ready when countdown starts
  useEffect(() => {
    if (!mode.startsWith('multi_')) return;
    if (!hasMultiplayerPair) return;
    if (multiplayerState.matchStatus !== 'lobby') return;

    const customSheetUrls: string[] = [];
    if (selectedCharacterId === 'custom' && selectedCustomCharacter?.asset.sheetUrl) {
      customSheetUrls.push(selectedCustomCharacter.asset.sheetUrl);
    }
    if (
      multiplayerState.opponent?.characterId === 'custom' &&
      opponentCustomCharacter?.asset.sheetUrl
    ) {
      customSheetUrls.push(opponentCustomCharacter.asset.sheetUrl);
    }

    void (async () => {
      await preloadGameEnvironment();
      await preloadCharacters([selectedCharacterId, multiplayerState.opponent?.characterId]);
      if (customSheetUrls.length > 0) {
        await preloadSkiaImages(customSheetUrls);
      }
    })();
  }, [
    mode,
    hasMultiplayerPair,
    multiplayerState.matchStatus,
    multiplayerState.opponent?.characterId,
    selectedCharacterId,
    selectedCustomCharacter?.asset.sheetUrl,
    opponentCustomCharacter?.asset.sheetUrl,
    preloadGameEnvironment,
    preloadCharacters,
    preloadSkiaImages,
  ]);

  useEffect(() => {
    let active = true;
    if (selectedCharacterId !== 'custom' || !selectedCustomCharacter?.activeVersionId) return;

    void backendApi
      .getCustomCharacterVersion(selectedCustomCharacter.activeVersionId)
      .then(async (response) => {
        if (!active) return;
        const refreshedCharacter: CustomCharacterSummary = {
          characterId: response.version.characterId,
          displayName: response.version.displayName,
          activeVersionId: response.version.versionId,
          asset: response.version.asset,
          createdAt: response.version.createdAt,
          updatedAt: response.version.createdAt,
          isActive: true,
        };
        setSelectedCustomCharacter(refreshedCharacter);
        await AsyncStorage.setItem(
          SELECTED_CUSTOM_CHARACTER_STORAGE_KEY,
          serializeStoredSelectedCustomCharacter(
            refreshedCharacter,
            walletSession.storedSession?.walletAddress ?? ''
          )
        );
      })
      .catch((error) => {
        if (active) {
          console.warn('Refreshing selected custom character failed:', error);
        }
      });

    return () => {
      active = false;
    };
  }, [
    selectedCharacterId,
    selectedCustomCharacter?.activeVersionId,
    walletSession.storedSession?.walletAddress,
  ]);

  useEffect(() => {
    let active = true;
    const versionId =
      multiplayerState.opponent?.characterId === 'custom'
        ? multiplayerState.opponent.customCharacterVersionId
        : null;

    if (!versionId) {
      setOpponentCustomCharacter(null);
      return;
    }

    void backendApi
      .getCustomCharacterVersion(versionId)
      .then((response) => {
        if (active) {
          setOpponentCustomCharacter(response.version);
        }
      })
      .catch((error) => {
        if (active) {
          console.warn('Loading opponent custom character failed:', error);
          setOpponentCustomCharacter(null);
        }
      });

    return () => {
      active = false;
    };
  }, [multiplayerState.opponent?.characterId, multiplayerState.opponent?.customCharacterVersionId]);

  useEffect(() => {
    if (!mode.startsWith('multi_')) return;
    const urls: string[] = [];
    if (selectedCharacterId === 'custom' && selectedCustomCharacter?.asset.sheetUrl) {
      urls.push(selectedCustomCharacter.asset.sheetUrl);
    }
    if (
      multiplayerState.opponent?.characterId === 'custom' &&
      opponentCustomCharacter?.asset.sheetUrl
    ) {
      urls.push(opponentCustomCharacter.asset.sheetUrl);
    }
    if (urls.length === 0) return;
    void preloadSkiaImages(urls);
  }, [
    mode,
    selectedCharacterId,
    selectedCustomCharacter?.asset.sheetUrl,
    multiplayerState.opponent?.characterId,
    opponentCustomCharacter?.asset.sheetUrl,
  ]);

  useEffect(() => {
    if (screen !== 'character_select') return;

    const task = InteractionManager.runAfterInteractions(() => {
      void Promise.all([
        preloadAssets(CHARACTER_STARTUP_ASSETS),
        preloadSkiaImages(CHARACTER_STARTUP_ASSETS),
      ]);
    });

    return () => {
      task.cancel();
    };
  }, [preloadAssets, screen]);

  useEffect(() => {
    if (!mode.startsWith('multi_')) return;
    if (
      multiplayerState.matchStatus !== 'countdown' &&
      multiplayerState.matchStatus !== 'running'
    ) {
      return;
    }
    if (!hasMultiplayerPair) return;
    if (multiplayerState.countdownStartAt == null) return;
    if (activeMultiplayerStartAtRef.current === multiplayerState.countdownStartAt) return;

    activeMultiplayerStartAtRef.current = multiplayerState.countdownStartAt;

    setBackgroundIndex((previousIndex) => getRandomBackgroundIndex(previousIndex));
    setTerrainTheme((previousTheme) => getRandomTerrainTheme(previousTheme));
    setLocalMultiplayerDeathScore(null);
    setGameOver(false);
    setLastResult(null);
    setLevelSeed(
      multiplayerState.roomCode
        ? hashStringToSeed(multiplayerState.roomCode)
        : Math.floor(Math.random() * 0x7fffffff)
    );
    setGameKey((k) => k + 1);

    // Show game screen immediately so both characters and countdown are visible
    setScreen('game');

    const customSheetUrls: string[] = [];
    if (selectedCharacterId === 'custom' && selectedCustomCharacter?.asset.sheetUrl) {
      customSheetUrls.push(selectedCustomCharacter.asset.sheetUrl);
    }
    if (
      multiplayerState.opponent?.characterId === 'custom' &&
      opponentCustomCharacter?.asset.sheetUrl
    ) {
      customSheetUrls.push(opponentCustomCharacter.asset.sheetUrl);
    }

    void (async () => {
      await preloadGameEnvironment();
      await preloadCharacters([selectedCharacterId, multiplayerState.opponent?.characterId]);
      if (customSheetUrls.length > 0) {
        await preloadSkiaImages(customSheetUrls);
      }
      await ensureAudioReady();
    })();
  }, [
    hasMultiplayerPair,
    mode,
    multiplayerState.countdownStartAt,
    multiplayerState.matchStatus,
    multiplayerState.opponent?.characterId,
    multiplayerState.roomCode,
    ensureAudioReady,
    preloadGameEnvironment,
    preloadCharacters,
    selectedCharacterId,
    selectedCustomCharacter?.asset.sheetUrl,
    opponentCustomCharacter?.asset.sheetUrl,
  ]);

  useEffect(() => {
    if (multiplayerState.countdownStartAt != null) return;
    activeMultiplayerStartAtRef.current = null;
  }, [multiplayerState.countdownStartAt]);

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
    setLevelSeed(Math.floor(Math.random() * 0x7fffffff));
    setGameKey((k) => k + 1);
  };

  const handleSinglePlay = useCallback(() => {
    singlePlayLaunchRequestRef.current += 1;
    setMode('single_practice');
    setGameOver(false);
    setLastResult(null);
    setPendingPaidSession(null);
    setPostPaymentHandoff(null);
    setPostPaymentActionPending(false);
    setPostPaymentRefundPending(false);
    setPostPaymentError(null);
    setPaidRunSubmissionPending(false);
    setPaidRunSubmissionError(null);
    setBackgroundIndex((previousIndex) => getRandomBackgroundIndex(previousIndex));
    setTerrainTheme((previousTheme) => getRandomTerrainTheme(previousTheme));
    setLevelSeed(Math.floor(Math.random() * 0x7fffffff));
    setGameKey((k) => k + 1);
    setScreen('game');
    void Promise.all([
      preloadGameEnvironment(),
      preloadCharacters([selectedCharacterId]),
      ensureAudioReady(),
    ]);
  }, [ensureAudioReady, preloadCharacters, preloadGameEnvironment, selectedCharacterId]);

  const handleMultiplay = () => {
    setScreen('multi_mode_select');
  };

  const handleOpenCharacterSelect = useCallback(() => {
    setScreen('character_select');
  }, []);

  const handleOpenCharacterGenerator = useCallback(() => {
    setScreen('character_generate');
  }, []);

  const handleReturnHome = useCallback(() => {
    singlePlayLaunchRequestRef.current += 1;
    setScreen('home');
  }, []);

  const handleConfirmCharacter = useCallback(
    async ({
      characterId,
      customCharacter,
    }: {
      characterId: CharacterId;
      customCharacter?: CustomCharacterSummary | null;
    }) => {
      setSelectedCharacterId(characterId);
      setSelectedCustomCharacter(characterId === 'custom' ? (customCharacter ?? null) : null);
      setScreen('home');
      try {
        await AsyncStorage.setItem(SELECTED_CHARACTER_STORAGE_KEY, characterId);
        if (characterId === 'custom' && customCharacter) {
          await AsyncStorage.setItem(
            SELECTED_CUSTOM_CHARACTER_STORAGE_KEY,
            serializeStoredSelectedCustomCharacter(
              customCharacter,
              walletSession.storedSession?.walletAddress ?? ''
            )
          );
        } else {
          await AsyncStorage.removeItem(SELECTED_CUSTOM_CHARACTER_STORAGE_KEY);
        }
      } catch (error) {
        console.warn('Persisting character selection failed:', error);
      }
    },
    [walletSession.storedSession?.walletAddress]
  );

  const handleExitToHome = () => {
    singlePlayLaunchRequestRef.current += 1;
    triggerSound('land');
    setGameOver(false);
    setLastResult(null);
    setLocalMultiplayerDeathScore(null);
    setPostPaymentHandoff(null);
    setPostPaymentActionPending(false);
    setPostPaymentRefundPending(false);
    setPostPaymentError(null);
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
        customCharacterVersionId:
          selectedCharacterId === 'custom' ? selectedCustomCharacter?.activeVersionId : undefined,
      });
    },
    [mode, multiplayerController, pendingPaidSession, selectedCharacterId, selectedCustomCharacter]
  );

  const handleJoinRoom = useCallback(
    (roomCode: string, nickname: string) => {
      multiplayerController.joinRoom(roomCode, nickname, selectedCharacterId, {
        accessToken: pendingPaidSession?.accessToken,
        roomKind: mode === 'multi_paid_private' ? 'paid_private' : 'casual',
        tokenId: pendingPaidSession?.selection.token.id,
        entryFeeTierId: pendingPaidSession?.selection.entryFeeTier.id,
        paymentIntentId: pendingPaidSession?.paymentIntentId,
        customCharacterVersionId:
          selectedCharacterId === 'custom' ? selectedCustomCharacter?.activeVersionId : undefined,
      });
    },
    [mode, multiplayerController, pendingPaidSession, selectedCharacterId, selectedCustomCharacter]
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
        customCharacterVersionId:
          selectedCharacterId === 'custom' ? selectedCustomCharacter?.activeVersionId : undefined,
      });
    },
    [multiplayerController, pendingPaidSession, selectedCharacterId, selectedCustomCharacter]
  );

  const handleLeavePaidQueue = useCallback(() => {
    multiplayerController.leavePaidQueue();
  }, [multiplayerController]);

  const handleCancelPendingMultiplayerAction = useCallback(() => {
    multiplayerController.cancelPendingAction();
  }, [multiplayerController]);

  const openSingleModeSelect = useCallback(() => {
    setScreen('single_mode_select');
  }, []);

  const handleSingleModeSelect = useCallback(
    (nextMode: SinglePlayerMenuMode) => {
      if (nextMode === 'practice') {
        void handleSinglePlay();
        return;
      }

      singlePlayLaunchRequestRef.current += 1;
      setScreen('single_paid_setup');
    },
    [handleSinglePlay]
  );

  const handleMultiplayerModeSelect = useCallback(
    (nextMode: MultiplayerMenuMode) => {
      if (nextMode === 'casual_room') {
        setMode('multi_casual');
        setPendingPaidSession(null);
        setPostPaymentHandoff(null);
        setPostPaymentActionPending(false);
        setPostPaymentRefundPending(false);
        setPostPaymentError(null);
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
      setPostPaymentHandoff(buildPostPaymentHandoff(result));
      setPostPaymentActionPending(false);
      setPostPaymentRefundPending(false);
      setPostPaymentError(null);
      setGameOver(false);
      setLastResult(null);
      setLocalMultiplayerDeathScore(null);
      setPaidRunSubmissionPending(false);
      setPaidRunSubmissionError(null);

      if (result.selection.purpose === 'single_paid_contest') {
        preloadGameEnvironment();
        preloadCharacters([selectedCharacterId]);
        void ensureAudioReady();
      }

      if (result.selection.purpose !== 'single_paid_contest') {
        multiplayerController.resetLobbyState();
      }

      setScreen('post_payment');
    },
    [
      ensureAudioReady,
      multiplayerController,
      preloadCharacters,
      preloadGameEnvironment,
      selectedCharacterId,
    ]
  );

  const handlePostPaymentPrimaryAction = useCallback(async () => {
    if (!pendingPaidSession || !postPaymentHandoff) return;

    setPostPaymentActionPending(true);
    setPostPaymentError(null);

    try {
      if (postPaymentHandoff.kind === 'single_paid_contest') {
        let nextSession = pendingPaidSession;
        if (!nextSession.runSessionId) {
          const contestId = nextSession.selection.contest?.id;
          if (!contestId) {
            throw new Error('No active contest is attached to this paid run.');
          }

          const contestEntry = await backendApi.createContestEntry(
            nextSession.accessToken,
            contestId,
            {
              paymentIntentId: nextSession.paymentIntentId,
            }
          );

          nextSession = {
            ...nextSession,
            contestEntryId: contestEntry.contestEntryId,
            runSessionId: contestEntry.runSessionId,
          };
          setPendingPaidSession(nextSession);
        }

        setMode('single_paid_contest');
        setBackgroundIndex((previousIndex) => getRandomBackgroundIndex(previousIndex));
        setTerrainTheme((previousTheme) => getRandomTerrainTheme(previousTheme));
        setGameOver(false);
        setLastResult(null);
        setPostPaymentHandoff(null);
        setLevelSeed(Math.floor(Math.random() * 0x7fffffff));
        setGameKey((k) => k + 1);
        setScreen('game');
        void Promise.all([
          preloadGameEnvironment(),
          preloadCharacters([selectedCharacterId]),
          ensureAudioReady(),
        ]);
        return;
      }

      multiplayerController.resetLobbyState();
      setPostPaymentHandoff(null);
      setScreen('lobby');
    } catch (error) {
      setPostPaymentError(getErrorMessage(error, 'Unable to continue from payment confirmation.'));
    } finally {
      setPostPaymentActionPending(false);
    }
  }, [
    ensureAudioReady,
    multiplayerController,
    pendingPaidSession,
    postPaymentHandoff,
    preloadCharacters,
    preloadGameEnvironment,
    selectedCharacterId,
  ]);

  const handleRefundPaidEntry = useCallback(async () => {
    if (!pendingPaidSession) return;

    setPostPaymentRefundPending(true);
    setPostPaymentError(null);

    try {
      await backendApi.refundPaymentIntent(
        pendingPaidSession.accessToken,
        pendingPaidSession.paymentIntentId
      );
      multiplayerController.resetLobbyState();
      setGameOver(false);
      setLastResult(null);
      setLocalMultiplayerDeathScore(null);
      setPendingPaidSession(null);
      setPostPaymentHandoff(null);
      setPostPaymentActionPending(false);
      setPostPaymentRefundPending(false);
      setPaidRunSubmissionPending(false);
      setPaidRunSubmissionError(null);

      if (pendingPaidSession.selection.purpose === 'single_paid_contest') {
        setMode('single_practice');
        setScreen('single_mode_select');
        return;
      }

      setScreen('multi_mode_select');
    } catch (error) {
      setPostPaymentError(getErrorMessage(error, 'Refund failed. Please try again.'));
      setPostPaymentRefundPending(false);
    }
  }, [multiplayerController, pendingPaidSession]);

  const handleFlipInput = useCallback(() => {
    multiplayerController.sendInput('flip');
  }, [multiplayerController]);

  const handleLocalState = useCallback(
    (payload: {
      normalizedY: number;
      gravityDir: 1 | -1;
      scroll: number;
      worldX: number;
      alive: boolean;
      score: number;
      pose: 'idle' | 'run' | 'jump' | 'fall';
      frameIndex: number;
      velocityY: number;
      velocityX: number;
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
            selectedCustomCharacter={selectedCustomCharacter}
            onSinglePlay={openSingleModeSelect}
            onMultiplay={handleMultiplay}
            onOpenCharacterSelect={handleOpenCharacterSelect}
            onOpenLeaderboard={() => setScreen('leaderboard')}
            onOpenWalletDebug={__DEV__ ? () => setScreen('wallet_debug') : undefined}
          />
        ) : null}

        {screen === 'leaderboard' ? <LeaderboardScreen onBack={handleReturnHome} /> : null}

        {screen === 'character_select' ? (
          <CharacterSelectScreen
            selectedCharacterId={selectedCharacterId}
            selectedCustomCharacter={selectedCustomCharacter}
            onBack={handleReturnHome}
            onOpenGenerator={handleOpenCharacterGenerator}
            onConfirm={handleConfirmCharacter}
          />
        ) : null}

        {screen === 'character_generate' ? (
          <CharacterGenerationScreen
            onBack={() => setScreen('character_select')}
            onUseCharacter={(character) => {
              void handleConfirmCharacter({
                characterId: 'custom',
                customCharacter: character,
              });
            }}
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

        {screen === 'post_payment' && pendingPaidSession && postPaymentHandoff ? (
          <PostPaymentSuccessScreen
            handoff={postPaymentHandoff}
            session={pendingPaidSession}
            primaryPending={postPaymentActionPending}
            refundPending={postPaymentRefundPending}
            errorMessage={postPaymentError}
            onPrimaryAction={() => void handlePostPaymentPrimaryAction()}
            onRefund={() => void handleRefundPaidEntry()}
          />
        ) : null}

        {screen === 'lobby' ? (
          <LobbyScreen
            key={multiplayerState.roomCode ?? 'room-entry'}
            state={multiplayerState}
            onBack={handleExitToHome}
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            onJoinQueue={handleJoinPaidQueue}
            onLeaveQueue={handleLeavePaidQueue}
            onCancelPending={handleCancelPendingMultiplayerAction}
            onReady={handleReadyRoom}
            mode={mode}
            paidSession={pendingPaidSession}
          />
        ) : null}

        {screen === 'game' ? (
          <>
            <GameCanvas
              restartKey={gameKey}
              levelSeed={levelSeed}
              onExit={handleExitToHome}
              onGameOver={handleSinglePlayerGameOver}
              onAudioEvent={triggerSound}
              backgroundIndex={backgroundIndex}
              terrainTheme={terrainTheme}
              initialGravityDirection={localInitialGravityDirection}
              characterId={selectedCharacterId}
              characterCustomSpriteUrl={selectedCustomCharacter?.asset.sheetUrl}
              characterCustomSpriteAnimation={selectedCustomCharacter?.asset.animation}
              opponentCharacterId={
                mode.startsWith('multi_') ? multiplayerState.opponent?.characterId : undefined
              }
              opponentCustomSpriteUrl={
                mode.startsWith('multi_') ? opponentCustomCharacter?.asset.sheetUrl : undefined
              }
              opponentCustomSpriteAnimation={
                mode.startsWith('multi_') ? opponentCustomCharacter?.asset.animation : undefined
              }
              opponentInitialGravityDirection={opponentInitialGravityDirection}
              multiplayerCountdownStartAt={
                mode.startsWith('multi_') ? multiplayerState.countdownStartAt : undefined
              }
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
                    ) : isPaidContestRun && paidRunSubmissionError ? (
                      <Pressable style={styles.restartButton} onPress={handleRetryPaidSubmission}>
                        <Text style={styles.buttonText}>Retry Submission</Text>
                      </Pressable>
                    ) : null}
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
                      <Text style={styles.gameOverSubtitle}>Distance</Text>
                      <View style={styles.scoreCardRow}>
                        <Text style={styles.scoreCardLabel}>
                          {multiplayerResult.winnerPlayerId === localPlayerId
                            ? 'You'
                            : (multiplayerState.opponent?.nickname ?? 'Winner')}
                        </Text>
                        <Text style={styles.scoreCardValue}>
                          {multiplayerResult.winnerScore != null
                            ? `${multiplayerResult.winnerScore}m`
                            : '—'}
                        </Text>
                      </View>
                      <View style={styles.scoreCardRow}>
                        <Text style={styles.scoreCardLabel}>
                          {multiplayerResult.loserPlayerId === localPlayerId
                            ? 'You'
                            : (multiplayerState.opponent?.nickname ?? 'Opponent')}
                        </Text>
                        <Text style={styles.scoreCardValue}>
                          {multiplayerResult.loserScore != null
                            ? `${multiplayerResult.loserScore}m`
                            : '—'}
                        </Text>
                      </View>
                      {multiplayerResult.settlementTransactionSignature ? (
                        <Text style={styles.gameOverSubtitle}>
                          Tx: {multiplayerResult.settlementTransactionSignature.slice(0, 12)}...
                        </Text>
                      ) : null}
                      <View style={styles.gameOverButtons}>
                        <Pressable
                          style={styles.restartButton}
                          onPress={() => {
                            multiplayerController.dismissResult();
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

        {screen === 'game' ? (
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
  scoreCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginVertical: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
  },
  scoreCardLabel: {
    fontSize: 16,
    color: '#e5e7eb',
    fontWeight: '600',
  },
  scoreCardValue: {
    fontSize: 18,
    color: '#fbbf24',
    fontWeight: '700',
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
