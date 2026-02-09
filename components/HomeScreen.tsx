import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

type HomeScreenProps = {
  onPlay: () => void;
};

export const HomeScreen = ({ onPlay }: HomeScreenProps) => {
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    return () => {
      ScreenOrientation.unlockAsync();
    };
  }, []);

  return (
    <View className="flex-1 bg-black items-center justify-center">
      <Text className="text-white text-3xl font-bold mb-12">Game</Text>
      <Pressable
        onPress={onPlay}
        className="bg-white px-12 py-4 rounded-full active:opacity-80">
        <Text className="text-black text-xl font-bold">Play</Text>
      </Pressable>
    </View>
  );
};
