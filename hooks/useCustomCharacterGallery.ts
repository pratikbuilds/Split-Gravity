import { useCallback, useEffect, useState } from 'react';
import type { CustomCharacterSummary } from '../shared/character-generation-contracts';
import { backendApi } from '../services/backend/api';
import { useWalletSession } from './useWalletSession';

export const useCustomCharacterGallery = () => {
  const walletSession = useWalletSession();
  const [characters, setCharacters] = useState<CustomCharacterSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!walletSession.walletAddress) {
      setCharacters([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const accessToken = await walletSession.ensureAccessToken();
      const response = await backendApi.getCustomCharacters(accessToken);
      setCharacters(response.characters);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to load custom characters.'
      );
    } finally {
      setLoading(false);
    }
  }, [walletSession]);

  useEffect(() => {
    if (!walletSession.walletAddress) return;
    void refresh();
  }, [refresh, walletSession.walletAddress]);

  const renameCharacter = useCallback(
    async (characterId: string, displayName: string) => {
      const accessToken = await walletSession.ensureAccessToken();
      await backendApi.renameCustomCharacter(accessToken, characterId, { displayName });
      await refresh();
    },
    [refresh, walletSession]
  );

  const activateCharacter = useCallback(
    async (characterId: string) => {
      const accessToken = await walletSession.ensureAccessToken();
      const response = await backendApi.activateCustomCharacter(accessToken, characterId);
      await refresh();
      return response;
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
