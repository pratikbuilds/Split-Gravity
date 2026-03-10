import path from 'node:path';
import cors from 'cors';
import express from 'express';
import { env } from '../config/env';
import { registerCharacterGenerationRoutes } from '../modules/character-generation/routes';
import { registerPaymentRoutes } from '../payments/routes';

export const createHttpApp = () => {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '20mb' }));
  app.use(
    '/character-assets',
    express.static(
      env.CHARACTER_LOCAL_ASSET_DIR ?? path.join(process.cwd(), '.data', 'character-assets')
    )
  );
  app.get(
    '/health',
    (_req: unknown, res: { json: (payload: { ok: boolean }) => void }) => {
      res.json({ ok: true });
    }
  );
  registerPaymentRoutes(app);
  registerCharacterGenerationRoutes(app);
  return app;
};
