import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import type { CharacterId } from '../shared/characters';
import type { CustomCharacterSummary } from '../shared/character-generation-contracts';
import { useCustomCharacterGallery } from '../hooks/useCustomCharacterGallery';
import { CharacterSpritePreview } from './character/CharacterSpritePreview';
import {
  CHARACTER_DEFINITIONS,
  getCharacterDefinitionOrDefault,
} from './game/characterSpritePresets';

type CharacterSelectScreenProps = {
  selectedCharacterId: CharacterId;
  selectedCustomCharacter?: CustomCharacterSummary | null;
  onBack: () => void;
  onOpenGenerator: () => void;
  onConfirm: (selection: {
    characterId: CharacterId;
    customCharacter?: CustomCharacterSummary | null;
  }) => void;
};

export const CharacterSelectScreen = ({
  selectedCharacterId,
  selectedCustomCharacter,
  onBack,
  onOpenGenerator,
  onConfirm,
}: CharacterSelectScreenProps) => {
  const insets = useSafeAreaInsets();
  const gallery = useCustomCharacterGallery();
  const [pendingCharacterId, setPendingCharacterId] = useState<CharacterId>(selectedCharacterId);
  const [pendingCustomCharacterId, setPendingCustomCharacterId] = useState<string | null>(
    selectedCharacterId === 'custom' ? (selectedCustomCharacter?.characterId ?? null) : null
  );

  const handleBack = useCallback(() => {
    onBack();
  }, [onBack]);

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  useEffect(() => {
    setPendingCharacterId(selectedCharacterId);
    setPendingCustomCharacterId(
      selectedCharacterId === 'custom' ? (selectedCustomCharacter?.characterId ?? null) : null
    );
  }, [selectedCharacterId, selectedCustomCharacter]);

  const pendingCustomCharacter =
    gallery.characters.find((character) => character.characterId === pendingCustomCharacterId) ??
    selectedCustomCharacter ??
    null;
  const pendingCharacter =
    pendingCharacterId === 'custom' ? null : getCharacterDefinitionOrDefault(pendingCharacterId);

  const handleSaveSelection = useCallback(async () => {
    if (pendingCharacterId === 'custom') {
      if (!pendingCustomCharacter) return;
      const activation = await gallery.activateCharacter(pendingCustomCharacter.characterId);
      onConfirm({
        characterId: 'custom',
        customCharacter: {
          ...pendingCustomCharacter,
          activeVersionId: activation.versionId,
          isActive: true,
          updatedAt: activation.activatedAt,
        },
      });
      return;
    }

    onConfirm({
      characterId: pendingCharacterId,
      customCharacter: null,
    });
  }, [gallery, onConfirm, pendingCharacterId, pendingCustomCharacter]);

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.splitDiagonal} />
      </View>

      <View
        className="z-10 flex-1 px-6 pb-10 pt-8"
        style={{ paddingTop: Math.max(insets.top, 32) }}>
        <View
          className="z-10 flex-row items-center justify-between"
          pointerEvents="box-none"
          style={{ minHeight: 44 }}>
          <Pressable
            onPress={handleBack}
            hitSlop={16}
            style={{ zIndex: 1 }}
            className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 transition-colors active:bg-white/10">
            <Text className="text-sm font-bold uppercase tracking-wider text-slate-300">Back</Text>
          </Pressable>
          <Text className="text-sm font-black uppercase italic tracking-widest text-slate-400">
            CHOOSE RUNNER
          </Text>
        </View>

        <View className="mt-6 items-center">
          <CharacterSpritePreview
            characterId={pendingCharacter?.id}
            sheetUrl={pendingCustomCharacter?.asset.sheetUrl}
            size={280}
            backgroundColor="rgba(255,255,255,0.03)"
          />
          <Text
            className="mt-4 text-5xl font-black italic tracking-wider text-white"
            style={{
              textShadowColor: 'rgba(0,0,0,0.5)',
              textShadowOffset: { width: 0, height: 4 },
              textShadowRadius: 10,
            }}>
            {pendingCustomCharacter?.displayName ?? pendingCharacter?.displayName ?? 'Runner'}
          </Text>
          <Text className="mt-2 max-w-sm text-center text-sm leading-5 text-slate-400">
            Choose a bundled runner or one of your AI-generated characters. This selection is used
            for solo runs and sent into multiplayer lobbies.
          </Text>
        </View>

        <Pressable
          onPress={onOpenGenerator}
          className="mt-6 rounded-2xl border border-orange-400/30 bg-orange-500/10 px-6 py-4 active:opacity-90">
          <Text className="text-center text-sm font-black uppercase tracking-[2px] text-orange-200">
            Open AI Runner Lab
          </Text>
        </Pressable>

        <ScrollView
          className="mt-6 flex-1"
          contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}>
          {CHARACTER_DEFINITIONS.map((character) => {
            const isSelected = character.id === pendingCharacterId;
            return (
              <Pressable
                key={character.id}
                onPress={() => {
                  setPendingCharacterId(character.id);
                  setPendingCustomCharacterId(null);
                }}
                className={`rounded-[24px] border px-6 py-5 transition-all active:scale-[0.98] ${
                  isSelected ? 'border-orange-400 bg-orange-500' : 'border-white/5 bg-slate-900/50'
                }`}
                style={isSelected ? styles.primaryButton : undefined}>
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text
                      className={`text-3xl font-black italic tracking-wide ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                      {character.displayName}
                    </Text>
                    <Text
                      className={`mt-1 text-sm font-medium ${isSelected ? 'text-orange-100' : 'text-slate-500'}`}>
                      {isSelected ? 'Selected for confirmation' : 'Tap to preview'}
                    </Text>
                  </View>
                  <View
                    className={`rounded-full px-4 py-2 ${isSelected ? 'border border-orange-300/30 bg-orange-900/40' : 'bg-white/5'}`}>
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

          <View className="mt-2 rounded-[24px] border border-white/10 bg-black/20 px-6 py-5">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-black uppercase tracking-[2px] text-orange-300">
                My AI Characters
              </Text>
              {gallery.walletSession.walletAddress ? (
                <Pressable onPress={() => void gallery.refresh()}>
                  <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Refresh
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {!gallery.walletSession.walletAddress ? (
              <Pressable
                onPress={() => void gallery.walletSession.connect()}
                className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                <Text className="text-center text-sm font-bold uppercase tracking-wider text-slate-200">
                  Connect Wallet To Load Gallery
                </Text>
              </Pressable>
            ) : null}

            {gallery.walletSession.walletAddress && gallery.characters.length === 0 ? (
              <Text className="mt-4 text-sm leading-6 text-slate-400">
                No AI-generated runners yet. Open the Runner Lab to create one.
              </Text>
            ) : null}

            {gallery.characters.map((character) => {
              const isSelected =
                pendingCharacterId === 'custom' &&
                pendingCustomCharacterId === character.characterId;

              return (
                <Pressable
                  key={character.characterId}
                  onPress={() => {
                    setPendingCharacterId('custom');
                    setPendingCustomCharacterId(character.characterId);
                  }}
                  className={`mt-4 rounded-[24px] border px-5 py-4 ${
                    isSelected ? 'border-orange-400 bg-orange-500/20' : 'border-white/10 bg-white/5'
                  }`}>
                  <View className="flex-row items-center gap-4">
                    <CharacterSpritePreview
                      sheetUrl={character.asset.thumbnailUrl ?? character.asset.sheetUrl}
                      size={88}
                      backgroundColor="rgba(255,255,255,0.03)"
                    />
                    <View className="flex-1">
                      <Text className="text-xl font-black italic tracking-wide text-white">
                        {character.displayName}
                      </Text>
                      <Text className="mt-1 text-xs font-bold uppercase tracking-[2px] text-slate-400">
                        {character.isActive ? 'Currently Active' : 'Tap To Select'}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <Pressable
          onPress={() => void handleSaveSelection()}
          className="rounded-full bg-white px-8 py-5 transition-transform active:scale-95"
          style={styles.whiteButtonGlow}>
          <Text className="text-center text-xl font-black uppercase italic tracking-widest text-black">
            Save Runner
          </Text>
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
  },
});
