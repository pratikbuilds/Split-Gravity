import { NativeModules, Platform } from 'react-native';

const FALLBACK_SERVER_PORT = 4100;
const DEFAULT_BACKEND_SERVER_URL = 'https://gravity-jump-production.up.railway.app';

const resolveDefaultServerUrl = () => {
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
  // In dev (Metro), use local backend when reachable; otherwise use production so "Create room" works.
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    return resolveDefaultServerUrl() || DEFAULT_BACKEND_SERVER_URL;
  }
  return DEFAULT_BACKEND_SERVER_URL;
};
