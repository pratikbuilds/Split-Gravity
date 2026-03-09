import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
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
        borderColor: 'rgba(180, 83, 9, 0.6)',
        badgeBg: 'rgba(180, 83, 9, 0.25)',
        badgeText: '#d97706',
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

export const LeaderboardScreen = ({ onBack }: LeaderboardScreenProps) => {
  const insets = useSafeAreaInsets();
  const [contests, setContests] = useState<DailyContest[]>([]);
  const [selectedContestId, setSelectedContestId] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const { contests: data } = await backendApi.getDailyContests();
      setContests(data);
      if (data.length > 0) {
        const cid = data[0].id;
        setSelectedContestId(cid);
        const { leaderboard: lb } = await backendApi.getLeaderboard(cid);
        setLeaderboard(lb);
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

  const renderItem = useCallback(
    ({ item, index }: { item: LeaderboardEntry; index: number }) => {
      const style = getRankStyle(item.rank);
      const displayName = item.nickname?.trim() || maskWallet(item.walletAddress);
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
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#fbbf24' }}>
              {item.bestDistance}m
            </Text>
          </View>
        </View>
      );
    },
    [leaderboard.length]
  );

  const contentPadding = {
    paddingTop: Math.max(insets.top + 24, 56),
    paddingBottom: Math.max(insets.bottom, 24),
    paddingHorizontal: 24,
  };

  if (loading && contests.length === 0) {
    return (
      <View className="flex-1 bg-[#050816]" style={contentPadding}>
        <View className="items-center justify-center flex-1">
          <ActivityIndicator color="#fbbf24" size="large" />
          <Text className="mt-4 text-slate-400">Loading leaderboard…</Text>
        </View>
        <Pressable
          onPress={onBack}
          className="self-start rounded-full border border-white/20 px-5 py-3 active:opacity-80">
          <Text className="font-bold text-white">Back</Text>
        </Pressable>
      </View>
    );
  }

  if (contests.length === 0) {
    return (
      <View className="flex-1 bg-[#050816]" style={contentPadding}>
        <Text className="text-center text-5xl font-black tracking-[4px] text-white">
          Leaderboard
        </Text>
        <View className="flex-1 items-center justify-center">
          <Text className="text-center text-slate-300 text-base">
            No active contest. Check back later.
          </Text>
        </View>
        <Pressable
          onPress={onBack}
          className="self-start rounded-full border border-white/20 px-5 py-3 active:opacity-80">
          <Text className="font-bold text-white">Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#050816]">
      <View style={[contentPadding, { paddingBottom: 0 }]}>
        <View className="flex-row items-center justify-between mb-4">
          <Pressable
            onPress={onBack}
            className="rounded-full border border-white/20 px-5 py-3 active:opacity-80">
            <Text className="font-bold text-white">Back</Text>
          </Pressable>
        </View>
        <Text className="text-5xl font-black tracking-[4px] text-white">Leaderboard</Text>
        {selectedContest && (
          <Text className="mt-2 text-sm text-slate-400">{selectedContest.title}</Text>
        )}
        {error && (
          <View className="mt-4 rounded-xl bg-red-900/30 border border-red-500/40 px-4 py-3">
            <Text className="text-red-300 text-sm">{error}</Text>
            <Pressable onPress={refresh} className="mt-2 self-start">
              <Text className="text-amber-300 font-semibold text-sm">Retry</Text>
            </Pressable>
          </View>
        )}
      </View>

      {leaderboard.length === 0 && !error ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-slate-300 text-base">No scores yet. Be the first!</Text>
        </View>
      ) : (
        <FlatList
          data={leaderboard}
          keyExtractor={(item) => item.playerId}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: Math.max(insets.bottom, 24),
            paddingTop: 16,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor="#fbbf24"
            />
          }
        />
      )}

      {leaderboard.length === 0 && !error && (
        <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(insets.bottom, 24) }}>
          <Pressable
            onPress={onBack}
            className="self-start rounded-full border border-white/20 px-5 py-3 active:opacity-80">
            <Text className="font-bold text-white">Back</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
};
