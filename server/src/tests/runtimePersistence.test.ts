import assert from 'node:assert/strict';
import test from 'node:test';
import nacl from 'tweetnacl';
import { Keypair } from '@solana/web3.js';
import { newDb } from 'pg-mem';
import { PostgresRuntimeStateRepository } from '../lib/runtimeStateRepository';
import { PaymentService } from '../payments/service';
import { PaymentStore } from '../payments/store';

const createRepository = async () => {
  const database = newDb();
  const adapter = database.adapters.createPg();
  const pool = new adapter.Pool();
  await pool.query(`
    create table runtime_snapshots (
      namespace varchar(64) primary key,
      payload jsonb not null,
      updated_at timestamptz not null default now()
    );
  `);
  return new PostgresRuntimeStateRepository(pool);
};

const createSignedWalletSession = async (service: PaymentService, keypair: Keypair) => {
  const nonce = await service.issueNonce();
  const message = new TextEncoder().encode(`Runner sign-in nonce: ${nonce.nonce}`);
  const signature = nacl.sign.detached(message, keypair.secretKey);

  return service.verifyWallet({
    walletAddress: keypair.publicKey.toBase58(),
    nonce: nonce.nonce,
    signedMessage: Buffer.from(message).toString('base64'),
    signature: Buffer.from(signature).toString('base64'),
  });
};

test('runtime persistence restores auth session and payment state after restart', async () => {
  const repository = await createRepository();
  const vaultPublicKey = Keypair.generate().publicKey.toBase58();

  const serviceA = new PaymentService({
    store: new PaymentStore({ vaultPublicKey }),
    runtimeStateRepository: repository,
  });
  await serviceA.initialize();

  const winner = Keypair.generate();
  const loser = Keypair.generate();
  const winnerSession = await createSignedWalletSession(serviceA, winner);
  const loserSession = await createSignedWalletSession(serviceA, loser);
  const [contest] = serviceA.getDailyContests();

  const reusableIntent = await serviceA.createPaymentIntent(winnerSession.accessToken, {
    tokenId: contest.tokenId,
    entryFeeTierId: contest.entryFeeTierId,
    purpose: 'multi_paid_private',
  });
  await serviceA.confirmPaymentIntent(winnerSession.accessToken, reusableIntent.paymentIntentId, {
    transactionSignature: 'persist-sig-private',
    walletAddress: winner.publicKey.toBase58(),
  });

  const winnerPayoutIntent = await serviceA.createPaymentIntent(winnerSession.accessToken, {
    tokenId: contest.tokenId,
    entryFeeTierId: contest.entryFeeTierId,
    purpose: 'multi_paid_queue',
  });
  await serviceA.confirmPaymentIntent(
    winnerSession.accessToken,
    winnerPayoutIntent.paymentIntentId,
    {
      transactionSignature: 'persist-sig-winner',
      walletAddress: winner.publicKey.toBase58(),
    }
  );

  const loserPayoutIntent = await serviceA.createPaymentIntent(loserSession.accessToken, {
    tokenId: contest.tokenId,
    entryFeeTierId: contest.entryFeeTierId,
    purpose: 'multi_paid_queue',
  });
  await serviceA.confirmPaymentIntent(loserSession.accessToken, loserPayoutIntent.paymentIntentId, {
    transactionSignature: 'persist-sig-loser',
    walletAddress: loser.publicKey.toBase58(),
  });

  await serviceA.settleRealtimeWinnerTakeAll(
    winnerSession.playerId,
    [winnerPayoutIntent.paymentIntentId, loserPayoutIntent.paymentIntentId],
    'persistence payout'
  );

  const withdrawal = await serviceA.createWithdrawal(winnerSession.accessToken, {
    tokenId: contest.tokenId,
    amountBaseUnits: '5000000',
    destinationAddress: Keypair.generate().publicKey.toBase58(),
  });
  await serviceA.markWithdrawalSubmitted(withdrawal.withdrawalRequestId, 'persist-withdraw');
  await serviceA.markWithdrawalConfirmed(withdrawal.withdrawalRequestId, 'persist-withdraw');

  const serviceB = new PaymentService({
    store: new PaymentStore({ vaultPublicKey }),
    runtimeStateRepository: repository,
  });
  await serviceB.initialize();

  const restoredSession = serviceB.requireSession(winnerSession.accessToken);
  assert.equal(restoredSession.playerId, winnerSession.playerId);
  assert.equal(restoredSession.walletAddress, winner.publicKey.toBase58());

  const validation = serviceB.validateRealtimePaymentIntent(
    winnerSession.accessToken,
    reusableIntent.paymentIntentId,
    {
      purpose: 'multi_paid_private',
      tokenId: contest.tokenId,
      entryFeeTierId: contest.entryFeeTierId,
    }
  );
  assert.equal(validation.player.id, winnerSession.playerId);
  assert.equal(validation.intent.transactionSignature, 'persist-sig-private');

  const balances = serviceB.getLedgerBalance(winnerSession.accessToken);
  assert.deepEqual(balances, [
    {
      tokenId: contest.tokenId,
      available: '15000000',
      locked: '0',
    },
  ]);

  const transactions = serviceB.getLedgerTransactions(winnerSession.accessToken);
  assert.equal(transactions.length, 4);
  assert.equal(transactions.filter((transaction) => transaction.type === 'payout').length, 1);
  assert.equal(
    transactions.filter((transaction) => transaction.type === 'withdrawal').length,
    1
  );
});
