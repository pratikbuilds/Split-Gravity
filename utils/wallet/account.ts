import { PublicKey } from '@solana/web3.js';

type WalletAccountLike = {
  publicKey?: PublicKey | null;
  address?: string | PublicKey | null;
} | null | undefined;

export const getWalletPublicKey = (account: WalletAccountLike): PublicKey | null => {
  if (!account) return null;

  if (account.publicKey instanceof PublicKey) {
    return account.publicKey;
  }

  if (account.address instanceof PublicKey) {
    return account.address;
  }

  if (typeof account.address === 'string' && account.address.length > 0) {
    try {
      return new PublicKey(account.address);
    } catch {
      return null;
    }
  }

  return null;
};

export const getWalletAddress = (account: WalletAccountLike): string | null => {
  const publicKey = getWalletPublicKey(account);
  return publicKey ? publicKey.toBase58() : null;
};
