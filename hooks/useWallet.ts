import { Platform } from 'react-native';

/**
 * Single wallet hook used by the app. On Android it uses the native adapter;
 * on iOS the native module is not linked, so we return a stub and never load @wallet-ui.
 */
export type WalletAccountLike = {
  publicKey?: unknown;
  address?: string | unknown;
} | null;

export type WalletApi = {
  account: WalletAccountLike;
  connect: () => Promise<WalletAccountLike>;
  disconnect: () => Promise<void>;
  signIn: (payload: Record<string, unknown>) => Promise<unknown>;
  signAndSendTransaction: (transaction: unknown, minContextSlot?: number) => Promise<string | { signature: string } | string[]>;
  signTransaction?: (transaction: unknown) => Promise<unknown>;
  connection?: unknown;
};

const UNSUPPORTED_MSG = 'Wallet is not available on iOS. Use an Android build for wallet features.';

const stubWallet: WalletApi = {
  account: null,
  connect: async () => null,
  disconnect: async () => {},
  signIn: async () => {
    throw new Error(UNSUPPORTED_MSG);
  },
  signAndSendTransaction: async () => {
    throw new Error(UNSUPPORTED_MSG);
  },
  signTransaction: async () => {
    throw new Error(UNSUPPORTED_MSG);
  },
  connection: undefined,
};

export function useWallet(): WalletApi {
  if (Platform.OS !== 'android') {
    return stubWallet;
  }
  const { useMobileWallet } = require('@wallet-ui/react-native-web3js') as {
    useMobileWallet: () => WalletApi;
  };
  return useMobileWallet();
}
