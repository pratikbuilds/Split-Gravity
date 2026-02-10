import 'react-native-gesture-handler';
import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GameCanvas } from 'components/GameCanvas';
import { HomeScreen } from 'components/HomeScreen';

import './global.css';

export default function App() {
  const [screen, setScreen] = useState<'home' | 'game'>('home');
  const [gameKey, setGameKey] = useState(0);
  const [lastScore, setLastScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  const handleGameOver = (score: number) => {
    setLastScore(score);
    setGameOver(true);
  };
  const handleRestart = () => {
    setGameOver(false);
    setGameKey((k) => k + 1);
  };
  const handleExitToHome = () => {
    setGameOver(false);
    setScreen('home');
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      {screen === 'home' ? (
        <HomeScreen onPlay={() => setScreen('game')} />
      ) : (
        <>
          <GameCanvas
            key={gameKey}
            onExit={handleExitToHome}
            onGameOver={handleGameOver}
          />
          {gameOver && (
            <View style={styles.gameOverOverlay}>
              <View style={styles.gameOverBackdrop} />
              <View style={styles.gameOverModal}>
                <Text style={styles.gameOverTitle}>Game Over</Text>
                <Text style={styles.gameOverSubtitle}>You fell into the ditch!</Text>
                <Text style={styles.scoreText}>Distance: {lastScore}m</Text>
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
    marginBottom: 24,
  },
  gameOverButtons: {
    flexDirection: 'row',
    gap: 16,
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
});
