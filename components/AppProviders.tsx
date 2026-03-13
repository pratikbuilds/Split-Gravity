import type { ReactNode } from 'react';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const SOLANA_CHAIN = 'solana:devnet';
const SOLANA_RPC_ENDPOINT = 'https://api.devnet.solana.com';

const appIdentity = {
  name: Constants.expoConfig?.name ?? 'Runner',
};

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  if (Platform.OS !== 'android') {
    return <>{children}</>;
  }

  const { MobileWalletProvider } = require('@wallet-ui/react-native-web3js') as {
    MobileWalletProvider: (props: {
      chain: string;
      endpoint: string;
      commitmentOrConfig: { commitment: string };
      identity: { name: string };
      children: ReactNode;
    }) => JSX.Element;
  };

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
