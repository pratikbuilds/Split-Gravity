export const buildReferenceImageObjectKey = (playerId: string, jobId: string, extension = 'png') =>
  `character-inputs/${playerId}/${jobId}/reference.${extension}`;

export const buildSheetObjectKey = (
  playerId: string,
  characterId: string,
  versionId: string
) => `character-renders/${playerId}/${characterId}/${versionId}/sheet.png`;

export const buildThumbnailObjectKey = (
  playerId: string,
  characterId: string,
  versionId: string
) => `character-renders/${playerId}/${characterId}/${versionId}/thumb.png`;
