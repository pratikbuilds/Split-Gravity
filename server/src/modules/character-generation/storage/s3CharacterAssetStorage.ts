import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../../config/env';
import type { CharacterAssetStorage, CharacterAssetUpload } from './characterAssetStorage';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export class S3CharacterAssetStorage implements CharacterAssetStorage {
  private readonly client: S3Client;

  constructor() {
    if (
      !env.CHARACTER_BUCKET_NAME ||
      !env.CHARACTER_BUCKET_ENDPOINT ||
      !env.CHARACTER_BUCKET_ACCESS_KEY ||
      !env.CHARACTER_BUCKET_SECRET_KEY
    ) {
      throw new Error('Character asset bucket configuration is incomplete.');
    }

    this.client = new S3Client({
      region: env.CHARACTER_BUCKET_REGION,
      endpoint: env.CHARACTER_BUCKET_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.CHARACTER_BUCKET_ACCESS_KEY,
        secretAccessKey: env.CHARACTER_BUCKET_SECRET_KEY,
      },
    });
  }

  async putObject(input: CharacterAssetUpload) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: env.CHARACTER_BUCKET_NAME,
        Key: input.objectKey,
        Body: input.body,
        ContentType: input.contentType,
      })
    );
  }

  async getObjectUrl(objectKey: string) {
    if (env.CHARACTER_BUCKET_PUBLIC_BASE_URL && !env.CHARACTER_BUCKET_SIGNED_URLS) {
      return `${trimTrailingSlash(env.CHARACTER_BUCKET_PUBLIC_BASE_URL)}/${objectKey}`;
    }

    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: env.CHARACTER_BUCKET_NAME,
        Key: objectKey,
      }),
      { expiresIn: 60 * 60 }
    );
  }

  async getObject(objectKey: string) {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: env.CHARACTER_BUCKET_NAME,
          Key: objectKey,
        })
      );

      if (!response.Body) return null;
      const byteArray = await response.Body.transformToByteArray();
      return Buffer.from(byteArray);
    } catch (error) {
      const code = (error as { name?: string }).name;
      if (code === 'NoSuchKey' || code === 'NotFound') {
        return null;
      }
      throw error;
    }
  }
}
