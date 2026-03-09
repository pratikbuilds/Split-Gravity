import { Pressable, Text, View } from 'react-native';
import type { SinglePlayerMenuMode } from '../types/payments';

type SingleModeSelectScreenProps = {
  onBack: () => void;
  onSelect: (mode: SinglePlayerMenuMode) => void;
};

export const SingleModeSelectScreen = ({ onBack, onSelect }: SingleModeSelectScreenProps) => {
  return (
    <View className="flex-1 bg-[#050816] px-6 py-16">
      <Text className="text-5xl font-black tracking-[4px] text-white">Single Play</Text>
      <Text className="mt-3 max-w-sm text-sm leading-5 text-slate-300">
        Choose a free practice run or enter the paid daily distance contest.
      </Text>

      <View className="mt-10 gap-4">
        <Pressable
          onPress={() => onSelect('practice')}
          className="rounded-[28px] border border-white/10 bg-white px-6 py-6 active:opacity-80">
          <Text className="text-sm font-semibold uppercase tracking-[2px] text-slate-500">
            Free
          </Text>
          <Text className="mt-2 text-2xl font-black text-black">Practice</Text>
          <Text className="mt-2 text-sm leading-5 text-slate-700">
            Instant run. No wallet required. Perfect for warm-up and learning the terrain.
          </Text>
        </Pressable>

        <Pressable
          onPress={() => onSelect('paid_contest')}
          className="rounded-[28px] border border-amber-300/30 bg-[#16141f] px-6 py-6 active:opacity-80">
          <Text className="text-sm font-semibold uppercase tracking-[2px] text-amber-200">
            Paid
          </Text>
          <Text className="mt-2 text-2xl font-black text-white">Daily Paid Contest</Text>
          <Text className="mt-2 text-sm leading-5 text-slate-300">
            Pay the entry fee, post your best distance for the UTC day, and compete for the prize
            pool.
          </Text>
        </Pressable>
      </View>

      <Pressable
        onPress={onBack}
        className="mt-8 self-start rounded-full border border-white/20 px-5 py-3 active:opacity-80">
        <Text className="font-bold text-white">Back</Text>
      </Pressable>
    </View>
  );
};
