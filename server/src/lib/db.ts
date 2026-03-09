import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env';

let poolSingleton: Pool | null = null;

export const getPgPool = () => {
  if (!poolSingleton) {
    poolSingleton = new Pool({
      connectionString: env.DATABASE_URL,
    });
  }

  return poolSingleton;
};

export const db = drizzle(getPgPool());
