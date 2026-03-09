import type { DailyContest, SupportedToken } from '../../../shared/payment-contracts';
import { env } from '../config/env';

const DEFAULT_PAYOUT_BPS = [3000, 2000, 1200, 1000, 800, 600, 500, 400, 300, 200];

export const SUPPORTED_TOKENS: SupportedToken[] = [
  {
    id: 'sol',
    symbol: 'SOL',
    name: 'Solana',
    mint: null,
    decimals: 9,
    enabled: true,
    entryFeeTiers: [
      {
        id: 'sol-001',
        label: 'Warm Up',
        amount: '0.01',
        amountBaseUnits: '10000000',
        currencySymbol: 'SOL',
      },
      {
        id: 'sol-005',
        label: 'Main Event',
        amount: '0.05',
        amountBaseUnits: '50000000',
        currencySymbol: 'SOL',
      },
    ],
  },
];

export const PAYOUT_BPS = DEFAULT_PAYOUT_BPS;
const DEFAULT_DEV_VAULT_PUBLIC_KEY = '2aAv86fEWoQ4TRDq2xjh9cBY1vT6qoLXkDcs4ycE5w1X';
const isProduction = process.env.NODE_ENV === 'production';

if (!env.VAULT_PUBLIC_KEY && isProduction) {
  throw new Error('VAULT_PUBLIC_KEY environment variable is required in production.');
}

if (!env.VAULT_PUBLIC_KEY && !isProduction) {
  console.warn('VAULT_PUBLIC_KEY not set, using development fallback public key.');
}

export const VAULT_PUBLIC_KEY = env.VAULT_PUBLIC_KEY || DEFAULT_DEV_VAULT_PUBLIC_KEY;
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
export const NONCE_TTL_MS = 1000 * 60 * 5;

export const getActiveDailyContests = (now = new Date()): DailyContest[] => {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const dayKey = start.toISOString().slice(0, 10);

  return SUPPORTED_TOKENS.flatMap((token) =>
    token.entryFeeTiers.map((tier) => ({
      id: `${dayKey}:${token.id}:${tier.id}`,
      tokenId: token.id,
      entryFeeTierId: tier.id,
      title: `${token.symbol} ${tier.amount} Daily Contest`,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      payoutBps: DEFAULT_PAYOUT_BPS,
    }))
  );
};
