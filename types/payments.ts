import type {
  DailyContest,
  EntryFeeTier,
  PaymentIntentPurpose,
  SupportedToken,
} from '../shared/payment-contracts';

export type HomeScreenRoute =
  | 'home'
  | 'character_select'
  | 'leaderboard'
  | 'single_mode_select'
  | 'single_paid_setup'
  | 'post_payment'
  | 'multi_mode_select'
  | 'multi_paid_setup'
  | 'lobby'
  | 'game'
  | 'wallet_debug';

export type SinglePlayerMenuMode = 'practice' | 'paid_contest';

export type MultiplayerMenuMode = 'casual_room' | 'paid_private_room' | 'paid_matchmaking';

export interface PaidFlowSelection {
  purpose: PaymentIntentPurpose;
  token: SupportedToken;
  entryFeeTier: EntryFeeTier;
  contest?: DailyContest | null;
}

export interface PaidSetupResult {
  accessToken: string;
  selection: PaidFlowSelection;
  paymentIntentId: string;
  contestEntryId?: string;
  runSessionId?: string;
  transactionSignature: string;
}

export interface PostPaymentHandoff {
  kind: PaidFlowSelection['purpose'];
  eyebrow: string;
  title: string;
  subtitle: string;
  primaryActionLabel: string;
  primaryHelperText: string;
  refundLabel: string;
  refundHelperText: string;
}
