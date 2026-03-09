import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMobileWallet } from '@wallet-ui/react-native-web3js';
import { backendApi } from '../services/backend/api';
import { getWalletAddress } from '../utils/wallet/account';
import { createWalletVerifyRequest } from '../utils/wallet/auth';

const STORAGE_KEY = 'my-expo-app:wallet-session';

type StoredWalletSession = {
  walletAddress: string;
  accessToken: string;
  expiresAt: string;
};

export const useWalletSession = () => {
  const wallet = useMobileWallet();
  const walletAddress = getWalletAddress(wallet.account);
  const [storedSession, setStoredSession] = useState<StoredWalletSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const hydrate = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!active || !raw) {
          setLoading(false);
          return;
        }

        const parsed = JSON.parse(raw) as StoredWalletSession;
        if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
          await AsyncStorage.removeItem(STORAGE_KEY);
          if (active) {
            setStoredSession(null);
          }
          return;
        }

        if (active) {
          setStoredSession(parsed);
        }
      } catch (error) {
        console.warn('Wallet session hydrate failed:', error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void hydrate();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!walletAddress || !storedSession) return;
    if (storedSession.walletAddress === walletAddress) return;

    void AsyncStorage.removeItem(STORAGE_KEY);
    setStoredSession(null);
  }, [storedSession, walletAddress]);

  const ensureAccessToken = useCallback(async () => {
    const connectedAccount = wallet.account ?? (await wallet.connect());
    const nextWalletAddress = getWalletAddress(connectedAccount);
    if (!nextWalletAddress) {
      throw new Error('Connected wallet account is missing a public address.');
    }

    if (
      storedSession &&
      storedSession.walletAddress === nextWalletAddress &&
      new Date(storedSession.expiresAt).getTime() > Date.now()
    ) {
      return storedSession.accessToken;
    }

    const challenge = await backendApi.createWalletChallenge(nextWalletAddress);
    const signInResult = await wallet.signIn(challenge.signInPayload);
    const auth = await backendApi.verifyWallet(
      createWalletVerifyRequest({
        nonce: challenge.nonce,
        signInResult,
      })
    );

    const nextSession: StoredWalletSession = {
      walletAddress: nextWalletAddress,
      accessToken: auth.accessToken,
      expiresAt: auth.expiresAt,
    };
    setStoredSession(nextSession);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
    return nextSession.accessToken;
  }, [storedSession, wallet]);

  const clearSession = useCallback(async () => {
    setStoredSession(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const hasValidSession = useMemo(() => {
    return Boolean(storedSession && new Date(storedSession.expiresAt).getTime() > Date.now());
  }, [storedSession]);

  return {
    ...wallet,
    walletAddress,
    storedSession,
    loading,
    hasValidSession,
    ensureAccessToken,
    clearSession,
  };
};
