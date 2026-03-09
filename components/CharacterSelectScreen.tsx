import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
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
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none"><View style={styles.splitDiagonal} /></View>
      

      <View
        className="flex-1 px-6 pb-10 pt-8 z-10"
        style={{ paddingTop: Math.max(insets.top, 32) }}>
        <View
          className="z-10 flex-row items-center justify-between"
          pointerEvents="box-none"
          style={{ minHeight: 44 }}>
          <Pressable
            onPress={handleBack}
            hitSlop={16}
            style={{ zIndex: 1 }}
            className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 active:bg-white/10 transition-colors">
            <Text className="text-sm font-bold uppercase tracking-wider text-slate-300">Back</Text>
          </Pressable>
          <Text className="text-sm font-black italic uppercase tracking-widest text-slate-400">
            CHOOSE RUNNER
          </Text>
        </View>

        <View className="mt-6 items-center">
          <CharacterSpritePreview characterId={pendingCharacter.id} size={280} backgroundColor="rgba(255,255,255,0.03)" />
          <Text 
            className="mt-4 text-5xl font-black italic tracking-wider text-white"
            style={{ textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 10 }}
          >
            {pendingCharacter.displayName}
          </Text>
          <Text className="mt-2 max-w-sm text-center text-sm leading-5 text-slate-400">
            Choose the runner you want to keep on your profile. This selection is used for solo runs
            and sent into multiplayer lobbies.
          </Text>
        </View>

        <ScrollView
          className="mt-6 flex-1"
          contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}>
          {CHARACTER_DEFINITIONS.map((character) => {
            const isSelected = character.id === pendingCharacterId;
            return (
              <Pressable
                key={character.id}
                onPress={() => setPendingCharacterId(character.id)}
                className={`rounded-[24px] border px-6 py-5 active:scale-[0.98] transition-all ${
                  isSelected 
                    ? 'bg-orange-500 border-orange-400' 
                    : 'border-white/5 bg-slate-900/50'
                }`}
                style={isSelected ? styles.primaryButton : undefined}>
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text className={`text-3xl font-black italic tracking-wide ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                      {character.displayName}
                    </Text>
                    <Text className={`mt-1 text-sm font-medium ${isSelected ? 'text-orange-100' : 'text-slate-500'}`}>
                      {isSelected ? 'Selected for confirmation' : 'Tap to preview'}
                    </Text>
                  </View>
                  <View
                    className={`rounded-full px-4 py-2 ${isSelected ? 'bg-orange-900/40 border border-orange-300/30' : 'bg-white/5'}`}>
                    <Text
                      className={`text-xs font-black uppercase tracking-widest ${
                        isSelected ? 'text-orange-200' : 'text-slate-400'
                      }`}>
                      {isSelected ? 'CURRENT' : 'PREVIEW'}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable
          onPress={() => onConfirm(pendingCharacterId)}
          className="rounded-full bg-white px-8 py-5 active:scale-95 transition-transform"
          style={styles.whiteButtonGlow}>
          <Text className="text-center text-xl font-black italic tracking-widest text-black uppercase">Save Runner</Text>
        </Pressable>
      </View>
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
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  whiteButtonGlow: {
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  }
});
