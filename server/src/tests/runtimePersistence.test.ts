import assert from 'node:assert/strict';
import test from 'node:test';
import nacl from 'tweetnacl';
import { createSignInMessageText } from '@solana/wallet-standard-util';
import { Keypair, type Connection } from '@solana/web3.js';
import { newDb } from 'pg-mem';
import { createWalletSignInMessageFields } from '../shared/walletAuth';
import { PostgresRuntimeStateRepository } from '../lib/runtimeStateRepository';
import { PaymentService } from '../payments/service';
import { PaymentStore } from '../payments/store';

const createMockVerifiedConnection = () => {
  const transactions = new Map<
    string,
    {
      walletAddress: string;
      vaultAddress: string;
      amountLamports: number;
      memo: string;
    }
  >();

  return {
    registerTransaction: (signature: string, details: {
      walletAddress: string;
      vaultAddress: string;
      amountLamports: number;
      memo: string;
    }) => {
      transactions.set(signature, details);
    },
    connection: {
      getParsedTransaction: async (signature: string) => {
        const details = transactions.get(signature);
        if (!details) {
          return null;
        }

        return {
          meta: {
            err: null,
            logMessages: [details.memo],
          },
          transaction: {
            message: {
              accountKeys: [
                {
                  signer: true,
                  pubkey: { toBase58: () => details.walletAddress },
                },
              ],
              instructions: [
                {
                  program: 'system',
                  parsed: {
                    type: 'transfer',
                    info: {
                      source: details.walletAddress,
                      destination: details.vaultAddress,
                      lamports: details.amountLamports,
                    },
                  },
                },
              ],
            },
          },
          blockTime: Math.floor(Date.now() / 1000),
          slot: 1,
        };
      },
    } as unknown as Connection,
  };
};

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
  return {
    repository: new PostgresRuntimeStateRepository(pool),
    pool,
  };
};

const createSignedWalletSession = async (service: PaymentService, keypair: Keypair) => {
  const nonce = await service.issueNonce();
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

  return service.verifyWallet({
    walletAddress: keypair.publicKey.toBase58(),
    nonce: nonce.nonce,
    signedMessage: Buffer.from(message).toString('base64'),
    signature: Buffer.from(signature).toString('base64'),
  });
};

test('runtime persistence restores auth session and payment state after restart', async (t) => {
  const { repository, pool } = await createRepository();
  t.after(async () => {
    await pool.end();
  });
  const vaultPublicKey = Keypair.generate().publicKey.toBase58();
  const mockConnection = createMockVerifiedConnection();

  const serviceA = new PaymentService({
    store: new PaymentStore({ vaultPublicKey }),
    connection: mockConnection.connection,
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
  mockConnection.registerTransaction('persist-sig-private', {
    walletAddress: winner.publicKey.toBase58(),
    vaultAddress: reusableIntent.vaultAddress,
    amountLamports: Number(reusableIntent.amountBaseUnits),
    memo: reusableIntent.memo,
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
  mockConnection.registerTransaction('persist-sig-winner', {
    walletAddress: winner.publicKey.toBase58(),
    vaultAddress: winnerPayoutIntent.vaultAddress,
    amountLamports: Number(winnerPayoutIntent.amountBaseUnits),
    memo: winnerPayoutIntent.memo,
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
  mockConnection.registerTransaction('persist-sig-loser', {
    walletAddress: loser.publicKey.toBase58(),
    vaultAddress: loserPayoutIntent.vaultAddress,
    amountLamports: Number(loserPayoutIntent.amountBaseUnits),
    memo: loserPayoutIntent.memo,
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
