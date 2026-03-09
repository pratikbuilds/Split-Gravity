import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import type {
  CharacterGenerationConfigResponse,
  CharacterGenerationJobSummary,
} from '../shared/character-generation-contracts';
import { backendApi, isSessionExpiredError } from '../services/backend/api';
import { fundPaymentIntent } from '../services/payments/fundPaymentIntent';
import { useWalletSession } from './useWalletSession';

const PENDING_JOBS_STORAGE_KEY = 'my-expo-app:character-generation-job-ids';
const MISSING_IMAGE_PICKER_MESSAGE =
  'Image picker is not available in this build. If using a development build: run "npx expo prebuild --clean" then "npx expo run:ios" or "npx expo run:android" and reinstall. If using Expo Go: update the Expo Go app to the latest version.';
const MISSING_NOTIFICATIONS_MESSAGE =
  'Push notifications are unavailable in the current app build. Rebuild and reinstall the Expo development build after adding expo-notifications.';

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
  const walletSessionRef = useRef(walletSession);
  walletSessionRef.current = walletSession;

  const [config, setConfig] = useState<CharacterGenerationConfigResponse | null>(null);
  const [jobs, setJobs] = useState<CharacterGenerationJobSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registerPushToken = useCallback(async () => {
    if (Platform.OS === 'web') return;
    const ws = walletSessionRef.current;
    // Only register when we already have a valid session — never prompt for sign on screen open
    if (!ws.walletAddress || !ws.hasValidSession || !ws.storedSession) return;
    if (!NativeModules.ExpoPushTokenManager) return; // Skip when native module not in build
    try {
      const Notifications = await import('expo-notifications');
      const api = Notifications?.default ?? Notifications;
      if (
        typeof api?.requestPermissionsAsync !== 'function' ||
        typeof api?.getExpoPushTokenAsync !== 'function'
      ) {
        return;
      }
      const { status } = await api.requestPermissionsAsync();
      if (status !== 'granted') return;
      const token = await api.getExpoPushTokenAsync();
      await backendApi.registerExpoPushToken(ws.storedSession.accessToken, {
        expoPushToken: token.data,
        platform: Platform.OS === 'android' ? 'android' : 'ios',
      });
    } catch {
      // ExpoPushTokenManager missing or permission denied; skip silently
    }
  }, [walletSession.walletAddress, walletSession.hasValidSession]);

  const refresh = useCallback(async () => {
    const ws = walletSessionRef.current;
    try {
      setLoading(true);
      setError(null);
      const nextConfig = await backendApi.getCharacterGenerationConfig();
      setConfig(nextConfig);

      if (!ws.walletAddress) {
        setJobs([]);
        return;
      }
      // Only fetch jobs when we already have a valid session — never trigger sign on screen open
      if (!ws.hasValidSession || !ws.storedSession) {
        setJobs([]);
        return;
      }
      const response = await backendApi.getCharacterGenerationJobs(ws.storedSession.accessToken);
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
      if (isSessionExpiredError(nextError)) {
        await ws.clearSession();
        setError('Session expired. Please sign in again.');
      } else {
        setError(
          nextError instanceof Error ? nextError.message : 'Failed to load generation status.'
        );
      }
    } finally {
      setLoading(false);
    }
  }, [walletSession.walletAddress, walletSession.hasValidSession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void registerPushToken();
  }, [registerPushToken]);

  const pickReferenceImage = useCallback(async () => {
    try {
      const ImagePicker = await import('expo-image-picker');
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permission.status !== 'granted') {
        setError('Photo library permission is required to upload a reference image.');
        return null;
      }

      setError(null);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
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
    } catch (nextError) {
      const nextMessage =
        nextError instanceof Error &&
        (nextError.message.includes('ExponentImagePicker') ||
          nextError.message.includes('ImagePicker') ||
          nextError.message.includes('native module'))
          ? MISSING_IMAGE_PICKER_MESSAGE
          : nextError instanceof Error
            ? nextError.message
            : 'Failed to open the image library.';
      setError(nextMessage);
      return null;
    }
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
        if (isSessionExpiredError(nextError)) {
          await walletSession.clearSession();
          setError('Session expired. Please sign in again.');
        } else {
          setError(
            nextError instanceof Error ? nextError.message : 'Failed to submit generation job.'
          );
        }
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
