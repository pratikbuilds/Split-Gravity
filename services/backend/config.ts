import { NativeModules, Platform } from 'react-native';

const FALLBACK_SERVER_PORT = 4100;
const DEFAULT_BACKEND_SERVER_URL = 'https://gravity-jump-production.up.railway.app';
const USE_LOCAL_BACKEND_FLAG = '1';

const resolveLocalDevServerUrl = () => {
  const sourceUrl: string | undefined = NativeModules?.SourceCode?.scriptURL;
  if (sourceUrl) {
    try {
      const parsed = new URL(sourceUrl);
      if (parsed.hostname) {
        return `http://${parsed.hostname}:${FALLBACK_SERVER_PORT}`;
      }
    } catch {
      // Ignore parse errors and fallback below.
    }
  }

  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${FALLBACK_SERVER_PORT}`;
  }

  return `http://localhost:${FALLBACK_SERVER_PORT}`;
};

export const resolveConfiguredBackendUrl = (): string => {
  const configuredUrl =
    process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || process.env.EXPO_PUBLIC_MULTIPLAYER_URL?.trim();
  if (configuredUrl) return configuredUrl;

  // Default to the deployed backend so multiplayer works out of the box on devices/simulators.
  // Opt into host-derived local backend resolution only when explicitly requested.
  if (process.env.EXPO_PUBLIC_USE_LOCAL_BACKEND?.trim() === USE_LOCAL_BACKEND_FLAG) {
    return resolveLocalDevServerUrl();
  }

  return DEFAULT_BACKEND_SERVER_URL;
};
