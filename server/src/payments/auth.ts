import { randomBytes } from 'node:crypto';
import { verifySignIn } from '@solana/wallet-standard-util';
import { PublicKey } from '@solana/web3.js';
import type { WalletSignInPayload } from '../shared/payment-contracts';
import { createWalletSignInPayload } from '../shared/walletAuth';
import { NONCE_TTL_MS, SESSION_TTL_MS } from './config';

export interface WalletSignInChallengeRecord {
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  signInPayload: WalletSignInPayload;
  consumedAt?: string;
}

export interface WalletSessionRecord {
  accessToken: string;
  playerId: string;
  walletAddress: string;
  expiresAt: string;
}

export const createWalletChallenge = (walletAddress: string): WalletSignInChallengeRecord => {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_MS);
  const nonce = randomBytes(18).toString('hex');
  return {
    nonce,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    signInPayload: createWalletSignInPayload({
      walletAddress,
      nonce,
      issuedAt: issuedAt.toISOString(),
    }),
  };
};

export const createSession = (playerId: string, walletAddress: string): WalletSessionRecord => {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  return {
    accessToken: randomBytes(24).toString('hex'),
    playerId,
    walletAddress,
    expiresAt: expiresAt.toISOString(),
  };
};

export const verifyWalletSignIn = ({
  challenge,
  signedMessage,
  signature,
}: {
  challenge: WalletSignInChallengeRecord;
  signedMessage: string;
  signature: string;
}) => {
  const messageBytes = Buffer.from(signedMessage, 'base64');
  const signatureBytes = Buffer.from(signature, 'base64');
  const publicKey = new PublicKey(challenge.signInPayload.address).toBytes();

  if (signatureBytes.length !== 64) {
    throw new Error('Wallet signature must be 64 bytes.');
  }

  const isValid = verifySignIn(challenge.signInPayload, {
    account: {
      address: challenge.signInPayload.address,
      publicKey,
      chains: [],
      features: [],
    },
    signedMessage: messageBytes,
    signature: signatureBytes,
  });

  if (!isValid) {
    throw new Error('Wallet signature verification failed.');
  }
};
