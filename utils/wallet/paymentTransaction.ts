import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type Connection,
} from '@solana/web3.js';

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

export type BuildPaymentTransactionParams = {
  connection: Connection;
  amountLamports: bigint;
  fromAddress: PublicKey;
  vaultAddress: string;
  memo: string;
};

export type BuiltPaymentTransaction = {
  minContextSlot: number;
  transaction: Transaction;
};

export async function buildPaymentTransaction({
  connection,
  amountLamports,
  fromAddress,
  vaultAddress,
  memo,
}: BuildPaymentTransactionParams): Promise<BuiltPaymentTransaction> {
  const { context, value } = await connection.getLatestBlockhashAndContext('confirmed');
  const transaction = new Transaction();

  transaction.add(
    SystemProgram.transfer({
      fromPubkey: fromAddress,
      toPubkey: new PublicKey(vaultAddress),
      lamports: amountLamports,
    })
  );
  transaction.add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [],
      data: new TextEncoder().encode(memo) as unknown as Buffer,
    })
  );

  transaction.feePayer = fromAddress;
  transaction.recentBlockhash = value.blockhash;

  return {
    minContextSlot: context.slot,
    transaction,
  };
}
