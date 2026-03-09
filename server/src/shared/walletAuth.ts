export const WALLET_SIGN_IN_DOMAIN = 'runner.mobile';
export const WALLET_SIGN_IN_STATEMENT = 'Sign in to Runner paid modes.';
export const WALLET_SIGN_IN_URI = 'https://runner.mobile';
export const WALLET_SIGN_IN_VERSION = '1';
export const WALLET_SIGN_IN_CHAIN_ID = 'solana:devnet';

export const createWalletSignInPayloadFields = (nonce: string, issuedAt: string) => ({
  domain: WALLET_SIGN_IN_DOMAIN,
  statement: WALLET_SIGN_IN_STATEMENT,
  uri: WALLET_SIGN_IN_URI,
  version: WALLET_SIGN_IN_VERSION,
  chainId: WALLET_SIGN_IN_CHAIN_ID,
  nonce,
  issuedAt,
});

export const createWalletSignInMessageFields = ({
  address,
  nonce,
  issuedAt,
}: {
  address: string;
  nonce: string;
  issuedAt: string;
}) => ({
  ...createWalletSignInPayloadFields(nonce, issuedAt),
  address,
});
