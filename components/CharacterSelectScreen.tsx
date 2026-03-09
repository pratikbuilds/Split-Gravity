import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import type { CharacterId } from '../shared/characters';
import { CharacterSpritePreview } from './character/CharacterSpritePreview';
import {
  CHARACTER_DEFINITIONS,
  getCharacterDefinitionOrDefault,
} from './game/characterSpritePresets';

type CharacterSelectScreenProps = {
  selectedCharacterId: CharacterId;
  onBack: () => void;
  onConfirm: (characterId: CharacterId) => void;
};

export const CharacterSelectScreen = ({
  selectedCharacterId,
  onBack,
  onConfirm,
}: CharacterSelectScreenProps) => {
  const insets = useSafeAreaInsets();
  const [pendingCharacterId, setPendingCharacterId] = useState<CharacterId>(selectedCharacterId);

  const handleBack = useCallback(() => {
    onBack();
  }, [onBack]);

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  useEffect(() => {
    setPendingCharacterId(selectedCharacterId);
  }, [selectedCharacterId]);

  const pendingCharacter = getCharacterDefinitionOrDefault(pendingCharacterId);

  return (
    <View
      className="flex-1 bg-[#040712] px-6 pb-10 pt-8"
      style={{ paddingTop: Math.max(insets.top, 32) }}>
      <View
        className="z-10 flex-row items-center justify-between"
        pointerEvents="box-none"
        style={{ minHeight: 44 }}>
        <Pressable
          onPress={handleBack}
          hitSlop={16}
          style={{ zIndex: 1 }}
          className="rounded-full border border-white/15 px-4 py-2">
          <Text className="text-sm font-semibold text-slate-200">Back</Text>
        </Pressable>
        <Text className="text-xs font-semibold uppercase tracking-[3px] text-slate-400">
          Character Select
        </Text>
      </View>

      <View className="mt-8 items-center">
        <CharacterSpritePreview characterId={pendingCharacter.id} size={260} />
        <Text className="mt-5 text-4xl font-black text-white">{pendingCharacter.displayName}</Text>
        <Text className="mt-2 max-w-sm text-center text-sm leading-5 text-slate-300">
          Choose the runner you want to keep on your profile. This selection is used for solo runs
          and sent into multiplayer lobbies.
        </Text>
      </View>

      <ScrollView
        className="mt-8 flex-1"
        contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}>
        {CHARACTER_DEFINITIONS.map((character) => {
          const isSelected = character.id === pendingCharacterId;
          return (
            <Pressable
              key={character.id}
              onPress={() => setPendingCharacterId(character.id)}
              className={`rounded-[24px] border px-5 py-4 active:opacity-80 ${
                isSelected ? 'border-white bg-white/10' : 'border-white/10 bg-slate-900/70'
              }`}>
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-2xl font-black text-white">{character.displayName}</Text>
                  <Text className="mt-1 text-sm text-slate-300">
                    {isSelected ? 'Selected for confirmation' : 'Tap to preview'}
                  </Text>
                </View>
                <View
                  className={`rounded-full px-4 py-2 ${isSelected ? 'bg-white' : 'bg-white/10'}`}>
                  <Text
                    className={`text-xs font-black uppercase tracking-[2px] ${
                      isSelected ? 'text-black' : 'text-white'
                    }`}>
                    {isSelected ? 'Current' : 'Preview'}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        onPress={() => onConfirm(pendingCharacterId)}
        className="rounded-full bg-white px-8 py-4 active:opacity-80">
        <Text className="text-center text-lg font-black text-black">Save Character</Text>
      </Pressable>
    </View>
  );
};
