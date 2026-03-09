import { randomBytes } from 'node:crypto';
import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';
import { NONCE_TTL_MS, SESSION_TTL_MS } from './config';

export interface WalletNonceRecord {
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  consumedAt?: string;
}

export interface WalletSessionRecord {
  accessToken: string;
  playerId: string;
  walletAddress: string;
  expiresAt: string;
}

export const createWalletNonce = (): WalletNonceRecord => {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_MS);
  return {
    nonce: randomBytes(18).toString('hex'),
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
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

export const verifyWalletSignature = ({
  walletAddress,
  signedMessage,
  signature,
  nonce,
}: {
  walletAddress: string;
  signedMessage: string;
  signature: string;
  nonce: string;
}) => {
  const publicKey = new PublicKey(walletAddress).toBytes();
  const messageBytes = Buffer.from(signedMessage, 'base64');
  const signatureBytes = Buffer.from(signature, 'base64');
  const messageText = messageBytes.toString('utf8');
  const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey);

  if (!isValid) {
    throw new Error('Wallet signature verification failed.');
  }

  if (!messageText.includes(nonce)) {
    throw new Error('Signed message nonce mismatch.');
  }
};
