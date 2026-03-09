import { Pressable, Text, View } from 'react-native';
import { WalletProofCard } from './WalletProofCard';

type WalletDebugScreenProps = {
  onBack: () => void;
};

export const WalletDebugScreen = ({ onBack }: WalletDebugScreenProps) => {
  return (
    <View className="flex-1 bg-[#050816] px-6 py-16">
      <Text className="text-3xl font-black text-white">Wallet Debug</Text>
      <Text className="mt-3 max-w-sm text-sm leading-5 text-slate-300">
        This surface keeps the low-level proof tooling out of the player home flow while still
        making it available during development.
      </Text>
      <WalletProofCard />
      <Pressable
        onPress={onBack}
        className="mt-8 self-start rounded-full border border-white/20 px-5 py-3 active:opacity-80">
        <Text className="font-bold text-white">Back</Text>
      </Pressable>
    </View>
  );
};
