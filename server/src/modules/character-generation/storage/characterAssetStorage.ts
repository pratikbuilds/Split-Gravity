export interface CharacterAssetUpload {
  objectKey: string;
  body: Buffer;
  contentType: string;
}

export interface CharacterAssetStorage {
  putObject(input: CharacterAssetUpload): Promise<void>;
  getObjectUrl(objectKey: string): Promise<string>;
}
