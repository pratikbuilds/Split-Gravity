import assert from 'node:assert/strict';
import test from 'node:test';
import nacl from 'tweetnacl';
import { createSignInMessageText } from '@solana/wallet-standard-util';
import { Keypair } from '@solana/web3.js';
import * as walletAuthShared from '../../../shared/walletAuth';
import { createSession, createWalletNonce, verifyWalletSignature } from '../payments/auth';

const sharedWalletAuth =
  'default' in walletAuthShared
    ? (walletAuthShared.default as typeof import('../../../shared/walletAuth'))
    : walletAuthShared;
const { createWalletSignInMessageFields } = sharedWalletAuth;

test('wallet signature verification succeeds for a signed nonce message', () => {
  const keypair = Keypair.generate();
  const nonce = createWalletNonce();
  const message = new TextEncoder().encode(
    createSignInMessageText(
      createWalletSignInMessageFields({
        address: keypair.publicKey.toBase58(),
        nonce: nonce.nonce,
        issuedAt: nonce.issuedAt,
      })
    )
  );
  const signature = nacl.sign.detached(message, keypair.secretKey);

  assert.doesNotThrow(() =>
    verifyWalletSignature({
      walletAddress: keypair.publicKey.toBase58(),
      nonce: nonce.nonce,
      signature: Buffer.from(signature).toString('base64'),
      signedMessage: Buffer.from(message).toString('base64'),
    })
  );
});

test('wallet session includes token and expiry', () => {
  const session = createSession('player-1', 'wallet-1');
  assert.equal(typeof session.accessToken, 'string');
  assert.equal(session.playerId, 'player-1');
  assert.equal(session.walletAddress, 'wallet-1');
  assert.ok(new Date(session.expiresAt).getTime() > Date.now());
});
