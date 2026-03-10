import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { MaterialIcons } from '@expo/vector-icons';
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

type RunnerListItem =
  | {
      key: string;
      kind: 'preset';
      title: string;
      characterId: Exclude<CharacterId, 'custom'>;
    }
  | {
      key: string;
      kind: 'ai';
      title: string;
      character: CustomCharacterSummary;
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

  const aiCharacters = useMemo(() => {
    const deduped = new Map<string, CustomCharacterSummary>();

    for (const character of gallery.characters) {
      deduped.set(character.characterId, character);
    }

    if (selectedCustomCharacter) {
      deduped.set(selectedCustomCharacter.characterId, selectedCustomCharacter);
    }

    return Array.from(deduped.values()).sort((left, right) => {
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    });
  }, [gallery.characters, selectedCustomCharacter]);

  const pendingCustomCharacter =
    aiCharacters.find((character) => character.characterId === pendingCustomCharacterId) ?? null;
  const pendingCharacter =
    pendingCharacterId === 'custom' ? null : getCharacterDefinitionOrDefault(pendingCharacterId);

  const runnerItems = useMemo<RunnerListItem[]>(() => {
    return [
      ...CHARACTER_DEFINITIONS.map((character) => ({
        key: character.id,
        kind: 'preset' as const,
        title: character.displayName,
        characterId: character.id,
      })),
      ...aiCharacters.map((character) => ({
        key: `ai-${character.characterId}`,
        kind: 'ai' as const,
        title: character.displayName,
        character,
      })),
    ];
  }, [aiCharacters]);

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

  const handleSelectPreset = useCallback((characterId: Exclude<CharacterId, 'custom'>) => {
    setPendingCharacterId(characterId);
    setPendingCustomCharacterId(null);
  }, []);

  const handleSelectAi = useCallback((character: CustomCharacterSummary) => {
    setPendingCharacterId('custom');
    setPendingCustomCharacterId(character.characterId);
  }, []);

  const labStatus = useMemo(() => {
    if (gallery.error) return gallery.error;
    if (gallery.loading) return 'Refreshing your AI runners...';
    if (!gallery.walletSession.walletAddress)
      return 'Connect wallet to load your generated runners.';
    if (aiCharacters.length === 0) return 'No AI runners yet. Open the lab to make your first one.';
    return `${aiCharacters.length} AI runner${aiCharacters.length === 1 ? '' : 's'} ready to use.`;
  }, [aiCharacters.length, gallery.error, gallery.loading, gallery.walletSession.walletAddress]);

  const renderRunnerItem = useCallback(
    ({ item }: { item: RunnerListItem }) => {
      const isPreset = item.kind === 'preset';
      const isSelected = isPreset
        ? pendingCharacterId === item.characterId
        : pendingCharacterId === 'custom' &&
          pendingCustomCharacterId === item.character.characterId;

      const subtitle = isPreset
        ? isSelected
          ? 'Selected for confirmation'
          : 'Built-in runner'
        : isSelected
          ? 'Selected AI runner'
          : item.character.isActive
            ? 'AI runner currently active'
            : 'AI-generated runner';

      return (
        <Pressable
          onPress={() => {
            if (isPreset) {
              handleSelectPreset(item.characterId);
              return;
            }

            handleSelectAi(item.character);
          }}
          className={`rounded-[24px] px-4 py-3 active:scale-[0.99] ${isSelected ? '' : 'bg-white/5'}`}
          style={isSelected ? styles.selectedCard : undefined}>
          <View className="flex-row items-center gap-3">
            <View className="flex-1 flex-row items-center gap-3">
              <View
                className={`h-2.5 w-2.5 rounded-full ${
                  isSelected ? 'bg-orange-300' : 'bg-white/20'
                }`}
              />
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text
                    className={`text-[22px] font-black italic tracking-wide ${
                      isSelected ? 'text-white' : 'text-slate-100'
                    }`}
                    numberOfLines={1}>
                    {item.title}
                  </Text>
                  {!isPreset ? (
                    <View className="rounded-full bg-orange-500/15 px-2 py-1">
                      <Text className="text-[9px] font-black uppercase tracking-[1.5px] text-orange-200">
                        AI
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  className={`mt-0.5 text-[12px] font-medium ${
                    isSelected ? 'text-orange-100' : 'text-slate-400'
                  }`}>
                  {subtitle}
                </Text>
              </View>
            </View>

            {isSelected ? (
              <View className="rounded-full bg-orange-900/40 px-3 py-1.5">
                <Text className="text-[10px] font-black uppercase tracking-[1.5px] text-orange-200">
                  Current
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      );
    },
    [handleSelectAi, handleSelectPreset, pendingCharacterId, pendingCustomCharacterId]
  );

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.splitDiagonal} />
      </View>

      <View
        className="z-10 flex-1 px-6"
        style={{
          paddingTop: Math.max(insets.top, 28),
          paddingBottom: Math.max(insets.bottom + 12, 24),
        }}>
        <View
          className="z-10 flex-row items-center justify-between"
          pointerEvents="box-none"
          style={{ minHeight: 44 }}>
          <Pressable
            onPress={handleBack}
            hitSlop={16}
            style={{ zIndex: 1 }}
            className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 active:bg-white/10">
            <Text className="text-sm font-bold uppercase tracking-wider text-slate-300">Back</Text>
          </Pressable>
          <Text className="text-sm font-black uppercase italic tracking-widest text-slate-400">
            CHOOSE RUNNER
          </Text>
        </View>

        <View className="mt-4 items-center">
          <CharacterSpritePreview
            characterId={pendingCharacter?.id}
            sheetUrl={pendingCustomCharacter?.asset.sheetUrl}
            sheetAnimation={pendingCustomCharacter?.asset.animation}
            size={176}
            backgroundColor="rgba(255,255,255,0.04)"
          />
          <Text
            className="mt-3 text-[34px] font-black italic tracking-wide text-white"
            style={styles.heroTitle}>
            {pendingCustomCharacter?.displayName ?? pendingCharacter?.displayName ?? 'Runner'}
          </Text>
          <Text className="mt-1 max-w-xs text-center text-sm leading-5 text-slate-400">
            Pick a runner, keep the preview live, and save the loadout for solo or multiplayer.
          </Text>
        </View>

        <Pressable
          onPress={onOpenGenerator}
          className="bg-orange-500/12 mt-4 rounded-[24px] px-5 py-4 active:opacity-90"
          style={styles.labCard}>
          <View className="flex-row items-center gap-4">
            <View style={styles.labIconWrap}>
              <MaterialIcons name="auto-awesome" size={24} color="#fff7ed" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-black uppercase tracking-[2px] text-orange-100">
                AI Runner Lab
              </Text>
              <Text className="mt-1 text-sm leading-5 text-orange-50/80">
                Generate brighter custom runners and drop them straight into this lineup.
              </Text>
            </View>
            <MaterialIcons name="north-east" size={22} color="#fdba74" />
          </View>
        </Pressable>

        <View className="mt-2 flex-row items-center justify-between px-1">
          <Text
            className={`flex-1 pr-4 text-xs font-bold uppercase tracking-[1.5px] ${
              gallery.error ? 'text-red-300' : 'text-slate-400'
            }`}>
            {labStatus}
          </Text>
          <Pressable
            onPress={() =>
              void (gallery.walletSession.walletAddress
                ? gallery.refresh()
                : gallery.walletSession.connect())
            }
            className="rounded-full border border-white/10 bg-white/5 px-3 py-2 active:bg-white/10">
            <Text className="text-[11px] font-black uppercase tracking-[1.5px] text-slate-200">
              {gallery.walletSession.walletAddress ? 'Refresh' : 'Connect'}
            </Text>
          </Pressable>
        </View>

        <FlatList
          data={runnerItems}
          keyExtractor={(item) => item.key}
          renderItem={renderRunnerItem}
          className="mt-4 flex-1"
          contentContainerStyle={{ paddingBottom: 20 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          showsVerticalScrollIndicator={false}
        />

        <Pressable
          onPress={() => void handleSaveSelection()}
          className="rounded-full bg-white px-8 py-5 active:scale-95"
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
  heroTitle: {
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
  },
  selectedCard: {
    backgroundColor: 'rgba(249, 115, 22, 0.18)',
  },
  labCard: {
    backgroundColor: 'rgba(249, 115, 22, 0.12)',
  },
  labIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  whiteButtonGlow: {
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
});
