import assert from 'node:assert/strict';
import test from 'node:test';
import nacl from 'tweetnacl';
import { createSignInMessageText } from '@solana/wallet-standard-util';
import { Keypair } from '@solana/web3.js';
import { createSession, createWalletChallenge, verifyWalletSignIn } from '../payments/auth';

test('wallet sign-in verification succeeds for a server-issued challenge', () => {
  const keypair = Keypair.generate();
  const challenge = createWalletChallenge(keypair.publicKey.toBase58());
  const message = new TextEncoder().encode(
    createSignInMessageText(challenge.signInPayload)
  );
  const signature = nacl.sign.detached(message, keypair.secretKey);

  assert.doesNotThrow(() =>
    verifyWalletSignIn({
      challenge,
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
