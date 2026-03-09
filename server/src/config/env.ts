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
} as const;

export const hasCustodialSignerEnv =
  Boolean(env.SOLANA_RPC_HTTP) &&
  Boolean(env.SOLANA_RPC_WS) &&
  Boolean(env.VAULT_PUBLIC_KEY) &&
  Boolean(env.VAULT_SECRET_KEY_JSON);
