import type { WalletVerifyRequest } from '../../shared/payment-contracts';

export const createWalletVerifyRequest = (_: {
  nonce: string;
  signInResult: unknown;
}): WalletVerifyRequest => {
  throw new Error('Wallet auth is not available on iOS.');
};
