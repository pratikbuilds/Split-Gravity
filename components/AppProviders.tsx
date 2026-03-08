import type { ReactNode } from 'react';
import Constants from 'expo-constants';
import { MobileWalletProvider } from '@wallet-ui/react-native-web3js';

const SOLANA_CHAIN = 'solana:devnet';
const SOLANA_RPC_ENDPOINT = 'https://api.devnet.solana.com';

const appIdentity = {
  name: Constants.expoConfig?.name ?? 'Runner',
};

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <MobileWalletProvider
      chain={SOLANA_CHAIN}
      endpoint={SOLANA_RPC_ENDPOINT}
      commitmentOrConfig={{ commitment: 'confirmed' }}
      identity={appIdentity}>
      {children}
    </MobileWalletProvider>
  );
}
