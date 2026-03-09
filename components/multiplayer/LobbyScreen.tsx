import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import type { MultiplayerViewState } from '../../services/multiplayer/matchController';
import type { GameMode } from '../../types/game';
import type { PaidSetupResult } from '../../types/payments';
import { getCharacterDefinitionOrDefault } from '../game/characterSpritePresets';
import { ModeSelect } from './ModeSelect';
import { RoomCodeInput } from './RoomCodeInput';

interface LobbyScreenProps {
  state: MultiplayerViewState;
  mode: GameMode;
  paidSession: PaidSetupResult | null;
  onBack: () => void;
  onCreateRoom: (nickname: string) => void;
  onJoinRoom: (roomCode: string, nickname: string) => void;
  onJoinQueue: (nickname: string) => void;
  onLeaveQueue: () => void;
  onReady: () => void;
}

export const LobbyScreen = ({
  state,
  mode,
  paidSession,
  onBack,
  onCreateRoom,
  onJoinRoom,
  onJoinQueue,
  onLeaveQueue,
  onReady,
}: LobbyScreenProps) => {
  const [nickname, setNickname] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [step, setStep] = useState<'mode' | 'join'>('mode');

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

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

  return (
    <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: '#0a0510' }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
        <View style={{
          position: 'absolute',
          top: '45%',
          left: '-50%',
          width: '200%',
          height: '150%',
          backgroundColor: '#120803',
          transform: [{ rotate: '-12deg' }],
          borderTopWidth: 2,
          borderTopColor: 'rgba(234, 88, 12, 0.2)',
        }} />
      </View>
      
      <View className="z-10 w-full items-center">
        <Text className="mb-2 text-5xl font-black italic tracking-widest text-white" style={{ textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 10 }}>MULTIPLAY</Text>
        <Text className="mb-8 text-center text-sm leading-5 text-slate-400 max-w-xs">
          {isPaidPrivate
            ? 'Private paid room. Both players must bring the same funded entry.'
            : isPaidQueue
              ? 'Paid matchmaking. Queue support lands through the backend matchmaking flow.'
              : '2 players. Last one standing wins.'}
        </Text>

        {paidSession ? (
          <View className="mb-8 w-full max-w-sm rounded-2xl border border-orange-500/20 bg-orange-500/10 px-5 py-5">
            <Text className="text-xs font-black uppercase tracking-widest text-orange-200">
              Paid Setup Ready
            </Text>
            <Text className="mt-2 text-xl font-black italic text-white">
              {paidSession.selection.entryFeeTier.amount}{' '}
              {paidSession.selection.entryFeeTier.currencySymbol}
              <Text className="text-orange-400"> · {paidSession.selection.token.symbol}</Text>
            </Text>
            <Text className="mt-2 text-xs text-orange-100/60 leading-4">
              Intent {paidSession.paymentIntentId.slice(0, 8)} • Tx {paidSession.transactionSignature.slice(0, 8)}...
            </Text>
          </View>
        ) : null}

        {isPaidQueue && !state.roomCode ? (
          <View className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900/60 px-6 py-6 shadow-xl shadow-black/50">
            <Text className="text-xl font-black italic tracking-wide text-white">Matchmaking Queue</Text>
            <Text className="mt-2 text-sm leading-5 text-slate-400">
              Join the funded queue for your selected token bucket. When another player enters the
              same entry fee, the room is created automatically and both players start funded.
            </Text>
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              autoCapitalize="words"
              placeholder="Nickname"
              placeholderTextColor="#64748b"
              className="mt-6 rounded-2xl border border-white/10 bg-black/40 px-5 py-4 text-white text-base font-medium"
            />
            <View className="mt-6 rounded-2xl border border-white/5 bg-black/20 px-5 py-4">
              <Text className="text-sm font-bold text-white uppercase tracking-wider">
                Status:{' '}
                <Text className={state.queueStatus === 'queued' ? 'text-orange-400' : state.queueStatus === 'matched' ? 'text-emerald-400' : 'text-slate-500'}>
                  {state.queueStatus === 'queued'
                    ? 'Waiting for opponent'
                    : state.queueStatus === 'matched'
                      ? 'Opponent found'
                      : 'Idle'}
                </Text>
              </Text>
              <Text className="mt-2 text-xs text-slate-500 font-medium">
                {state.queueEntryId
                  ? `Queue entry ${state.queueEntryId.slice(0, 8)}...`
                  : 'Not currently queued.'}
              </Text>
            </View>
            <View className="mt-6 gap-3">
              <Pressable
                onPress={() => (canJoinQueue ? onJoinQueue((nickname || 'Player').trim()) : null)}
                disabled={!canJoinQueue}
                className={`rounded-2xl px-6 py-4 active:scale-95 transition-transform ${
                  canJoinQueue ? 'bg-orange-500 shadow-lg shadow-orange-500/30' : 'bg-slate-800'
                }`}>
                <Text
                  className={`text-center text-lg font-black uppercase tracking-widest italic ${
                    canJoinQueue ? 'text-white' : 'text-slate-500'
                  }`}>
                  {state.pendingAction === 'queueing' ? 'Joining...' : 'Join Queue'}
                </Text>
              </Pressable>
              <Pressable
                onPress={onLeaveQueue}
                disabled={state.queueStatus !== 'queued' || state.pendingAction === 'leaving_queue'}
                className={`rounded-2xl px-6 py-4 border active:scale-95 transition-transform ${
                  state.queueStatus === 'queued' && state.pendingAction !== 'leaving_queue'
                    ? 'border-white/20 bg-white/5'
                    : 'border-transparent bg-transparent'
                }`}>
                <Text className={`text-center text-sm font-bold uppercase tracking-wider ${state.queueStatus === 'queued' && state.pendingAction !== 'leaving_queue' ? 'text-slate-300' : 'text-slate-600'}`}>
                  {state.pendingAction === 'leaving_queue' ? 'Leaving...' : 'Leave Queue'}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : !state.roomCode ? (
          <View className="w-full max-w-sm">
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              autoCapitalize="words"
              placeholder="Enter your nickname"
              placeholderTextColor="#64748b"
              className="mb-6 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-5 py-4 text-white text-base font-medium text-center"
            />

            {step === 'mode' ? (
              <ModeSelect
                onCreateRoom={() => (canCreate ? onCreateRoom((nickname || 'Player').trim()) : null)}
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
              <View className="w-full items-center gap-5">
                <RoomCodeInput value={roomCodeInput} onChangeText={setRoomCodeInput} />
                <Pressable
                  onPress={() =>
                    canJoin ? onJoinRoom(normalizedCode, (nickname || 'Player').trim()) : null
                  }
                  className={`w-full rounded-2xl px-8 py-5 active:scale-95 transition-transform ${
                    canJoin ? 'bg-orange-500 shadow-lg shadow-orange-500/30' : 'bg-slate-800'
                  }`}>
                  <Text
                    className={`text-center text-xl font-black uppercase italic tracking-widest ${canJoin ? 'text-white' : 'text-slate-500'}`}>
                    {state.pendingAction === 'joining_room'
                      ? 'Joining...'
                      : isPaidPrivate
                        ? 'Join Paid Room'
                        : 'Join Room'}
                  </Text>
                </Pressable>
                <Pressable onPress={() => setStep('mode')} className="px-6 py-3 rounded-full bg-white/5 border border-white/10 active:bg-white/10">
                  <Text className="text-slate-300 font-bold uppercase tracking-wider text-sm">Back to Options</Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : (
          <View className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-xl shadow-black/50">
            <View className="items-center mb-6">
              <Text className="text-xs font-black uppercase tracking-[4px] text-orange-400 mb-1">ROOM CODE</Text>
              <Text className="text-5xl font-black tracking-widest text-white bg-black/30 px-6 py-2 rounded-xl border border-white/5">
                {state.roomCode}
              </Text>
            </View>
            
            <View className="gap-3 mb-6">
              <View className="bg-black/30 rounded-xl p-4 border border-white/5">
                <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">You</Text>
                <View className="flex-row justify-between items-center">
                  <Text className="text-white font-bold text-lg">{state.localPlayer?.nickname ?? '-'}</Text>
                  <View className={`px-2 py-1 rounded ${state.localReady ? 'bg-emerald-500/20' : 'bg-slate-800'}`}>
                    <Text className={`text-xs font-bold uppercase ${state.localReady ? 'text-emerald-400' : 'text-slate-400'}`}>{state.localReady ? 'Ready' : 'Not Ready'}</Text>
                  </View>
                </View>
                <Text className="text-slate-400 text-sm mt-1">{localCharacterName}</Text>
                {isPaidPrivate ? (
                  <Text className={`text-xs mt-2 ${state.localFunded ? 'text-orange-400' : 'text-red-400'}`}>Funded: {state.localFunded ? 'Yes' : 'No'}</Text>
                ) : null}
              </View>

              <View className="bg-black/30 rounded-xl p-4 border border-white/5">
                <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Opponent</Text>
                <View className="flex-row justify-between items-center">
                  <Text className="text-white font-bold text-lg">{state.opponent?.nickname ?? 'Waiting...'}</Text>
                  <View className={`px-2 py-1 rounded ${state.opponentReady ? 'bg-emerald-500/20' : 'bg-slate-800'}`}>
                    <Text className={`text-xs font-bold uppercase ${state.opponentReady ? 'text-emerald-400' : 'text-slate-400'}`}>{state.opponentReady ? 'Ready' : 'Not Ready'}</Text>
                  </View>
                </View>
                <Text className="text-slate-400 text-sm mt-1">{opponentCharacterName}</Text>
                {isPaidPrivate ? (
                  <Text className={`text-xs mt-2 ${state.opponentFunded ? 'text-orange-400' : 'text-red-400'}`}>Funded: {state.opponentFunded ? 'Yes' : 'No'}</Text>
                ) : null}
              </View>
            </View>

            <Pressable
              onPress={onReady}
              disabled={!canReady}
              className={`rounded-2xl px-6 py-5 active:scale-95 transition-transform ${canReady ? 'bg-orange-500 shadow-lg shadow-orange-500/30' : 'bg-slate-800'}`}>
              <Text className={`text-center text-xl font-black uppercase italic tracking-widest ${canReady ? 'text-white' : 'text-slate-400'}`}>
                {isPaidPrivate && !state.localFunded
                  ? 'Funding required'
                  : state.localReady
                    ? 'You are ready'
                    : state.pendingAction === 'readying'
                      ? 'Sending ready...'
                      : canReady
                        ? 'Ready Up'
                        : 'Waiting for opponent'}
              </Text>
            </Pressable>
          </View>
        )}

        {state.pendingAction === 'creating_room' && (
          <Text className="mt-6 text-sm font-bold uppercase tracking-wider text-orange-400">Creating room...</Text>
        )}
        {state.errorMessage && <Text className="mt-6 text-sm font-bold text-red-400 bg-red-950/50 px-4 py-2 rounded-lg border border-red-500/30">{state.errorMessage}</Text>}
        <Text className="mt-8 text-xs font-medium text-slate-600">Server: {state.serverUrl}</Text>

        <Pressable onPress={onBack} className="mt-6 rounded-full bg-white/5 border border-white/10 px-6 py-3 active:bg-white/10 transition-colors">
          <Text className="text-slate-300 font-bold uppercase tracking-wider text-sm">Exit to Main Menu</Text>
        </Pressable>
      </View>
    </View>
  );
};
