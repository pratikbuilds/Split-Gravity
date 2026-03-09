import cors from 'cors';
import express from 'express';
import { registerPaymentRoutes } from '../payments/routes';

export const createHttpApp = () => {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.get(
    '/health',
    (_req: unknown, res: { json: (payload: { ok: boolean }) => void }) => {
      res.json({ ok: true });
    }
  );
  registerPaymentRoutes(app);
  return app;
};
