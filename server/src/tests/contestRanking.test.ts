import assert from 'node:assert/strict';
import test from 'node:test';
import { PaymentStore } from '../payments/store';

test('single-player contest keeps only the best distance per wallet', () => {
  const store = new PaymentStore();
  const player = store.getOrCreatePlayer('5EYCAe5iji9fEGm6ZUKf6wX4cLSh19g7p9hK5HzQYVE4');
  const [contest] = store.getDailyContests();
  const paymentIntent = store.createPaymentIntent(player.id, {
    tokenId: contest.tokenId,
    entryFeeTierId: contest.entryFeeTierId,
    purpose: 'single_paid_contest',
    contestId: contest.id,
  });
  store.confirmPaymentIntent(player.id, paymentIntent.paymentIntentId, 'sig-1');
  const entry = store.createContestEntry(player.id, contest.id, paymentIntent.paymentIntentId);

  const first = store.submitRun(player.id, entry.runSessionId, 120);
  const second = store.submitRun(player.id, entry.runSessionId, 90);
  const third = store.submitRun(player.id, entry.runSessionId, 145);

  assert.equal(first.bestDistance, 120);
  assert.equal(second.bestDistance, 120);
  assert.equal(third.bestDistance, 145);

  const leaderboard = store.getLeaderboard(contest.id);
  assert.equal(leaderboard.length, 1);
  assert.equal(leaderboard[0]?.bestDistance, 145);
  assert.equal(leaderboard[0]?.rank, 1);
});

test('contest settlement pays ranked winners from the full entry-fee pool', () => {
  const store = new PaymentStore();
  const [contest] = store.getDailyContests();

  const wallets = Array.from({ length: 3 }, (_, index) =>
    store.getOrCreatePlayer(`wallet-${index + 1}`.padEnd(32, String(index + 1)))
  );

  const scores = [220, 180, 140];
  wallets.forEach((player, index) => {
    const paymentIntent = store.createPaymentIntent(player.id, {
      tokenId: contest.tokenId,
      entryFeeTierId: contest.entryFeeTierId,
      purpose: 'single_paid_contest',
      contestId: contest.id,
    });
    store.confirmPaymentIntent(player.id, paymentIntent.paymentIntentId, `contest-sig-${index}`);
    const entry = store.createContestEntry(player.id, contest.id, paymentIntent.paymentIntentId);
    store.submitRun(player.id, entry.runSessionId, scores[index]!);
  });

  const payouts = store.settleContest(contest.id);

  assert.equal(payouts[0]?.rank, 1);
  assert.equal(payouts[0]?.payoutAmount, '9000000');
  assert.equal(payouts[1]?.payoutAmount, '6000000');
  assert.equal(payouts[2]?.payoutAmount, '3600000');
});

test('winner take all payout credits the winner once', () => {
  const store = new PaymentStore();
  const [contest] = store.getDailyContests();
  const winner = store.getOrCreatePlayer('winner-wallet-address-0000000000000');
  const loser = store.getOrCreatePlayer('loser-wallet-address-00000000000000');

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

  store.confirmPaymentIntent(winner.id, winnerIntent.paymentIntentId, 'winner-sig');
  store.confirmPaymentIntent(loser.id, loserIntent.paymentIntentId, 'loser-sig');

  const payout = store.settleWinnerTakeAll(winner.id, [
    winnerIntent.paymentIntentId,
    loserIntent.paymentIntentId,
  ]);

  assert.equal(payout.amount, '20000000');

  const balances = store.getLedgerBalance(winner.id);
  assert.equal(balances[0]?.available, '20000000');
});

test('refund restores the original entry fee once', () => {
  const store = new PaymentStore();
  const [contest] = store.getDailyContests();
  const player = store.getOrCreatePlayer('refund-wallet-address-000000000000');

  const paymentIntent = store.createPaymentIntent(player.id, {
    tokenId: contest.tokenId,
    entryFeeTierId: contest.entryFeeTierId,
    purpose: 'multi_paid_queue',
  });
  store.confirmPaymentIntent(player.id, paymentIntent.paymentIntentId, 'refund-sig');

  const refunded = store.refundPaymentIntent(
    player.id,
    paymentIntent.paymentIntentId,
    { description: 'Queue cancelled' }
  );
  const refundedAgain = store.refundPaymentIntent(
    player.id,
    paymentIntent.paymentIntentId,
    { description: 'Queue cancelled' }
  );

  assert.equal(refunded.ledgerTransactionId, refundedAgain.ledgerTransactionId);
  const balances = store.getLedgerBalance(player.id);
  assert.equal(balances[0]?.available, '10000000');
});
