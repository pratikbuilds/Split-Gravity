import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';

export const PRIMARY_PROOF_LAMPORTS = 0;
export const FALLBACK_PROOF_LAMPORTS = 1;

type BuildProofTransactionParams = {
  connection: Connection;
  publicKey: PublicKey;
  lamports?: number;
};

export type BuiltProofTransaction = {
  blockhash: string;
  lamports: number;
  minContextSlot: number;
  transaction: Transaction;
};

export type SignedTransactionSummary = {
  byteLength: number;
  previewHex: string;
  transactionType: 'legacy' | 'versioned';
};

export async function buildProofTransaction({
  connection,
  publicKey,
  lamports = PRIMARY_PROOF_LAMPORTS,
}: BuildProofTransactionParams): Promise<BuiltProofTransaction> {
  const { context, value } = await connection.getLatestBlockhashAndContext('confirmed');
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: publicKey,
      lamports,
      toPubkey: publicKey,
    })
  );
  transaction.feePayer = publicKey;
  transaction.recentBlockhash = value.blockhash;

  return {
    blockhash: value.blockhash,
    lamports,
    minContextSlot: context.slot,
    transaction,
  };
}

export function summarizeSignedTransaction(
  transaction: Transaction | VersionedTransaction
): SignedTransactionSummary {
  const serialized = transaction.serialize();
  const previewHex = Array.from(serialized.slice(0, 12), (value) =>
    value.toString(16).padStart(2, '0')
  ).join('');

  return {
    byteLength: serialized.byteLength,
    previewHex,
    transactionType: transaction instanceof VersionedTransaction ? 'versioned' : 'legacy',
  };
}
