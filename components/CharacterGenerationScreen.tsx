import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCharacterGenerationFlow } from '../hooks/useCharacterGenerationFlow';
import { useCustomCharacterGallery } from '../hooks/useCustomCharacterGallery';
import type { CustomCharacterSummary } from '../shared/character-generation-contracts';
import { GenerationJobCard } from './character-generation/GenerationJobCard';

type CharacterGenerationScreenProps = {
  onBack: () => void;
  onUseCharacter: (character: CustomCharacterSummary) => void;
};

export const CharacterGenerationScreen = ({
  onBack,
  onUseCharacter,
}: CharacterGenerationScreenProps) => {
  const insets = useSafeAreaInsets();
  const [displayName, setDisplayName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [referenceImageDataUrl, setReferenceImageDataUrl] = useState<string | null>(null);
  const generation = useCharacterGenerationFlow();
  const gallery = useCustomCharacterGallery();

  const canSubmit = useMemo(
    () => Boolean(prompt.trim() || referenceImageDataUrl) && !generation.submitting,
    [generation.submitting, prompt, referenceImageDataUrl]
  );

  const handlePickImage = async () => {
    const nextImage = await generation.pickReferenceImage();
    if (nextImage) {
      setReferenceImageDataUrl(nextImage);
    }
  };

  const handleSubmit = async () => {
    try {
      await generation.submitGeneration({
        displayName: displayName.trim() || undefined,
        prompt: prompt.trim() || undefined,
        referenceImageDataUrl,
      });
      setPrompt('');
      setDisplayName('');
      setReferenceImageDataUrl(null);
    } catch (error) {
      Alert.alert('Generation Failed', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const handleUseCharacter = async (
    characterId: string,
    fallback: NonNullable<(typeof generation.jobs)[number]['result']>
  ) => {
    try {
      const activation = await gallery.activateCharacter(characterId);
      const selected =
        gallery.characters.find((character) => character.characterId === characterId) ?? null;

      onUseCharacter(
        selected ?? {
          characterId: fallback.characterId,
          displayName: fallback.displayName,
          activeVersionId: activation.versionId,
          asset: fallback.asset,
          isActive: true,
          createdAt: fallback.createdAt,
          updatedAt: activation.activatedAt,
        }
      );
    } catch (error) {
      Alert.alert(
        'Activation Failed',
        error instanceof Error ? error.message : 'Unable to select this runner.'
      );
    }
  };

  return (
    <View className="flex-1 bg-[#0a0510]">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: Math.max(insets.top + 16, 48),
          paddingBottom: Math.max(insets.bottom + 24, 32),
          gap: 20,
        }}
        showsVerticalScrollIndicator={false}>
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={onBack}
            className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5">
            <Text className="text-sm font-bold uppercase tracking-wider text-slate-300">Back</Text>
          </Pressable>
          <Pressable
            onPress={() => void generation.refresh()}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
            <Text className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Refresh
            </Text>
          </Pressable>
        </View>

        <View>
          <Text className="text-4xl font-black italic tracking-widest text-white">
            AI RUNNER LAB
          </Text>
          <Text className="mt-3 text-sm leading-6 text-slate-400">
            Generate a new 2K sprite sheet from a prompt or a reference image. Jobs keep running
            after you leave this screen.
          </Text>
        </View>

        <View className="rounded-3xl border border-white/10 bg-slate-900/70 p-5">
          <Text className="text-xs font-black uppercase tracking-[2px] text-orange-300">Cost</Text>
          <Text className="mt-2 text-2xl font-black text-white">
            {generation.config?.pricing.amountDisplay ?? '...'}
          </Text>
          <Text className="mt-2 text-sm leading-5 text-slate-400">
            Size: {generation.config?.generationSize ?? '2K'} · Max active jobs:{' '}
            {generation.config?.maxConcurrentJobs ?? 0}
          </Text>
        </View>

        <View className="rounded-3xl border border-white/10 bg-slate-900/70 p-5">
          <Text className="text-xs font-black uppercase tracking-[2px] text-orange-300">
            Runner Name
          </Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Runner 7"
            placeholderTextColor="#64748b"
            className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-white"
          />

          <Text className="mt-5 text-xs font-black uppercase tracking-[2px] text-orange-300">
            Prompt
          </Text>
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Describe the character silhouette, outfit, and vibe..."
            placeholderTextColor="#64748b"
            multiline
            textAlignVertical="top"
            className="mt-3 min-h-[120px] rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-white"
          />

          <View className="mt-5 flex-row gap-3">
            <Pressable
              onPress={() => void handlePickImage()}
              className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
              <Text className="text-center text-sm font-bold uppercase tracking-wider text-slate-200">
                {referenceImageDataUrl ? 'Replace Image' : 'Upload Image'}
              </Text>
            </Pressable>
            {referenceImageDataUrl ? (
              <Pressable
                onPress={() => setReferenceImageDataUrl(null)}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                <Text className="text-center text-sm font-bold uppercase tracking-wider text-slate-200">
                  Clear
                </Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={() => void handleSubmit()}
            disabled={!canSubmit}
            className={`mt-5 rounded-2xl px-4 py-4 ${
              canSubmit ? 'bg-orange-500' : 'bg-slate-700'
            }`}>
            <Text className="text-center text-base font-black uppercase tracking-wider text-white">
              {generation.submitting ? 'Submitting…' : 'Generate Runner'}
            </Text>
          </Pressable>

          {generation.error ? (
            <Text className="mt-4 text-sm leading-5 text-red-300">{generation.error}</Text>
          ) : null}
        </View>

        <View className="gap-4">
          <Text className="text-xs font-black uppercase tracking-[2px] text-orange-300">
            Recent Jobs
          </Text>
          {generation.jobs.length === 0 ? (
            <View className="rounded-3xl border border-dashed border-white/10 bg-slate-900/40 p-6">
              <Text className="text-sm leading-6 text-slate-400">
                Your completed and in-progress generations will show up here.
              </Text>
            </View>
          ) : null}
          {generation.jobs.map((job) => {
            const result = job.result;
            return (
              <GenerationJobCard
                key={job.jobId}
                job={job}
                onUseCharacter={
                  result ? () => void handleUseCharacter(result.characterId, result) : undefined
                }
              />
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};
