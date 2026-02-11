import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

type HomeScreenProps = {
  onSinglePlay: () => void;
  onMultiplay: () => void;
};

export const HomeScreen = ({ onSinglePlay, onMultiplay }: HomeScreenProps) => {
  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  return (
    <View className="flex-1 items-center justify-center bg-black px-6">
      <Text className="mb-12 text-3xl font-bold text-white">Game</Text>
      <View className="w-full max-w-sm gap-4">
        <Pressable
          onPress={onSinglePlay}
          className="rounded-full bg-white px-12 py-4 active:opacity-80">
          <Text className="text-center text-xl font-bold text-black">Single Play</Text>
        </Pressable>

        <Pressable
          onPress={onMultiplay}
          className="rounded-full border border-white px-12 py-4 active:opacity-80">
          <Text className="text-center text-xl font-bold text-white">Multiplay</Text>
        </Pressable>
      </View>
    </View>
  );
};
