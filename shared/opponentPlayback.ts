import type { OpponentSnapshot } from '../types/game';

export type TimedOpponentSnapshot = OpponentSnapshot & {
  receivedAt: number;
};

export type SampledOpponentSnapshot = OpponentSnapshot & {
  receivedAt: number;
};

const lerp = (from: number, to: number, alpha: number) => from + (to - from) * alpha;

export const enqueueOpponentSnapshot = (
  queue: TimedOpponentSnapshot[],
  snapshot: OpponentSnapshot,
  receivedAt: number,
  maxEntries = 6
): TimedOpponentSnapshot[] => {
  const nextEntry: TimedOpponentSnapshot = {
    ...snapshot,
    receivedAt,
  };

  if (snapshot.phase !== 'running' || snapshot.countdownLocked === 1) {
    return [nextEntry];
  }

  const last = queue[queue.length - 1];
  if (last) {
    if (last.playerId !== snapshot.playerId) {
      return [nextEntry];
    }
    if (
      (last.phase !== 'running' || last.countdownLocked === 1) &&
      snapshot.phase === 'running' &&
      snapshot.countdownLocked === 0
    ) {
      return [nextEntry];
    }
    if (snapshot.seq <= last.seq) {
      return queue;
    }
  }

  const nextQueue = [...queue, nextEntry];
  return nextQueue.slice(Math.max(0, nextQueue.length - maxEntries));
};

export const sampleOpponentSnapshot = (
  queue: TimedOpponentSnapshot[],
  renderAt: number,
  maxExtrapolationMs = 100
): SampledOpponentSnapshot | null => {
  if (queue.length === 0) return null;

  const first = queue[0];
  if (queue.length === 1 || renderAt <= first.receivedAt) {
    return first;
  }

  for (let i = 1; i < queue.length; i += 1) {
    const prev = queue[i - 1];
    const next = queue[i];
    if (renderAt > next.receivedAt) continue;

    const spanMs = Math.max(1, next.receivedAt - prev.receivedAt);
    const alpha = Math.min(1, Math.max(0, (renderAt - prev.receivedAt) / spanMs));
    const chosen = alpha < 0.5 ? prev : next;

    return {
      ...chosen,
      receivedAt: renderAt,
      normalizedY: lerp(prev.normalizedY, next.normalizedY, alpha),
      worldX: lerp(prev.worldX, next.worldX, alpha),
      velocityY: lerp(prev.velocityY, next.velocityY, alpha),
      velocityX: lerp(prev.velocityX, next.velocityX, alpha),
    };
  }

  const latest = queue[queue.length - 1];
  if (latest.phase !== 'running' || latest.countdownLocked === 1) {
    return latest;
  }

  const previous = queue.length > 1 ? queue[queue.length - 2] : null;
  if (!previous) {
    return latest;
  }

  const extrapolationMs = Math.min(Math.max(0, renderAt - latest.receivedAt), maxExtrapolationMs);
  if (extrapolationMs === 0) {
    return latest;
  }

  const spanMs = Math.max(1, latest.receivedAt - previous.receivedAt);
  const worldVelocityPerMs = (latest.worldX - previous.worldX) / spanMs;
  const normalizedVelocityPerMs = (latest.normalizedY - previous.normalizedY) / spanMs;

  return {
    ...latest,
    receivedAt: latest.receivedAt + extrapolationMs,
    worldX: latest.worldX + worldVelocityPerMs * extrapolationMs,
    normalizedY: latest.normalizedY + normalizedVelocityPerMs * extrapolationMs,
  };
};

export default {
  enqueueOpponentSnapshot,
  sampleOpponentSnapshot,
};
