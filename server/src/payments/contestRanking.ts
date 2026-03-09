import type { LeaderboardEntry } from '../../../shared/payment-contracts';

export const rankLeaderboard = <T extends { bestDistance: number; achievedAt: string }>(
  rows: T[]
) =>
  [...rows].sort((a, b) => {
    if (b.bestDistance !== a.bestDistance) return b.bestDistance - a.bestDistance;
    return new Date(a.achievedAt).getTime() - new Date(b.achievedAt).getTime();
  });

export const applyRankings = (rows: LeaderboardEntry[]): LeaderboardEntry[] =>
  rankLeaderboard(rows).map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
