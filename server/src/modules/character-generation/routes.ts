import { characterGenerationService } from './index';
import {
  createCharacterGenerationJobSchema,
  registerExpoPushTokenSchema,
  renameCustomCharacterSchema,
} from './contracts';

type AppLike = {
  get: (path: string, handler: RouteHandler) => void;
  post: (path: string, handler: RouteHandler) => void;
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

export const registerCharacterGenerationRoutes = (app: AppLike) => {
  app.get('/character-generation/config', (_request: RequestLike, response: ResponseLike) => {
    response.json(characterGenerationService.getConfig());
  });

  app.get('/character-generation/jobs', async (request: RequestLike, response: ResponseLike) => {
    try {
      response.json({ jobs: await characterGenerationService.listJobs(getBearerToken(request)) });
    } catch (error) {
      handleError(
        response,
        error,
        'CHARACTER_GENERATION_LIST_FAILED',
        isUnauthorizedError(error) ? 401 : 400
      );
    }
  });

  app.get(
    '/character-generation/jobs/:jobId',
    async (request: RequestLike, response: ResponseLike) => {
      try {
        response.json({
          job: await characterGenerationService.getJob(
            getBearerToken(request),
            request.params.jobId || ''
          ),
        });
      } catch (error) {
        handleError(
          response,
          error,
          'CHARACTER_GENERATION_FETCH_FAILED',
          isUnauthorizedError(error) ? 401 : 400
        );
      }
    }
  );

  app.post('/character-generation/jobs', async (request: RequestLike, response: ResponseLike) => {
    const parsed = createCharacterGenerationJobSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        code: 'INVALID_REQUEST',
        message: parsed.error.issues[0]?.message ?? 'Invalid generation payload.',
      });
      return;
    }

    try {
      response.status(201).json({
        job: await characterGenerationService.createJob(getBearerToken(request), parsed.data),
      });
    } catch (error) {
      handleError(
        response,
        error,
        'CHARACTER_GENERATION_CREATE_FAILED',
        isUnauthorizedError(error) ? 401 : 400
      );
    }
  });

  app.get('/custom-characters', async (request: RequestLike, response: ResponseLike) => {
    try {
      response.json({
        characters: await characterGenerationService.listCharacters(getBearerToken(request)),
      });
    } catch (error) {
      handleError(
        response,
        error,
        'CUSTOM_CHARACTER_LIST_FAILED',
        isUnauthorizedError(error) ? 401 : 400
      );
    }
  });

  app.post(
    '/custom-characters/:characterId/rename',
    async (request: RequestLike, response: ResponseLike) => {
      const parsed = renameCustomCharacterSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          code: 'INVALID_REQUEST',
          message: 'Invalid rename payload.',
        });
        return;
      }

      try {
        response.json(
          await characterGenerationService.renameCharacter(
            getBearerToken(request),
            request.params.characterId || '',
            parsed.data.displayName
          )
        );
      } catch (error) {
        handleError(
          response,
          error,
          'CUSTOM_CHARACTER_RENAME_FAILED',
          isUnauthorizedError(error) ? 401 : 400
        );
      }
    }
  );

  app.post(
    '/custom-characters/:characterId/activate',
    async (request: RequestLike, response: ResponseLike) => {
      try {
        response.json(
          await characterGenerationService.activateCharacter(
            getBearerToken(request),
            request.params.characterId || ''
          )
        );
      } catch (error) {
        handleError(
          response,
          error,
          'CUSTOM_CHARACTER_ACTIVATE_FAILED',
          isUnauthorizedError(error) ? 401 : 400
        );
      }
    }
  );

  app.get(
    '/custom-characters/versions/:versionId',
    async (request: RequestLike, response: ResponseLike) => {
      try {
        response.json({
          version: await characterGenerationService.getPublicVersion(
            request.params.versionId || ''
          ),
        });
      } catch (error) {
        handleError(response, error, 'CUSTOM_CHARACTER_VERSION_FETCH_FAILED');
      }
    }
  );

  app.post('/notifications/expo-token', async (request: RequestLike, response: ResponseLike) => {
    const parsed = registerExpoPushTokenSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        code: 'INVALID_REQUEST',
        message: 'Invalid notification token payload.',
      });
      return;
    }

    try {
      await characterGenerationService.registerPushToken(getBearerToken(request), parsed.data);
      response.status(204).json({});
    } catch (error) {
      handleError(
        response,
        error,
        'EXPO_PUSH_TOKEN_REGISTER_FAILED',
        isUnauthorizedError(error) ? 401 : 400
      );
    }
  });
};
