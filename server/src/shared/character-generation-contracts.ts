export type CharacterGenerationSourceType = 'prompt' | 'image';

export type CharacterGenerationJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'refunded';

export interface CharacterGenerationPricing {
  requiresPayment: boolean;
  tokenId: string | null;
  entryFeeTierId: string | null;
  amountBaseUnits: string;
  amountDisplay: string;
  currencySymbol: string | null;
}

export interface CharacterGenerationConfigResponse {
  enabled: boolean;
  generationSize: '2K';
  pricing: CharacterGenerationPricing;
  maxConcurrentJobs: number;
  supportedInputs: CharacterGenerationSourceType[];
}

export interface CreateCharacterGenerationJobRequest {
  prompt?: string;
  displayName?: string;
  referenceImageDataUrl?: string;
}

export interface CharacterAssetDescriptor {
  sheetUrl: string;
  thumbnailUrl: string | null;
  width: number;
  height: number;
  gridColumns: number;
  gridRows: number;
}

export interface CustomCharacterVersionSummary {
  characterId: string;
  versionId: string;
  displayName: string;
  asset: CharacterAssetDescriptor;
  createdAt: string;
  isActive: boolean;
}

export interface CharacterGenerationJobSummary {
  jobId: string;
  status: CharacterGenerationJobStatus;
  sourceType: CharacterGenerationSourceType;
  displayName: string | null;
  prompt: string | null;
  paymentIntentId: string | null;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
  result: CustomCharacterVersionSummary | null;
}

export interface CharacterGenerationJobResponse {
  job: CharacterGenerationJobSummary;
}

export interface CharacterGenerationJobListResponse {
  jobs: CharacterGenerationJobSummary[];
}

export interface CustomCharacterSummary {
  characterId: string;
  displayName: string;
  activeVersionId: string;
  asset: CharacterAssetDescriptor;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomCharacterListResponse {
  characters: CustomCharacterSummary[];
}

export interface RenameCustomCharacterRequest {
  displayName: string;
}

export interface ActivateCustomCharacterResponse {
  characterId: string;
  versionId: string;
  activatedAt: string;
}

export interface RegisterExpoPushTokenRequest {
  expoPushToken: string;
  platform: 'ios' | 'android';
}
