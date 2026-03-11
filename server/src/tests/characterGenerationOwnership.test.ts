import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLatestVersionByCharacterId } from '../modules/character-generation/gallery';
import { CharacterGenerationService } from '../modules/character-generation/service/characterGenerationService';
import { paymentService } from '../payments/service';

test('buildLatestVersionByCharacterId picks the newest version per character', () => {
  const latest = buildLatestVersionByCharacterId([
    {
      id: 'version-1',
      customCharacterId: 'character-a',
      createdAt: new Date('2026-03-10T10:00:00.000Z'),
    },
    {
      id: 'version-3',
      customCharacterId: 'character-b',
      createdAt: new Date('2026-03-10T08:00:00.000Z'),
    },
    {
      id: 'version-2',
      customCharacterId: 'character-a',
      createdAt: new Date('2026-03-11T10:00:00.000Z'),
    },
  ]);

  assert.equal(latest.get('character-a')?.id, 'version-2');
  assert.equal(latest.get('character-b')?.id, 'version-3');
});

test('buildLatestVersionByCharacterId breaks timestamp ties by version id', () => {
  const latest = buildLatestVersionByCharacterId([
    {
      id: 'version-1',
      customCharacterId: 'character-a',
      createdAt: new Date('2026-03-11T10:00:00.000Z'),
    },
    {
      id: 'version-2',
      customCharacterId: 'character-a',
      createdAt: new Date('2026-03-11T10:00:00.000Z'),
    },
  ]);

  assert.equal(latest.get('character-a')?.id, 'version-2');
});

test('assertOwnedVersion rejects versions from another wallet', async (t) => {
  const service = new CharacterGenerationService();
  const originalRequireSession = paymentService.requireSession;

  (service as unknown as {
    repository: { getOwnedVersion: (playerId: string, versionId: string) => Promise<null> };
  }).repository = {
    getOwnedVersion: async () => null,
  };

  paymentService.requireSession = () =>
    ({
      playerId: 'player-1',
      walletAddress: 'wallet-1',
      accessToken: 'token',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }) as ReturnType<typeof paymentService.requireSession>;

  t.after(() => {
    paymentService.requireSession = originalRequireSession;
  });

  await assert.rejects(
    service.assertOwnedVersion('token', 'version-1'),
    /does not belong to this wallet/
  );
});

test('assertOwnedVersion rejects mismatched funded wallet sessions', async (t) => {
  const service = new CharacterGenerationService();
  const originalRequireSession = paymentService.requireSession;

  paymentService.requireSession = () =>
    ({
      playerId: 'player-1',
      walletAddress: 'wallet-1',
      accessToken: 'token',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }) as ReturnType<typeof paymentService.requireSession>;

  t.after(() => {
    paymentService.requireSession = originalRequireSession;
  });

  await assert.rejects(
    service.assertOwnedVersion('token', 'version-1', 'player-2'),
    /does not match the funded wallet/
  );
});
