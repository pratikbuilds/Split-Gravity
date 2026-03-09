import { useCallback, useEffect, useRef, useState } from 'react';
import type { CustomCharacterSummary } from '../shared/character-generation-contracts';
import { backendApi, isSessionExpiredError } from '../services/backend/api';
import { useWalletSession } from './useWalletSession';

export const useCustomCharacterGallery = () => {
  const walletSession = useWalletSession();
  const [characters, setCharacters] = useState<CustomCharacterSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const walletSessionRef = useRef(walletSession);
  walletSessionRef.current = walletSession;

  const refresh = useCallback(async () => {
    const ws = walletSessionRef.current;
    if (!ws.walletAddress) {
      setCharacters([]);
      return;
    }
    // Use existing valid session so we never trigger wallet.connect() on load
    if (!ws.hasValidSession || !ws.storedSession) {
      setCharacters([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await backendApi.getCustomCharacters(ws.storedSession.accessToken);
      setCharacters(response.characters);
    } catch (nextError) {
      if (isSessionExpiredError(nextError)) {
        await ws.clearSession();
        setError('Session expired. Please sign in again.');
      } else {
        setError(
          nextError instanceof Error ? nextError.message : 'Failed to load custom characters.'
        );
      }
    } finally {
      setLoading(false);
    }
  }, [walletSession.walletAddress, walletSession.hasValidSession]);

  useEffect(() => {
    if (!walletSession.walletAddress || !walletSession.hasValidSession) return;
    void refresh();
  }, [refresh, walletSession.walletAddress, walletSession.hasValidSession]);

  const renameCharacter = useCallback(
    async (characterId: string, displayName: string) => {
      try {
        const accessToken = await walletSession.ensureAccessToken();
        await backendApi.renameCustomCharacter(accessToken, characterId, { displayName });
        await refresh();
      } catch (error) {
        if (isSessionExpiredError(error)) {
          await walletSession.clearSession();
          throw new Error('Session expired. Please sign in again.');
        }
        throw error;
      }
    },
    [refresh, walletSession]
  );

  const activateCharacter = useCallback(
    async (characterId: string) => {
      try {
        const accessToken = await walletSession.ensureAccessToken();
        const response = await backendApi.activateCustomCharacter(accessToken, characterId);
        await refresh();
        return response;
      } catch (error) {
        if (isSessionExpiredError(error)) {
          await walletSession.clearSession();
          throw new Error('Session expired. Please sign in again.');
        }
        throw error;
      }
    },
    [refresh, walletSession]
  );

  return {
    walletSession,
    characters,
    loading,
    error,
    refresh,
    renameCharacter,
    activateCharacter,
  };
};
