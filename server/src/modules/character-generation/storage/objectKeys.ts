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

export const buildAnimationObjectKey = (
  playerId: string,
  characterId: string,
  versionId: string
) => `character-renders/${playerId}/${characterId}/${versionId}/animation.json`;

export const buildAnimationObjectKeyFromSheet = (sheetObjectKey: string) => {
  if (!sheetObjectKey.endsWith('/sheet.png')) {
    throw new Error('Invalid sheet object key for animation metadata.');
  }

  return sheetObjectKey.replace(/\/sheet\.png$/, '/animation.json');
};
