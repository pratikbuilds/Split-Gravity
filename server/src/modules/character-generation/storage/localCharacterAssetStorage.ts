import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../../config/env';
import type { CharacterAssetStorage, CharacterAssetUpload } from './characterAssetStorage';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const normalizeObjectKey = (objectKey: string) => {
  const segments = objectKey.split('/').filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === '..')) {
    throw new Error('Invalid character asset object key.');
  }
  return segments;
};

const encodeObjectKey = (segments: string[]) => segments.map(encodeURIComponent).join('/');

export class LocalCharacterAssetStorage implements CharacterAssetStorage {
  private readonly assetDir: string;
  private readonly publicBaseUrl: string;

  constructor() {
    this.assetDir =
      env.CHARACTER_LOCAL_ASSET_DIR ??
      path.join(process.cwd(), '.data', 'character-assets');
    this.publicBaseUrl = trimTrailingSlash(
      env.CHARACTER_BUCKET_PUBLIC_BASE_URL ??
        env.SERVER_PUBLIC_BASE_URL ??
        `http://localhost:${env.PORT}`
    );
  }

  async putObject(input: CharacterAssetUpload) {
    const segments = normalizeObjectKey(input.objectKey);
    const destinationPath = path.join(this.assetDir, ...segments);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await writeFile(destinationPath, input.body);
  }

  async getObjectUrl(objectKey: string) {
    const segments = normalizeObjectKey(objectKey);
    return `${this.publicBaseUrl}/character-assets/${encodeObjectKey(segments)}`;
  }

  async getObject(objectKey: string) {
    try {
      const segments = normalizeObjectKey(objectKey);
      const sourcePath = path.join(this.assetDir, ...segments);
      return await readFile(sourcePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }
}
