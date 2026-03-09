import assert from 'node:assert/strict';
import test from 'node:test';
import { PaymentStore, type PlayerRecord } from '../payments/store';

const fundPlayerWithWinnerTakeAll = (
  store: PaymentStore,
  winnerWallet: string,
  loserWallet: string
): { winner: PlayerRecord; tokenId: string } => {
  const [contest] = store.getDailyContests();
  const winner = store.getOrCreatePlayer(winnerWallet);
  const loser = store.getOrCreatePlayer(loserWallet);

  const winnerIntent = store.createPaymentIntent(winner.id, {
    tokenId: contest.tokenId,
    entryFeeTierId: contest.entryFeeTierId,
    purpose: 'multi_paid_private',
  });
  const loserIntent = store.createPaymentIntent(loser.id, {
    tokenId: contest.tokenId,
    entryFeeTierId: contest.entryFeeTierId,
    purpose: 'multi_paid_private',
  });

  store.confirmPaymentIntent(winner.id, winnerIntent.paymentIntentId, `${winner.id}-deposit`);
  store.confirmPaymentIntent(loser.id, loserIntent.paymentIntentId, `${loser.id}-deposit`);
  store.settleWinnerTakeAll(winner.id, [winnerIntent.paymentIntentId, loserIntent.paymentIntentId]);

  return {
    winner,
    tokenId: contest.tokenId,
  };
};

test('confirmed payment intents return and persist their transaction signature', () => {
  const store = new PaymentStore();
  const [contest] = store.getDailyContests();
  const player = store.getOrCreatePlayer('intent-signature-wallet-000000000000');

  const intent = store.createPaymentIntent(player.id, {
    tokenId: contest.tokenId,
    entryFeeTierId: contest.entryFeeTierId,
    purpose: 'single_paid_contest',
    contestId: contest.id,
  });

  const confirmed = store.confirmPaymentIntent(player.id, intent.paymentIntentId, 'deposit-sig-1');
  const confirmedAgain = store.confirmPaymentIntent(
    player.id,
    intent.paymentIntentId,
    'deposit-sig-1'
  );

  assert.equal(confirmed.transactionSignature, 'deposit-sig-1');
  assert.equal(confirmedAgain.transactionSignature, 'deposit-sig-1');
  assert.equal(
    store.getPaymentIntent(intent.paymentIntentId)?.transactionSignature,
    'deposit-sig-1'
  );
  assert.ok(store.getPaymentIntent(intent.paymentIntentId)?.depositChainTransactionId);

  assert.throws(
    () => store.confirmPaymentIntent(player.id, intent.paymentIntentId, 'deposit-sig-2'),
    /different transaction signature/
  );
});

test('transaction signatures cannot be reused across payment intents', () => {
  const store = new PaymentStore();
  const [contest] = store.getDailyContests();
  const player = store.getOrCreatePlayer('duplicate-signature-wallet-0000000000');

  const firstIntent = store.createPaymentIntent(player.id, {
    tokenId: contest.tokenId,
    entryFeeTierId: contest.entryFeeTierId,
    purpose: 'multi_paid_private',
  });
  const secondIntent = store.createPaymentIntent(player.id, {
    tokenId: contest.tokenId,
    entryFeeTierId: contest.entryFeeTierId,
    purpose: 'multi_paid_queue',
  });

  store.confirmPaymentIntent(player.id, firstIntent.paymentIntentId, 'shared-sig');

  assert.throws(
    () => store.confirmPaymentIntent(player.id, secondIntent.paymentIntentId, 'shared-sig'),
    /already used/
  );
});

test('withdrawals lock funds until the vault transfer is confirmed', () => {
  const store = new PaymentStore();
  const { winner, tokenId } = fundPlayerWithWinnerTakeAll(
    store,
    'withdraw-winner-wallet-00000000000000',
    'withdraw-loser-wallet-000000000000000'
  );

  const created = store.createWithdrawal(winner.id, {
    tokenId,
    amountBaseUnits: '4000000',
    destinationAddress: 'dest-wallet-0000000000000000000000000001',
  });
  const lockedBalance = store.getLedgerBalance(winner.id).find((entry) => entry.tokenId === tokenId);

  assert.equal(created.status, 'pending');
  assert.equal(created.transactionSignature, null);
  assert.equal(lockedBalance?.available, '16000000');
  assert.equal(lockedBalance?.locked, '4000000');

  const submitted = store.markWithdrawalSubmitted(created.withdrawalRequestId, 'withdraw-sig-1');
  const confirmed = store.markWithdrawalConfirmed(created.withdrawalRequestId);
  const finalBalance = store.getLedgerBalance(winner.id).find((entry) => entry.tokenId === tokenId);
  const withdrawalTransactions = store
    .getLedgerTransactions(winner.id)
    .filter((entry) => entry.type === 'withdrawal');

  assert.equal(submitted.status, 'submitted');
  assert.equal(submitted.transactionSignature, 'withdraw-sig-1');
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.transactionSignature, 'withdraw-sig-1');
  assert.equal(finalBalance?.available, '16000000');
  assert.equal(finalBalance?.locked, '0');
  assert.equal(withdrawalTransactions.length, 1);
  assert.equal(withdrawalTransactions[0]?.amount, '4000000');
});

test('failed withdrawals release locked balance without posting a debit', () => {
  const store = new PaymentStore();
  const { winner, tokenId } = fundPlayerWithWinnerTakeAll(
    store,
    'failed-withdraw-winner-wallet-000000000',
    'failed-withdraw-loser-wallet-0000000000'
  );

  const created = store.createWithdrawal(winner.id, {
    tokenId,
    amountBaseUnits: '3000000',
    destinationAddress: 'dest-wallet-0000000000000000000000000002',
  });
  const submitted = store.markWithdrawalSubmitted(created.withdrawalRequestId, 'withdraw-sig-2');
  const failed = store.markWithdrawalFailed(created.withdrawalRequestId, 'rpc timeout');
  const balance = store.getLedgerBalance(winner.id).find((entry) => entry.tokenId === tokenId);
  const withdrawalTransactions = store
    .getLedgerTransactions(winner.id)
    .filter((entry) => entry.type === 'withdrawal');

  assert.equal(submitted.status, 'submitted');
  assert.equal(failed.status, 'failed');
  assert.equal(failed.transactionSignature, 'withdraw-sig-2');
  assert.equal(balance?.available, '20000000');
  assert.equal(balance?.locked, '0');
  assert.equal(withdrawalTransactions.length, 0);
});
