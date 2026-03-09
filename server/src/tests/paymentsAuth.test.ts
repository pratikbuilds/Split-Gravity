import assert from 'node:assert/strict';
import test from 'node:test';
import nacl from 'tweetnacl';
import { Keypair } from '@solana/web3.js';
import { createSession, createWalletNonce, verifyWalletSignature } from '../payments/auth';

test('wallet signature verification succeeds for a signed nonce message', () => {
  const keypair = Keypair.generate();
  const nonce = createWalletNonce();
  const message = new TextEncoder().encode(`Runner sign-in nonce: ${nonce.nonce}`);
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
