import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GameCanvas } from 'components/GameCanvas';
import { HomeScreen } from 'components/HomeScreen';
import { getRandomBackgroundIndex } from './utils/backgrounds';
import type { GameAudioEvent, GameResult } from './types/game';
import {
  configureAudioMode,
  loadSounds,
  mapGameEventToSound,
  playSound,
  unloadSounds,
} from './utils/audio';

import './global.css';

export default function App() {
  const [screen, setScreen] = useState<'home' | 'game'>('home');
  const [gameKey, setGameKey] = useState(0);
  const [lastResult, setLastResult] = useState<GameResult | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [backgroundIndex, setBackgroundIndex] = useState(() => getRandomBackgroundIndex());
  const [isMuted, setIsMuted] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  const soundsRef = useRef<Awaited<ReturnType<typeof loadSounds>> | null>(null);

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

  const triggerSound = (event: GameAudioEvent) => {
    const loadedSounds = soundsRef.current;
    if (!loadedSounds || !audioReady) return;
    const soundKey = mapGameEventToSound(event);
    void playSound(loadedSounds, soundKey, isMutedRef.current);
  };

  const handleGameOver = (result: GameResult) => {
    setLastResult(result);
    setGameOver(true);
  };
  const handleRestart = () => {
    triggerSound('run_start');
    setGameOver(false);
    setBackgroundIndex((previousIndex) => getRandomBackgroundIndex(previousIndex));
    setGameKey((k) => k + 1);
  };
  const handlePlay = () => {
    triggerSound('run_start');
    setGameOver(false);
    setLastResult(null);
    setBackgroundIndex((previousIndex) => getRandomBackgroundIndex(previousIndex));
    setGameKey((k) => k + 1);
    setScreen('game');
  };
  const handleExitToHome = () => {
    triggerSound('land');
    setGameOver(false);
    setLastResult(null);
    setScreen('home');
  };
  const handleToggleMute = () => {
    setIsMuted((prev) => !prev);
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      {screen === 'home' ? (
        <HomeScreen onPlay={handlePlay} />
      ) : (
        <>
          <GameCanvas
            key={gameKey}
            onExit={handleExitToHome}
            onGameOver={handleGameOver}
            onAudioEvent={triggerSound}
            backgroundIndex={backgroundIndex}
          />
          {gameOver && (
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
        </>
      )}
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
