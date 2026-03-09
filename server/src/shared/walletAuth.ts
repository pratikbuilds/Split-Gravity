import type { WalletSignInPayload } from './payment-contracts';

export const WALLET_SIGN_IN_DOMAIN = 'runner.mobile';
export const WALLET_SIGN_IN_STATEMENT = 'Sign in to Runner paid modes.';
export const WALLET_SIGN_IN_URI = 'https://runner.mobile';
export const WALLET_SIGN_IN_VERSION = '1';
export const WALLET_SIGN_IN_CHAIN_ID = 'solana:devnet';

export const createWalletSignInPayload = ({
  walletAddress,
  nonce,
  issuedAt,
}: {
  walletAddress: string;
  nonce: string;
  issuedAt: string;
}): WalletSignInPayload => ({
  domain: WALLET_SIGN_IN_DOMAIN,
  address: walletAddress,
  statement: WALLET_SIGN_IN_STATEMENT,
  uri: WALLET_SIGN_IN_URI,
  version: WALLET_SIGN_IN_VERSION,
  chainId: WALLET_SIGN_IN_CHAIN_ID,
  nonce,
  issuedAt,
});
