import { Pressable, Text, View } from 'react-native';
import type { MultiplayerMenuMode } from '../types/payments';

type MultiplayerModeSelectScreenProps = {
  onBack: () => void;
  onSelect: (mode: MultiplayerMenuMode) => void;
};

const OPTIONS: {
  mode: MultiplayerMenuMode;
  eyebrow: string;
  title: string;
  description: string;
}[] = [
  {
    mode: 'casual_room',
    eyebrow: 'Free',
    title: 'Casual Room',
    description: 'Create or join a normal room with no wallet or wager required.',
  },
  {
    mode: 'paid_private_room',
    eyebrow: 'Paid',
    title: 'Paid Private Room',
    description:
      'Lock in a token and entry fee, then challenge a specific opponent in a private room.',
  },
  {
    mode: 'paid_matchmaking',
    eyebrow: 'Paid',
    title: 'Paid Matchmaking',
    description: 'Queue into a public paid bucket and get matched against another funded player.',
  },
];

export const MultiplayerModeSelectScreen = ({
  onBack,
  onSelect,
}: MultiplayerModeSelectScreenProps) => {
  return (
    <View className="flex-1 bg-[#050816] px-6 py-16">
      <Text className="text-5xl font-black tracking-[4px] text-white">Multiplayer</Text>
      <Text className="mt-3 max-w-sm text-sm leading-5 text-slate-300">
        Choose a casual room or a paid mode. Wallet steps only appear when money is involved.
      </Text>

      <View className="mt-10 gap-4">
        {OPTIONS.map((option) => (
          <Pressable
            key={option.mode}
            onPress={() => onSelect(option.mode)}
            className={`rounded-[28px] px-6 py-6 active:opacity-80 ${
              option.eyebrow === 'Free'
                ? 'border border-white/10 bg-white'
                : 'border border-cyan-300/25 bg-[#111827]'
            }`}>
            <Text
              className={`text-sm font-semibold uppercase tracking-[2px] ${
                option.eyebrow === 'Free' ? 'text-slate-500' : 'text-cyan-200'
              }`}>
              {option.eyebrow}
            </Text>
            <Text
              className={`mt-2 text-2xl font-black ${
                option.eyebrow === 'Free' ? 'text-black' : 'text-white'
              }`}>
              {option.title}
            </Text>
            <Text
              className={`mt-2 text-sm leading-5 ${
                option.eyebrow === 'Free' ? 'text-slate-700' : 'text-slate-300'
              }`}>
              {option.description}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={onBack}
        className="mt-8 self-start rounded-full border border-white/20 px-5 py-3 active:opacity-80">
        <Text className="font-bold text-white">Back</Text>
      </Pressable>
    </View>
  );
};
