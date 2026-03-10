import React, { useEffect } from 'react';
import { Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import type { CharacterId } from '../shared/characters';
import type { CustomCharacterSummary } from '../shared/character-generation-contracts';
import { CharacterSpritePreview } from './character/CharacterSpritePreview';
import { getCharacterDefinitionOrDefault } from './game/characterSpritePresets';
import { WalletStatusChip } from './wallet/WalletStatusChip';

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

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  const selectedCharacter = getCharacterDefinitionOrDefault(selectedCharacterId);
  const selectedCharacterName =
    selectedCharacterId === 'custom'
      ? selectedCustomCharacter?.displayName ?? 'Custom Runner'
      : selectedCharacter.displayName;

  return (
    <View style={styles.container}>
      {/* Geometric Split Background */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none"><View style={styles.splitDiagonal} /></View>
      

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: Math.max(insets.bottom, 24),
          paddingTop: Math.max(insets.top + 16, 48),
        }}
        showsVerticalScrollIndicator={false}>
        
        {/* Top Bar: Wallet */}
        <View className="w-full px-6 flex-row justify-end items-center">
          <WalletStatusChip />
        </View>

        <View className="flex-1 px-6 justify-center items-center">
          {/* Game Title */}
          <Pressable 
            onLongPress={onOpenWalletDebug} 
            disabled={!onOpenWalletDebug}
            className="items-center z-10 w-full"
            style={{ marginBottom: -10 }}
          >
            <Text 
              className="text-[64px] font-black tracking-widest text-white italic" 
              style={{ textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 10 }}
            >
              SPLIT
            </Text>
            <Text 
              className="text-[52px] font-black tracking-wider text-orange-500 italic"
              style={{ marginTop: -24, textShadowColor: 'rgba(249,115,22,0.4)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 20 }}
            >
              GRAVITY
            </Text>
          </Pressable>

          {/* Hero Character - positioned to interact dynamically with the title */}
          <View className="items-center z-20 my-4" style={{ transform: [{ scale: 1.05 }] }}>
            <CharacterSpritePreview 
              characterId={selectedCharacterId === 'custom' ? undefined : selectedCharacter.id}
              sheetUrl={selectedCustomCharacter?.asset.sheetUrl}
              sheetAnimation={selectedCustomCharacter?.asset.animation}
              size={260} 
              backgroundColor="rgba(255,255,255,0.03)" 
            />
            <View className="bg-black/40 px-4 py-1.5 rounded-full mt-4 border border-white/10">
              <Text className="text-sm font-bold text-orange-200 tracking-wider uppercase">
                {selectedCharacterName}
              </Text>
            </View>
          </View>

          {/* Main Actions */}
          <View className="w-full max-w-sm mt-8 gap-4 z-30">
            <Pressable
              onPress={onSinglePlay}
              className="w-full rounded-2xl bg-orange-500 overflow-hidden active:scale-95 transition-transform"
              style={styles.primaryButton}
            >
              <View className="px-8 py-5 items-center justify-center bg-white/10">
                <Text className="text-2xl font-black text-white tracking-wide uppercase">Solo Run</Text>
              </View>
            </Pressable>
            
            <Pressable
              onPress={onMultiplay}
              className="w-full rounded-2xl bg-slate-800 border border-slate-700 active:scale-95 transition-transform"
            >
              <View className="px-8 py-5 items-center justify-center">
                <Text className="text-xl font-bold text-white tracking-wide uppercase">Multiplayer</Text>
              </View>
            </Pressable>
          </View>

          {/* Secondary Actions */}
          <View className="w-full max-w-sm flex-row gap-4 mt-6 z-30 justify-center">
            <Pressable
              onPress={onOpenCharacterSelect}
              className="flex-1 rounded-xl bg-white/5 border border-white/10 px-4 py-3 active:bg-white/10 transition-colors"
            >
              <Text className="text-center text-sm font-bold text-slate-300 uppercase tracking-wider">Runners</Text>
            </Pressable>
            
            {onOpenLeaderboard ? (
              <Pressable
                onPress={onOpenLeaderboard}
                className="flex-1 rounded-xl bg-white/5 border border-white/10 px-4 py-3 active:bg-white/10 transition-colors"
              >
                <Text className="text-center text-sm font-bold text-amber-400 uppercase tracking-wider">Rankings</Text>
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
  }
});
