import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import type { CharacterId } from '../shared/characters';
import { CharacterSpritePreview } from './character/CharacterSpritePreview';
import { getCharacterDefinitionOrDefault } from './game/characterSpritePresets';

const SECTION_GAP = 28;
const HERO_SIZE = 270;
const BUTTON_MIN_HEIGHT = 44;

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
  const insets = useSafeAreaInsets();

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  const selectedCharacter = getCharacterDefinitionOrDefault(selectedCharacterId);

  return (
    <View
      className="flex-1 bg-[#050816] px-6"
      style={{
        paddingTop: Math.max(insets.top + 48, 96),
        paddingBottom: 0,
      }}>
      {/* Header: starts below SOUND button; title centered */}
      <View className="w-full max-w-sm items-center self-center">
        <Text className="text-center text-5xl font-black tracking-[4px] text-white">Runner</Text>
        <Text className="mt-3 max-w-xs text-center text-sm leading-5 text-slate-300">
          Pick your runner, keep the profile saved, and take that same character into solo or
          multiplayer matches.
        </Text>
      </View>

      {/* Hero: sprite + name */}
      <View style={{ marginTop: SECTION_GAP }} className="w-full items-center">
        <CharacterSpritePreview characterId={selectedCharacter.id} size={HERO_SIZE} />
        <Text className="mt-4 text-center text-3xl font-black text-white">
          {selectedCharacter.displayName}
        </Text>
      </View>

      {/* Characters button (secondary) */}
      <View className="w-full max-w-sm self-center" style={{ marginTop: SECTION_GAP }}>
        <Pressable
          onPress={onOpenCharacterSelect}
          style={{ minHeight: BUTTON_MIN_HEIGHT }}
          className="rounded-full border border-white/20 bg-slate-900/70 px-6 py-3.5 active:opacity-80">
          <Text className="text-center text-base font-bold text-white">Characters</Text>
        </Pressable>
      </View>

      {/* Flexible spacer so bottom band doesn't crowd hero */}
      <View style={{ flex: 1, minHeight: 24 }} />

      {/* Anchored bottom: two primary buttons */}
      <View
        style={{
          paddingBottom: Math.max(insets.bottom, 24),
          gap: 16,
        }}
        className="w-full max-w-sm self-center">
        <Pressable
          onPress={onSinglePlay}
          style={{ minHeight: BUTTON_MIN_HEIGHT }}
          className="rounded-full bg-white px-8 py-4 active:opacity-80">
          <Text className="text-center text-xl font-bold text-black">Single Play</Text>
        </Pressable>
        <Pressable
          onPress={onMultiplay}
          style={{ minHeight: BUTTON_MIN_HEIGHT }}
          className="rounded-full bg-white px-8 py-4 active:opacity-80">
          <Text className="text-center text-xl font-bold text-black">Multiplay</Text>
        </Pressable>
      </View>
    </View>
  );
};
