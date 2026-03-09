import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../../lib/db';
import {
  characterGenerationJobs,
  customCharacters,
  customCharacterVersions,
  playerActiveCharacters,
  playerPushTokens,
} from '../../../db/schema';

type CreateJobInput = {
  playerId: string;
  sourceType: 'prompt' | 'image';
  displayName?: string;
  prompt?: string;
  referenceImageDataUrl?: string;
  paymentIntentId?: string;
};

type CompleteJobInput = {
  jobId: string;
  characterId: string;
  versionId: string;
};

type CreateCharacterInput = {
  playerId: string;
  displayName: string;
  generationJobId: string;
  sheetObjectKey: string;
  thumbnailObjectKey?: string | null;
  width: number;
  height: number;
};

export class CharacterGenerationRepository {
  async countInFlightJobs(playerId: string) {
    const rows = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(characterGenerationJobs)
      .where(
        and(
          eq(characterGenerationJobs.playerId, playerId),
          inArray(characterGenerationJobs.status, ['queued', 'running'])
        )
      );

    return rows[0]?.value ?? 0;
  }

  async createJob(input: CreateJobInput) {
    const [job] = await db
      .insert(characterGenerationJobs)
      .values({
        playerId: input.playerId,
        sourceType: input.sourceType,
        displayName: input.displayName,
        prompt: input.prompt,
        referenceImageDataUrl: input.referenceImageDataUrl,
        paymentIntentId: input.paymentIntentId,
      })
      .returning();

    return job;
  }

  async getJobById(jobId: string) {
    const [job] = await db
      .select()
      .from(characterGenerationJobs)
      .where(eq(characterGenerationJobs.id, jobId))
      .limit(1);

    return job ?? null;
  }

  async listJobs(playerId: string) {
    return db
      .select()
      .from(characterGenerationJobs)
      .where(eq(characterGenerationJobs.playerId, playerId))
      .orderBy(desc(characterGenerationJobs.createdAt));
  }

  async markJobRunning(jobId: string) {
    await db
      .update(characterGenerationJobs)
      .set({
        status: 'running',
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(characterGenerationJobs.id, jobId));
  }

  async markJobFailed(jobId: string, failureMessage: string, refunded = false) {
    await db
      .update(characterGenerationJobs)
      .set({
        status: refunded ? 'refunded' : 'failed',
        failureMessage,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(characterGenerationJobs.id, jobId));
  }

  async createCharacterVersion(input: CreateCharacterInput) {
    const [character] = await db
      .insert(customCharacters)
      .values({
        playerId: input.playerId,
        displayName: input.displayName,
      })
      .returning();

    const [version] = await db
      .insert(customCharacterVersions)
      .values({
        customCharacterId: character.id,
        generationJobId: input.generationJobId,
        sheetObjectKey: input.sheetObjectKey,
        thumbnailObjectKey: input.thumbnailObjectKey ?? null,
        width: input.width,
        height: input.height,
      })
      .returning();

    return { character, version };
  }

  async completeJob(input: CompleteJobInput) {
    await db
      .update(characterGenerationJobs)
      .set({
        status: 'succeeded',
        resultCharacterId: input.characterId,
        resultVersionId: input.versionId,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(characterGenerationJobs.id, input.jobId));
  }

  async listCharacters(playerId: string) {
    const characters = await db
      .select()
      .from(customCharacters)
      .where(and(eq(customCharacters.playerId, playerId), isNull(customCharacters.archivedAt)))
      .orderBy(desc(customCharacters.updatedAt));

    if (characters.length === 0) {
      return { characters, versions: [], activeVersionId: null as string | null };
    }

    const versions = await db
      .select()
      .from(customCharacterVersions)
      .where(
        inArray(
          customCharacterVersions.customCharacterId,
          characters.map((character) => character.id)
        )
      );

    const [active] = await db
      .select()
      .from(playerActiveCharacters)
      .where(eq(playerActiveCharacters.playerId, playerId))
      .limit(1);

    return {
      characters,
      versions,
      activeVersionId: active?.customCharacterVersionId ?? null,
    };
  }

  async renameCharacter(playerId: string, characterId: string, displayName: string) {
    const [character] = await db
      .update(customCharacters)
      .set({
        displayName,
        updatedAt: new Date(),
      })
      .where(and(eq(customCharacters.playerId, playerId), eq(customCharacters.id, characterId)))
      .returning();

    return character ?? null;
  }

  async activateCharacter(playerId: string, characterId: string) {
    const [version] = await db
      .select()
      .from(customCharacterVersions)
      .where(eq(customCharacterVersions.customCharacterId, characterId))
      .orderBy(desc(customCharacterVersions.createdAt))
      .limit(1);

    if (!version) {
      return null;
    }

    await db
      .insert(playerActiveCharacters)
      .values({
        playerId,
        characterId: 'custom',
        customCharacterVersionId: version.id,
      })
      .onConflictDoUpdate({
        target: playerActiveCharacters.playerId,
        set: {
          characterId: 'custom',
          customCharacterVersionId: version.id,
          updatedAt: new Date(),
        },
      });

    return version;
  }

  async getPublicVersion(versionId: string) {
    const [version] = await db
      .select()
      .from(customCharacterVersions)
      .where(eq(customCharacterVersions.id, versionId))
      .limit(1);

    if (!version) return null;

    const [character] = await db
      .select()
      .from(customCharacters)
      .where(eq(customCharacters.id, version.customCharacterId))
      .limit(1);

    return character ? { version, character } : null;
  }

  async registerPushToken(playerId: string, expoPushToken: string, platform: 'ios' | 'android') {
    await db
      .insert(playerPushTokens)
      .values({
        playerId,
        expoPushToken,
        platform,
      })
      .onConflictDoUpdate({
        target: playerPushTokens.expoPushToken,
        set: {
          playerId,
          platform,
          lastSeenAt: new Date(),
        },
      });
  }

  async getPushTokens(playerId: string) {
    return db.select().from(playerPushTokens).where(eq(playerPushTokens.playerId, playerId));
  }

  async getActiveVersionId(playerId: string) {
    const [active] = await db
      .select({ customCharacterVersionId: playerActiveCharacters.customCharacterVersionId })
      .from(playerActiveCharacters)
      .where(eq(playerActiveCharacters.playerId, playerId))
      .limit(1);

    return active?.customCharacterVersionId ?? null;
  }
}
