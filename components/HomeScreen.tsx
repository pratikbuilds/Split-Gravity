import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useWalletSession } from '../hooks/useWalletSession';
import type { CharacterId } from '../shared/characters';
import type { CustomCharacterSummary } from '../shared/character-generation-contracts';
import { CharacterSpritePreview } from './character/CharacterSpritePreview';
import { getCharacterDefinitionOrDefault } from './game/characterSpritePresets';
import { WalletMenuTrigger } from './wallet/WalletMenuTrigger';
import { WalletSheet } from './wallet/WalletSheet';

type HomeScreenProps = {
  selectedCharacterId: CharacterId;
  selectedCustomCharacter?: CustomCharacterSummary | null;
  onSinglePlay: () => void;
  onMultiplay: () => void;
  onOpenCharacterSelect: () => void;
  onOpenLeaderboard?: () => void;
  onOpenWalletDebug?: () => void;
};

export const HomeScreen = ({
  selectedCharacterId,
  selectedCustomCharacter,
  onSinglePlay,
  onMultiplay,
  onOpenCharacterSelect,
  onOpenLeaderboard,
  onOpenWalletDebug,
}: HomeScreenProps) => {
  const insets = useSafeAreaInsets();
  const walletSession = useWalletSession();
  const [walletSheetVisible, setWalletSheetVisible] = useState(false);

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  const selectedCharacter = getCharacterDefinitionOrDefault(selectedCharacterId);
  const selectedCharacterName =
    selectedCharacterId === 'custom'
      ? (selectedCustomCharacter?.displayName ?? 'Custom Runner')
      : selectedCharacter.displayName;

  return (
    <View style={styles.container}>
      {/* Geometric Split Background */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.splitDiagonal} />
      </View>
      <WalletSheet
        onClose={() => setWalletSheetVisible(false)}
        visible={walletSheetVisible}
        walletSession={walletSession}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: Math.max(insets.bottom, 24),
          paddingTop: Math.max(insets.top + 16, 48),
        }}
        showsVerticalScrollIndicator={false}>
        {/* Top Bar: Wallet */}
        <View className="w-full flex-row items-center justify-end px-6">
          <WalletMenuTrigger
            hasValidSession={walletSession.hasValidSession}
            onPress={() => setWalletSheetVisible(true)}
            walletAddress={walletSession.walletAddress}
          />
        </View>

        <View className="flex-1 items-center justify-center px-6">
          {/* Game Title */}
          <Pressable
            onLongPress={onOpenWalletDebug}
            disabled={!onOpenWalletDebug}
            className="z-10 w-full items-center"
            style={{ marginBottom: -10 }}>
            <Text
              className="text-[64px] font-black italic tracking-widest text-white"
              style={{
                textShadowColor: 'rgba(0,0,0,0.5)',
                textShadowOffset: { width: 0, height: 4 },
                textShadowRadius: 10,
              }}>
              SPLIT
            </Text>
            <Text
              className="text-[52px] font-black italic tracking-wider text-orange-500"
              style={{
                marginTop: -24,
                textShadowColor: 'rgba(249,115,22,0.4)',
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 20,
              }}>
              GRAVITY
            </Text>
          </Pressable>

          {/* Hero Character - positioned to interact dynamically with the title */}
          <View className="z-20 my-4 items-center" style={{ transform: [{ scale: 1.05 }] }}>
            <CharacterSpritePreview
              characterId={selectedCharacterId === 'custom' ? undefined : selectedCharacter.id}
              sheetUrl={selectedCustomCharacter?.asset.sheetUrl}
              sheetAnimation={selectedCustomCharacter?.asset.animation}
              size={260}
              backgroundColor="rgba(255,255,255,0.03)"
            />
            <View className="mt-4 rounded-full border border-white/10 bg-black/40 px-4 py-1.5">
              <Text className="text-sm font-bold uppercase tracking-wider text-orange-200">
                {selectedCharacterName}
              </Text>
            </View>
          </View>

          {/* Main Actions */}
          <View className="z-30 mt-8 w-full max-w-sm gap-4">
            <Pressable
              onPress={onSinglePlay}
              className="w-full overflow-hidden rounded-2xl bg-orange-500 transition-transform active:scale-95"
              style={styles.primaryButton}>
              <View className="items-center justify-center bg-white/10 px-8 py-5">
                <Text className="text-2xl font-black uppercase tracking-wide text-white">
                  Solo Run
                </Text>
              </View>
            </Pressable>

            <Pressable
              onPress={onMultiplay}
              className="w-full rounded-2xl border border-slate-700 bg-slate-800 transition-transform active:scale-95">
              <View className="items-center justify-center px-8 py-5">
                <Text className="text-xl font-bold uppercase tracking-wide text-white">
                  Multiplayer
                </Text>
              </View>
            </Pressable>
          </View>

          {/* Secondary Actions */}
          <View className="z-30 mt-6 w-full max-w-sm flex-row justify-center gap-4">
            <Pressable
              onPress={onOpenCharacterSelect}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition-colors active:bg-white/10">
              <Text className="text-center text-sm font-bold uppercase tracking-wider text-slate-300">
                Runners
              </Text>
            </Pressable>

            {onOpenLeaderboard ? (
              <Pressable
                onPress={onOpenLeaderboard}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition-colors active:bg-white/10">
                <Text className="text-center text-sm font-bold uppercase tracking-wider text-amber-400">
                  Rankings
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0510',
  },
  splitDiagonal: {
    position: 'absolute',
    top: '45%',
    left: '-50%',
    width: '200%',
    height: '150%',
    backgroundColor: '#120803',
    transform: [{ rotate: '-12deg' }],
    borderTopWidth: 2,
    borderTopColor: 'rgba(234, 88, 12, 0.2)',
  },
  primaryButton: {
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});
