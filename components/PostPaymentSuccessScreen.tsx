import { Pressable, Text, View } from 'react-native';
import type { PaidSetupResult, PostPaymentHandoff } from '../types/payments';

type PostPaymentSuccessScreenProps = {
  handoff: PostPaymentHandoff;
  session: PaidSetupResult;
  primaryPending: boolean;
  refundPending: boolean;
  errorMessage: string | null;
  onPrimaryAction: () => void;
  onRefund: () => void;
};

const shorten = (value: string) => `${value.slice(0, 8)}...${value.slice(-6)}`;

export const PostPaymentSuccessScreen = ({
  handoff,
  session,
  primaryPending,
  refundPending,
  errorMessage,
  onPrimaryAction,
  onRefund,
}: PostPaymentSuccessScreenProps) => {
  const contestTitle = session.selection.contest?.title ?? null;
  const isBusy = primaryPending || refundPending;

  return (
    <View className="flex-1 bg-[#040814] px-6 py-10">
      <View className="absolute left-[-40] top-20 h-48 w-48 rounded-full bg-cyan-400/10" />
      <View className="absolute bottom-16 right-[-30] h-56 w-56 rounded-full bg-emerald-300/10" />

      <View className="flex-1 justify-center">
        <View className="rounded-[32px] border border-white/10 bg-slate-950/85 p-6">
          <Text className="text-xs font-semibold uppercase tracking-[3px] text-cyan-200">
            {handoff.eyebrow}
          </Text>
          <Text className="mt-4 text-4xl font-black leading-tight text-white">
            {handoff.title}
          </Text>
          <Text className="mt-4 text-base leading-6 text-slate-300">{handoff.subtitle}</Text>

          <View className="mt-6 gap-3 rounded-[28px] border border-white/10 bg-white/5 p-4">
            <Text className="text-sm font-semibold uppercase tracking-[2px] text-slate-400">
              Entry Confirmed
            </Text>
            <Text className="text-xl font-black text-white">
              {session.selection.entryFeeTier.amount} {session.selection.entryFeeTier.currencySymbol}{' '}
              · {session.selection.token.symbol}
            </Text>
            {contestTitle ? (
              <Text className="text-sm leading-5 text-slate-300">{contestTitle}</Text>
            ) : null}
            <Text className="text-xs leading-5 text-slate-400">
              Payment intent {shorten(session.paymentIntentId)}
            </Text>
            <Text className="text-xs leading-5 text-slate-400">
              Transaction {shorten(session.transactionSignature)}
            </Text>
          </View>

          <View className="mt-6 gap-3 rounded-[28px] border border-emerald-300/10 bg-emerald-400/10 p-4">
            <Text className="text-sm font-semibold uppercase tracking-[2px] text-emerald-100">
              Next Move
            </Text>
            <Text className="text-base font-semibold text-white">{handoff.primaryActionLabel}</Text>
            <Text className="text-sm leading-5 text-emerald-50/85">
              {handoff.primaryHelperText}
            </Text>
          </View>

          {errorMessage ? (
            <View className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3">
              <Text className="text-sm font-semibold leading-5 text-red-100">{errorMessage}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={onPrimaryAction}
            disabled={isBusy}
            className={`mt-8 rounded-full px-6 py-4 active:opacity-80 ${
              isBusy ? 'bg-slate-700' : 'bg-white'
            }`}>
            <Text
              className={`text-center text-lg font-black ${
                isBusy ? 'text-slate-300' : 'text-black'
              }`}>
              {primaryPending ? 'Preparing...' : handoff.primaryActionLabel}
            </Text>
          </Pressable>

          <Pressable
            onPress={onRefund}
            disabled={isBusy}
            className={`mt-4 rounded-full border px-6 py-4 active:opacity-80 ${
              isBusy ? 'border-slate-800 bg-slate-900' : 'border-amber-300/40 bg-amber-400/10'
            }`}>
            <Text className="text-center text-lg font-black text-white">
              {refundPending ? 'Refunding...' : handoff.refundLabel}
            </Text>
          </Pressable>
          <Text className="mt-3 text-center text-xs leading-5 text-slate-400">
            {handoff.refundHelperText}
          </Text>
        </View>
      </View>
    </View>
  );
};
