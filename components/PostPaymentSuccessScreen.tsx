import { Pressable, Text, View, StyleSheet } from 'react-native';
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
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none"><View style={styles.splitDiagonal} /></View>
      

      <View className="flex-1 justify-center px-6 z-10">
        <View className="rounded-[32px] border border-white/10 bg-slate-900/60 p-6 shadow-2xl shadow-black/50">
          <Text className="text-xs font-black uppercase tracking-widest text-orange-400">
            {handoff.eyebrow}
          </Text>
          <Text 
            className="mt-4 text-4xl font-black italic tracking-wide leading-tight text-white"
            style={{ textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 10 }}
          >
            {handoff.title}
          </Text>
          <Text className="mt-4 text-base leading-6 text-slate-300">{handoff.subtitle}</Text>

          <View className="mt-6 gap-3 rounded-[28px] border border-white/5 bg-black/30 p-5">
            <Text className="text-xs font-bold uppercase tracking-widest text-slate-400">
              Entry Confirmed
            </Text>
            <Text className="text-2xl font-black italic text-white">
              {session.selection.entryFeeTier.amount} {session.selection.entryFeeTier.currencySymbol}{' '}
              <Text className="text-orange-400">· {session.selection.token.symbol}</Text>
            </Text>
            {contestTitle ? (
              <Text className="text-sm font-medium leading-5 text-slate-300">{contestTitle}</Text>
            ) : null}
            <Text className="text-xs font-medium leading-5 text-slate-500">
              Intent {shorten(session.paymentIntentId)}
            </Text>
            <Text className="text-xs font-medium leading-5 text-slate-500">
              Tx {shorten(session.transactionSignature)}
            </Text>
          </View>

          <View className="mt-6 gap-3 rounded-[28px] border border-emerald-500/20 bg-emerald-500/10 p-5">
            <Text className="text-xs font-bold uppercase tracking-widest text-emerald-400">
              Next Move
            </Text>
            <Text className="text-lg font-black italic tracking-wide text-white uppercase">{handoff.primaryActionLabel}</Text>
            <Text className="text-sm font-medium leading-5 text-emerald-100/80">
              {handoff.primaryHelperText}
            </Text>
          </View>

          {errorMessage ? (
            <View className="mt-6 rounded-2xl border border-red-500/30 bg-red-950/50 px-5 py-4">
              <Text className="text-sm font-bold leading-5 text-red-300">{errorMessage}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={onPrimaryAction}
            disabled={isBusy}
            className={`mt-8 rounded-[28px] px-6 py-5 active:scale-95 transition-transform ${
              isBusy ? 'bg-slate-800' : 'bg-orange-500 shadow-lg shadow-orange-500/30'
            }`}>
            <Text
              className={`text-center text-xl font-black uppercase italic tracking-widest ${
                isBusy ? 'text-slate-500' : 'text-white'
              }`}>
              {primaryPending ? 'Preparing...' : handoff.primaryActionLabel}
            </Text>
          </Pressable>

          <Pressable
            onPress={onRefund}
            disabled={isBusy}
            className={`mt-4 rounded-full border px-6 py-4 active:scale-95 transition-transform ${
              isBusy ? 'border-slate-800 bg-slate-900/50' : 'border-white/10 bg-white/5 hover:bg-white/10'
            }`}>
            <Text className={`text-center text-sm font-bold uppercase tracking-wider ${isBusy ? 'text-slate-600' : 'text-slate-300'}`}>
              {refundPending ? 'Refunding...' : handoff.refundLabel}
            </Text>
          </Pressable>
          <Text className="mt-4 text-center text-xs font-medium leading-5 text-slate-500">
            {handoff.refundHelperText}
          </Text>
        </View>
      </View>
    </View>
  );
};

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
