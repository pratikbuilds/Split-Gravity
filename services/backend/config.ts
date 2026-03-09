const DEFAULT_BACKEND_SERVER_URL = 'https://split-gravity-production.up.railway.app';

/** Backend URL for API and multiplayer. Override with EXPO_PUBLIC_BACKEND_URL for local testing. */
export const resolveConfiguredBackendUrl = (): string => {
  const configuredUrl =
    process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || process.env.EXPO_PUBLIC_MULTIPLAYER_URL?.trim();
  return configuredUrl || DEFAULT_BACKEND_SERVER_URL;
};
