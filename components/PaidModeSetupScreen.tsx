import { useEffect, useMemo, useState } from 'react';
import { Buffer } from 'buffer';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { fromUint8Array, useMobileWallet } from '@wallet-ui/react-native-web3js';
import { Transaction } from '@solana/web3.js';
import type {
  DailyContest,
  PaymentIntentPurpose,
  SupportedToken,
} from '../shared/payment-contracts';
import { backendApi } from '../services/backend/api';
import type { PaidSetupResult } from '../types/payments';
import { getWalletAddress, getWalletPublicKey } from '../utils/wallet/account';
import { createWalletSignInPayload } from '../utils/wallet/auth';
import { formatWalletError } from '../utils/wallet/errors';

type PaidModeSetupScreenProps = {
  purpose: PaymentIntentPurpose;
  onBack: () => void;
  onComplete: (result: PaidSetupResult) => void;
};

const PURPOSE_COPY: Record<PaymentIntentPurpose, { title: string; description: string }> = {
  single_paid_contest: {
    title: 'Daily Paid Contest',
    description: 'Connect your wallet, pick the token and entry fee, then pay to lock in a run.',
  },
  multi_paid_private: {
    title: 'Paid Private Room',
    description:
      'Connect your wallet and preselect the stake so the room can enforce matching terms.',
  },
  multi_paid_queue: {
    title: 'Paid Matchmaking',
    description: 'Connect your wallet and fund a stake bucket before joining the public queue.',
  },
};

const shortenAddress = (address: string) => `${address.slice(0, 4)}...${address.slice(-4)}`;

type PaymentProgress = {
  selectionKey: string;
  accessToken?: string;
  paymentIntentId?: string;
  transactionSignature?: string;
  contestEntryId?: string;
  runSessionId?: string;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const PaidModeSetupScreen = ({ purpose, onBack, onComplete }: PaidModeSetupScreenProps) => {
  const { account, connect, disconnect, signAndSendTransaction, signIn } = useMobileWallet();
  const [tokens, setTokens] = useState<SupportedToken[]>([]);
  const [contests, setContests] = useState<DailyContest[]>([]);
  const [contestId, setContestId] = useState<string | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
          setError(nextError instanceof Error ? nextError.message : 'Failed to load paid setup.');
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
      setError('Select a token and entry fee before continuing.');
      return;
    }

    if (contestUnavailable) {
      setError('No active contest is available for that token and entry fee.');
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
        const { nonce } = await backendApi.createWalletNonce();
        const signInPayload = createWalletSignInPayload(nonce);
        const signInResult = await signIn(signInPayload);
        const auth = await backendApi.verifyWallet({
          walletAddress: wallet,
          nonce,
          signature: fromUint8Array(signInResult.signature),
          signedMessage: fromUint8Array(signInResult.signedMessage),
        });
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

      let contestEntryId: string | undefined;
      let runSessionId: string | undefined;
      if (purpose === 'single_paid_contest' && contestId) {
        contestEntryId = currentProgress?.contestEntryId;
        runSessionId = currentProgress?.runSessionId;
        if (!contestEntryId || !runSessionId) {
          const contestEntry = await runWithBackoff(() =>
            backendApi.createContestEntry(accessToken!, contestId, {
              paymentIntentId: paymentIntentId!,
            })
          );
          contestEntryId = contestEntry.contestEntryId;
          runSessionId = contestEntry.runSessionId;
          setPaymentProgress((existing) => ({
            ...(existing ?? { selectionKey }),
            selectionKey,
            accessToken,
            paymentIntentId,
            transactionSignature,
            contestEntryId,
            runSessionId,
          }));
        }
      }

      onComplete({
        accessToken,
        paymentIntentId: paymentIntentId!,
        transactionSignature: transactionSignature!,
        contestEntryId,
        runSessionId,
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
      setError(nextError instanceof Error ? nextError.message : formatWalletError(nextError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-[#050816]">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 64, paddingBottom: 32 }}>
        <Text className="text-4xl font-black tracking-[3px] text-white">{copy.title}</Text>
        <Text className="mt-3 max-w-sm text-sm leading-5 text-slate-300">{copy.description}</Text>

        <View className="mt-8 rounded-[28px] border border-white/10 bg-slate-950/70 p-5">
          <Text className="text-xs font-semibold uppercase tracking-[2px] text-slate-400">
            Wallet
          </Text>
          <Text className="mt-2 text-base font-bold text-white">
            {walletAddress ? shortenAddress(walletAddress) : 'Not connected'}
          </Text>
          <View className="mt-4 flex-row gap-3">
            <Pressable
              onPress={() => void connect()}
              disabled={submitting}
              className="flex-1 rounded-full bg-white px-4 py-3 active:opacity-80">
              <Text className="text-center font-bold text-black">
                {walletAddress ? 'Reconnect' : 'Connect Wallet'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void disconnect()}
              disabled={!walletAddress || submitting}
              className={`flex-1 rounded-full px-4 py-3 active:opacity-80 ${
                walletAddress && !submitting ? 'bg-slate-800' : 'bg-slate-900'
              }`}>
              <Text className="text-center font-bold text-white">Disconnect</Text>
            </Pressable>
          </View>
        </View>

        <View className="mt-6 rounded-[28px] border border-white/10 bg-slate-950/70 p-5">
          <Text className="text-xs font-semibold uppercase tracking-[2px] text-slate-400">
            Token
          </Text>
          <View className="mt-4 gap-3">
            {tokens.map((token) => {
              const isSelected = token.id === selectedTokenId;
              return (
                <Pressable
                  key={token.id}
                  onPress={() => setSelectedTokenId(token.id)}
                  className={`rounded-2xl border px-4 py-4 active:opacity-80 ${
                    isSelected
                      ? 'border-cyan-300 bg-cyan-400/10'
                      : 'border-white/10 bg-slate-900/80'
                  }`}>
                  <Text className="text-lg font-black text-white">{token.symbol}</Text>
                  <Text className="mt-1 text-sm text-slate-300">{token.name}</Text>
                </Pressable>
              );
            })}
            {!loading && tokens.length === 0 ? (
              <Text className="text-sm text-slate-400">No funded tokens are enabled yet.</Text>
            ) : null}
          </View>
        </View>

        <View className="mt-6 rounded-[28px] border border-white/10 bg-slate-950/70 p-5">
          <Text className="text-xs font-semibold uppercase tracking-[2px] text-slate-400">
            Entry Fee
          </Text>
          <View className="mt-4 gap-3">
            {selectedToken?.entryFeeTiers.map((tier) => {
              const isSelected = tier.id === selectedTierId;
              return (
                <Pressable
                  key={tier.id}
                  onPress={() => setSelectedTierId(tier.id)}
                  className={`rounded-2xl border px-4 py-4 active:opacity-80 ${
                    isSelected
                      ? 'border-amber-300 bg-amber-400/10'
                      : 'border-white/10 bg-slate-900/80'
                  }`}>
                  <Text className="text-lg font-black text-white">
                    {tier.amount} {tier.currencySymbol}
                  </Text>
                  <Text className="mt-1 text-sm text-slate-300">{tier.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {purpose === 'single_paid_contest' && !contestId && selectedToken && selectedTier ? (
            <Text className="mt-4 text-sm text-amber-200">
              No live contest is currently open for this token and entry fee tier.
            </Text>
          ) : null}
        </View>

        {error ? (
          <View className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3">
            <Text className="text-sm leading-5 text-red-100">{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => void handlePrimaryAction()}
          disabled={loading || submitting || !selectedToken || !selectedTier || contestUnavailable}
          className={`mt-8 rounded-full px-6 py-4 active:opacity-80 ${
            loading || submitting || !selectedToken || !selectedTier || contestUnavailable
              ? 'bg-slate-700'
              : 'bg-white'
          }`}>
          <Text
            className={`text-center text-lg font-black ${
              loading || submitting || !selectedToken || !selectedTier || contestUnavailable
                ? 'text-slate-300'
                : 'text-black'
            }`}>
            {submitting ? 'Funding Entry…' : 'Connect and Pay Entry Fee'}
          </Text>
        </Pressable>

        <Pressable
          onPress={onBack}
          disabled={submitting}
          className="mt-4 self-start rounded-full border border-white/20 px-5 py-3 active:opacity-80">
          <Text className="font-bold text-white">Back</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
};
