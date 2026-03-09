import { Buffer } from 'buffer';
import { Transaction } from '@solana/web3.js';
import type { PaymentIntentPurpose } from '../../shared/payment-contracts';
import { backendApi } from '../backend/api';
import { getWalletAddress, getWalletPublicKey } from '../../utils/wallet/account';
import { createWalletVerifyRequest } from '../../utils/wallet/auth';

type WalletAccountLike = Parameters<typeof getWalletAddress>[0];

type WalletFlowContext = {
  account: WalletAccountLike;
  connect: () => Promise<WalletAccountLike>;
  signIn: (payload: Record<string, unknown>) => Promise<unknown>;
  signAndSendTransaction: (
    transaction: Transaction,
    minContextSlot: number
  ) => Promise<{ signature: string } | string | string[]>;
};

type FundPaymentIntentArgs = {
  wallet: WalletFlowContext;
  purpose: PaymentIntentPurpose;
  tokenId: string;
  entryFeeTierId: string;
  contestId?: string;
  existingAccessToken?: string;
  existingPaymentIntentId?: string;
};

export type FundPaymentIntentResult = {
  accessToken: string;
  paymentIntentId: string;
  transactionSignature: string;
};

export const fundPaymentIntent = async ({
  wallet,
  purpose,
  tokenId,
  entryFeeTierId,
  contestId,
  existingAccessToken,
  existingPaymentIntentId,
}: FundPaymentIntentArgs): Promise<FundPaymentIntentResult> => {
  const connectedAccount = (wallet.account ?? (await wallet.connect())) as WalletAccountLike;
  const walletAddress = getWalletAddress(connectedAccount);
  const publicKey = getWalletPublicKey(connectedAccount);
  if (!walletAddress || !publicKey) {
    throw new Error('Connected wallet account is missing a valid public key.');
  }

  let accessToken = existingAccessToken;
  if (!accessToken) {
    const challenge = await backendApi.createWalletChallenge(walletAddress);
    const signInResult = await wallet.signIn(
      challenge.signInPayload as unknown as Record<string, unknown>
    );
    const auth = await backendApi.verifyWallet(
      createWalletVerifyRequest({
        nonce: challenge.nonce,
        signInResult: signInResult as never,
      })
    );
    accessToken = auth.accessToken;
  }

  let paymentIntentId = existingPaymentIntentId;
  if (!paymentIntentId) {
    const paymentIntent = await backendApi.createPaymentIntent(accessToken, {
      tokenId,
      entryFeeTierId,
      purpose,
      contestId,
    });
    paymentIntentId = paymentIntent.paymentIntentId;
  }

  const built = await backendApi.buildPaymentIntentTransaction(accessToken, paymentIntentId, {
    walletAddress,
  });
  const transaction = Transaction.from(Buffer.from(built.serializedTransactionBase64, 'base64'));
  const txSignature = await wallet.signAndSendTransaction(transaction, built.minContextSlot);
  const transactionSignature = Array.isArray(txSignature)
    ? txSignature[0]
    : typeof txSignature === 'string'
      ? txSignature
      : txSignature.signature;
  const confirmed = await backendApi.confirmPaymentIntent(accessToken, paymentIntentId, {
    transactionSignature,
    walletAddress,
  });

  return {
    accessToken,
    paymentIntentId,
    transactionSignature: confirmed.transactionSignature,
  };
};
