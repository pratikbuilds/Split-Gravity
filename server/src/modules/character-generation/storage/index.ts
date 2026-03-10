import { env } from '../../../config/env';
import type { CharacterAssetStorage } from './characterAssetStorage';
import { LocalCharacterAssetStorage } from './localCharacterAssetStorage';
import { S3CharacterAssetStorage } from './s3CharacterAssetStorage';

let storageSingleton: CharacterAssetStorage | null = null;

const hasBucketConfig = () =>
  Boolean(
    env.CHARACTER_BUCKET_NAME &&
      env.CHARACTER_BUCKET_ENDPOINT &&
      env.CHARACTER_BUCKET_ACCESS_KEY &&
      env.CHARACTER_BUCKET_SECRET_KEY
  );

export const getCharacterAssetStorage = () => {
  if (!storageSingleton) {
    storageSingleton = hasBucketConfig()
      ? new S3CharacterAssetStorage()
      : new LocalCharacterAssetStorage();
  }

  return storageSingleton;
};
