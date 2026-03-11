import { randomUUID } from 'node:crypto';
import { env } from '../../../config/env';
import { SUPPORTED_TOKENS } from '../../../payments/config';
import { paymentService } from '../../../payments/service';
import type {
  ActivateCustomCharacterResponse,
  CharacterAssetDescriptor,
  GeneratedSpriteAnimationDescriptor,
  CharacterGenerationConfigResponse,
  CharacterGenerationJobSummary,
  CreateCharacterGenerationJobRequest,
  CustomCharacterSummary,
  CustomCharacterVersionSummary,
} from '../../../shared/character-generation-contracts';
import { ExpoPushNotifier } from '../notifications/expoPushNotifier';
import { GeminiSpritePipeline } from '../pipeline/geminiSpritePipeline';
import { CharacterGenerationRepository } from '../repositories/characterGenerationRepository';
import { CharacterGenerationQueue } from '../jobs/characterGenerationQueue';
import { getCharacterAssetStorage } from '../storage';
import { buildLatestVersionByCharacterId } from '../gallery';
import {
  buildAnimationObjectKey,
  buildAnimationObjectKeyFromSheet,
  buildSheetObjectKey,
  buildThumbnailObjectKey,
} from '../storage/objectKeys';

const DEFAULT_JOB_NAME = 'Runner';

const resolveGenerationPricing = () => {
  const tokenId = env.CHARACTER_GENERATION_TOKEN_ID ?? null;
  const tierId = env.CHARACTER_GENERATION_ENTRY_FEE_TIER_ID ?? null;
  if (!tokenId || !tierId) {
    return {
      requiresPayment: false,
      tokenId: null,
      entryFeeTierId: null,
      amountBaseUnits: '0',
      amountDisplay: 'Free',
      currencySymbol: null,
    };
  }

  const token = SUPPORTED_TOKENS.find((entry) => entry.id === tokenId);
  const tier = token?.entryFeeTiers.find((entry) => entry.id === tierId);
  if (!token || !tier) {
    throw new Error('Character generation token/tier config is invalid.');
  }

  return {
    requiresPayment: BigInt(tier.amountBaseUnits) > 0n,
    tokenId: token.id,
    entryFeeTierId: tier.id,
    amountBaseUnits: tier.amountBaseUnits,
    amountDisplay: `${tier.amount} ${tier.currencySymbol}`,
    currencySymbol: tier.currencySymbol,
  };
};

export class CharacterGenerationService {
  private readonly repository = new CharacterGenerationRepository();
  private readonly queue = new CharacterGenerationQueue();
  private readonly notifier = new ExpoPushNotifier();
  private workerStarted = false;
  private pipeline: GeminiSpritePipeline | null = null;

  private getPipeline() {
    if (!this.pipeline) {
      this.pipeline = new GeminiSpritePipeline();
    }

    return this.pipeline;
  }

  async startWorker() {
    if (this.workerStarted || !env.CHARACTER_GENERATION_ENABLED) return;
    await this.queue.start(async (jobId) => {
      await this.processJob(jobId);
    });
    this.workerStarted = true;
  }

  getConfig(): CharacterGenerationConfigResponse {
    return {
      enabled: env.CHARACTER_GENERATION_ENABLED,
      workerRunning: this.workerStarted,
      generationSize: '2K',
      pricing: resolveGenerationPricing(),
      maxConcurrentJobs: env.CHARACTER_GENERATION_MAX_CONCURRENT_JOBS,
      supportedInputs: ['prompt', 'image'],
    };
  }

  private async toAssetDescriptor(
    sheetObjectKey: string,
    thumbnailObjectKey: string | null,
    width: number,
    height: number
  ): Promise<CharacterAssetDescriptor> {
    const animation = await this.readAnimationDescriptor(sheetObjectKey);
    return {
      sheetUrl: await getCharacterAssetStorage().getObjectUrl(sheetObjectKey),
      thumbnailUrl: thumbnailObjectKey
        ? await getCharacterAssetStorage().getObjectUrl(thumbnailObjectKey)
        : null,
      width,
      height,
      gridColumns: 6,
      gridRows: 3,
      animation,
    };
  }

  private async readAnimationDescriptor(
    sheetObjectKey: string
  ): Promise<GeneratedSpriteAnimationDescriptor | null> {
    const storage = getCharacterAssetStorage();
    try {
      const metadataBuffer = await storage.getObject(
        buildAnimationObjectKeyFromSheet(sheetObjectKey)
      );
      if (!metadataBuffer) return null;
      const parsed = JSON.parse(
        metadataBuffer.toString('utf8')
      ) as GeneratedSpriteAnimationDescriptor;
      if (parsed?.version !== 1) return null;
      return parsed;
    } catch (error) {
      console.warn('Loading sprite animation metadata failed:', error);
      return null;
    }
  }

  private async toVersionSummary(input: {
    characterId: string;
    versionId: string;
    displayName: string;
    sheetObjectKey: string;
    thumbnailObjectKey: string | null;
    width: number;
    height: number;
    createdAt: Date;
    isActive: boolean;
  }): Promise<CustomCharacterVersionSummary> {
    return {
      characterId: input.characterId,
      versionId: input.versionId,
      displayName: input.displayName,
      asset: await this.toAssetDescriptor(
        input.sheetObjectKey,
        input.thumbnailObjectKey,
        input.width,
        input.height
      ),
      createdAt: input.createdAt.toISOString(),
      isActive: input.isActive,
    };
  }

  private async toJobSummary(
    job: Awaited<ReturnType<CharacterGenerationRepository['getJobById']>>
  ): Promise<CharacterGenerationJobSummary | null> {
    if (!job) return null;

    let result: CustomCharacterVersionSummary | null = null;
    if (job.resultVersionId) {
      const activeVersionId = await this.repository.getActiveVersionId(job.playerId);
      const versionResult = await this.repository.getPublicVersion(job.resultVersionId);
      if (versionResult) {
        result = await this.toVersionSummary({
          characterId: versionResult.character.id,
          versionId: versionResult.version.id,
          displayName: versionResult.character.displayName,
          sheetObjectKey: versionResult.version.sheetObjectKey,
          thumbnailObjectKey: versionResult.version.thumbnailObjectKey,
          width: versionResult.version.width,
          height: versionResult.version.height,
          createdAt: versionResult.version.createdAt,
          isActive: versionResult.version.id === activeVersionId,
        });
      }
    }

    return {
      jobId: job.id,
      status: job.status,
      sourceType: job.sourceType,
      displayName: job.displayName,
      prompt: job.prompt,
      paymentIntentId: job.paymentIntentId,
      failureMessage: job.failureMessage,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      result,
    };
  }

  async listJobs(accessToken: string | undefined) {
    const session = paymentService.requireSession(accessToken);
    const jobs = await this.repository.listJobs(session.playerId);
    const summaries = await Promise.all(jobs.map((job) => this.toJobSummary(job)));
    return summaries.filter((value): value is CharacterGenerationJobSummary => value != null);
  }

  async getJob(accessToken: string | undefined, jobId: string) {
    const session = paymentService.requireSession(accessToken);
    const job = await this.repository.getJobById(jobId);
    if (!job || job.playerId !== session.playerId) {
      throw new Error('Generation job not found.');
    }

    const summary = await this.toJobSummary(job);
    if (!summary) {
      throw new Error('Generation job not found.');
    }

    return summary;
  }

  async listCharacters(accessToken: string | undefined) {
    const session = paymentService.requireSession(accessToken);
    const { characters, versions, activeVersionId } = await this.repository.listCharacters(
      session.playerId
    );

    const versionByCharacterId = buildLatestVersionByCharacterId(versions);

    const result = await Promise.all(
      characters.map(async (character): Promise<CustomCharacterSummary | null> => {
        const version = versionByCharacterId.get(character.id);
        if (!version) return null;

        return {
          characterId: character.id,
          displayName: character.displayName,
          activeVersionId: version.id,
          asset: await this.toAssetDescriptor(
            version.sheetObjectKey,
            version.thumbnailObjectKey,
            version.width,
            version.height
          ),
          createdAt: character.createdAt.toISOString(),
          updatedAt: character.updatedAt.toISOString(),
          isActive: version.id === activeVersionId,
        };
      })
    );

    return result.filter((value): value is CustomCharacterSummary => value != null);
  }

  async assertOwnedVersion(
    accessToken: string | undefined,
    versionId: string,
    expectedPlayerId?: string
  ) {
    const session = paymentService.requireSession(accessToken);
    if (expectedPlayerId && session.playerId !== expectedPlayerId) {
      throw new Error('Custom runner session does not match the funded wallet.');
    }

    const ownedVersion = await this.repository.getOwnedVersion(session.playerId, versionId);
    if (!ownedVersion) {
      throw new Error('Custom runner does not belong to this wallet.');
    }

    return ownedVersion;
  }

  async registerPushToken(
    accessToken: string | undefined,
    payload: { expoPushToken: string; platform: 'ios' | 'android' }
  ) {
    const session = paymentService.requireSession(accessToken);
    await this.repository.registerPushToken(
      session.playerId,
      payload.expoPushToken,
      payload.platform
    );
  }

  async createJob(
    accessToken: string | undefined,
    payload: CreateCharacterGenerationJobRequest & { paymentIntentId?: string }
  ) {
    if (!env.CHARACTER_GENERATION_ENABLED) {
      throw new Error('Character generation is disabled.');
    }

    const session = paymentService.requireSession(accessToken);
    const config = this.getConfig();
    const inFlight = await this.repository.countInFlightJobs(session.playerId);
    if (inFlight >= config.maxConcurrentJobs) {
      throw new Error('You already have the maximum number of active generation jobs.');
    }

    if (config.pricing.requiresPayment) {
      if (!payload.paymentIntentId) {
        throw new Error('A confirmed payment intent is required for generation.');
      }

      await paymentService.assertPaymentIntentForPurpose(
        accessToken,
        payload.paymentIntentId,
        'character_generation'
      );
    }

    const job = await this.repository.createJob({
      playerId: session.playerId,
      sourceType: payload.referenceImageDataUrl ? 'image' : 'prompt',
      displayName: payload.displayName,
      prompt: payload.prompt,
      referenceImageDataUrl: payload.referenceImageDataUrl,
      paymentIntentId: payload.paymentIntentId,
    });

    await this.queue.enqueue(job.id);
    const summary = await this.toJobSummary(job);
    if (!summary) {
      throw new Error('Unable to create generation job.');
    }
    return summary;
  }

  async renameCharacter(accessToken: string | undefined, characterId: string, displayName: string) {
    const session = paymentService.requireSession(accessToken);
    const character = await this.repository.renameCharacter(
      session.playerId,
      characterId,
      displayName
    );
    if (!character) {
      throw new Error('Character not found.');
    }
    return character;
  }

  async activateCharacter(
    accessToken: string | undefined,
    characterId: string
  ): Promise<ActivateCustomCharacterResponse> {
    const session = paymentService.requireSession(accessToken);
    const version = await this.repository.activateCharacter(session.playerId, characterId);
    if (!version) {
      throw new Error('Character not found.');
    }

    return {
      characterId,
      versionId: version.id,
      activatedAt: new Date().toISOString(),
    };
  }

  async getPublicVersion(versionId: string) {
    const result = await this.repository.getPublicVersion(versionId);
    if (!result) {
      throw new Error('Character version not found.');
    }

    return this.toVersionSummary({
      characterId: result.character.id,
      versionId: result.version.id,
      displayName: result.character.displayName,
      sheetObjectKey: result.version.sheetObjectKey,
      thumbnailObjectKey: result.version.thumbnailObjectKey,
      width: result.version.width,
      height: result.version.height,
      createdAt: result.version.createdAt,
      isActive: false,
    });
  }

  async processJob(jobId: string) {
    const job = await this.repository.getJobById(jobId);
    if (!job) return;

    await this.repository.markJobRunning(jobId);

    try {
      const generated = await this.getPipeline().generateSpriteSheet({
        prompt: job.prompt,
        referenceImageDataUrl: job.referenceImageDataUrl,
        sourceType: job.sourceType,
      });

      const existingCharacters = await this.repository.listCharacters(job.playerId);
      const displayName =
        job.displayName?.trim() ||
        `${DEFAULT_JOB_NAME} ${existingCharacters.characters.length + 1}`;

      const pendingCharacterId = randomUUID();
      const pendingVersionId = randomUUID();
      const sheetObjectKey = buildSheetObjectKey(
        job.playerId,
        pendingCharacterId,
        pendingVersionId
      );
      const animationObjectKey = buildAnimationObjectKey(
        job.playerId,
        pendingCharacterId,
        pendingVersionId
      );
      const thumbnailObjectKey = buildThumbnailObjectKey(
        job.playerId,
        pendingCharacterId,
        pendingVersionId
      );

      await getCharacterAssetStorage().putObject({
        objectKey: sheetObjectKey,
        body: generated.sheetBuffer,
        contentType: 'image/png',
      });
      await getCharacterAssetStorage().putObject({
        objectKey: thumbnailObjectKey,
        body: generated.thumbnailBuffer,
        contentType: 'image/png',
      });
      await getCharacterAssetStorage().putObject({
        objectKey: animationObjectKey,
        body: Buffer.from(JSON.stringify(generated.animation)),
        contentType: 'application/json',
      });

      const { character, version } = await this.repository.createCharacterVersion({
        playerId: job.playerId,
        displayName,
        generationJobId: job.id,
        sheetObjectKey,
        thumbnailObjectKey,
        width: generated.width,
        height: generated.height,
      });

      await this.repository.completeJob({
        jobId: job.id,
        characterId: character.id,
        versionId: version.id,
      });

      const pushTokens = await this.repository.getPushTokens(job.playerId);
      await this.notifier.send(
        pushTokens.map((token) => ({
          to: token.expoPushToken,
          title: 'Character Ready',
          body: `${displayName} is ready to use.`,
          data: {
            screen: 'character_generate',
            characterId: character.id,
            versionId: version.id,
          },
        }))
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Character generation failed unexpectedly.';
      let refunded = false;
      if (job.paymentIntentId) {
        try {
          await paymentService.refundRealtimePaymentIntent(
            job.playerId,
            job.paymentIntentId,
            'Character generation failed'
          );
          refunded = true;
        } catch {
          refunded = false;
        }
      }

      await this.repository.markJobFailed(job.id, message, refunded);

      const pushTokens = await this.repository.getPushTokens(job.playerId);
      await this.notifier.send(
        pushTokens.map((token) => ({
          to: token.expoPushToken,
          title: refunded ? 'Generation Refunded' : 'Generation Failed',
          body: message,
          data: {
            screen: 'character_generate',
            jobId: job.id,
          },
        }))
      );
    }
  }
}
