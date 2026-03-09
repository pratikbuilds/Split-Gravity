import { useEffect, useMemo, useState } from 'react';
import { Buffer } from 'buffer';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMobileWallet } from '@wallet-ui/react-native-web3js';
import { Transaction } from '@solana/web3.js';
import type {
  DailyContest,
  PaymentIntentPurpose,
  SupportedToken,
} from '../shared/payment-contracts';
import { backendApi, formatApiErrorForDebug } from '../services/backend/api';
import type { PaidSetupResult } from '../types/payments';
import { getWalletAddress, getWalletPublicKey } from '../utils/wallet/account';
import { createWalletVerifyRequest } from '../utils/wallet/auth';
import { formatWalletError } from '../utils/wallet/errors';

type PaidModeSetupScreenProps = {
  purpose: PaymentIntentPurpose;
  onBack: () => void;
  onComplete: (result: PaidSetupResult) => void;
};

const PURPOSE_COPY: Record<
  PaymentIntentPurpose,
  { headline: string; subtitle: string; cta: string }
> = {
  single_paid_contest: {
    headline: 'Daily Paid Contest',
    subtitle: 'Connect your wallet, choose token and entry fee, then pay to enter. Your best distance today counts for the leaderboard.',
    cta: 'Pay Entry Fee',
  },
  multi_paid_private: {
    headline: 'Paid Private Room',
    subtitle: 'Connect your wallet and set the stake amount. Both players must fund the same stake before the match.',
    cta: 'Connect & Set Stake',
  },
  multi_paid_queue: {
    headline: 'Paid Matchmaking',
    subtitle: 'Connect your wallet and fund your stake, then join the queue to be matched with another paid player.',
    cta: 'Connect & Fund Stake',
  },
};

const shortenAddress = (address: string) => `${address.slice(0, 4)}...${address.slice(-4)}`;

type PaymentProgress = {
  selectionKey: string;
  accessToken?: string;
  paymentIntentId?: string;
  transactionSignature?: string;
};

type ScreenError = {
  summary: string;
  details: string[];
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const formatScreenError = (error: unknown, fallbackSummary: string): ScreenError => {
  const apiDebug = formatApiErrorForDebug(error);
  if (apiDebug) {
    return apiDebug;
  }

  const summary =
    error instanceof Error
      ? error.message.trim() || fallbackSummary
      : typeof error === 'string'
        ? error.trim() || fallbackSummary
        : fallbackSummary;

  return {
    summary,
    details: [],
  };
};

export const PaidModeSetupScreen = ({ purpose, onBack, onComplete }: PaidModeSetupScreenProps) => {
  const { account, connect, disconnect, signAndSendTransaction, signIn } = useMobileWallet();
  const [tokens, setTokens] = useState<SupportedToken[]>([]);
  const [contests, setContests] = useState<DailyContest[]>([]);
  const [contestId, setContestId] = useState<string | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ScreenError | null>(null);
  const [paymentProgress, setPaymentProgress] = useState<PaymentProgress | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const [tokensResponse, contestsResponse] = await Promise.all([
          backendApi.getSupportedTokens(),
          purpose === 'single_paid_contest'
            ? backendApi.getDailyContests()
            : Promise.resolve({ contests: [] }),
        ]);
        if (cancelled) return;

        const enabledTokens = tokensResponse.tokens.filter((token) => token.enabled);
        setTokens(enabledTokens);
        setContests(contestsResponse.contests);
        const firstToken = enabledTokens[0] ?? null;
        const firstTier = firstToken?.entryFeeTiers[0] ?? null;
        setSelectedTokenId(firstToken?.id ?? null);
        setSelectedTierId(firstTier?.id ?? null);

        if (purpose === 'single_paid_contest' && firstToken && firstTier) {
          const matchingContest = contestsResponse.contests.find(
            (contest) =>
              contest.tokenId === firstToken.id && contest.entryFeeTierId === firstTier.id
          );
          setContestId(matchingContest?.id ?? null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(formatScreenError(nextError, 'Failed to load paid setup.'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [purpose]);

  const selectedToken = useMemo(
    () => tokens.find((token) => token.id === selectedTokenId) ?? null,
    [selectedTokenId, tokens]
  );
  const selectedTier = useMemo(
    () => selectedToken?.entryFeeTiers.find((tier) => tier.id === selectedTierId) ?? null,
    [selectedTierId, selectedToken]
  );
  const selectionKey = `${purpose}:${selectedTokenId ?? 'none'}:${selectedTierId ?? 'none'}:${contestId ?? 'none'}`;

  useEffect(() => {
    if (!selectedToken) return;
    if (!selectedToken.entryFeeTiers.some((tier) => tier.id === selectedTierId)) {
      setSelectedTierId(selectedToken.entryFeeTiers[0]?.id ?? null);
    }
  }, [selectedTierId, selectedToken]);

  useEffect(() => {
    if (purpose !== 'single_paid_contest') return;
    if (!selectedToken || !selectedTier) {
      setContestId(null);
      return;
    }

    const match = contests.find(
      (contest) =>
        contest.tokenId === selectedToken.id && contest.entryFeeTierId === selectedTier.id
    );
    setContestId(match?.id ?? null);
  }, [contests, purpose, selectedTier, selectedToken]);

  useEffect(() => {
    setPaymentProgress((current) => (current?.selectionKey === selectionKey ? current : null));
  }, [selectionKey]);

  const walletAddress = getWalletAddress(account);
  const copy = PURPOSE_COPY[purpose];
  const contestUnavailable = purpose === 'single_paid_contest' && !contestId;

  const runWithBackoff = async <T,>(operation: () => Promise<T>) => {
    const delays = [0, 500, 1500];
    let lastError: unknown;
    for (const delay of delays) {
      if (delay > 0) {
        await wait(delay);
      }
      try {
        return await operation();
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  };

  const handlePrimaryAction = async () => {
    setError(null);

    if (!selectedToken || !selectedTier) {
      setError({
        summary: 'Select a token and entry fee before continuing.',
        details: [],
      });
      return;
    }

    if (contestUnavailable) {
      setError({
        summary: 'No active contest is available for that token and entry fee.',
        details: [],
      });
      return;
    }

    try {
      setSubmitting(true);

      const connectedAccount = account ?? (await connect());
      const wallet = getWalletAddress(connectedAccount);
      const publicKey = getWalletPublicKey(connectedAccount);
      if (!wallet || !publicKey) {
        throw new Error('Connected wallet account is missing a valid public key.');
      }
      const currentProgress =
        paymentProgress?.selectionKey === selectionKey ? paymentProgress : null;

      let accessToken = currentProgress?.accessToken;
      if (!accessToken) {
        const challenge = await backendApi.createWalletChallenge(wallet);
        const signInResult = await signIn(challenge.signInPayload);
        const auth = await backendApi.verifyWallet(
          createWalletVerifyRequest({
            nonce: challenge.nonce,
            signInResult,
          })
        );
        accessToken = auth.accessToken;
        setPaymentProgress({
          selectionKey,
          accessToken,
        });
      }

      let paymentIntentId = currentProgress?.paymentIntentId;
      if (!paymentIntentId) {
        const paymentIntent = await backendApi.createPaymentIntent(accessToken, {
          tokenId: selectedToken.id,
          entryFeeTierId: selectedTier.id,
          purpose,
          contestId: contestId ?? undefined,
        });
        paymentIntentId = paymentIntent.paymentIntentId;
        setPaymentProgress((existing) => ({
          ...(existing ?? { selectionKey }),
          selectionKey,
          accessToken,
          paymentIntentId,
        }));
      }

      let transactionSignature = currentProgress?.transactionSignature;
      if (!transactionSignature) {
        const built = await backendApi.buildPaymentIntentTransaction(accessToken, paymentIntentId, {
          walletAddress: wallet,
        });
        const transaction = Transaction.from(
          Buffer.from(built.serializedTransactionBase64, 'base64')
        );
        const txSignature = await signAndSendTransaction(transaction, built.minContextSlot);
        transactionSignature = Array.isArray(txSignature) ? txSignature[0] : txSignature;
        setPaymentProgress((existing) => ({
          ...(existing ?? { selectionKey }),
          selectionKey,
          accessToken,
          paymentIntentId,
          transactionSignature,
        }));
      }

      await runWithBackoff(() =>
        backendApi.confirmPaymentIntent(accessToken!, paymentIntentId!, {
          transactionSignature: transactionSignature!,
          walletAddress: wallet,
        })
      );

      onComplete({
        accessToken,
        paymentIntentId: paymentIntentId!,
        transactionSignature: transactionSignature!,
        selection: {
          purpose,
          token: selectedToken,
          entryFeeTier: selectedTier,
          contest: contestId
            ? (contests.find((contest) => contest.id === contestId) ?? null)
            : null,
        },
      });
    } catch (nextError) {
      setError(
        formatScreenError(nextError, formatWalletError(nextError) || 'Failed to fund entry.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const insets = useSafeAreaInsets();
  const topPad = Math.max(insets.top + 16, 56);
  const bottomPad = Math.max(insets.bottom, 24);

  const flatTiers = tokens.flatMap((token) =>
    token.entryFeeTiers.map((tier) => ({ token, tier }))
  );

  const ctaText = !walletAddress
    ? 'Connect Wallet'
    : submitting
      ? 'Funding…'
      : copy.cta;

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none"><View style={styles.splitDiagonal} /></View>
      

      <ScrollView
        className="flex-1 z-10"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: topPad,
          paddingBottom: bottomPad,
        }}
        showsVerticalScrollIndicator={false}>

        <View className="flex-row items-center justify-between mb-8">
          <Pressable onPress={onBack} disabled={submitting} className="active:opacity-80 px-4 py-2 bg-white/5 rounded-full border border-white/10">
            <Text className="font-bold text-slate-300 uppercase tracking-wider text-xs">Back</Text>
          </Pressable>
          {walletAddress ? (
            <Pressable
              onPress={() => void disconnect()}
              disabled={submitting}
              className="rounded-full bg-slate-900/80 px-4 py-2 border border-slate-700 active:opacity-80">
              <Text className="text-xs font-bold text-slate-300">
                {shortenAddress(walletAddress)} • Disconnect
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Text 
          className="text-5xl font-black tracking-widest text-white italic"
          style={{ textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 10 }}
        >
          {copy.headline.toUpperCase()}
        </Text>
        <Text className="mt-4 max-w-sm text-sm leading-6 text-slate-400">
          {copy.subtitle}
        </Text>

        <View className="mt-10 gap-4">
          {flatTiers.map(({ token, tier }) => {
            const isSelected = token.id === selectedTokenId && tier.id === selectedTierId;
            return (
              <Pressable
                key={`${token.id}-${tier.id}`}
                onPress={() => {
                  setSelectedTokenId(token.id);
                  setSelectedTierId(tier.id);
                }}
                className={`flex-row items-center justify-between rounded-2xl border px-6 py-5 active:scale-[0.98] transition-all ${
                  isSelected 
                    ? 'bg-orange-500 border-orange-400 shadow-lg shadow-orange-500/30' 
                    : 'border-white/5 bg-slate-900/50'
                }`}>
                <View>
                  <Text className={`text-2xl font-black italic tracking-wide ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                    {tier.amount} <Text className={isSelected ? 'text-orange-200' : 'text-slate-400'}>{token.symbol}</Text>
                  </Text>
                  {tier.label ? (
                    <Text className={`mt-1 text-sm font-medium ${isSelected ? 'text-orange-100/80' : 'text-slate-500'}`}>{tier.label}</Text>
                  ) : null}
                </View>
                <View
                  className={`h-6 w-6 items-center justify-center rounded-full border-2 ${
                    isSelected ? 'border-white bg-orange-400' : 'border-slate-600 bg-slate-800'
                  }`}>
                  {isSelected && <View className="h-2.5 w-2.5 rounded-full bg-white" />}
                </View>
              </Pressable>
            );
          })}
          {!loading && flatTiers.length === 0 ? (
            <View className="bg-slate-900/50 border border-white/5 rounded-2xl p-6 items-center">
              <Text className="text-sm font-medium text-slate-500 uppercase tracking-widest">No entry options available</Text>
            </View>
          ) : null}
        </View>

        {purpose === 'single_paid_contest' && !contestId && selectedToken && selectedTier ? (
          <View className="mt-6 bg-red-950/50 border border-red-500/30 rounded-xl p-4">
            <Text className="text-sm font-bold text-red-400">
              No live contest is currently open for this entry tier.
            </Text>
          </View>
        ) : null}

        {error ? (
          <View className="mt-6 rounded-xl border border-red-400/30 bg-red-500/10 px-5 py-4">
            <Text className="text-sm font-bold text-red-300 uppercase tracking-wider mb-2">{error.summary}</Text>
            {error.details.length > 0 ? (
              <View className="gap-1.5">
                {error.details.map((detail, index) => (
                  <Text key={`${detail}:${index}`} className="text-xs font-medium text-red-200/80">
                    • {detail}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <Pressable
          onPress={() => void handlePrimaryAction()}
          disabled={loading || submitting || !selectedToken || !selectedTier || contestUnavailable}
          className={`mt-10 rounded-[28px] px-6 py-5 active:scale-95 transition-transform ${
            loading || submitting || !selectedToken || !selectedTier || contestUnavailable
              ? 'bg-slate-800'
              : 'bg-white'
          }`}
          style={(!loading && !submitting && selectedToken && selectedTier && !contestUnavailable) ? {
            shadowColor: '#ffffff',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 8,
            elevation: 5,
          } : undefined}>
          <Text
            className={`text-center text-xl font-black uppercase italic tracking-widest ${
              loading || submitting || !selectedToken || !selectedTier || contestUnavailable
                ? 'text-slate-500'
                : 'text-black'
            }`}>
            {ctaText}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
};

import { StyleSheet } from 'react-native';
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0510',
  },
  splitDiagonal: {
    position: 'absolute',
    top: '45%',
    left: '-50%',
    width: '200%',
    height: '150%',
    backgroundColor: '#120803',
    transform: [{ rotate: '-12deg' }],
    borderTopWidth: 2,
    borderTopColor: 'rgba(234, 88, 12, 0.2)',
  },
});
