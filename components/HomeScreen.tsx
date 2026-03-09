import React, { useEffect } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import type { CharacterId } from '../shared/characters';
import { CharacterSpritePreview } from './character/CharacterSpritePreview';
import { getCharacterDefinitionOrDefault } from './game/characterSpritePresets';
import { WalletStatusChip } from './wallet/WalletStatusChip';

const SECTION_GAP = 28;
const HERO_SIZE = 270;
const BUTTON_MIN_HEIGHT = 44;

type HomeScreenProps = {
  selectedCharacterId: CharacterId;
  onSinglePlay: () => void;
  onMultiplay: () => void;
  onOpenCharacterSelect: () => void;
  onOpenLeaderboard?: () => void;
  onOpenWalletDebug?: () => void;
};

export const HomeScreen = ({
  selectedCharacterId,
  onSinglePlay,
  onMultiplay,
  onOpenCharacterSelect,
  onOpenLeaderboard,
  onOpenWalletDebug,
}: HomeScreenProps) => {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  const selectedCharacter = getCharacterDefinitionOrDefault(selectedCharacterId);

  return (
    <View className="flex-1 bg-[#050816]">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          alignItems: 'center',
          flexGrow: 1,
          paddingBottom: Math.max(insets.bottom, 24),
          paddingTop: Math.max(insets.top + 32, 72),
        }}
        showsVerticalScrollIndicator={false}>
        <View className="w-full max-w-sm px-6">
          {/* Header: starts below SOUND button; title centered */}
          <View className="w-full items-center self-center">
            <Pressable onLongPress={onOpenWalletDebug} disabled={!onOpenWalletDebug}>
              <Text className="text-center text-5xl font-black tracking-[4px] text-white">
                Runner
              </Text>
            </Pressable>
            <Text className="mt-3 max-w-xs text-center text-sm leading-5 text-slate-300">
              Pick your runner, keep the profile saved, and launch straight into solo or
              multiplayer. Wallet steps only appear when you choose a paid mode.
            </Text>
          </View>

          <View className="mt-5">
            <WalletStatusChip />
          </View>

          {/* Hero: sprite + name */}
          <View style={{ marginTop: SECTION_GAP }} className="w-full items-center">
            <CharacterSpritePreview characterId={selectedCharacter.id} size={HERO_SIZE} />
            <Text className="mt-4 text-center text-3xl font-black text-white">
              {selectedCharacter.displayName}
            </Text>
          </View>

          {/* Characters + Leaderboard buttons (secondary) */}
          <View className="w-full self-center gap-3" style={{ marginTop: SECTION_GAP }}>
            <Pressable
              onPress={onOpenCharacterSelect}
              style={{ minHeight: BUTTON_MIN_HEIGHT }}
              className="rounded-full border border-white/20 bg-slate-900/70 px-6 py-3.5 active:opacity-80">
              <Text className="text-center text-base font-bold text-white">Characters</Text>
            </Pressable>
            {onOpenLeaderboard ? (
              <Pressable
                onPress={onOpenLeaderboard}
                style={{ minHeight: BUTTON_MIN_HEIGHT }}
                className="rounded-full border border-amber-400/30 bg-slate-900/70 px-6 py-3.5 active:opacity-80">
                <Text className="text-center text-base font-bold text-amber-200">Leaderboard</Text>
              </Pressable>
            ) : null}
          </View>

          <View
            style={{
              gap: 16,
              marginTop: 24,
            }}
            className="w-full self-center">
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
      </ScrollView>
    </View>
  );
};
