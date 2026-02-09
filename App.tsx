import 'react-native-gesture-handler';
import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GameCanvas } from 'components/GameCanvas';
import { HomeScreen } from 'components/HomeScreen';

import './global.css';

export default function App() {
  const [screen, setScreen] = useState<'home' | 'game'>('home');

  return (
    <>
      {screen === 'home' ? (
        <HomeScreen onPlay={() => setScreen('game')} />
      ) : (
        <GameCanvas onExit={() => setScreen('home')} />
      )}
      <StatusBar style="auto" />
    </>
  );
}
