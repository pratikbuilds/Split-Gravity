import { useCallback, useMemo, useState, memo } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useMobileWallet } from '@wallet-ui/react-native-web3js';

import { formatWalletError, isUserRejectedWalletError } from '../../utils/wallet/errors';
import {
  buildProofTransaction,
  FALLBACK_PROOF_LAMPORTS,
  summarizeSignedTransaction,
} from '../../utils/wallet/proofTransaction';

type FeedbackTone = 'error' | 'info' | 'success';
type PendingAction = 'connect' | 'disconnect' | 'sign' | null;

type FeedbackState = {
  lines: string[];
  tone: FeedbackTone;
} | null;

const CARD_MAX_WIDTH = 360;

function WalletProofCardComponent() {
  const { account, connect, connection, disconnect, signTransaction } = useMobileWallet();
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const walletAddress = account?.publicKey.toBase58() ?? null;
  const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  const isSupportedRuntime = Platform.OS === 'android' && !isExpoGo;

  const unsupportedMessage = useMemo(() => {
    if (Platform.OS !== 'android') {
      return 'Wallet proof is currently available only in Android development builds.';
    }

    if (isExpoGo) {
      return 'Wallet proof requires an Android development build. Expo Go does not support Mobile Wallet Adapter.';
    }

    return null;
  }, [isExpoGo]);

  const setErrorFeedback = useCallback((error: unknown) => {
    setFeedback({
      lines: [formatWalletError(error)],
      tone: 'error',
    });
  }, []);

  const handleConnect = useCallback(async () => {
    if (!isSupportedRuntime) return;

    setPendingAction('connect');
    setFeedback({
      lines: ['Opening wallet selector...'],
      tone: 'info',
    });

    try {
      const nextAccount = await connect();
      setFeedback({
        lines: [`Connected: ${nextAccount.publicKey.toBase58()}`],
        tone: 'success',
      });
    } catch (error) {
      setErrorFeedback(error);
    } finally {
      setPendingAction(null);
    }
  }, [connect, isSupportedRuntime, setErrorFeedback]);

  const handleDisconnect = useCallback(async () => {
    if (!account) return;

    setPendingAction('disconnect');
    setFeedback({
      lines: ['Disconnecting wallet session...'],
      tone: 'info',
    });

    try {
      await disconnect();
      setFeedback({
        lines: ['Wallet disconnected.'],
        tone: 'success',
      });
    } catch (error) {
      setErrorFeedback(error);
    } finally {
      setPendingAction(null);
    }
  }, [account, disconnect, setErrorFeedback]);

  const handleSignProof = useCallback(async () => {
    if (!account || !isSupportedRuntime) return;

    setPendingAction('sign');
    setFeedback({
      lines: ['Preparing proof transaction...'],
      tone: 'info',
    });

    try {
      let proof = await buildProofTransaction({
        connection,
        publicKey: account.publicKey,
      });
      let signedTransaction;

      try {
        signedTransaction = await signTransaction(proof.transaction);
      } catch (error) {
        if (isUserRejectedWalletError(error)) {
          throw error;
        }

        proof = await buildProofTransaction({
          connection,
          lamports: FALLBACK_PROOF_LAMPORTS,
          publicKey: account.publicKey,
        });
        signedTransaction = await signTransaction(proof.transaction);
      }

      const summary = summarizeSignedTransaction(signedTransaction);
      setFeedback({
        lines: [
          `Signed ${summary.transactionType} transaction.`,
          `Serialized bytes: ${summary.byteLength}`,
          `Recent blockhash: ${proof.blockhash}`,
          `Instruction lamports: ${proof.lamports}`,
          `Preview hex: ${summary.previewHex || 'n/a'}`,
        ],
        tone: 'success',
      });
    } catch (error) {
      setErrorFeedback(error);
    } finally {
      setPendingAction(null);
    }
  }, [account, connection, isSupportedRuntime, setErrorFeedback, signTransaction]);

  const feedbackColors =
    feedback?.tone === 'error'
      ? 'border-red-400/40 bg-red-500/10 text-red-100'
      : feedback?.tone === 'success'
        ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
        : 'border-sky-400/40 bg-sky-500/10 text-sky-100';

  const buttonsDisabled = !isSupportedRuntime || pendingAction !== null;
  const canDisconnect = Boolean(account) && !buttonsDisabled;
  const canSign = Boolean(account) && !buttonsDisabled;
  const connectLabel =
    pendingAction === 'connect' ? 'Connecting...' : account ? 'Wallet Connected' : 'Connect Wallet';
  const disconnectLabel = pendingAction === 'disconnect' ? 'Disconnecting...' : 'Disconnect';
  const signLabel = pendingAction === 'sign' ? 'Signing...' : 'Sign Proof Transaction';

  return (
    <View
      className="w-full self-center rounded-[28px] border border-white/12 bg-slate-950/80 p-5"
      style={{ marginTop: 28, maxWidth: CARD_MAX_WIDTH }}>
      <Text className="text-xs font-semibold uppercase tracking-[2px] text-sky-200">
        Wallet Proof
      </Text>
      <Text className="mt-2 text-lg font-black text-white">Connect and sign on Solana devnet</Text>
      <Text className="mt-2 text-sm leading-5 text-slate-300">
        This proof flow is separate from gameplay and signs a local self-transfer transaction
        without sending it.
      </Text>

      <View className="mt-4 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3">
        <Text className="text-xs font-semibold uppercase tracking-[2px] text-slate-400">
          Status
        </Text>
        <Text className="mt-2 text-sm text-white">
          {walletAddress ? `Connected: ${walletAddress}` : 'No wallet connected.'}
        </Text>
        {unsupportedMessage ? (
          <Text className="mt-2 text-sm text-amber-200">{unsupportedMessage}</Text>
        ) : (
          <Text className="mt-2 text-xs text-slate-400">
            Network: solana:devnet via https://api.devnet.solana.com
          </Text>
        )}
      </View>

      <View className="mt-4 gap-3">
        <Pressable
          disabled={buttonsDisabled || Boolean(account)}
          onPress={handleConnect}
          className={`rounded-full px-5 py-3 ${buttonsDisabled || account ? 'bg-slate-700' : 'bg-sky-300'} `}>
          <Text
            className={`text-center text-sm font-bold ${buttonsDisabled || account ? 'text-slate-300' : 'text-slate-950'}`}>
            {connectLabel}
          </Text>
        </Pressable>

        <View className="flex-row gap-3">
          <Pressable
            disabled={!canDisconnect}
            onPress={handleDisconnect}
            className={`flex-1 rounded-full px-5 py-3 ${canDisconnect ? 'bg-white' : 'bg-slate-700'}`}>
            <Text
              className={`text-center text-sm font-bold ${canDisconnect ? 'text-black' : 'text-slate-300'}`}>
              {disconnectLabel}
            </Text>
          </Pressable>

          <Pressable
            disabled={!canSign}
            onPress={handleSignProof}
            className={`flex-1 rounded-full px-5 py-3 ${canSign ? 'bg-emerald-300' : 'bg-slate-700'}`}>
            <Text
              className={`text-center text-sm font-bold ${canSign ? 'text-slate-950' : 'text-slate-300'}`}>
              {signLabel}
            </Text>
          </Pressable>
        </View>
      </View>

      {feedback ? (
        <View className={`mt-4 rounded-2xl border px-4 py-3 ${feedbackColors}`}>
          {feedback.lines.map((line) => (
            <Text key={line} className="text-sm leading-5">
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export const WalletProofCard = memo(WalletProofCardComponent);
