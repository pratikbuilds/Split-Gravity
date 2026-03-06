import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import type { CharacterId } from '../shared/characters';
import { CharacterSpritePreview } from './character/CharacterSpritePreview';
import { getCharacterDefinitionOrDefault } from './game/characterSpritePresets';

type HomeScreenProps = {
  selectedCharacterId: CharacterId;
  onSinglePlay: () => void;
  onMultiplay: () => void;
  onOpenCharacterSelect: () => void;
};

export const HomeScreen = ({
  selectedCharacterId,
  onSinglePlay,
  onMultiplay,
  onOpenCharacterSelect,
}: HomeScreenProps) => {
  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  const selectedCharacter = getCharacterDefinitionOrDefault(selectedCharacterId);

  return (
    <View className="flex-1 bg-[#050816] px-6 pb-12 pt-8">
      <View className="flex-1 items-center justify-between">
        <View className="w-full items-center" style={{ marginTop: 40, marginBottom: -40 }}>
          <Text className="mt-2 text-center text-5xl font-black tracking-[4px] text-white">
            Runner
          </Text>
          <Text className="mt-3 max-w-xs text-center text-sm leading-5 text-slate-300">
            Pick your runner, keep the profile saved, and take that same character into solo or
            multiplayer matches.
          </Text>
        </View>

        <View className="w-full items-center">
          <CharacterSpritePreview characterId={selectedCharacter.id} size={240} />
          <View className="mt-5 w-full max-w-sm rounded-[28px] border border-white/10 bg-white/5 px-5 py-4">
            <Text className="text-xs font-semibold uppercase tracking-[3px] text-slate-400">
              Selected Character
            </Text>
            <Text className="mt-2 text-3xl font-black text-white">
              {selectedCharacter.displayName}
            </Text>
            <Pressable
              onPress={onOpenCharacterSelect}
              className="mt-4 rounded-full border border-white/20 bg-slate-900/70 px-5 py-3 active:opacity-80">
              <Text className="text-center text-base font-bold text-white">Characters</Text>
            </Pressable>
          </View>
        </View>

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
    </View>
  );
};
