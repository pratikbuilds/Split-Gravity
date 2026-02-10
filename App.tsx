import 'react-native-gesture-handler';
import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { GameCanvas } from 'components/GameCanvas';
import { HomeScreen } from 'components/HomeScreen';

import './global.css';

export default function App() {
  const [screen, setScreen] = useState<'home' | 'game'>('home');

  return (
    <GestureHandlerRootView style={styles.root}>
      {screen === 'home' ? (
        <HomeScreen onPlay={() => setScreen('game')} />
      ) : (
        <GameCanvas onExit={() => setScreen('home')} />
      )}
      <StatusBar style="auto" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
