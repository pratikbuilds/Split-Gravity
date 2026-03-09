import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
  StyleSheet
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import type { DailyContest, LeaderboardEntry } from '../shared/payment-contracts';
import { backendApi, formatApiErrorForDebug } from '../services/backend/api';

const ROW_GAP = 12;
const CARD_PADDING = 16;
const RANK_BADGE_SIZE = 40;

function maskWallet(address: string): string {
  if (!address || address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatAchievedAt(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (isToday) {
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function getTimeLeft(endsAtIso: string, nowMs: number): string {
  try {
    const end = new Date(endsAtIso).getTime();
    const left = Math.max(0, Math.floor((end - nowMs) / 1000));
    if (left === 0) return 'Ended';
    const h = Math.floor(left / 3600);
    const m = Math.floor((left % 3600) / 60);
    const s = left % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
    if (m > 0) return `${m}m ${pad(s)}s`;
    return `0:${pad(s)}`;
  } catch {
    return '—';
  }
}

function getRankStyle(rank: number): {
  borderColor: string;
  badgeBg: string;
  badgeText: string;
} {
  switch (rank) {
    case 1:
      return {
        borderColor: 'rgba(251, 191, 36, 0.6)',
        badgeBg: 'rgba(251, 191, 36, 0.25)',
        badgeText: '#fbbf24',
      };
    case 2:
      return {
        borderColor: 'rgba(203, 213, 225, 0.6)',
        badgeBg: 'rgba(203, 213, 225, 0.2)',
        badgeText: '#e2e8f0',
      };
    case 3:
      return {
        borderColor: 'rgba(249, 115, 22, 0.6)',
        badgeBg: 'rgba(249, 115, 22, 0.25)',
        badgeText: '#f97316',
      };
    default:
      return {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        badgeBg: 'rgba(71, 85, 105, 0.5)',
        badgeText: '#94a3b8',
      };
  }
}

type LeaderboardScreenProps = {
  onBack: () => void;
};

const DECIMALS_DEFAULT = 9;

function formatBaseUnitsToDisplay(baseUnits: string, decimals: number = DECIMALS_DEFAULT): string {
  const n = Number(baseUnits) / 10 ** decimals;
  if (n % 1 === 0) return n.toFixed(0);
  return n.toFixed(4).replace(/\.?0+$/, '');
}

export const LeaderboardScreen = ({ onBack }: LeaderboardScreenProps) => {
  const insets = useSafeAreaInsets();
  const [contests, setContests] = useState<DailyContest[]>([]);
  const [selectedContestId, setSelectedContestId] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [poolTotalDisplay, setPoolTotalDisplay] = useState<string>('');
  const [tokenSymbol, setTokenSymbol] = useState<string>('');
  const [payoutBps, setPayoutBps] = useState<number[]>([]);
  const [poolTotalBaseUnits, setPoolTotalBaseUnits] = useState<string>('0');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const endsAt = selectedContestId
      ? contests.find((c) => c.id === selectedContestId)?.endsAt
      : null;
    if (!endsAt) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [selectedContestId, contests]);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const { contests: data } = await backendApi.getDailyContests();
      setContests(data);
      if (data.length > 0) {
        const cid = data[0].id;
        setSelectedContestId(cid);
        const res = await backendApi.getLeaderboard(cid);
        setLeaderboard(res.leaderboard);
        setPoolTotalDisplay(res.poolTotalDisplay);
        setTokenSymbol(res.tokenSymbol);
        setPayoutBps(res.payoutBps ?? []);
        setPoolTotalBaseUnits(res.poolTotalBaseUnits ?? '0');
      }
    } catch (e) {
      const formatted = formatApiErrorForDebug(e);
      setError(formatted?.summary ?? 'Failed to load');
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadAll().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadAll]);

  const selectedContest = contests.find((c) => c.id === selectedContestId);

  const getExpectedPayoutDisplay = useCallback(
    (rank: number): string => {
      const bps = payoutBps[rank - 1];
      if (bps == null) return '—';
      const poolBase = BigInt(poolTotalBaseUnits);
      const payoutBase = (poolBase * BigInt(bps)) / 10_000n;
      return `${formatBaseUnitsToDisplay(payoutBase.toString())} ${tokenSymbol}`.trim();
    },
    [payoutBps, poolTotalBaseUnits, tokenSymbol]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: LeaderboardEntry; index: number }) => {
      const style = getRankStyle(item.rank);
      const displayName = item.nickname?.trim() || maskWallet(item.walletAddress);
      const payoutDisplay =
        item.payoutAmount != null
          ? `${formatBaseUnitsToDisplay(item.payoutAmount)} ${tokenSymbol}`.trim()
          : getExpectedPayoutDisplay(item.rank);
      return (
        <View
          style={{
            marginBottom: index < leaderboard.length - 1 ? ROW_GAP : 0,
            padding: CARD_PADDING,
            borderRadius: 16,
            borderWidth: 2,
            borderColor: style.borderColor,
            backgroundColor: item.rank <= 3 ? 'rgba(15, 23, 42, 0.8)' : 'rgba(30, 41, 59, 0.5)',
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View
              style={{
                width: RANK_BADGE_SIZE,
                height: RANK_BADGE_SIZE,
                borderRadius: RANK_BADGE_SIZE / 2,
                backgroundColor: style.badgeBg,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: style.badgeText }}>
                {item.rank}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={1}
                style={{ fontSize: 16, fontWeight: '700', color: '#f1f5f9' }}>
                {displayName}
              </Text>
              <Text style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
                {formatAchievedAt(item.achievedAt)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#fbbf24', fontStyle: 'italic' }}>
                {item.bestDistance}m
              </Text>
              <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                {payoutDisplay}
              </Text>
            </View>
          </View>
        </View>
      );
    },
    [leaderboard.length, tokenSymbol, getExpectedPayoutDisplay]
  );

  const contentPadding = {
    paddingTop: Math.max(insets.top + 24, 56),
    paddingBottom: Math.max(insets.bottom, 24),
    paddingHorizontal: 24,
  };

  if (loading && contests.length === 0) {
    return (
      <View style={styles.container}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none"><View style={styles.splitDiagonal} /></View>
        
        <View className="flex-1 z-10" style={contentPadding}>
          <View className="items-center justify-center flex-1">
            <ActivityIndicator color="#ea580c" size="large" />
            <Text className="mt-4 text-slate-400 font-bold uppercase tracking-widest">Loading...</Text>
          </View>
          <Pressable
            onPress={onBack}
            className="self-start rounded-full bg-white/5 border border-white/10 px-6 py-3 active:bg-white/10 transition-colors">
            <Text className="font-bold text-slate-300 uppercase tracking-wider text-sm">Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (contests.length === 0) {
    return (
      <View style={styles.container}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none"><View style={styles.splitDiagonal} /></View>
        
        <View className="flex-1 z-10" style={contentPadding}>
          <Text className="text-5xl font-black tracking-widest text-white italic" style={{ textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 10 }}>
            RANKINGS
          </Text>
          <View className="flex-1 items-center justify-center">
            <Text className="text-center text-slate-400 text-base">
              No active contest. Check back later.
            </Text>
          </View>
          <Pressable
            onPress={onBack}
            className="self-start rounded-full bg-white/5 border border-white/10 px-6 py-3 active:bg-white/10 transition-colors">
            <Text className="font-bold text-slate-300 uppercase tracking-wider text-sm">Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none"><View style={styles.splitDiagonal} /></View>
      

      <View className="flex-1 z-10">
        <View style={[contentPadding, { paddingBottom: 0 }]}>
          <View className="flex-row items-center justify-between mb-4">
            <Pressable
              onPress={onBack}
              className="rounded-full bg-white/5 border border-white/10 px-6 py-2.5 active:bg-white/10 transition-colors">
              <Text className="font-bold text-slate-300 uppercase tracking-wider text-sm">Back</Text>
            </Pressable>
          </View>
          <Text className="text-5xl font-black tracking-widest text-white italic" style={{ textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 10 }}>
            RANKINGS
          </Text>
          {selectedContest && (
            <>
              <Text className="mt-2 text-sm text-orange-200/80 font-bold uppercase tracking-wider">{selectedContest.title}</Text>
              {selectedContest.endsAt && (
                <View className="mt-3 flex-row items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
                  <Text className="text-xs font-bold uppercase tracking-wider text-amber-200/90">Time left</Text>
                  <Text className="font-mono text-lg font-black tabular-nums text-amber-400" style={{ textShadowColor: 'rgba(251,191,36,0.3)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 }}>
                    {getTimeLeft(selectedContest.endsAt, Date.now())}
                  </Text>
                </View>
              )}
            </>
          )}
          {(poolTotalDisplay || tokenSymbol) && (
            <View className="mt-4 rounded-xl border border-orange-500/20 bg-orange-500/10 px-4 py-3">
              <Text className="text-xs font-black uppercase tracking-widest text-orange-200">
                Prize pool
              </Text>
              <Text className="mt-1 text-2xl font-black italic text-white">
                {poolTotalDisplay || '0'} <Text className="text-orange-400">{tokenSymbol}</Text>
              </Text>
              <Text className="mt-1 text-xs text-slate-400">
                Payouts by rank shown below. Final amounts after contest ends.
              </Text>
            </View>
          )}
          {error && (
            <View className="mt-4 rounded-xl bg-red-900/30 border border-red-500/40 px-4 py-3">
              <Text className="text-red-300 text-sm">{error}</Text>
              <Pressable onPress={refresh} className="mt-2 self-start">
                <Text className="text-orange-300 font-bold uppercase tracking-wider text-sm">Retry</Text>
              </Pressable>
            </View>
          )}
        </View>

        {leaderboard.length === 0 && !error ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-center text-slate-400 text-base">No scores yet. Be the first!</Text>
          </View>
        ) : (
          <FlatList
            data={leaderboard}
            keyExtractor={(item) => item.playerId}
            renderItem={renderItem}
            contentContainerStyle={{
              paddingHorizontal: 24,
              paddingBottom: Math.max(insets.bottom, 24),
              paddingTop: 24,
            }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor="#ea580c"
              />
            }
          />
        )}

        {leaderboard.length === 0 && !error && (
          <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(insets.bottom, 24) }}>
            <Pressable
              onPress={onBack}
              className="self-start rounded-full bg-white/5 border border-white/10 px-6 py-3 active:bg-white/10 transition-colors">
              <Text className="font-bold text-slate-300 uppercase tracking-wider text-sm">Back</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0510',
  },
  splitDiagonal: {
    position: 'absolute',
    top: '45%',
    left: '-50%',
    width: '200%',
    height: '150%',
    backgroundColor: '#120803',
    transform: [{ rotate: '-12deg' }],
    borderTopWidth: 2,
    borderTopColor: 'rgba(234, 88, 12, 0.2)',
  },
});
