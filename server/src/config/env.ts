import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4100),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_STATE_EVENTS: z
    .union([z.literal('0'), z.literal('1')])
    .optional()
    .transform((value: '0' | '1' | undefined) => value === '1'),
  ENABLE_RUNTIME_PERSISTENCE: z
    .union([z.literal('0'), z.literal('1')])
    .optional()
    .transform((value: '0' | '1' | undefined) => value === '1'),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgres://postgres:postgres@localhost:5432/runner'),
  SOLANA_RPC_HTTP: z.string().url().optional(),
  SOLANA_RPC_WS: z.string().url().optional(),
  SOCKET_IO_CORS_ORIGINS: z.string().optional(),
  VAULT_PUBLIC_KEY: z.string().min(32).optional(),
  VAULT_SECRET_KEY_JSON: z.string().min(10).optional(),
  SERVER_PUBLIC_BASE_URL: z.string().url().optional(),
  CHARACTER_GENERATION_ENABLED: z
    .union([z.literal('0'), z.literal('1')])
    .optional()
    .transform((value: '0' | '1' | undefined) => value === '1'),
  CHARACTER_GENERATION_TOKEN_ID: z.string().min(1).optional(),
  CHARACTER_GENERATION_ENTRY_FEE_TIER_ID: z.string().min(1).optional(),
  CHARACTER_GENERATION_MAX_CONCURRENT_JOBS: z.coerce.number().int().positive().default(5),
  GEMINI_API_KEY: z.string().min(1).optional(),
  CHARACTER_BUCKET_NAME: z.string().min(1).optional(),
  CHARACTER_BUCKET_ENDPOINT: z.string().url().optional(),
  CHARACTER_BUCKET_REGION: z.string().min(1).default('auto'),
  CHARACTER_BUCKET_ACCESS_KEY: z.string().min(1).optional(),
  CHARACTER_BUCKET_SECRET_KEY: z.string().min(1).optional(),
  CHARACTER_BUCKET_PUBLIC_BASE_URL: z.string().url().optional(),
  CHARACTER_BUCKET_SIGNED_URLS: z
    .union([z.literal('0'), z.literal('1')])
    .optional()
    .transform((value: '0' | '1' | undefined) => value === '1'),
  CHARACTER_LOCAL_ASSET_DIR: z.string().min(1).optional(),
  EXPO_PUSH_ACCESS_TOKEN: z.string().min(1).optional(),
});

const parsedEnv = envSchema.parse(process.env);

export const env = {
  PORT: parsedEnv.PORT,
  LOG_LEVEL: parsedEnv.LOG_LEVEL,
  LOG_STATE_EVENTS: parsedEnv.LOG_STATE_EVENTS ?? false,
  ENABLE_RUNTIME_PERSISTENCE: parsedEnv.ENABLE_RUNTIME_PERSISTENCE ?? false,
  DATABASE_URL: parsedEnv.DATABASE_URL,
  SOLANA_RPC_HTTP: parsedEnv.SOLANA_RPC_HTTP,
  SOLANA_RPC_WS: parsedEnv.SOLANA_RPC_WS,
  SOCKET_IO_CORS_ORIGINS: parsedEnv.SOCKET_IO_CORS_ORIGINS,
  VAULT_PUBLIC_KEY: parsedEnv.VAULT_PUBLIC_KEY,
  VAULT_SECRET_KEY_JSON: parsedEnv.VAULT_SECRET_KEY_JSON,
  SERVER_PUBLIC_BASE_URL: parsedEnv.SERVER_PUBLIC_BASE_URL,
  CHARACTER_GENERATION_ENABLED: parsedEnv.CHARACTER_GENERATION_ENABLED ?? false,
  CHARACTER_GENERATION_TOKEN_ID: parsedEnv.CHARACTER_GENERATION_TOKEN_ID,
  CHARACTER_GENERATION_ENTRY_FEE_TIER_ID: parsedEnv.CHARACTER_GENERATION_ENTRY_FEE_TIER_ID,
  CHARACTER_GENERATION_MAX_CONCURRENT_JOBS: parsedEnv.CHARACTER_GENERATION_MAX_CONCURRENT_JOBS,
  GEMINI_API_KEY: parsedEnv.GEMINI_API_KEY,
  CHARACTER_BUCKET_NAME: parsedEnv.CHARACTER_BUCKET_NAME,
  CHARACTER_BUCKET_ENDPOINT: parsedEnv.CHARACTER_BUCKET_ENDPOINT,
  CHARACTER_BUCKET_REGION: parsedEnv.CHARACTER_BUCKET_REGION,
  CHARACTER_BUCKET_ACCESS_KEY: parsedEnv.CHARACTER_BUCKET_ACCESS_KEY,
  CHARACTER_BUCKET_SECRET_KEY: parsedEnv.CHARACTER_BUCKET_SECRET_KEY,
  CHARACTER_BUCKET_PUBLIC_BASE_URL: parsedEnv.CHARACTER_BUCKET_PUBLIC_BASE_URL,
  CHARACTER_BUCKET_SIGNED_URLS: parsedEnv.CHARACTER_BUCKET_SIGNED_URLS ?? false,
  CHARACTER_LOCAL_ASSET_DIR: parsedEnv.CHARACTER_LOCAL_ASSET_DIR,
  EXPO_PUSH_ACCESS_TOKEN: parsedEnv.EXPO_PUSH_ACCESS_TOKEN,
} as const;

export const hasCustodialSignerEnv =
  Boolean(env.SOLANA_RPC_HTTP) &&
  Boolean(env.SOLANA_RPC_WS) &&
  Boolean(env.VAULT_PUBLIC_KEY) &&
  Boolean(env.VAULT_SECRET_KEY_JSON);
