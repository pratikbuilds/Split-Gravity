import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

const bigintToLamports = (amountLamports: bigint) => {
  if (amountLamports > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Lamport amount exceeds safe transaction limit.');
  }

  return Number(amountLamports);
};

export const createSolanaConnection = (rpcUrl: string) => new Connection(rpcUrl, 'confirmed');

export const loadKeypairFromSecretKeyJson = (secretKeyJson: string) => {
  const parsed = JSON.parse(secretKeyJson) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(parsed));
};

export const buildSerializedDepositTransaction = async ({
  connection,
  amountLamports,
  fromAddress,
  vaultAddress,
  memo,
}: {
  connection: Connection;
  amountLamports: bigint;
  fromAddress: string;
  vaultAddress: string;
  memo: string;
}) => {
  const fromPubkey = new PublicKey(fromAddress);
  const { context, value } = await connection.getLatestBlockhashAndContext('confirmed');
  const transaction = new Transaction();

  transaction.add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey: new PublicKey(vaultAddress),
      lamports: bigintToLamports(amountLamports),
    })
  );
  transaction.add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [],
      data: Buffer.from(memo, 'utf8'),
    })
  );

  transaction.feePayer = fromPubkey;
  transaction.recentBlockhash = value.blockhash;

  return {
    minContextSlot: context.slot,
    serializedTransactionBase64: transaction
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString('base64'),
  };
};

export const verifyDepositTransaction = async ({
  connection,
  transactionSignature,
  walletAddress,
  vaultAddress,
  amountLamports,
  memo,
}: {
  connection: Connection;
  transactionSignature: string;
  walletAddress: string;
  vaultAddress: string;
  amountLamports: bigint;
  memo: string;
}) => {
  const transaction = await connection.getParsedTransaction(transactionSignature, {
    maxSupportedTransactionVersion: 0,
    commitment: 'confirmed',
  });

  if (!transaction) {
    throw new Error('Deposit transaction not found on chain.');
  }
  if (transaction.meta?.err) {
    throw new Error(`Deposit transaction ${transactionSignature} failed on chain.`);
  }

  const walletSigner = transaction.transaction.message.accountKeys.some(
    (accountKey) => accountKey.signer && accountKey.pubkey.toBase58() === walletAddress
  );
  if (!walletSigner) {
    throw new Error('Deposit transaction was not signed by the expected wallet.');
  }

  const expectedLamports = bigintToLamports(amountLamports);
  const hasExpectedTransfer = transaction.transaction.message.instructions.some((instruction) => {
    if (!('parsed' in instruction) || instruction.program !== 'system') return false;
    if (!instruction.parsed || instruction.parsed.type !== 'transfer') return false;
    const info = instruction.parsed.info as {
      source?: string;
      destination?: string;
      lamports?: number;
    };
    return (
      info.source === walletAddress &&
      info.destination === vaultAddress &&
      info.lamports === expectedLamports
    );
  });

  if (!hasExpectedTransfer) {
    throw new Error('Deposit transaction does not contain the expected vault transfer.');
  }

  const hasExpectedMemo =
    transaction.meta?.logMessages?.some((message) => message.includes(memo)) ?? false;
  if (!hasExpectedMemo) {
    throw new Error('Deposit transaction memo mismatch.');
  }

  return {
    confirmedAt: new Date((transaction.blockTime ?? Math.floor(Date.now() / 1000)) * 1000)
      .toISOString(),
    slot: transaction.slot,
  };
};

export const sendVaultTransfer = async ({
  connection,
  vaultSigner,
  destinationAddress,
  amountLamports,
  memo,
}: {
  connection: Connection;
  vaultSigner: Keypair;
  destinationAddress: string;
  amountLamports: bigint;
  memo: string;
}) => {
  const { value } = await connection.getLatestBlockhashAndContext('confirmed');
  const transaction = new Transaction();

  transaction.add(
    SystemProgram.transfer({
      fromPubkey: vaultSigner.publicKey,
      toPubkey: new PublicKey(destinationAddress),
      lamports: bigintToLamports(amountLamports),
    })
  );
  transaction.add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [],
      data: Buffer.from(memo, 'utf8'),
    })
  );

  transaction.feePayer = vaultSigner.publicKey;
  transaction.recentBlockhash = value.blockhash;

  const transactionSignature = await sendAndConfirmTransaction(connection, transaction, [vaultSigner], {
    commitment: 'confirmed',
  });

  return {
    transactionSignature,
  };
};
