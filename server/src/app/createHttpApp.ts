import cors from 'cors';
import express from 'express';
import { registerCharacterGenerationRoutes } from '../modules/character-generation/routes';
import { registerPaymentRoutes } from '../payments/routes';

export const createHttpApp = () => {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '20mb' }));
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
