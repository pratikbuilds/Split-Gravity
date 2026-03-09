export type SupportedTokenId = 'sol' | string;

export interface EntryFeeTier {
  id: string;
  label: string;
  amount: string;
  amountBaseUnits: string;
  currencySymbol: string;
}

export interface SupportedToken {
  id: SupportedTokenId;
  symbol: string;
  name: string;
  mint: string | null;
  decimals: number;
  enabled: boolean;
  entryFeeTiers: EntryFeeTier[];
}

export interface DailyContest {
  id: string;
  tokenId: SupportedTokenId;
  entryFeeTierId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  payoutBps: number[];
}

export interface LeaderboardEntry {
  playerId: string;
  walletAddress: string;
  nickname: string | null;
  bestDistance: number;
  rank: number;
  achievedAt: string;
  payoutAmount?: string;
}

export interface WalletSignInPayload {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  version: string;
  chainId: string;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
}

export interface WalletChallengeResponse {
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  signInPayload: WalletSignInPayload;
}

export interface WalletVerifyRequest {
  nonce: string;
  signedMessage: string;
  signature: string;
}

export interface WalletVerifyResponse {
  accessToken: string;
  playerId: string;
  walletAddress: string;
  expiresAt: string;
}

export type PaymentIntentPurpose =
  | 'single_paid_contest'
  | 'multi_paid_private'
  | 'multi_paid_queue';

export interface PaymentIntentRequest {
  tokenId: SupportedTokenId;
  entryFeeTierId: string;
  purpose: PaymentIntentPurpose;
  contestId?: string;
}

export interface PaymentIntentResponse {
  paymentIntentId: string;
  tokenId: SupportedTokenId;
  tokenSymbol: string;
  entryFeeTierId: string;
  amountBaseUnits: string;
  amountDisplay: string;
  vaultAddress: string;
  memo: string;
  expiresAt: string;
}

export interface PaymentIntentTransactionRequest {
  walletAddress: string;
}

export interface PaymentIntentTransactionResponse {
  paymentIntentId: string;
  minContextSlot: number;
  serializedTransactionBase64: string;
}

export interface ConfirmPaymentIntentRequest {
  transactionSignature: string;
  walletAddress: string;
}

export interface ConfirmPaymentIntentResponse {
  paymentIntentId: string;
  confirmedAt: string;
  ledgerTransactionId: string;
  transactionSignature: string;
}

export interface RefundPaymentIntentResponse {
  paymentIntentId: string;
  refundedAt: string;
  ledgerTransactionId: string;
  transactionSignature: string | null;
}

export interface ContestEntryRequest {
  paymentIntentId: string;
  nickname?: string;
}

export interface ContestEntryResponse {
  contestEntryId: string;
  contestId: string;
  runSessionId: string;
  bestDistance: number | null;
}

export interface SubmitRunResultRequest {
  distance: number;
  finishedAt: string;
}

export interface SubmitRunResultResponse {
  runSessionId: string;
  leaderboardUpdated: boolean;
  rank: number | null;
  bestDistance: number;
  underReview: boolean;
}

export interface WalletLedgerBalance {
  tokenId: SupportedTokenId;
  available: string;
  locked: string;
}

export interface LedgerTransaction {
  id: string;
  tokenId: SupportedTokenId;
  amount: string;
  direction: 'credit' | 'debit';
  type: 'entry_fee' | 'payout' | 'refund' | 'withdrawal';
  createdAt: string;
  description: string;
}

export interface WithdrawalRequestPayload {
  tokenId: SupportedTokenId;
  amountBaseUnits: string;
  destinationAddress: string;
}

export interface WithdrawalRequestResponse {
  withdrawalRequestId: string;
  status: 'pending' | 'submitted' | 'confirmed' | 'failed';
  transactionSignature: string | null;
}
