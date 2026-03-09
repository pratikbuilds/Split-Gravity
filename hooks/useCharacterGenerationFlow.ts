import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type {
  CharacterGenerationConfigResponse,
  CharacterGenerationJobSummary,
} from '../shared/character-generation-contracts';
import { backendApi } from '../services/backend/api';
import { fundPaymentIntent } from '../services/payments/fundPaymentIntent';
import { useWalletSession } from './useWalletSession';

const PENDING_JOBS_STORAGE_KEY = 'my-expo-app:character-generation-job-ids';

const mergeJobs = (
  existing: CharacterGenerationJobSummary[],
  incoming: CharacterGenerationJobSummary[]
) => {
  const map = new Map(existing.map((job) => [job.jobId, job]));
  for (const job of incoming) {
    map.set(job.jobId, job);
  }
  return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const useCharacterGenerationFlow = () => {
  const walletSession = useWalletSession();
  const [config, setConfig] = useState<CharacterGenerationConfigResponse | null>(null);
  const [jobs, setJobs] = useState<CharacterGenerationJobSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registerPushToken = useCallback(async () => {
    if (Platform.OS === 'web') return;
    if (!walletSession.walletAddress) return;
    const accessToken = await walletSession.ensureAccessToken();
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    const token = await Notifications.getExpoPushTokenAsync();
    await backendApi.registerExpoPushToken(accessToken, {
      expoPushToken: token.data,
      platform: Platform.OS === 'android' ? 'android' : 'ios',
    });
  }, [walletSession]);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const nextConfig = await backendApi.getCharacterGenerationConfig();
      setConfig(nextConfig);

      if (!walletSession.walletAddress) {
        setJobs([]);
        return;
      }

      const accessToken = await walletSession.ensureAccessToken();
      const response = await backendApi.getCharacterGenerationJobs(accessToken);
      setJobs(response.jobs);
      await AsyncStorage.setItem(
        PENDING_JOBS_STORAGE_KEY,
        JSON.stringify(
          response.jobs
            .filter((job) => job.status === 'queued' || job.status === 'running')
            .map((job) => job.jobId)
        )
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Failed to load generation status.'
      );
    } finally {
      setLoading(false);
    }
  }, [walletSession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void registerPushToken().catch((nextError) => {
      console.warn('Expo push token registration failed:', nextError);
    });
  }, [registerPushToken]);

  const pickReferenceImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      base64: true,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0]?.base64) {
      return null;
    }

    const asset = result.assets[0];
    const mimeType = asset.mimeType || 'image/png';
    return `data:${mimeType};base64,${asset.base64}`;
  }, []);

  const submitGeneration = useCallback(
    async ({
      prompt,
      displayName,
      referenceImageDataUrl,
    }: {
      prompt?: string;
      displayName?: string;
      referenceImageDataUrl?: string | null;
    }) => {
      if (!config) {
        throw new Error('Generation config is not loaded yet.');
      }

      setSubmitting(true);
      setError(null);

      try {
        let paymentIntentId: string | undefined;
        const accessToken = await walletSession.ensureAccessToken();

        if (
          config.pricing.requiresPayment &&
          config.pricing.tokenId &&
          config.pricing.entryFeeTierId
        ) {
          const funded = await fundPaymentIntent({
            wallet: walletSession,
            purpose: 'character_generation',
            tokenId: config.pricing.tokenId,
            entryFeeTierId: config.pricing.entryFeeTierId,
            existingAccessToken: accessToken,
          });
          paymentIntentId = funded.paymentIntentId;
        }

        const response = await backendApi.createCharacterGenerationJob(accessToken, {
          prompt,
          displayName,
          referenceImageDataUrl: referenceImageDataUrl ?? undefined,
          paymentIntentId,
        });

        setJobs((current) => mergeJobs(current, [response.job]));
        const currentPending = JSON.parse(
          (await AsyncStorage.getItem(PENDING_JOBS_STORAGE_KEY)) || '[]'
        ) as string[];
        await AsyncStorage.setItem(
          PENDING_JOBS_STORAGE_KEY,
          JSON.stringify(Array.from(new Set([...currentPending, response.job.jobId])))
        );
        return response.job;
      } catch (nextError) {
        setError(
          nextError instanceof Error ? nextError.message : 'Failed to submit generation job.'
        );
        throw nextError;
      } finally {
        setSubmitting(false);
      }
    },
    [config, walletSession]
  );

  return {
    walletSession,
    config,
    jobs,
    loading,
    submitting,
    error,
    refresh,
    pickReferenceImage,
    submitGeneration,
  };
};
