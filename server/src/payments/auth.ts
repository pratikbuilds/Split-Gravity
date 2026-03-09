import { randomBytes } from 'node:crypto';
import nacl from 'tweetnacl';
import { createSignInMessageText, parseSignInMessageText } from '@solana/wallet-standard-util';
import { PublicKey } from '@solana/web3.js';
import * as walletAuthShared from '../../../shared/walletAuth';
import { NONCE_TTL_MS, SESSION_TTL_MS } from './config';

const sharedWalletAuth =
  'default' in walletAuthShared
    ? (walletAuthShared.default as typeof import('../../../shared/walletAuth'))
    : walletAuthShared;
const { createWalletSignInMessageFields } = sharedWalletAuth;

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

  let parsedMessage: ReturnType<typeof parseSignInMessageText>;
  try {
    parsedMessage = parseSignInMessageText(messageText);
  } catch {
    throw new Error('Signed message format mismatch.');
  }
  if (!parsedMessage?.issuedAt) {
    throw new Error('Signed message format mismatch.');
  }

  const expectedMessage = createSignInMessageText(
    createWalletSignInMessageFields({
      address: walletAddress,
      nonce,
      issuedAt: parsedMessage.issuedAt,
    })
  );

  if (messageText !== expectedMessage) {
    throw new Error('Signed message payload mismatch.');
  }
};
