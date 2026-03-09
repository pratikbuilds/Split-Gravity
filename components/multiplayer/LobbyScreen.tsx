import { useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import type { MultiplayerMatchController } from '../../services/multiplayer/matchController';
import type { GameMode } from '../../types/game';
import type { PaidSetupResult } from '../../types/payments';
import { getCharacterDefinitionOrDefault } from '../game/characterSpritePresets';
import { useMultiplayerState } from './useMultiplayerState';
import { ModeSelect } from './ModeSelect';
import { RoomCodeInput } from './RoomCodeInput';

interface LobbyScreenProps {
  controller: MultiplayerMatchController;
  mode: GameMode;
  paidSession: PaidSetupResult | null;
  onBack: () => void;
  onCreateRoom: (nickname: string) => void;
  onJoinRoom: (roomCode: string, nickname: string) => void;
  onJoinQueue: (nickname: string) => void;
  onLeaveQueue: () => void;
  onReady: () => void;
  onTransitionToGame: () => void;
}

export const LobbyScreen = ({
  controller,
  mode,
  paidSession,
  onBack,
  onCreateRoom,
  onJoinRoom,
  onJoinQueue,
  onLeaveQueue,
  onReady,
  onTransitionToGame,
}: LobbyScreenProps) => {
  const state = useMultiplayerState(controller);
  const [nickname, setNickname] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [step, setStep] = useState<'mode' | 'join'>('mode');

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  const localPlayerId = state.localPlayer?.playerId ?? null;
  const opponentPlayerId = state.opponent?.playerId ?? null;
  const hasMultiplayerPair = Boolean(localPlayerId && opponentPlayerId);

  useEffect(() => {
    if (!mode.startsWith('multi_')) return;
    if (state.matchStatus !== 'running') return;
    if (!hasMultiplayerPair) return;
    onTransitionToGame();
  }, [mode, state.matchStatus, hasMultiplayerPair, onTransitionToGame]);

  const normalizedCode = useMemo(() => roomCodeInput.toUpperCase().trim(), [roomCodeInput]);
  const isPaidPrivate = mode === 'multi_paid_private';
  const isPaidQueue = mode === 'multi_paid_queue';
  const canReady =
    Boolean(state.roomCode && state.opponent && state.localPlayer) &&
    (!isPaidPrivate || state.localFunded) &&
    !state.localReady &&
    state.pendingAction !== 'readying';
  const canCreate = nickname.trim().length > 0 && state.pendingAction === 'none';
  const canJoin =
    nickname.trim().length > 0 && normalizedCode.length === 5 && state.pendingAction === 'none';
  const canJoinQueue =
    nickname.trim().length > 0 &&
    state.pendingAction !== 'queueing' &&
    state.pendingAction !== 'leaving_queue' &&
    state.queueStatus !== 'queued';
  const localCharacterName = state.localPlayer
    ? getCharacterDefinitionOrDefault(state.localPlayer.characterId).displayName
    : '-';
  const opponentCharacterName = state.opponent
    ? getCharacterDefinitionOrDefault(state.opponent.characterId).displayName
    : 'Waiting...';
  const hasPendingRoomRequest =
    state.pendingAction === 'creating_room' || state.pendingAction === 'joining_room';

  const handleBack = () => {
    Keyboard.dismiss();
    onBack();
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0510' }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center', alignItems: 'center' }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ fontSize: 36, fontWeight: '800', color: '#fff', marginBottom: 8, letterSpacing: 4 }}>
          MULTIPLAY
        </Text>
        <Text style={{ fontSize: 14, color: '#94a3b8', textAlign: 'center', marginBottom: 24, maxWidth: 280 }}>
          {isPaidPrivate
            ? 'Private paid room. Both players must bring the same funded entry.'
            : isPaidQueue
              ? 'Paid matchmaking. Queue support lands through the backend matchmaking flow.'
              : '2 players. Last one standing wins.'}
        </Text>

        {paidSession ? (
          <View style={{ marginBottom: 24, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(234,88,12,0.2)', backgroundColor: 'rgba(234,88,12,0.1)', width: '100%', maxWidth: 360 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#fed7aa', letterSpacing: 2 }}>PAID SETUP READY</Text>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff', marginTop: 8 }}>
              {paidSession.selection.entryFeeTier.amount} {paidSession.selection.entryFeeTier.currencySymbol}
              <Text style={{ color: '#fb923c' }}> · {paidSession.selection.token.symbol}</Text>
            </Text>
            <Text style={{ fontSize: 12, color: 'rgba(255,237,213,0.6)', marginTop: 8 }}>
              Intent {paidSession.paymentIntentId.slice(0, 8)} • Tx {paidSession.transactionSignature.slice(0, 8)}...
            </Text>
          </View>
        ) : null}

        {isPaidQueue && !state.roomCode ? (
          <View style={{ width: '100%', maxWidth: 360, padding: 24, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(15,23,42,0.6)' }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff' }}>Matchmaking Queue</Text>
            <Text style={{ fontSize: 14, color: '#94a3b8', marginTop: 8, lineHeight: 20 }}>
              Join the funded queue for your selected token bucket.
            </Text>
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              placeholder="Nickname"
              placeholderTextColor="#64748b"
              style={{ marginTop: 24, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 16 }}
            />
            <View style={{ marginTop: 24, padding: 16, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.2)' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
                Status: <Text style={state.queueStatus === 'queued' ? { color: '#fb923c' } : state.queueStatus === 'matched' ? { color: '#34d399' } : { color: '#64748b' }}>
                  {state.queueStatus === 'queued' ? 'Waiting for opponent' : state.queueStatus === 'matched' ? 'Opponent found' : 'Idle'}
                </Text>
              </Text>
            </View>
            <View style={{ marginTop: 24, gap: 12 }}>
              <Pressable
                onPress={() => canJoinQueue && onJoinQueue((nickname || 'Player').trim())}
                disabled={!canJoinQueue}
                style={{ padding: 16, borderRadius: 16, backgroundColor: canJoinQueue ? '#f97316' : '#334155', alignItems: 'center' }}
              >
                <Text style={{ fontSize: 18, fontWeight: '800', color: canJoinQueue ? '#fff' : '#64748b' }}>
                  {state.pendingAction === 'queueing' ? 'Joining...' : 'Join Queue'}
                </Text>
              </Pressable>
              <Pressable
                onPress={onLeaveQueue}
                disabled={state.queueStatus !== 'queued' || state.pendingAction === 'leaving_queue'}
                style={{ padding: 16, borderRadius: 16, borderWidth: 1, borderColor: state.queueStatus === 'queued' ? 'rgba(255,255,255,0.2)' : 'transparent', alignItems: 'center' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: state.queueStatus === 'queued' ? '#cbd5e1' : '#64748b' }}>
                  {state.pendingAction === 'leaving_queue' ? 'Leaving...' : 'Leave Queue'}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : !state.roomCode ? (
          <View style={{ width: '100%', maxWidth: 360 }}>
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              placeholder="Enter your nickname"
              placeholderTextColor="#64748b"
              style={{ marginBottom: 24, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(15,23,42,0.6)', color: '#fff', fontSize: 16, textAlign: 'center' }}
            />
            {step === 'mode' ? (
              <ModeSelect
                onCreateRoom={() => {
                  if (!canCreate) return;
                  Keyboard.dismiss();
                  onCreateRoom((nickname || 'Player').trim());
                }}
                onJoinRoom={() => setStep('join')}
                createDisabled={!canCreate}
                createLabel={
                  state.pendingAction === 'creating_room'
                    ? 'Creating...'
                    : isPaidPrivate
                      ? 'Create Paid Room'
                      : 'Create Room'
                }
                joinDisabled={state.pendingAction !== 'none'}
              />
            ) : (
              <View style={{ width: '100%', alignItems: 'center', gap: 20 }}>
                <RoomCodeInput value={roomCodeInput} onChangeText={setRoomCodeInput} />
                <Pressable
                  onPress={() => {
                    if (!canJoin) return;
                    Keyboard.dismiss();
                    onJoinRoom(normalizedCode, (nickname || 'Player').trim());
                  }}
                  disabled={!canJoin}
                  style={{ width: '100%', padding: 20, borderRadius: 16, backgroundColor: canJoin ? '#f97316' : '#334155', alignItems: 'center' }}
                >
                  <Text style={{ fontSize: 20, fontWeight: '800', color: canJoin ? '#fff' : '#64748b' }}>
                    {state.pendingAction === 'joining_room' ? 'Joining...' : isPaidPrivate ? 'Join Paid Room' : 'Join Room'}
                  </Text>
                </Pressable>
                <Pressable onPress={() => setStep('mode')} style={{ padding: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#cbd5e1' }}>Back to Options</Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : (
          <View style={{ width: '100%', maxWidth: 360, padding: 24, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(15,23,42,0.6)' }}>
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#fb923c', letterSpacing: 4, marginBottom: 4 }}>ROOM CODE</Text>
              <Text style={{ fontSize: 48, fontWeight: '800', letterSpacing: 8, color: '#fff', paddingHorizontal: 24, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
                {state.roomCode}
              </Text>
            </View>
            <View style={{ gap: 12, marginBottom: 24 }}>
              <View style={{ padding: 16, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 8 }}>You</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff' }}>{state.localPlayer?.nickname ?? '-'}</Text>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: state.localReady ? 'rgba(52,211,153,0.2)' : '#1e293b' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: state.localReady ? '#34d399' : '#94a3b8' }}>{state.localReady ? 'Ready' : 'Not Ready'}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 14, color: '#94a3b8', marginTop: 4 }}>{localCharacterName}</Text>
                {isPaidPrivate ? <Text style={{ fontSize: 12, marginTop: 8, color: state.localFunded ? '#fb923c' : '#f87171' }}>Funded: {state.localFunded ? 'Yes' : 'No'}</Text> : null}
              </View>
              <View style={{ padding: 16, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 8 }}>Opponent</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff' }}>{state.opponent?.nickname ?? 'Waiting...'}</Text>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: state.opponentReady ? 'rgba(52,211,153,0.2)' : '#1e293b' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: state.opponentReady ? '#34d399' : '#94a3b8' }}>{state.opponentReady ? 'Ready' : 'Not Ready'}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 14, color: '#94a3b8', marginTop: 4 }}>{opponentCharacterName}</Text>
                {isPaidPrivate ? <Text style={{ fontSize: 12, marginTop: 8, color: state.opponentFunded ? '#fb923c' : '#f87171' }}>Funded: {state.opponentFunded ? 'Yes' : 'No'}</Text> : null}
              </View>
            </View>
            <Pressable
              onPress={onReady}
              disabled={!canReady}
              style={{ padding: 20, borderRadius: 16, backgroundColor: canReady ? '#f97316' : '#334155', alignItems: 'center' }}
            >
              <Text style={{ fontSize: 20, fontWeight: '800', color: canReady ? '#fff' : '#94a3b8' }}>
                {isPaidPrivate && !state.localFunded ? 'Funding required' : state.localReady ? 'You are ready' : state.pendingAction === 'readying' ? 'Sending ready...' : canReady ? 'Ready Up' : 'Waiting for opponent'}
              </Text>
            </Pressable>
          </View>
        )}

        {hasPendingRoomRequest && (
          <View style={{ marginTop: 24, alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#fb923c' }}>
              {state.pendingAction === 'joining_room' ? 'Joining room...' : 'Creating room...'}
            </Text>
            <Pressable onPress={handleBack} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(251,146,60,0.4)', backgroundColor: 'rgba(249,115,22,0.1)' }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#fed7aa' }}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {state.errorMessage ? (
          <View style={{ marginTop: 24, padding: 16, borderRadius: 12, backgroundColor: 'rgba(127,29,29,0.5)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#f87171' }}>{state.errorMessage}</Text>
          </View>
        ) : null}

        <View style={{ marginTop: 32, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: state.connected ? '#22c55e' : hasPendingRoomRequest ? '#f59e0b' : '#ef4444',
            }}
          />
          <Text style={{ fontSize: 12, color: '#64748b' }}>
            {state.connected ? `Connected · ${state.serverUrl}` : hasPendingRoomRequest ? `Connecting...` : `Disconnected · ${state.serverUrl}`}
          </Text>
        </View>

        <Pressable onPress={handleBack} style={{ marginTop: 24, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignSelf: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#cbd5e1' }}>Exit to Main Menu</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
};
