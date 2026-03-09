import { memo } from 'react';
import { Text, View } from 'react-native';
import { useMobileWallet } from '@wallet-ui/react-native-web3js';
import { getWalletAddress } from '../../utils/wallet/account';

const shortenAddress = (address: string) => `${address.slice(0, 4)}...${address.slice(-4)}`;

function WalletStatusChipComponent() {
  const { account } = useMobileWallet();
  const walletAddress = getWalletAddress(account);

  if (!walletAddress) return null;

  return (
    <View className="self-center rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2">
      <Text className="text-xs font-semibold uppercase tracking-[2px] text-emerald-100">
        Wallet {shortenAddress(walletAddress)}
      </Text>
    </View>
  );
}

export const WalletStatusChip = memo(WalletStatusChipComponent);
