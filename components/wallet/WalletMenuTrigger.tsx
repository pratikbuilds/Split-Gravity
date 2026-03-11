import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

type WalletMenuTriggerProps = {
  hasValidSession: boolean;
  walletAddress?: string | null;
  onPress: () => void;
};

const shortenAddress = (address: string) => `${address.slice(0, 4)}...${address.slice(-4)}`;

function WalletMenuTriggerComponent({
  hasValidSession,
  walletAddress,
  onPress,
}: WalletMenuTriggerProps) {
  const isConnected = Boolean(walletAddress);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isConnected ? 'Open wallet menu' : 'Connect wallet'}
      onPress={onPress}
      className={`min-h-12 flex-row items-center gap-3 rounded-full border px-4 py-3 ${
        isConnected ? 'border-emerald-400/30 bg-emerald-500/10' : 'border-white/14 bg-black/25'
      }`}>
      <View
        className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-emerald-300' : 'bg-orange-300'}`}
      />

      <View>
        <Text
          className={`text-[10px] font-black uppercase tracking-[2px] ${
            isConnected ? 'text-emerald-100' : 'text-orange-100'
          }`}>
          {isConnected ? (hasValidSession ? 'Wallet Ready' : 'Wallet Connected') : 'Wallet'}
        </Text>
        <Text className="mt-0.5 text-sm font-bold text-white">
          {walletAddress ? shortenAddress(walletAddress) : 'Connect Wallet'}
        </Text>
      </View>
    </Pressable>
  );
}

export const WalletMenuTrigger = memo(WalletMenuTriggerComponent);
