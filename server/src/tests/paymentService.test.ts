import assert from 'node:assert/strict';
import test from 'node:test';
import { Keypair, type Connection } from '@solana/web3.js';
import { PaymentService } from '../payments/service';
import { PaymentStore } from '../payments/store';

const createConfirmedRealtimeIntent = async (
  purpose: 'multi_paid_private' | 'multi_paid_queue' = 'multi_paid_queue',
  options?: { forceTransferFailure?: boolean }
) => {
  const store = new PaymentStore({ vaultPublicKey: Keypair.generate().publicKey.toBase58() });
  const service = new PaymentService({
    store,
    connection: options?.forceTransferFailure ? ({} as Connection) : undefined,
    vaultSigner: options?.forceTransferFailure ? Keypair.generate() : undefined,
  });
  const [contest] = service.getDailyContests();
  const player = store.getOrCreatePlayer(`wallet-${purpose}-${Math.random()}`);
  const session = {
    accessToken: 'token',
    playerId: player.id,
    walletAddress: player.walletAddress,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };

  // Seed the in-memory auth/session state without going through the wallet-signing flow.
  (service as unknown as { sessions: Map<string, typeof session> }).sessions.set(
    session.accessToken,
    session
  );

  const paymentIntent = await service.createPaymentIntent(session.accessToken, {
    tokenId: contest.tokenId,
    entryFeeTierId: contest.entryFeeTierId,
    purpose,
  });
  const confirmed = store.confirmPaymentIntent(player.id, paymentIntent.paymentIntentId, `${purpose}-sig`);

  return {
    contest,
    player,
    service,
    store,
    session,
    paymentIntentId: confirmed.paymentIntentId,
  };
};

test('realtime refund does not mutate ledger state when vault transfer fails', async () => {
  const { player, service, store, paymentIntentId } = await createConfirmedRealtimeIntent(
    'multi_paid_private',
    { forceTransferFailure: true }
  );
  const intentBefore = store.getPaymentIntent(paymentIntentId);

  await assert.rejects(
    service.refundRealtimePaymentIntent(
      player.id,
      paymentIntentId,
      'refund should fail closed when chain transfer fails'
    )
  );

  const intentAfter = store.getPaymentIntent(paymentIntentId);
  assert.equal(intentBefore?.status, 'confirmed');
  assert.equal(intentAfter?.status, 'confirmed');
  assert.equal(
    store.getLedgerTransactions(player.id).filter((entry) => entry.type === 'refund').length,
    0
  );
});

test('realtime payout only attempts unsettled intents and fails closed on transfer errors', async () => {
  const store = new PaymentStore({ vaultPublicKey: Keypair.generate().publicKey.toBase58() });
  const winner = store.getOrCreatePlayer('winner-wallet-payout-test');
  const loser = store.getOrCreatePlayer('loser-wallet-payout-test');
  const service = new PaymentService({
    store,
    connection: {} as Connection,
    vaultSigner: Keypair.generate(),
  });
  const [contest] = service.getDailyContests();

  const firstIntent = store.createPaymentIntent(winner.id, {
    tokenId: contest.tokenId,
    entryFeeTierId: contest.entryFeeTierId,
    purpose: 'multi_paid_queue',
  });
  const secondIntent = store.createPaymentIntent(loser.id, {
    tokenId: contest.tokenId,
    entryFeeTierId: contest.entryFeeTierId,
    purpose: 'multi_paid_queue',
  });

  store.confirmPaymentIntent(winner.id, firstIntent.paymentIntentId, 'winner-sig');
  store.confirmPaymentIntent(loser.id, secondIntent.paymentIntentId, 'loser-sig');
  store.settleWinnerTakeAll(winner.id, [firstIntent.paymentIntentId]);

  await assert.rejects(
    service.settleRealtimeWinnerTakeAll(
      winner.id,
      [firstIntent.paymentIntentId, secondIntent.paymentIntentId],
      'retry should not overpay or settle on vault failure'
    )
  );

  assert.equal(store.getPaymentIntent(firstIntent.paymentIntentId)?.status, 'settled');
  assert.equal(store.getPaymentIntent(secondIntent.paymentIntentId)?.status, 'confirmed');
  assert.equal(
    store.getLedgerTransactions(winner.id).filter((entry) => entry.type === 'payout').length,
    1
  );
});
