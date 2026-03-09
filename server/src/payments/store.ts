import { randomUUID } from 'node:crypto';
import type {
  ContestEntryResponse,
  DailyContest,
  LeaderboardEntry,
  LedgerTransaction,
  PaymentIntentPurpose,
  PaymentIntentResponse,
  SubmitRunResultResponse,
  SupportedToken,
  WalletLedgerBalance,
  WithdrawalRequestPayload,
  WithdrawalRequestResponse,
} from '../shared/payment-contracts';
import { applyRankings } from './contestRanking';
import { getActiveDailyContests, SUPPORTED_TOKENS, VAULT_PUBLIC_KEY } from './config';

export type PlayerRecord = {
  id: string;
  walletAddress: string;
  nickname: string | null;
};

export type PaymentIntentStatus = 'pending' | 'confirmed' | 'refunded' | 'settled';

export type PaymentIntentRecord = {
  id: string;
  playerId: string;
  tokenId: string;
  entryFeeTierId: string;
  purpose: PaymentIntentPurpose;
  contestId?: string;
  amountBaseUnits: string;
  amountDisplay: string;
  tokenSymbol: string;
  vaultAddress: string;
  memo: string;
  expiresAt: string;
  status: PaymentIntentStatus;
  transactionSignature?: string;
  confirmedAt?: string;
  refundedAt?: string;
  settledAt?: string;
  ledgerTransactionId?: string;
  refundLedgerTransactionId?: string;
  settlementLedgerTransactionId?: string;
  depositChainTransactionId?: string;
  refundChainTransactionId?: string;
  refundTransactionSignature?: string | null;
  settlementChainTransactionId?: string;
  settlementTransactionSignature?: string | null;
};

type ContestEntryRecord = {
  id: string;
  playerId: string;
  contestId: string;
  paymentIntentId: string;
  runSessionId: string;
};

type RunSessionRecord = {
  id: string;
  playerId: string;
  contestEntryId: string;
  bestDistance: number | null;
  submittedAt?: string;
};

type ChainTransactionKind = 'deposit' | 'withdrawal' | 'payout' | 'refund';
type ChainTransactionStatus = 'pending' | 'submitted' | 'confirmed' | 'failed';

type ChainTransactionRecord = {
  id: string;
  playerId: string;
  tokenId: string;
  kind: ChainTransactionKind;
  referenceId: string;
  status: ChainTransactionStatus;
  transactionSignature: string | null;
  walletAddress?: string;
  destinationAddress?: string;
  createdAt: string;
  submittedAt?: string;
  confirmedAt?: string;
  failedAt?: string;
  failureReason?: string;
};

type WithdrawalRecord = WithdrawalRequestResponse &
  WithdrawalRequestPayload & {
    id: string;
    playerId: string;
    createdAt: string;
    submittedAt?: string;
    confirmedAt?: string;
    failedAt?: string;
    ledgerTransactionId?: string;
    chainTransactionId: string;
  };

type ContestSettlementRecord = {
  contestId: string;
  settledAt: string;
  payouts: LeaderboardEntry[];
};

export type PaymentStoreSnapshot = Record<string, unknown> & {
  players: PlayerRecord[];
  paymentIntents: PaymentIntentRecord[];
  contestEntries: ContestEntryRecord[];
  runSessions: RunSessionRecord[];
  leaderboardByContest: Record<string, LeaderboardEntry[]>;
  ledgerByPlayer: Record<string, LedgerTransaction[]>;
  withdrawals: WithdrawalRecord[];
  chainTransactions: ChainTransactionRecord[];
  settledContests: ContestSettlementRecord[];
};

export class PaymentStore {
  private readonly vaultPublicKey: string;
  private readonly playersByWallet = new Map<string, PlayerRecord>();
  private readonly playersById = new Map<string, PlayerRecord>();
  private readonly paymentIntents = new Map<string, PaymentIntentRecord>();
  private readonly paymentIntentIdBySignature = new Map<string, string>();
  private readonly contestEntriesByPaymentIntentId = new Map<string, ContestEntryRecord>();
  private readonly runSessions = new Map<string, RunSessionRecord>();
  private readonly leaderboardByContest = new Map<string, LeaderboardEntry[]>();
  private readonly ledgerByPlayer = new Map<string, LedgerTransaction[]>();
  private readonly withdrawals = new Map<string, WithdrawalRecord>();
  private readonly chainTransactions = new Map<string, ChainTransactionRecord>();
  private readonly chainTransactionIdBySignature = new Map<string, string>();
  private readonly settledContests = new Map<string, ContestSettlementRecord>();

  constructor(options?: { vaultPublicKey?: string }) {
    this.vaultPublicKey = options?.vaultPublicKey ?? VAULT_PUBLIC_KEY;
  }

  getSupportedTokens(): SupportedToken[] {
    return SUPPORTED_TOKENS;
  }

  hydrate(snapshot: PaymentStoreSnapshot) {
    this.playersByWallet.clear();
    this.playersById.clear();
    this.paymentIntents.clear();
    this.paymentIntentIdBySignature.clear();
    this.contestEntriesByPaymentIntentId.clear();
    this.runSessions.clear();
    this.leaderboardByContest.clear();
    this.ledgerByPlayer.clear();
    this.withdrawals.clear();
    this.chainTransactions.clear();
    this.chainTransactionIdBySignature.clear();
    this.settledContests.clear();

    for (const player of snapshot.players) {
      this.playersByWallet.set(player.walletAddress, player);
      this.playersById.set(player.id, player);
    }

    for (const paymentIntent of snapshot.paymentIntents) {
      this.paymentIntents.set(paymentIntent.id, paymentIntent);
      if (paymentIntent.transactionSignature) {
        this.paymentIntentIdBySignature.set(paymentIntent.transactionSignature, paymentIntent.id);
      }
    }

    for (const contestEntry of snapshot.contestEntries) {
      this.contestEntriesByPaymentIntentId.set(contestEntry.paymentIntentId, contestEntry);
    }

    for (const runSession of snapshot.runSessions) {
      this.runSessions.set(runSession.id, runSession);
    }

    for (const [contestId, leaderboard] of Object.entries(snapshot.leaderboardByContest)) {
      this.leaderboardByContest.set(contestId, leaderboard);
    }

    for (const [playerId, transactions] of Object.entries(snapshot.ledgerByPlayer)) {
      this.ledgerByPlayer.set(playerId, transactions);
    }

    for (const withdrawal of snapshot.withdrawals) {
      this.withdrawals.set(withdrawal.id, withdrawal);
    }

    for (const chainTransaction of snapshot.chainTransactions) {
      this.chainTransactions.set(chainTransaction.id, chainTransaction);
      if (chainTransaction.transactionSignature) {
        this.chainTransactionIdBySignature.set(
          chainTransaction.transactionSignature,
          chainTransaction.id
        );
      }
    }

    for (const settlement of snapshot.settledContests) {
      this.settledContests.set(settlement.contestId, settlement);
    }
  }

  dumpSnapshot(): PaymentStoreSnapshot {
    return {
      players: [...this.playersById.values()],
      paymentIntents: [...this.paymentIntents.values()],
      contestEntries: [...this.contestEntriesByPaymentIntentId.values()],
      runSessions: [...this.runSessions.values()],
      leaderboardByContest: Object.fromEntries(this.leaderboardByContest.entries()),
      ledgerByPlayer: Object.fromEntries(this.ledgerByPlayer.entries()),
      withdrawals: [...this.withdrawals.values()],
      chainTransactions: [...this.chainTransactions.values()],
      settledContests: [...this.settledContests.values()],
    };
  }

  getDailyContests(): DailyContest[] {
    return getActiveDailyContests();
  }

  getOrCreatePlayer(walletAddress: string) {
    const existing = this.playersByWallet.get(walletAddress);
    if (existing) return existing;

    const player: PlayerRecord = {
      id: randomUUID(),
      walletAddress,
      nickname: null,
    };
    this.playersByWallet.set(walletAddress, player);
    this.playersById.set(player.id, player);
    return player;
  }

  getPlayerById(playerId: string) {
    return this.playersById.get(playerId) ?? null;
  }

  getPaymentIntent(paymentIntentId: string) {
    return this.paymentIntents.get(paymentIntentId) ?? null;
  }

  getContestEntryByPaymentIntentId(paymentIntentId: string) {
    return this.contestEntriesByPaymentIntentId.get(paymentIntentId) ?? null;
  }

  createPaymentIntent(
    playerId: string,
    payload: {
      tokenId: string;
      entryFeeTierId: string;
      purpose: PaymentIntentPurpose;
      contestId?: string;
    }
  ): PaymentIntentResponse {
    const token = SUPPORTED_TOKENS.find((entry) => entry.id === payload.tokenId);
    const tier = token?.entryFeeTiers.find((entry) => entry.id === payload.entryFeeTierId);
    if (!token || !tier) {
      throw new Error('Unsupported token or entry fee tier.');
    }

    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 10).toISOString();
    const record: PaymentIntentRecord = {
      id,
      playerId,
      tokenId: token.id,
      entryFeeTierId: tier.id,
      purpose: payload.purpose,
      contestId: payload.contestId,
      amountBaseUnits: tier.amountBaseUnits,
      amountDisplay: `${tier.amount} ${tier.currencySymbol}`,
      tokenSymbol: token.symbol,
      vaultAddress: this.vaultPublicKey,
      memo: `runner:${id}`,
      expiresAt,
      status: 'pending',
    };
    this.paymentIntents.set(id, record);

    return {
      paymentIntentId: id,
      tokenId: token.id,
      tokenSymbol: token.symbol,
      entryFeeTierId: tier.id,
      amountBaseUnits: tier.amountBaseUnits,
      amountDisplay: `${tier.amount} ${tier.currencySymbol}`,
      vaultAddress: this.vaultPublicKey,
      memo: record.memo,
      expiresAt,
    };
  }

  confirmPaymentIntent(playerId: string, paymentIntentId: string, transactionSignature: string) {
    const intent = this.paymentIntents.get(paymentIntentId);
    if (!intent || intent.playerId !== playerId) {
      throw new Error('Payment intent not found.');
    }

    const existingSignatureIntentId = this.paymentIntentIdBySignature.get(transactionSignature);
    if (existingSignatureIntentId && existingSignatureIntentId !== paymentIntentId) {
      throw new Error('Transaction signature already used by another payment intent.');
    }

    if (intent.confirmedAt) {
      if (intent.transactionSignature && intent.transactionSignature !== transactionSignature) {
        throw new Error('Payment intent already confirmed with a different transaction signature.');
      }

      if (!intent.depositChainTransactionId) {
        const chainTransaction = this.createChainTransaction({
          playerId,
          tokenId: intent.tokenId,
          kind: 'deposit',
          referenceId: paymentIntentId,
          status: 'confirmed',
          transactionSignature: intent.transactionSignature ?? transactionSignature,
          walletAddress: this.playersById.get(playerId)?.walletAddress,
          confirmedAt: intent.confirmedAt,
        });
        intent.depositChainTransactionId = chainTransaction.id;
      }

      return {
        paymentIntentId,
        confirmedAt: intent.confirmedAt,
        ledgerTransactionId: intent.ledgerTransactionId!,
        transactionSignature: intent.transactionSignature ?? transactionSignature,
      };
    }

    intent.transactionSignature = transactionSignature;
    intent.confirmedAt = new Date().toISOString();
    intent.status = 'confirmed';
    intent.ledgerTransactionId = randomUUID();
    this.paymentIntentIdBySignature.set(transactionSignature, paymentIntentId);

    this.pushLedgerTransaction(playerId, {
      id: intent.ledgerTransactionId,
      tokenId: intent.tokenId,
      amount: intent.amountBaseUnits,
      direction: 'debit',
      type: 'entry_fee',
      createdAt: intent.confirmedAt,
      description: `${intent.purpose} entry fee`,
    });

    const chainTransaction = this.createChainTransaction({
      playerId,
      tokenId: intent.tokenId,
      kind: 'deposit',
      referenceId: paymentIntentId,
      status: 'confirmed',
      transactionSignature,
      walletAddress: this.playersById.get(playerId)?.walletAddress,
      confirmedAt: intent.confirmedAt,
    });
    intent.depositChainTransactionId = chainTransaction.id;

    return {
      paymentIntentId,
      confirmedAt: intent.confirmedAt,
      ledgerTransactionId: intent.ledgerTransactionId,
      transactionSignature,
    };
  }

  validateConfirmedPaymentIntent(
    playerId: string,
    paymentIntentId: string,
    options?: {
      purpose?: PaymentIntentPurpose;
      tokenId?: string;
      entryFeeTierId?: string;
      contestId?: string;
    }
  ) {
    const intent = this.paymentIntents.get(paymentIntentId);
    if (!intent || intent.playerId !== playerId) {
      throw new Error('Payment intent not found.');
    }
    if (intent.status !== 'confirmed' || !intent.confirmedAt) {
      throw new Error('Confirmed payment intent required.');
    }
    if (options?.purpose && intent.purpose !== options.purpose) {
      throw new Error('Payment intent purpose mismatch.');
    }
    if (options?.tokenId && intent.tokenId !== options.tokenId) {
      throw new Error('Payment intent token mismatch.');
    }
    if (options?.entryFeeTierId && intent.entryFeeTierId !== options.entryFeeTierId) {
      throw new Error('Payment intent entry fee mismatch.');
    }
    if (options?.contestId && intent.contestId !== options.contestId) {
      throw new Error('Payment intent contest mismatch.');
    }
    return intent;
  }

  refundPaymentIntent(
    playerId: string,
    paymentIntentId: string,
    options?: {
      description?: string;
      externalTransferSignature?: string | null;
    }
  ) {
    const description = options?.description ?? 'Pre-start paid match refund';
    const intent = this.paymentIntents.get(paymentIntentId);
    if (!intent || intent.playerId !== playerId) {
      throw new Error('Payment intent not found.');
    }
    if (intent.status === 'refunded') {
      return {
        paymentIntentId,
        refundedAt: intent.refundedAt!,
        ledgerTransactionId: intent.refundLedgerTransactionId!,
        transactionSignature: intent.refundTransactionSignature ?? null,
      };
    }
    if (intent.status === 'settled') {
      throw new Error('Settled payment intent cannot be refunded.');
    }
    if (intent.status !== 'confirmed' || !intent.confirmedAt) {
      throw new Error('Only confirmed payment intents can be refunded.');
    }

    intent.status = 'refunded';
    intent.refundedAt = new Date().toISOString();
    intent.refundLedgerTransactionId = randomUUID();
    intent.refundTransactionSignature = options?.externalTransferSignature ?? null;

    if (intent.refundTransactionSignature) {
      const chainTransaction = this.createChainTransaction({
        playerId,
        tokenId: intent.tokenId,
        kind: 'refund',
        referenceId: intent.refundLedgerTransactionId,
        status: 'confirmed',
        transactionSignature: intent.refundTransactionSignature,
        destinationAddress: this.playersById.get(playerId)?.walletAddress,
        confirmedAt: intent.refundedAt,
      });
      intent.refundChainTransactionId = chainTransaction.id;
    } else {
      this.pushLedgerTransaction(playerId, {
        id: intent.refundLedgerTransactionId,
        tokenId: intent.tokenId,
        amount: intent.amountBaseUnits,
        direction: 'credit',
        type: 'refund',
        createdAt: intent.refundedAt,
        description,
      });
    }

    return {
      paymentIntentId,
      refundedAt: intent.refundedAt,
      ledgerTransactionId: intent.refundLedgerTransactionId,
      transactionSignature: intent.refundTransactionSignature,
    };
  }

  createContestEntry(
    playerId: string,
    contestId: string,
    paymentIntentId: string
  ): ContestEntryResponse {
    const existing = this.contestEntriesByPaymentIntentId.get(paymentIntentId);
    if (existing) {
      if (existing.contestId !== contestId) {
        throw new Error('Payment intent already used for a different contest.');
      }
      const runSession = this.runSessions.get(existing.runSessionId);
      return {
        contestEntryId: existing.id,
        contestId: existing.contestId,
        runSessionId: existing.runSessionId,
        bestDistance: runSession?.bestDistance ?? null,
      };
    }

    const contest = this.getDailyContests().find((entry) => entry.id === contestId);
    if (!contest) {
      throw new Error('Contest not found.');
    }

    this.validateConfirmedPaymentIntent(playerId, paymentIntentId, {
      purpose: 'single_paid_contest',
      contestId,
      tokenId: contest.tokenId,
      entryFeeTierId: contest.entryFeeTierId,
    });

    const contestEntryId = randomUUID();
    const runSessionId = randomUUID();
    const contestEntry: ContestEntryRecord = {
      id: contestEntryId,
      playerId,
      contestId,
      paymentIntentId,
      runSessionId,
    };
    const runSession: RunSessionRecord = {
      id: runSessionId,
      playerId,
      contestEntryId,
      bestDistance: null,
    };
    this.contestEntriesByPaymentIntentId.set(paymentIntentId, contestEntry);
    this.runSessions.set(runSessionId, runSession);

    return {
      contestEntryId,
      contestId,
      runSessionId,
      bestDistance: null,
    };
  }

  submitRun(playerId: string, runSessionId: string, distance: number): SubmitRunResultResponse {
    const runSession = this.runSessions.get(runSessionId);
    if (!runSession || runSession.playerId !== playerId) {
      throw new Error('Run session not found.');
    }

    runSession.bestDistance = Math.max(runSession.bestDistance ?? 0, Math.floor(distance));
    runSession.submittedAt = new Date().toISOString();

    const contestEntry = [...this.contestEntriesByPaymentIntentId.values()].find(
      (entry) => entry.runSessionId === runSessionId
    );
    if (!contestEntry) {
      throw new Error('Contest entry not found for run session.');
    }

    const player = this.playersById.get(playerId);
    const leaderboard = this.leaderboardByContest.get(contestEntry.contestId) ?? [];
    const existingRow = leaderboard.find((row) => row.playerId === playerId);
    const achievedAt = runSession.submittedAt;

    if (!existingRow) {
      leaderboard.push({
        playerId,
        walletAddress: player?.walletAddress ?? '',
        nickname: player?.nickname ?? null,
        bestDistance: runSession.bestDistance,
        rank: 0,
        achievedAt,
      });
    } else if (runSession.bestDistance > existingRow.bestDistance) {
      existingRow.bestDistance = runSession.bestDistance;
      existingRow.achievedAt = achievedAt;
    }

    const ranked = applyRankings(leaderboard);
    this.leaderboardByContest.set(contestEntry.contestId, ranked);
    const row = ranked.find((entry) => entry.playerId === playerId) ?? null;

    return {
      runSessionId,
      leaderboardUpdated: true,
      rank: row?.rank ?? null,
      bestDistance: runSession.bestDistance,
      underReview: false,
    };
  }

  settleContest(contestId: string) {
    const settled = this.settledContests.get(contestId);
    if (settled) {
      return settled.payouts;
    }

    const contest = this.getDailyContests().find((entry) => entry.id === contestId);
    if (!contest) {
      throw new Error('Contest not found.');
    }

    const ranked = applyRankings(this.leaderboardByContest.get(contestId) ?? []);
    const contestEntries = [...this.contestEntriesByPaymentIntentId.values()].filter(
      (entry) => entry.contestId === contestId
    );
    const pool = contestEntries.reduce((sum, entry) => {
      const intent = this.paymentIntents.get(entry.paymentIntentId);
      return intent?.confirmedAt ? sum + BigInt(intent.amountBaseUnits) : sum;
    }, 0n);

    const payouts = ranked.map((entry) => ({ ...entry }));
    contest.payoutBps.forEach((bps, index) => {
      const row = payouts[index];
      if (!row) return;

      const payoutAmount = ((pool * BigInt(bps)) / 10_000n).toString();
      row.payoutAmount = payoutAmount;
      if (payoutAmount === '0') return;

      this.pushLedgerTransaction(row.playerId, {
        id: randomUUID(),
        tokenId: contest.tokenId,
        amount: payoutAmount,
        direction: 'credit',
        type: 'payout',
        createdAt: new Date().toISOString(),
        description: `${contest.title} payout`,
      });
    });

    const settledAt = new Date().toISOString();
    for (const entry of contestEntries) {
      const intent = this.paymentIntents.get(entry.paymentIntentId);
      if (!intent || !intent.confirmedAt) continue;
      intent.status = 'settled';
      intent.settledAt = settledAt;
    }

    this.settledContests.set(contestId, {
      contestId,
      settledAt,
      payouts,
    });
    this.leaderboardByContest.set(contestId, payouts);
    return payouts;
  }

  settleWinnerTakeAll(
    winnerPlayerId: string,
    paymentIntentIds: string[],
    options?: {
      description?: string;
      externalTransferSignature?: string | null;
    }
  ) {
    const description = options?.description ?? 'Winner-take-all payout';
    if (paymentIntentIds.length === 0) {
      throw new Error('At least one payment intent is required.');
    }

    const intents = paymentIntentIds.map((paymentIntentId) => {
      const intent = this.paymentIntents.get(paymentIntentId);
      if (!intent) {
        throw new Error('Payment intent not found.');
      }
      if (intent.status === 'refunded') {
        throw new Error('Refunded payment intent cannot be settled.');
      }
      if (intent.status !== 'settled' && (intent.status !== 'confirmed' || !intent.confirmedAt)) {
        throw new Error('Only confirmed payment intents can be settled.');
      }
      return intent;
    });

    const alreadySettled = intents.filter((intent) => intent.status === 'settled');
    const toSettle = intents.filter((intent) => intent.status !== 'settled');

    if (toSettle.length === 0) {
      return {
        winnerPlayerId,
        ledgerTransactionId: alreadySettled[0]?.settlementLedgerTransactionId ?? '',
        transactionSignature: alreadySettled[0]?.settlementTransactionSignature ?? null,
        amount: alreadySettled
          .reduce((sum, intent) => sum + BigInt(intent.amountBaseUnits), 0n)
          .toString(),
      };
    }

    const totalAmount = toSettle.reduce((sum, intent) => sum + BigInt(intent.amountBaseUnits), 0n);
    const createdAt = new Date().toISOString();
    const ledgerTransactionId = randomUUID();

    for (const intent of toSettle) {
      intent.status = 'settled';
      intent.settledAt = createdAt;
      intent.settlementLedgerTransactionId = ledgerTransactionId;
      intent.settlementTransactionSignature = options?.externalTransferSignature ?? null;
    }

    if (options?.externalTransferSignature) {
      const chainTransaction = this.createChainTransaction({
        playerId: winnerPlayerId,
        tokenId: toSettle[0]!.tokenId,
        kind: 'payout',
        referenceId: ledgerTransactionId,
        status: 'confirmed',
        transactionSignature: options.externalTransferSignature,
        destinationAddress: this.playersById.get(winnerPlayerId)?.walletAddress,
        confirmedAt: createdAt,
      });
      for (const intent of toSettle) {
        intent.settlementChainTransactionId = chainTransaction.id;
      }
    } else {
      this.pushLedgerTransaction(winnerPlayerId, {
        id: ledgerTransactionId,
        tokenId: toSettle[0]!.tokenId,
        amount: totalAmount.toString(),
        direction: 'credit',
        type: 'payout',
        createdAt,
        description,
      });
    }

    return {
      winnerPlayerId,
      ledgerTransactionId,
      transactionSignature: options?.externalTransferSignature ?? null,
      amount: totalAmount.toString(),
    };
  }

  getContestPool(contestId: string): bigint {
    const contest = this.getDailyContests().find((c) => c.id === contestId);
    if (!contest) return 0n;
    const contestEntries = [...this.contestEntriesByPaymentIntentId.values()].filter(
      (entry) => entry.contestId === contestId
    );
    return contestEntries.reduce((sum, entry) => {
      const intent = this.paymentIntents.get(entry.paymentIntentId);
      return intent?.confirmedAt ? sum + BigInt(intent.amountBaseUnits) : sum;
    }, 0n);
  }

  getLeaderboard(contestId: string) {
    return applyRankings(this.leaderboardByContest.get(contestId) ?? []);
  }

  getLedgerBalance(playerId: string): WalletLedgerBalance[] {
    const postedByToken = new Map<string, bigint>();
    for (const transaction of this.ledgerByPlayer.get(playerId) ?? []) {
      // Entry-fee debits fund a match or contest immediately; they are not withdrawable balance.
      if (transaction.type === 'entry_fee') continue;
      const current = postedByToken.get(transaction.tokenId) ?? 0n;
      const amount = BigInt(transaction.amount);
      postedByToken.set(
        transaction.tokenId,
        current + (transaction.direction === 'credit' ? amount : -amount)
      );
    }

    const lockedByToken = new Map<string, bigint>();
    for (const withdrawal of this.withdrawals.values()) {
      if (withdrawal.playerId !== playerId) continue;
      if (withdrawal.status !== 'pending' && withdrawal.status !== 'submitted') continue;

      const current = lockedByToken.get(withdrawal.tokenId) ?? 0n;
      lockedByToken.set(withdrawal.tokenId, current + BigInt(withdrawal.amountBaseUnits));
    }

    const tokenIds = new Set([...postedByToken.keys(), ...lockedByToken.keys()]);
    return [...tokenIds].map((tokenId) => {
      const posted = postedByToken.get(tokenId) ?? 0n;
      const locked = lockedByToken.get(tokenId) ?? 0n;
      return {
        tokenId,
        available: (posted - locked).toString(),
        locked: locked.toString(),
      };
    });
  }

  getLedgerTransactions(playerId: string) {
    return this.ledgerByPlayer.get(playerId) ?? [];
  }

  createWithdrawal(playerId: string, payload: WithdrawalRequestPayload): WithdrawalRequestResponse {
    const balances = this.getLedgerBalance(playerId);
    const balance = balances.find((entry) => entry.tokenId === payload.tokenId);
    const available = BigInt(balance?.available ?? '0');
    const requested = BigInt(payload.amountBaseUnits);
    if (requested <= 0n) {
      throw new Error('Withdrawal amount must be positive.');
    }
    if (available < requested) {
      throw new Error('Insufficient balance for withdrawal.');
    }

    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const chainTransaction = this.createChainTransaction({
      playerId,
      tokenId: payload.tokenId,
      kind: 'withdrawal',
      referenceId: id,
      status: 'pending',
      transactionSignature: null,
      destinationAddress: payload.destinationAddress,
    });

    const record: WithdrawalRecord = {
      ...payload,
      id,
      playerId,
      withdrawalRequestId: id,
      status: 'pending',
      transactionSignature: null,
      createdAt,
      chainTransactionId: chainTransaction.id,
    };
    this.withdrawals.set(id, record);
    return this.toWithdrawalResponse(record);
  }

  markWithdrawalSubmitted(withdrawalRequestId: string, transactionSignature: string) {
    const withdrawal = this.requireWithdrawal(withdrawalRequestId);
    if (withdrawal.status === 'confirmed') {
      if (
        withdrawal.transactionSignature &&
        withdrawal.transactionSignature !== transactionSignature
      ) {
        throw new Error('Withdrawal already confirmed with a different transaction signature.');
      }
      return this.toWithdrawalResponse(withdrawal);
    }
    if (withdrawal.status === 'failed') {
      throw new Error('Failed withdrawal cannot be submitted.');
    }
    if (withdrawal.transactionSignature && withdrawal.transactionSignature !== transactionSignature) {
      throw new Error('Withdrawal already submitted with a different transaction signature.');
    }

    const submittedAt = withdrawal.submittedAt ?? new Date().toISOString();
    withdrawal.status = 'submitted';
    withdrawal.transactionSignature = transactionSignature;
    withdrawal.submittedAt = submittedAt;
    this.updateChainTransaction(withdrawal.chainTransactionId, {
      status: 'submitted',
      transactionSignature,
      submittedAt,
    });
    return this.toWithdrawalResponse(withdrawal);
  }

  markWithdrawalConfirmed(withdrawalRequestId: string, transactionSignature?: string) {
    const withdrawal = this.requireWithdrawal(withdrawalRequestId);
    if (withdrawal.status === 'failed') {
      throw new Error('Failed withdrawal cannot be confirmed.');
    }
    if (withdrawal.status === 'confirmed') {
      if (
        transactionSignature &&
        withdrawal.transactionSignature &&
        withdrawal.transactionSignature !== transactionSignature
      ) {
        throw new Error('Withdrawal already confirmed with a different transaction signature.');
      }
      return this.toWithdrawalResponse(withdrawal);
    }

    const signature = transactionSignature ?? withdrawal.transactionSignature;
    if (!signature) {
      throw new Error('Withdrawal confirmation requires a transaction signature.');
    }

    const confirmedAt = new Date().toISOString();
    withdrawal.status = 'confirmed';
    withdrawal.transactionSignature = signature;
    withdrawal.confirmedAt = confirmedAt;
    withdrawal.ledgerTransactionId ??= randomUUID();
    this.updateChainTransaction(withdrawal.chainTransactionId, {
      status: 'confirmed',
      transactionSignature: signature,
      submittedAt: withdrawal.submittedAt ?? confirmedAt,
      confirmedAt,
    });
    this.pushLedgerTransaction(withdrawal.playerId, {
      id: withdrawal.ledgerTransactionId,
      tokenId: withdrawal.tokenId,
      amount: withdrawal.amountBaseUnits,
      direction: 'debit',
      type: 'withdrawal',
      createdAt: confirmedAt,
      description: `Withdrawal to ${withdrawal.destinationAddress.slice(0, 6)}...`,
    });
    return this.toWithdrawalResponse(withdrawal);
  }

  markWithdrawalFailed(withdrawalRequestId: string, reason = 'Vault transfer failed') {
    const withdrawal = this.requireWithdrawal(withdrawalRequestId);
    if (withdrawal.status === 'confirmed') {
      throw new Error('Confirmed withdrawal cannot be failed.');
    }
    if (withdrawal.status === 'failed') {
      return this.toWithdrawalResponse(withdrawal);
    }

    withdrawal.status = 'failed';
    withdrawal.failedAt = new Date().toISOString();
    this.updateChainTransaction(withdrawal.chainTransactionId, {
      status: 'failed',
      transactionSignature: withdrawal.transactionSignature,
      submittedAt: withdrawal.submittedAt,
      failedAt: withdrawal.failedAt,
      failureReason: reason,
    });
    return this.toWithdrawalResponse(withdrawal);
  }

  private pushLedgerTransaction(playerId: string, transaction: LedgerTransaction) {
    this.ledgerByPlayer.set(playerId, [...(this.ledgerByPlayer.get(playerId) ?? []), transaction]);
  }

  private createChainTransaction(
    input: Omit<ChainTransactionRecord, 'id' | 'createdAt'> & {
      createdAt?: string;
    }
  ) {
    const record: ChainTransactionRecord = {
      ...input,
      id: randomUUID(),
      createdAt: input.createdAt ?? new Date().toISOString(),
    };

    if (record.transactionSignature) {
      this.assignChainTransactionSignature(record.id, record.transactionSignature);
    }

    this.chainTransactions.set(record.id, record);
    return record;
  }

  private updateChainTransaction(
    chainTransactionId: string,
    patch: Partial<
      Pick<
        ChainTransactionRecord,
        | 'status'
        | 'transactionSignature'
        | 'submittedAt'
        | 'confirmedAt'
        | 'failedAt'
        | 'failureReason'
      >
    >
  ) {
    const record = this.chainTransactions.get(chainTransactionId);
    if (!record) {
      throw new Error('Chain transaction not found.');
    }

    if (patch.transactionSignature) {
      this.assignChainTransactionSignature(chainTransactionId, patch.transactionSignature);
    }

    Object.assign(record, patch);
    return record;
  }

  private assignChainTransactionSignature(chainTransactionId: string, transactionSignature: string) {
    const existingChainTransactionId =
      this.chainTransactionIdBySignature.get(transactionSignature);
    if (existingChainTransactionId && existingChainTransactionId !== chainTransactionId) {
      throw new Error('Transaction signature already used by another chain transaction.');
    }

    this.chainTransactionIdBySignature.set(transactionSignature, chainTransactionId);
  }

  private requireWithdrawal(withdrawalRequestId: string) {
    const withdrawal = this.withdrawals.get(withdrawalRequestId);
    if (!withdrawal) {
      throw new Error('Withdrawal request not found.');
    }
    return withdrawal;
  }

  private toWithdrawalResponse(withdrawal: WithdrawalRecord): WithdrawalRequestResponse {
    return {
      withdrawalRequestId: withdrawal.withdrawalRequestId,
      status: withdrawal.status,
      transactionSignature: withdrawal.transactionSignature,
    };
  }
}
