import type {
  ConfirmPaymentIntentRequest,
  ConfirmPaymentIntentResponse,
  ContestEntryRequest,
  ContestEntryResponse,
  DailyContest,
  LeaderboardEntry,
  PaymentIntentRequest,
  PaymentIntentResponse,
  PaymentIntentTransactionRequest,
  PaymentIntentTransactionResponse,
  SubmitRunResultRequest,
  SubmitRunResultResponse,
  SupportedToken,
  WalletLedgerBalance,
  WalletNonceResponse,
  WalletVerifyRequest,
  WalletVerifyResponse,
} from '../../shared/payment-contracts';
import { resolveConfiguredBackendUrl } from './config';

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const parseJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
};

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = resolveConfiguredBackendUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorBody =
      (await parseJson<{ message?: string; code?: string }>(response).catch(() => null)) ?? {};
    throw new ApiError(
      errorBody.message || `Request failed with status ${response.status}`,
      response.status,
      errorBody.code
    );
  }

  return parseJson<T>(response);
}

export const backendApi = {
  getBaseUrl: resolveConfiguredBackendUrl,
  createWalletNonce: () => fetchJson<WalletNonceResponse>('/auth/wallet/nonce', { method: 'POST' }),
  verifyWallet: (payload: WalletVerifyRequest) =>
    fetchJson<WalletVerifyResponse>('/auth/wallet/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getSupportedTokens: () => fetchJson<{ tokens: SupportedToken[] }>('/tokens'),
  getDailyContests: () => fetchJson<{ contests: DailyContest[] }>('/contests/active'),
  createPaymentIntent: (accessToken: string, payload: PaymentIntentRequest) =>
    fetchJson<PaymentIntentResponse>('/payments/intents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    }),
  buildPaymentIntentTransaction: (
    accessToken: string,
    paymentIntentId: string,
    payload: PaymentIntentTransactionRequest
  ) =>
    fetchJson<PaymentIntentTransactionResponse>(
      `/payments/intents/${paymentIntentId}/transaction`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(payload),
      }
    ),
  confirmPaymentIntent: (
    accessToken: string,
    paymentIntentId: string,
    payload: ConfirmPaymentIntentRequest
  ) =>
    fetchJson<ConfirmPaymentIntentResponse>(`/payments/intents/${paymentIntentId}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    }),
  createContestEntry: (accessToken: string, contestId: string, payload: ContestEntryRequest) =>
    fetchJson<ContestEntryResponse>(`/contests/${contestId}/entries`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    }),
  submitRunResult: (accessToken: string, runSessionId: string, payload: SubmitRunResultRequest) =>
    fetchJson<SubmitRunResultResponse>(`/runs/${runSessionId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    }),
  getLeaderboard: (contestId: string) =>
    fetchJson<{ leaderboard: LeaderboardEntry[] }>(`/contests/${contestId}/leaderboard`),
  getLedgerBalance: (accessToken: string) =>
    fetchJson<{ balances: WalletLedgerBalance[] }>('/ledger/balance', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
};

export { ApiError };
