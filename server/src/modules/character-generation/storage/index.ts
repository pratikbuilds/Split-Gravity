import { S3CharacterAssetStorage } from './s3CharacterAssetStorage';

let storageSingleton: S3CharacterAssetStorage | null = null;

export const getCharacterAssetStorage = () => {
  if (!storageSingleton) {
    storageSingleton = new S3CharacterAssetStorage();
  }

  return storageSingleton;
};
