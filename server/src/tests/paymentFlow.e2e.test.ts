import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import nacl from 'tweetnacl';
import { createSignInMessageText } from '@solana/wallet-standard-util';
import {
  Connection,
  Keypair,
  type ParsedInstruction,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { PaymentService } from '../payments/service';
import { PaymentStore } from '../payments/store';
import { createWalletSignInMessageFields } from '../shared/walletAuth';

const runDevnetTest = process.env.RUN_DEVNET_PAYMENT_E2E === '1' ? test : test.skip;
const LAMPORTS_PER_SOL = 1_000_000_000;
const DEFAULT_FUNDING_KEYPAIR_PATH = path.join(os.homedir(), '.config/solana/id.json');

const loadKeypairFromPath = async (filePath: string) => {
  const secretKey = JSON.parse(await readFile(filePath, 'utf8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
};

const fundAddress = async ({
  connection,
  funder,
  destination,
  lamports,
}: {
  connection: Connection;
  funder: Keypair;
  destination: PublicKey;
  lamports: number;
}) => {
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: funder.publicKey,
      toPubkey: destination,
      lamports,
    })
  );

  await sendAndConfirmTransaction(connection, transaction, [funder], {
    commitment: 'confirmed',
  });
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

const signAndSendSerializedTransaction = async ({
  connection,
  signer,
  serializedTransactionBase64,
  minContextSlot,
}: {
  connection: Connection;
  signer: Keypair;
  serializedTransactionBase64: string;
  minContextSlot: number;
}) => {
  const transaction = Transaction.from(Buffer.from(serializedTransactionBase64, 'base64'));
  transaction.sign(signer);
  const transactionSignature = await connection.sendRawTransaction(transaction.serialize(), {
    minContextSlot,
    preflightCommitment: 'confirmed',
  });
  await connection.confirmTransaction(transactionSignature, 'confirmed');
  return transactionSignature;
};

const assertTransferInTransaction = async ({
  connection,
  transactionSignature,
  destination,
  lamports,
}: {
  connection: Connection;
  transactionSignature: string;
  destination: string;
  lamports: number;
}) => {
  const transaction = await connection.getParsedTransaction(transactionSignature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  assert.ok(transaction, `Transaction ${transactionSignature} was not found on devnet.`);

  const hasExpectedTransfer = transaction.transaction.message.instructions.some((instruction) => {
    if ('parsed' in instruction) {
      const parsedInstruction = instruction as ParsedInstruction;
      if (parsedInstruction.program !== 'system') return false;
      if (parsedInstruction.parsed.type !== 'transfer') return false;
      const info = parsedInstruction.parsed.info as { destination?: string; lamports?: number };
      return info.destination === destination && info.lamports === lamports;
    }

    return false;
  });

  assert.ok(
    hasExpectedTransfer,
    `Transaction ${transactionSignature} did not transfer ${lamports} lamports to ${destination}.`
  );
};

runDevnetTest('devnet payment creation signing confirmation and withdrawal flow', async () => {
  const rpcUrl = process.env.SOLANA_RPC_HTTP ?? 'https://api.devnet.solana.com';
  const fundingKeypairPath =
    process.env.SOLANA_FUNDING_KEYPAIR_PATH ?? DEFAULT_FUNDING_KEYPAIR_PATH;
  const connection = new Connection(rpcUrl, 'confirmed');
  const funder = await loadKeypairFromPath(fundingKeypairPath);
  const funderBalance = await connection.getBalance(funder.publicKey, 'confirmed');
  assert.ok(
    funderBalance >= 0.2 * LAMPORTS_PER_SOL,
    `Funding wallet ${funder.publicKey.toBase58()} needs at least 0.2 SOL on devnet.`
  );

  const winner = Keypair.generate();
  const loser = Keypair.generate();
  const vault = Keypair.generate();
  const withdrawalDestination = Keypair.generate();

  await fundAddress({
    connection,
    funder,
    destination: winner.publicKey,
    lamports: 30_000_000,
  });
  await fundAddress({
    connection,
    funder,
    destination: loser.publicKey,
    lamports: 30_000_000,
  });
  await fundAddress({
    connection,
    funder,
    destination: vault.publicKey,
    lamports: 10_000_000,
  });

  const service = new PaymentService({
    connection,
    vaultSigner: vault,
    store: new PaymentStore({ vaultPublicKey: vault.publicKey.toBase58() }),
  });
  const winnerSession = await createSignedWalletSession(service, winner);
  const loserSession = await createSignedWalletSession(service, loser);
  const [contest] = service.getDailyContests();

  const winnerIntent = await service.createPaymentIntent(winnerSession.accessToken, {
    tokenId: contest.tokenId,
    entryFeeTierId: contest.entryFeeTierId,
    purpose: 'multi_paid_private',
  });
  const winnerBuilt = await service.buildPaymentIntentTransaction(
    winnerSession.accessToken,
    winnerIntent.paymentIntentId,
    {
      walletAddress: winner.publicKey.toBase58(),
    }
  );
  const winnerSignature = await signAndSendSerializedTransaction({
    connection,
    signer: winner,
    serializedTransactionBase64: winnerBuilt.serializedTransactionBase64,
    minContextSlot: winnerBuilt.minContextSlot,
  });
  const winnerConfirmed = await service.confirmPaymentIntent(
    winnerSession.accessToken,
    winnerIntent.paymentIntentId,
    {
      transactionSignature: winnerSignature,
      walletAddress: winner.publicKey.toBase58(),
    }
  );

  const loserIntent = await service.createPaymentIntent(loserSession.accessToken, {
    tokenId: contest.tokenId,
    entryFeeTierId: contest.entryFeeTierId,
    purpose: 'multi_paid_private',
  });
  const loserBuilt = await service.buildPaymentIntentTransaction(
    loserSession.accessToken,
    loserIntent.paymentIntentId,
    {
      walletAddress: loser.publicKey.toBase58(),
    }
  );
  const loserSignature = await signAndSendSerializedTransaction({
    connection,
    signer: loser,
    serializedTransactionBase64: loserBuilt.serializedTransactionBase64,
    minContextSlot: loserBuilt.minContextSlot,
  });
  const loserConfirmed = await service.confirmPaymentIntent(
    loserSession.accessToken,
    loserIntent.paymentIntentId,
    {
      transactionSignature: loserSignature,
      walletAddress: loser.publicKey.toBase58(),
    }
  );

  assert.equal(winnerConfirmed.transactionSignature, winnerSignature);
  assert.equal(loserConfirmed.transactionSignature, loserSignature);

  const payout = await service.settleRealtimeWinnerTakeAll(
    winnerSession.playerId,
    [winnerIntent.paymentIntentId, loserIntent.paymentIntentId],
    'devnet e2e payout'
  );
  assert.ok(payout.transactionSignature);
  await assertTransferInTransaction({
    connection,
    transactionSignature: payout.transactionSignature!,
    destination: winner.publicKey.toBase58(),
    lamports: 20_000_000,
  });

  const contestIntent = await service.createPaymentIntent(winnerSession.accessToken, {
    tokenId: contest.tokenId,
    entryFeeTierId: contest.entryFeeTierId,
    purpose: 'single_paid_contest',
    contestId: contest.id,
  });
  const contestBuilt = await service.buildPaymentIntentTransaction(
    winnerSession.accessToken,
    contestIntent.paymentIntentId,
    {
      walletAddress: winner.publicKey.toBase58(),
    }
  );
  const contestSignature = await signAndSendSerializedTransaction({
    connection,
    signer: winner,
    serializedTransactionBase64: contestBuilt.serializedTransactionBase64,
    minContextSlot: contestBuilt.minContextSlot,
  });
  await service.confirmPaymentIntent(winnerSession.accessToken, contestIntent.paymentIntentId, {
    transactionSignature: contestSignature,
    walletAddress: winner.publicKey.toBase58(),
  });
  const entry = await service.createContestEntry(winnerSession.accessToken, contest.id, {
    paymentIntentId: contestIntent.paymentIntentId,
  });
  await service.submitRun(winnerSession.accessToken, entry.runSessionId, {
    distance: 250,
    finishedAt: new Date().toISOString(),
  });
  await service.settleContest(contest.id);

  const destinationBefore = await connection.getBalance(withdrawalDestination.publicKey, 'confirmed');
  const withdrawal = await service.createWithdrawal(winnerSession.accessToken, {
    tokenId: contest.tokenId,
    amountBaseUnits: '3000000',
    destinationAddress: withdrawalDestination.publicKey.toBase58(),
  });
  const destinationAfter = await connection.getBalance(withdrawalDestination.publicKey, 'confirmed');

  assert.equal(withdrawal.status, 'confirmed');
  assert.ok(withdrawal.transactionSignature);
  assert.equal(destinationAfter - destinationBefore, 3_000_000);
});
