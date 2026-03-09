import { z } from 'zod';
import { paymentService } from './service';

type AppLike = {
  get: (path: string, handler: RouteHandler) => void;
  post: (path: string, handler: RouteHandler) => void;
  delete: (path: string, handler: RouteHandler) => void;
};

type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  params: Record<string, string | undefined>;
};

type ResponseLike = {
  status: (code: number) => ResponseLike;
  json: (payload: unknown) => void;
};

type RouteHandler = (request: RequestLike, response: ResponseLike) => void | Promise<void>;

const verifyWalletSchema = z.object({
  nonce: z.string().min(8),
  signedMessage: z.string().min(8),
  signature: z.string().min(8),
});

const createWalletChallengeSchema = z.object({
  walletAddress: z.string().min(32),
});

const createPaymentIntentSchema = z.object({
  tokenId: z.string().min(1),
  entryFeeTierId: z.string().min(1),
  purpose: z.enum([
    'single_paid_contest',
    'multi_paid_private',
    'multi_paid_queue',
    'character_generation',
  ]),
  contestId: z.string().optional(),
});

const buildPaymentIntentTransactionSchema = z.object({
  walletAddress: z.string().min(32),
});

const confirmPaymentIntentSchema = z.object({
  transactionSignature: z.string().min(16),
  walletAddress: z.string().min(32),
});

const createContestEntrySchema = z.object({
  paymentIntentId: z.string().uuid(),
  nickname: z.string().max(32).optional(),
});

const submitRunSchema = z.object({
  distance: z.number().finite().min(0),
  finishedAt: z.string().min(8),
});

const createWithdrawalSchema = z.object({
  tokenId: z.string().min(1),
  amountBaseUnits: z.string().regex(/^\d+$/),
  destinationAddress: z.string().min(32),
});

const getBearerToken = (request: RequestLike) => {
  const headerValue = request.headers.authorization;
  return typeof headerValue === 'string' ? headerValue.replace(/^Bearer\s+/i, '') : undefined;
};

const handleError = (response: ResponseLike, error: unknown, code: string, status = 400) => {
  response.status(status).json({
    code,
    message: error instanceof Error ? error.message : code,
  });
};

const isUnauthorizedError = (error: unknown) =>
  error instanceof Error &&
  (error.message === 'Missing bearer token.' || error.message === 'Session expired.');

export const registerPaymentRoutes = (app: AppLike) => {
  app.post('/auth/wallet/challenge', async (request: RequestLike, response: ResponseLike) => {
    const parsed = createWalletChallengeSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ code: 'INVALID_REQUEST', message: 'Invalid wallet challenge payload.' });
      return;
    }

    response.json(await paymentService.issueWalletChallenge(parsed.data.walletAddress));
  });

  app.post('/auth/wallet/verify', async (request: RequestLike, response: ResponseLike) => {
    const parsed = verifyWalletSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ code: 'INVALID_REQUEST', message: 'Invalid wallet verify payload.' });
      return;
    }

    try {
      response.json(await paymentService.verifyWallet(parsed.data));
    } catch (error) {
      handleError(response, error, 'WALLET_VERIFY_FAILED');
    }
  });

  app.get('/tokens', (_request: RequestLike, response: ResponseLike) => {
    response.json({ tokens: paymentService.getSupportedTokens() });
  });

  app.get('/contests/active', (_request: RequestLike, response: ResponseLike) => {
    response.json({ contests: paymentService.getDailyContests() });
  });

  app.get('/contests/:contestId/leaderboard', (request: RequestLike, response: ResponseLike) => {
    const contestId = request.params.contestId || '';
    const contests = paymentService.getDailyContests();
    const contest = contests.find((c) => c.id === contestId);
    const tokens = paymentService.getSupportedTokens();
    const token = contest ? tokens.find((t) => t.id === contest.tokenId) : undefined;
    const poolBase = paymentService.getContestPool(contestId);
    const decimals = token?.decimals ?? 9;
    const divisor = 10 ** decimals;
    const poolNum = Number(poolBase) / divisor;
    const poolTotalDisplay =
      poolNum % 1 === 0 ? poolNum.toFixed(0) : poolNum.toFixed(4).replace(/\.?0+$/, '');
    response.json({
      leaderboard: paymentService.getLeaderboard(contestId),
      poolTotalBaseUnits: poolBase.toString(),
      poolTotalDisplay,
      tokenSymbol: token?.symbol ?? '',
      payoutBps: contest?.payoutBps ?? [],
    });
  });

  app.post('/payments/intents', async (request: RequestLike, response: ResponseLike) => {
    const parsed = createPaymentIntentSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ code: 'INVALID_REQUEST', message: 'Invalid payment intent payload.' });
      return;
    }

    try {
      const paymentIntent = await paymentService.createPaymentIntent(
        getBearerToken(request),
        parsed.data
      );
      response.status(201).json(paymentIntent);
    } catch (error) {
      handleError(
        response,
        error,
        'PAYMENT_INTENT_FAILED',
        error instanceof Error && error.message === 'Session expired.' ? 401 : 400
      );
    }
  });

  app.post(
    '/payments/intents/:paymentIntentId/transaction',
    async (request: RequestLike, response: ResponseLike) => {
      const parsed = buildPaymentIntentTransactionSchema.safeParse(request.body);
      if (!parsed.success) {
        response
          .status(400)
          .json({ code: 'INVALID_REQUEST', message: 'Invalid payment transaction payload.' });
        return;
      }

      try {
        response.json(
          await paymentService.buildPaymentIntentTransaction(
            getBearerToken(request),
            request.params.paymentIntentId || '',
            parsed.data
          )
        );
      } catch (error) {
        handleError(
          response,
          error,
          'PAYMENT_TRANSACTION_BUILD_FAILED',
          error instanceof Error && error.message === 'Session expired.' ? 401 : 400
        );
      }
    }
  );

  app.post(
    '/payments/intents/:paymentIntentId/confirm',
    async (request: RequestLike, response: ResponseLike) => {
      const parsed = confirmPaymentIntentSchema.safeParse(request.body);
      if (!parsed.success) {
        response
          .status(400)
          .json({ code: 'INVALID_REQUEST', message: 'Invalid payment confirmation payload.' });
        return;
      }

      try {
        response.json(
          await paymentService.confirmPaymentIntent(
            getBearerToken(request),
            request.params.paymentIntentId || '',
            parsed.data
          )
        );
      } catch (error) {
        handleError(
          response,
          error,
          'PAYMENT_CONFIRM_FAILED',
          error instanceof Error && error.message === 'Session expired.' ? 401 : 400
        );
      }
    }
  );

  app.post(
    '/payments/intents/:paymentIntentId/refund',
    async (request: RequestLike, response: ResponseLike) => {
      try {
        response.json(
          await paymentService.refundPaymentIntent(
            getBearerToken(request),
            request.params.paymentIntentId || ''
          )
        );
      } catch (error) {
        handleError(
          response,
          error,
          'PAYMENT_REFUND_FAILED',
          isUnauthorizedError(error) ? 401 : 400
        );
      }
    }
  );

  app.post('/contests/:contestId/entries', async (request: RequestLike, response: ResponseLike) => {
    const parsed = createContestEntrySchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ code: 'INVALID_REQUEST', message: 'Invalid contest entry payload.' });
      return;
    }

    try {
      const entry = await paymentService.createContestEntry(
        getBearerToken(request),
        request.params.contestId || '',
        parsed.data
      );
      response.status(201).json(entry);
    } catch (error) {
      handleError(
        response,
        error,
        'CONTEST_ENTRY_FAILED',
        error instanceof Error && error.message === 'Session expired.' ? 401 : 400
      );
    }
  });

  app.post('/runs/:runSessionId/submit', async (request: RequestLike, response: ResponseLike) => {
    const parsed = submitRunSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ code: 'INVALID_REQUEST', message: 'Invalid run submission payload.' });
      return;
    }

    try {
      response.json(
        await paymentService.submitRun(
          getBearerToken(request),
          request.params.runSessionId || '',
          parsed.data
        )
      );
    } catch (error) {
      handleError(
        response,
        error,
        'RUN_SUBMIT_FAILED',
        error instanceof Error && error.message === 'Session expired.' ? 401 : 400
      );
    }
  });

  app.get('/ledger/balance', (request: RequestLike, response: ResponseLike) => {
    try {
      response.json({ balances: paymentService.getLedgerBalance(getBearerToken(request)) });
    } catch (error) {
      handleError(
        response,
        error,
        isUnauthorizedError(error) ? 'UNAUTHORIZED' : 'INTERNAL_SERVER_ERROR',
        isUnauthorizedError(error) ? 401 : 500
      );
    }
  });

  app.get('/ledger/transactions', (request: RequestLike, response: ResponseLike) => {
    try {
      response.json({
        transactions: paymentService.getLedgerTransactions(getBearerToken(request)),
      });
    } catch (error) {
      handleError(
        response,
        error,
        isUnauthorizedError(error) ? 'UNAUTHORIZED' : 'INTERNAL_SERVER_ERROR',
        isUnauthorizedError(error) ? 401 : 500
      );
    }
  });

  app.post('/withdrawals', async (request: RequestLike, response: ResponseLike) => {
    const parsed = createWithdrawalSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ code: 'INVALID_REQUEST', message: 'Invalid withdrawal payload.' });
      return;
    }

    try {
      response
        .status(201)
        .json(await paymentService.createWithdrawal(getBearerToken(request), parsed.data));
    } catch (error) {
      const status = error instanceof Error && error.message === 'Session expired.' ? 401 : 400;
      handleError(response, error, 'WITHDRAWAL_FAILED', status);
    }
  });

  app.post('/wagers/private', (request: RequestLike, response: ResponseLike) => {
    try {
      paymentService.requireSession(getBearerToken(request));
      response.status(202).json({
        ok: true,
        message: 'Paid private wager creation is delegated to realtime room flow.',
      });
    } catch (error) {
      handleError(response, error, 'UNAUTHORIZED', 401);
    }
  });

  app.post('/wagers/:wagerId/join', (request: RequestLike, response: ResponseLike) => {
    try {
      paymentService.requireSession(getBearerToken(request));
      response.status(202).json({
        ok: true,
        message: 'Paid private wager joining is delegated to realtime room flow.',
      });
    } catch (error) {
      handleError(response, error, 'UNAUTHORIZED', 401);
    }
  });

  app.post('/matchmaking/queue', (request: RequestLike, response: ResponseLike) => {
    try {
      paymentService.requireSession(getBearerToken(request));
      response
        .status(202)
        .json({ ok: true, message: 'Paid matchmaking queue is handled by realtime flow.' });
    } catch (error) {
      handleError(response, error, 'UNAUTHORIZED', 401);
    }
  });

  app.delete('/matchmaking/queue/:queueEntryId', (request: RequestLike, response: ResponseLike) => {
    try {
      paymentService.requireSession(getBearerToken(request));
      response
        .status(202)
        .json({ ok: true, message: 'Paid matchmaking dequeue is handled by realtime flow.' });
    } catch (error) {
      handleError(response, error, 'UNAUTHORIZED', 401);
    }
  });
};
