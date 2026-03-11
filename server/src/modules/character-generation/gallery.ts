type VersionLike = {
  id: string;
  customCharacterId: string;
  createdAt: Date;
};

const compareVersionRecency = (left: VersionLike, right: VersionLike) => {
  const createdAtDiff = right.createdAt.getTime() - left.createdAt.getTime();
  if (createdAtDiff !== 0) {
    return createdAtDiff;
  }

  return right.id.localeCompare(left.id);
};

export const buildLatestVersionByCharacterId = <TVersion extends VersionLike>(
  versions: readonly TVersion[]
) => {
  const latestByCharacterId = new Map<string, TVersion>();

  for (const version of versions) {
    const current = latestByCharacterId.get(version.customCharacterId);
    if (!current || compareVersionRecency(version, current) < 0) {
      latestByCharacterId.set(version.customCharacterId, version);
    }
  }

  return latestByCharacterId;
};
