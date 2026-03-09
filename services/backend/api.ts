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
  RefundPaymentIntentResponse,
  SubmitRunResultRequest,
  SubmitRunResultResponse,
  SupportedToken,
  WalletChallengeResponse,
  WalletLedgerBalance,
  WalletVerifyRequest,
  WalletVerifyResponse,
} from '../../shared/payment-contracts';
import { resolveConfiguredBackendUrl } from './config';

type ApiErrorContext = {
  method: string;
  path: string;
  baseUrl: string;
  url: string;
  isNetworkError?: boolean;
  causeName?: string;
  causeMessage?: string;
  responseText?: string;
};

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public context?: ApiErrorContext
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const parseTextJson = <T>(text: string): T => JSON.parse(text) as T;

const parseJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  if (!text) return {} as T;
  return parseTextJson<T>(text);
};

const readResponseText = async <T>(response: Response) => {
  const text = await response.text();
  if (!text) {
    return { text: '', json: null as T | null };
  }

  try {
    return { text, json: parseTextJson<T>(text) };
  } catch {
    return { text, json: null as T | null };
  }
};

const resolveRequestUrl = (baseUrl: string, path: string) => {
  try {
    return new URL(path, baseUrl).toString();
  } catch {
    return `${baseUrl}${path}`;
  }
};

const compactSingleLine = (value: string) => value.replace(/\s+/g, ' ').trim();

const truncate = (value: string, maxLength = 240) =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = resolveConfiguredBackendUrl();
  const method = (init?.method ?? 'GET').toUpperCase();
  const url = resolveRequestUrl(baseUrl, path);
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    throw new ApiError(
      error instanceof Error ? error.message : 'Network request failed',
      0,
      'NETWORK_ERROR',
      {
        method,
        path,
        baseUrl,
        url,
        isNetworkError: true,
        causeName: error instanceof Error ? error.name : undefined,
        causeMessage: error instanceof Error ? error.message : undefined,
      }
    );
  }

  if (!response.ok) {
    const errorBody = await readResponseText<{ message?: string; code?: string }>(response);
    const message =
      errorBody.json?.message ||
      compactSingleLine(errorBody.text) ||
      `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, errorBody.json?.code, {
      method,
      path,
      baseUrl,
      url,
      responseText: errorBody.text ? truncate(compactSingleLine(errorBody.text)) : undefined,
    });
  }

  return parseJson<T>(response);
}

export const formatApiErrorForDebug = (
  error: unknown
): { summary: string; details: string[] } | null => {
  if (!(error instanceof ApiError)) {
    return null;
  }

  const details = [
    `Request: ${error.context?.method ?? 'GET'} ${error.context?.path ?? 'unknown path'}`,
    `URL: ${error.context?.url ?? error.context?.baseUrl ?? 'unknown'}`,
  ];

  if (error.status > 0) {
    details.push(`HTTP status: ${error.status}`);
  } else if (error.context?.isNetworkError) {
    details.push('Stage: request could not reach the server');
  }

  if (error.code) {
    details.push(`Code: ${error.code}`);
  }

  if (error.context?.causeName || error.context?.causeMessage) {
    details.push(
      `Cause: ${[error.context.causeName, error.context.causeMessage].filter(Boolean).join(': ')}`
    );
  }

  if (error.context?.responseText && error.context.responseText !== error.message) {
    details.push(`Response: ${error.context.responseText}`);
  }

  if (error.context?.isNetworkError) {
    details.push(`Backend base URL: ${error.context.baseUrl}`);
    details.push('Check that the backend is running and reachable from this device/emulator.');
  }

  return {
    summary: error.message,
    details,
  };
};

export const backendApi = {
  getBaseUrl: resolveConfiguredBackendUrl,
  createWalletChallenge: (walletAddress: string) =>
    fetchJson<WalletChallengeResponse>('/auth/wallet/challenge', {
      method: 'POST',
      body: JSON.stringify({ walletAddress }),
    }),
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
  refundPaymentIntent: (accessToken: string, paymentIntentId: string) =>
    fetchJson<RefundPaymentIntentResponse>(`/payments/intents/${paymentIntentId}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
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
    fetchJson<{
      leaderboard: LeaderboardEntry[];
      poolTotalBaseUnits: string;
      poolTotalDisplay: string;
      tokenSymbol: string;
      payoutBps: number[];
    }>(`/contests/${contestId}/leaderboard`),
  getLedgerBalance: (accessToken: string) =>
    fetchJson<{ balances: WalletLedgerBalance[] }>('/ledger/balance', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
};

export { ApiError };
