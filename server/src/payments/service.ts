import type { Connection, Keypair } from '@solana/web3.js';
import type {
  ConfirmPaymentIntentRequest,
  ContestEntryRequest,
  PaymentIntentRequest,
  PaymentIntentTransactionRequest,
  SubmitRunResultRequest,
  WalletChallengeResponse,
  WalletVerifyRequest,
  WithdrawalRequestPayload,
} from '../shared/payment-contracts';
import { env } from '../config/env';
import {
  PostgresRuntimeStateRepository,
  type RuntimeStateRepository,
} from '../lib/runtimeStateRepository';
import {
  buildSerializedDepositTransaction,
  createSolanaConnection,
  loadKeypairFromSecretKeyJson,
  sendVaultTransfer,
  verifyDepositTransaction,
} from '../lib/solana/payments';
import {
  createSession,
  createWalletChallenge,
  verifyWalletSignIn,
  type WalletSignInChallengeRecord,
  type WalletSessionRecord,
} from './auth';
import { PaymentStore, type PaymentStoreSnapshot } from './store';

type PaymentServiceOptions = {
  connection?: Connection | null;
  vaultSigner?: Keypair | null;
  store?: PaymentStore;
  runtimeStateRepository?: RuntimeStateRepository | null;
};

type WalletAuthSnapshot = Record<string, unknown> & {
  challenges: WalletSignInChallengeRecord[];
  sessions: WalletSessionRecord[];
};

export class PaymentService {
  private readonly store: PaymentStore;
  private readonly challenges = new Map<string, WalletSignInChallengeRecord>();
  private readonly sessions = new Map<string, WalletSessionRecord>();
  private readonly connection: Connection | null;
  private readonly vaultSigner: Keypair | null;
  private readonly runtimeStateRepository: RuntimeStateRepository | null;
  private initialized: boolean;
  private initializePromise: Promise<void> | null = null;

  constructor(options: PaymentServiceOptions = {}) {
    this.store = options.store ?? new PaymentStore();
    this.connection =
      options.connection ??
      (env.SOLANA_RPC_HTTP ? createSolanaConnection(env.SOLANA_RPC_HTTP) : null);
    this.vaultSigner =
      options.vaultSigner ??
      (env.VAULT_SECRET_KEY_JSON ? loadKeypairFromSecretKeyJson(env.VAULT_SECRET_KEY_JSON) : null);
    this.runtimeStateRepository =
      options.runtimeStateRepository ??
      (env.ENABLE_RUNTIME_PERSISTENCE ? new PostgresRuntimeStateRepository() : null);
    this.initialized = !this.runtimeStateRepository;
  }

  async initialize() {
    if (this.initialized) return;
    if (this.initializePromise) return this.initializePromise;

    this.initializePromise = (async () => {
      const [walletAuthSnapshot, paymentSnapshot] = await Promise.all([
        this.runtimeStateRepository?.load<WalletAuthSnapshot>('wallet-auth') ?? Promise.resolve(null),
        this.runtimeStateRepository?.load<PaymentStoreSnapshot>('payments') ?? Promise.resolve(null),
      ]);

      this.challenges.clear();
      for (const challenge of walletAuthSnapshot?.challenges ?? []) {
        this.challenges.set(challenge.nonce, challenge);
      }

      this.sessions.clear();
      for (const session of walletAuthSnapshot?.sessions ?? []) {
        this.sessions.set(session.accessToken, session);
      }

      if (paymentSnapshot) {
        this.store.hydrate(paymentSnapshot);
      }

      this.initialized = true;
    })();

    try {
      await this.initializePromise;
    } finally {
      this.initializePromise = null;
    }
  }

  private async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private assertInitialized() {
    if (!this.initialized) {
      throw new Error('Payment service must be initialized before use.');
    }
  }

  private getWalletAuthSnapshot(): WalletAuthSnapshot {
    return {
      challenges: [...this.challenges.values()],
      sessions: [...this.sessions.values()],
    };
  }

  private async persistWalletAuthState() {
    if (!this.runtimeStateRepository) return;
    await this.runtimeStateRepository.save('wallet-auth', this.getWalletAuthSnapshot());
  }

  private async persistPaymentState() {
    if (!this.runtimeStateRepository) return;
    await this.runtimeStateRepository.save('payments', this.store.dumpSnapshot());
  }

  async issueWalletChallenge(walletAddress: string): Promise<WalletChallengeResponse> {
    await this.ensureInitialized();
    const challenge = createWalletChallenge(walletAddress);
    this.challenges.set(challenge.nonce, challenge);
    await this.persistWalletAuthState();
    return challenge;
  }

  async verifyWallet(payload: WalletVerifyRequest) {
    await this.ensureInitialized();
    const challenge = this.challenges.get(payload.nonce);
    if (!challenge) {
      throw new Error('Nonce not found.');
    }
    if (challenge.consumedAt) {
      throw new Error('Nonce already used.');
    }
    if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
      throw new Error('Nonce expired.');
    }

    verifyWalletSignIn({
      challenge,
      signedMessage: payload.signedMessage,
      signature: payload.signature,
    });
    challenge.consumedAt = new Date().toISOString();

    const player = this.store.getOrCreatePlayer(challenge.signInPayload.address);
    const session = createSession(player.id, player.walletAddress);
    this.sessions.set(session.accessToken, session);
    await Promise.all([this.persistWalletAuthState(), this.persistPaymentState()]);
    return session;
  }

  requireSession(accessToken: string | undefined) {
    this.assertInitialized();
    if (!accessToken) {
      throw new Error('Missing bearer token.');
    }

    const session = this.sessions.get(accessToken);
    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
      throw new Error('Session expired.');
    }

    return session;
  }

  private requireConnection() {
    if (!this.connection) {
      throw new Error('SOLANA_RPC_HTTP is required for backend-built payment transactions.');
    }

    return this.connection;
  }

  getSupportedTokens() {
    this.assertInitialized();
    return this.store.getSupportedTokens();
  }

  getDailyContests() {
    this.assertInitialized();
    return this.store.getDailyContests();
  }

  getLeaderboard(contestId: string) {
    this.assertInitialized();
    return this.store.getLeaderboard(contestId);
  }

  async createPaymentIntent(accessToken: string | undefined, payload: PaymentIntentRequest) {
    await this.ensureInitialized();
    const session = this.requireSession(accessToken);
    const paymentIntent = this.store.createPaymentIntent(session.playerId, payload);
    await this.persistPaymentState();
    return paymentIntent;
  }

  async buildPaymentIntentTransaction(
    accessToken: string | undefined,
    paymentIntentId: string,
    payload: PaymentIntentTransactionRequest
  ) {
    await this.ensureInitialized();
    const session = this.requireSession(accessToken);
    if (payload.walletAddress !== session.walletAddress) {
      throw new Error('Wallet address does not match the authenticated session.');
    }

    const intent = this.store.getPaymentIntent(paymentIntentId);
    if (!intent || intent.playerId !== session.playerId) {
      throw new Error('Payment intent not found.');
    }
    if (intent.status !== 'pending') {
      throw new Error('Only pending payment intents can be turned into transactions.');
    }

    const connection = this.requireConnection();
    const built = await buildSerializedDepositTransaction({
      connection,
      amountLamports: BigInt(intent.amountBaseUnits),
      fromAddress: payload.walletAddress,
      vaultAddress: intent.vaultAddress,
      memo: intent.memo,
    });

    return {
      paymentIntentId,
      minContextSlot: built.minContextSlot,
      serializedTransactionBase64: built.serializedTransactionBase64,
    };
  }

  async confirmPaymentIntent(
    accessToken: string | undefined,
    paymentIntentId: string,
    payload: ConfirmPaymentIntentRequest
  ) {
    await this.ensureInitialized();
    const session = this.requireSession(accessToken);
    if (payload.walletAddress !== session.walletAddress) {
      throw new Error('Wallet address does not match the authenticated session.');
    }

    const intent = this.store.getPaymentIntent(paymentIntentId);
    if (!intent || intent.playerId !== session.playerId) {
      throw new Error('Payment intent not found.');
    }

    await verifyDepositTransaction({
      connection: this.requireConnection(),
      transactionSignature: payload.transactionSignature,
      walletAddress: payload.walletAddress,
      vaultAddress: intent.vaultAddress,
      amountLamports: BigInt(intent.amountBaseUnits),
      memo: intent.memo,
    });

    const confirmed = this.store.confirmPaymentIntent(
      session.playerId,
      paymentIntentId,
      payload.transactionSignature
    );
    await this.persistPaymentState();
    return confirmed;
  }

  async refundPaymentIntent(accessToken: string | undefined, paymentIntentId: string) {
    await this.ensureInitialized();
    const session = this.requireSession(accessToken);
    const intent = this.store.getPaymentIntent(paymentIntentId);
    if (!intent || intent.playerId !== session.playerId) {
      throw new Error('Payment intent not found.');
    }

    if (
      intent.purpose === 'single_paid_contest' &&
      this.store.getContestEntryByPaymentIntentId(paymentIntentId)
    ) {
      throw new Error('This paid run has already started and can no longer be refunded.');
    }

    if (!this.connection || !this.vaultSigner) {
      const refund = this.store.refundPaymentIntent(session.playerId, paymentIntentId, {
        description: 'Refunded before gameplay started',
      });
      await this.persistPaymentState();
      return refund;
    }

    const transfer = await sendVaultTransfer({
      connection: this.connection,
      vaultSigner: this.vaultSigner,
      destinationAddress: session.walletAddress,
      amountLamports: BigInt(intent.amountBaseUnits),
      memo: `runner:refund:${paymentIntentId}`,
    });
    const refund = this.store.refundPaymentIntent(session.playerId, paymentIntentId, {
      description: 'Refunded before gameplay started',
      externalTransferSignature: transfer.transactionSignature,
    });
    await this.persistPaymentState();
    return refund;
  }

  async createContestEntry(
    accessToken: string | undefined,
    contestId: string,
    payload: ContestEntryRequest
  ) {
    await this.ensureInitialized();
    const session = this.requireSession(accessToken);
    const entry = this.store.createContestEntry(session.playerId, contestId, payload.paymentIntentId);
    await this.persistPaymentState();
    return entry;
  }

  async submitRun(
    accessToken: string | undefined,
    runSessionId: string,
    payload: SubmitRunResultRequest
  ) {
    await this.ensureInitialized();
    const session = this.requireSession(accessToken);
    const result = this.store.submitRun(session.playerId, runSessionId, payload.distance);
    await this.persistPaymentState();
    return result;
  }

  getLedgerBalance(accessToken: string | undefined) {
    this.assertInitialized();
    const session = this.requireSession(accessToken);
    return this.store.getLedgerBalance(session.playerId);
  }

  getLedgerTransactions(accessToken: string | undefined) {
    this.assertInitialized();
    const session = this.requireSession(accessToken);
    return this.store.getLedgerTransactions(session.playerId);
  }

  async createWithdrawal(accessToken: string | undefined, payload: WithdrawalRequestPayload) {
    await this.ensureInitialized();
    const session = this.requireSession(accessToken);
    const withdrawal = this.store.createWithdrawal(session.playerId, payload);
    await this.persistPaymentState();

    if (!this.connection || !this.vaultSigner) {
      return withdrawal;
    }

    try {
      const transfer = await sendVaultTransfer({
        connection: this.connection,
        vaultSigner: this.vaultSigner,
        destinationAddress: payload.destinationAddress,
        amountLamports: BigInt(payload.amountBaseUnits),
        memo: `runner:withdrawal:${withdrawal.withdrawalRequestId}`,
      });
      this.store.markWithdrawalSubmitted(
        withdrawal.withdrawalRequestId,
        transfer.transactionSignature
      );
      const confirmed = this.store.markWithdrawalConfirmed(
        withdrawal.withdrawalRequestId,
        transfer.transactionSignature
      );
      await this.persistPaymentState();
      return confirmed;
    } catch (error) {
      this.store.markWithdrawalFailed(
        withdrawal.withdrawalRequestId,
        error instanceof Error ? error.message : 'Vault transfer failed.'
      );
      await this.persistPaymentState();
      throw error;
    }
  }

  async markWithdrawalSubmitted(withdrawalRequestId: string, transactionSignature: string) {
    await this.ensureInitialized();
    const updated = this.store.markWithdrawalSubmitted(withdrawalRequestId, transactionSignature);
    await this.persistPaymentState();
    return updated;
  }

  async markWithdrawalConfirmed(withdrawalRequestId: string, transactionSignature?: string) {
    await this.ensureInitialized();
    const updated = this.store.markWithdrawalConfirmed(withdrawalRequestId, transactionSignature);
    await this.persistPaymentState();
    return updated;
  }

  async markWithdrawalFailed(withdrawalRequestId: string, reason?: string) {
    await this.ensureInitialized();
    const updated = this.store.markWithdrawalFailed(withdrawalRequestId, reason);
    await this.persistPaymentState();
    return updated;
  }

  validateRealtimePaymentIntent(
    accessToken: string | undefined,
    paymentIntentId: string,
    options: {
      purpose: PaymentIntentRequest['purpose'];
      tokenId: string;
      entryFeeTierId: string;
      contestId?: string;
    }
  ) {
    this.assertInitialized();
    const session = this.requireSession(accessToken);
    const player = this.store.getPlayerById(session.playerId);
    if (!player) {
      throw new Error('Player not found.');
    }

    const intent = this.store.validateConfirmedPaymentIntent(
      session.playerId,
      paymentIntentId,
      options
    );
    return {
      session,
      player,
      intent,
    };
  }

  async refundRealtimePaymentIntent(playerId: string, paymentIntentId: string, description: string) {
    await this.ensureInitialized();
    const player = this.store.getPlayerById(playerId);
    const intent = this.store.getPaymentIntent(paymentIntentId);
    if (!player || !intent) {
      throw new Error('Payment intent not found.');
    }

    if (!this.connection || !this.vaultSigner) {
      const refund = this.store.refundPaymentIntent(playerId, paymentIntentId, {
        description,
      });
      await this.persistPaymentState();
      return refund;
    }

    const transfer = await sendVaultTransfer({
      connection: this.connection,
      vaultSigner: this.vaultSigner,
      destinationAddress: player.walletAddress,
      amountLamports: BigInt(intent.amountBaseUnits),
      memo: `runner:refund:${paymentIntentId}`,
    });
    const refund = this.store.refundPaymentIntent(playerId, paymentIntentId, {
      description,
      externalTransferSignature: transfer.transactionSignature,
    });
    await this.persistPaymentState();
    return refund;
  }

  async settleRealtimeWinnerTakeAll(
    winnerPlayerId: string,
    paymentIntentIds: string[],
    description: string
  ) {
    await this.ensureInitialized();
    const winner = this.store.getPlayerById(winnerPlayerId);
    if (!winner) {
      throw new Error('Winner player not found.');
    }

    const intents = paymentIntentIds.map((paymentIntentId) => {
      const intent = this.store.getPaymentIntent(paymentIntentId);
      if (!intent) {
        throw new Error('Payment intent not found.');
      }
      return intent;
    });

    const unsettledIntents = intents.filter((intent) => intent.status !== 'settled');
    const allSettled = unsettledIntents.length === 0;
    if (allSettled) {
      const settlement = this.store.settleWinnerTakeAll(winnerPlayerId, paymentIntentIds, {
        description,
      });
      await this.persistPaymentState();
      return settlement;
    }

    const totalAmount = unsettledIntents.reduce(
      (sum, intent) => sum + BigInt(intent.amountBaseUnits),
      0n
    );
    if (!this.connection || !this.vaultSigner) {
      const settlement = this.store.settleWinnerTakeAll(winnerPlayerId, paymentIntentIds, {
        description,
      });
      await this.persistPaymentState();
      return settlement;
    }

    try {
      const transfer = await sendVaultTransfer({
        connection: this.connection,
        vaultSigner: this.vaultSigner,
        destinationAddress: winner.walletAddress,
        amountLamports: totalAmount,
        memo: `runner:payout:${paymentIntentIds.join(',')}`,
      });
      const settlement = this.store.settleWinnerTakeAll(winnerPlayerId, paymentIntentIds, {
        description,
        externalTransferSignature: transfer.transactionSignature,
      });
      await this.persistPaymentState();
      return settlement;
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : 'Winner payout transfer failed.'
      );
    }
  }

  async settleContest(contestId: string) {
    await this.ensureInitialized();
    const payouts = this.store.settleContest(contestId);
    await this.persistPaymentState();
    return payouts;
  }
}

export const paymentService = new PaymentService();
