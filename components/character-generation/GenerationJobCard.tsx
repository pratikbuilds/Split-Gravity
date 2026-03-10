import { Pressable, Text, View } from 'react-native';
import type { CharacterGenerationJobSummary } from '../../shared/character-generation-contracts';
import { CharacterSpritePreview } from '../character/CharacterSpritePreview';

type GenerationJobCardProps = {
  job: CharacterGenerationJobSummary;
  onUseCharacter?: () => void;
};

const STATUS_COPY: Record<CharacterGenerationJobSummary['status'], string> = {
  queued: 'Queued',
  running: 'Generating',
  succeeded: 'Ready',
  failed: 'Failed',
  refunded: 'Refunded',
};

export const GenerationJobCard = ({ job, onUseCharacter }: GenerationJobCardProps) => {
  return (
    <View className="rounded-3xl border border-white/10 bg-slate-900/70 p-5">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-4">
          <Text className="text-lg font-black uppercase tracking-wide text-white">
            {job.displayName || 'Untitled Runner'}
          </Text>
          <Text className="mt-1 text-xs font-bold uppercase tracking-[2px] text-orange-300">
            {STATUS_COPY[job.status]}
          </Text>
        </View>
        {job.result?.asset.sheetUrl ? (
          <CharacterSpritePreview
            sheetUrl={job.result.asset.sheetUrl}
            sheetAnimation={job.result.asset.animation}
            size={92}
            backgroundColor="rgba(255,255,255,0.04)"
            previewMode="jobCard"
          />
        ) : null}
      </View>

      {job.failureMessage ? (
        <Text className="mt-3 text-sm text-red-300">{job.failureMessage}</Text>
      ) : null}

      {job.prompt ? (
        <Text className="mt-3 text-sm leading-5 text-slate-300" numberOfLines={3}>
          {job.prompt}
        </Text>
      ) : null}

      {job.result && onUseCharacter ? (
        <Pressable
          onPress={onUseCharacter}
          className="mt-4 rounded-2xl bg-orange-500 px-4 py-3 active:opacity-90">
          <Text className="text-center text-sm font-black uppercase tracking-wider text-white">
            Use This Runner
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
};
