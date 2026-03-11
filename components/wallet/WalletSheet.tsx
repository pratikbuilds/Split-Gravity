import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { WalletSessionController } from '../../hooks/useWalletSession';
import { formatWalletError } from '../../utils/wallet/errors';

type WalletSheetProps = {
  onClose: () => void;
  walletSession: WalletSessionController;
  visible: boolean;
};

type PendingAction = 'connect' | 'disconnect' | 'switch' | null;

const shortenAddress = (address: string) => `${address.slice(0, 4)}...${address.slice(-4)}`;

export function WalletSheet({ onClose, visible, walletSession }: WalletSheetProps) {
  const insets = useSafeAreaInsets();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const isConnected = Boolean(walletSession.walletAddress);
  const sessionLabel = useMemo(() => {
    if (!isConnected) {
      return 'No wallet connected yet.';
    }

    if (walletSession.hasValidSession) {
      return 'Verified session ready for paid modes and protected actions.';
    }

    return 'Wallet connected. The app will ask for a signature only when a protected action needs it.';
  }, [isConnected, walletSession.hasValidSession]);

  const clearFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  const handleClose = useCallback(() => {
    if (pendingAction) return;
    clearFeedback();
    onClose();
  }, [clearFeedback, onClose, pendingAction]);

  const handleSheetPress = useCallback((event: GestureResponderEvent) => {
    event.stopPropagation();
  }, []);

  const runAction = useCallback(
    async (action: PendingAction, operation: () => Promise<unknown>) => {
      setPendingAction(action);
      clearFeedback();

      try {
        await operation();
        onClose();
      } catch (error) {
        setFeedback(formatWalletError(error));
      } finally {
        setPendingAction(null);
      }
    },
    [clearFeedback, onClose]
  );

  const handleConnect = useCallback(() => {
    void runAction('connect', () => walletSession.connect());
  }, [runAction, walletSession]);

  const handleDisconnect = useCallback(() => {
    void runAction('disconnect', walletSession.disconnectWallet);
  }, [runAction, walletSession]);

  const handleSwitchWallet = useCallback(() => {
    void runAction('switch', walletSession.switchWallet);
  }, [runAction, walletSession]);

  const pendingLabel =
    pendingAction === 'connect'
      ? 'Connecting wallet...'
      : pendingAction === 'disconnect'
        ? 'Disconnecting wallet...'
        : pendingAction === 'switch'
          ? 'Switching wallet...'
          : null;

  return (
    <Modal animationType="slide" onRequestClose={handleClose} transparent visible={visible}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable
          className="rounded-t-[32px] border border-white/10 bg-[#140b19] px-6 pt-5"
          onPress={handleSheetPress}
          style={{ paddingBottom: Math.max(insets.bottom, 20) }}>
          <View className="mb-5 items-center">
            <View className="h-1.5 w-14 rounded-full bg-white/15" />
          </View>

          <View className="flex-row items-start justify-between gap-4">
            <View className="flex-1">
              <Text className="text-xs font-black uppercase tracking-[2px] text-orange-200">
                Wallet
              </Text>
              <Text className="mt-2 text-2xl font-black italic text-white">
                Manage your runner account
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close wallet sheet"
              className="border-white/12 rounded-full border bg-white/5 px-4 py-2"
              disabled={pendingAction !== null}
              onPress={handleClose}>
              <Text className="text-sm font-bold uppercase tracking-[1.5px] text-slate-200">
                Close
              </Text>
            </Pressable>
          </View>

          <View className="mt-6 rounded-[28px] border border-white/10 bg-black/20 px-5 py-5">
            <View className="flex-row items-center gap-3">
              <View
                className={`h-3 w-3 rounded-full ${
                  isConnected ? 'bg-emerald-300' : 'bg-orange-300'
                }`}
              />
              <Text className="text-xs font-black uppercase tracking-[2px] text-slate-300">
                {isConnected ? 'Connected Wallet' : 'Connection Status'}
              </Text>
            </View>

            <Text className="mt-4 text-2xl font-black text-white">
              {walletSession.walletAddress
                ? shortenAddress(walletSession.walletAddress)
                : 'No wallet connected'}
            </Text>

            <Text className="mt-3 text-sm leading-5 text-slate-300">{sessionLabel}</Text>

            {walletSession.storedSession?.expiresAt ? (
              <Text className="mt-3 text-xs uppercase tracking-[1.5px] text-slate-400">
                Session expires {new Date(walletSession.storedSession.expiresAt).toLocaleString()}
              </Text>
            ) : null}
          </View>

          <View className="mt-5 gap-3">
            {!isConnected ? (
              <Pressable
                className="rounded-[24px] bg-orange-500 px-5 py-4"
                disabled={pendingAction !== null || walletSession.loading}
                onPress={handleConnect}
                style={styles.primaryButton}>
                <Text className="text-center text-base font-black uppercase tracking-[1.5px] text-white">
                  Connect Wallet
                </Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  className="rounded-[24px] bg-orange-500 px-5 py-4"
                  disabled={pendingAction !== null}
                  onPress={handleSwitchWallet}
                  style={styles.primaryButton}>
                  <Text className="text-center text-base font-black uppercase tracking-[1.5px] text-white">
                    Change Wallet
                  </Text>
                </Pressable>

                <Pressable
                  className="border-white/12 rounded-[24px] border bg-white/5 px-5 py-4"
                  disabled={pendingAction !== null}
                  onPress={handleDisconnect}>
                  <Text className="text-center text-base font-black uppercase tracking-[1.5px] text-slate-100">
                    Disconnect
                  </Text>
                </Pressable>
              </>
            )}
          </View>

          <View className="border-white/8 mt-5 min-h-14 rounded-[22px] border bg-black/15 px-4 py-3">
            {pendingLabel ? (
              <View className="flex-row items-center gap-3">
                <ActivityIndicator color="#fdba74" />
                <Text className="flex-1 text-sm text-orange-100">{pendingLabel}</Text>
              </View>
            ) : feedback ? (
              <Text className="text-sm leading-5 text-red-200">{feedback}</Text>
            ) : (
              <Text className="text-sm leading-5 text-slate-400">
                Paid modes and private wallet features will request a signature only when needed.
              </Text>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
  },
  primaryButton: {
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
});
