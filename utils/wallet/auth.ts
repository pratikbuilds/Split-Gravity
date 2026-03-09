import type { SignInPayload } from '@wallet-ui/react-native-web3js';

export const createWalletSignInPayload = (nonce: string): SignInPayload => {
  const now = new Date().toISOString();
  return {
    domain: 'runner.mobile',
    statement: 'Sign in to Runner paid modes.',
    uri: 'https://runner.mobile',
    version: '1',
    chainId: 'solana:devnet',
    nonce,
    issuedAt: now,
  };
};
