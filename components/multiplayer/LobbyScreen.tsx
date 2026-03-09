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
    <View className="flex-1 items-center justify-center bg-[#030712] px-6">
      <Text className="mb-2 text-4xl font-extrabold text-white">Multiplay</Text>
      <Text className="mb-6 text-center text-slate-300">
        {isPaidPrivate
          ? 'Private paid room. Both players must bring the same funded entry.'
          : isPaidQueue
            ? 'Paid matchmaking. Queue support lands through the backend matchmaking flow.'
            : '2 players. Last one standing wins.'}
      </Text>

      {paidSession ? (
        <View className="mb-6 w-full max-w-sm rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-4">
          <Text className="text-xs font-semibold uppercase tracking-[2px] text-amber-100">
            Paid Setup Ready
          </Text>
          <Text className="mt-2 text-sm text-white">
            {paidSession.selection.token.symbol} · {paidSession.selection.entryFeeTier.amount}{' '}
            {paidSession.selection.entryFeeTier.currencySymbol}
          </Text>
          <Text className="mt-2 text-xs text-amber-50/80">
            Payment intent {paidSession.paymentIntentId.slice(0, 8)} funded via transaction{' '}
            {paidSession.transactionSignature.slice(0, 8)}...
          </Text>
        </View>
      ) : null}

      {isPaidQueue && !state.roomCode ? (
        <View className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 px-5 py-6">
          <Text className="text-lg font-bold text-white">Paid matchmaking queue</Text>
          <Text className="mt-3 text-sm leading-5 text-slate-300">
            Join the funded queue for your selected token bucket. When another player enters the
            same entry fee, the room is created automatically and both players start funded.
          </Text>
          <TextInput
            value={nickname}
            onChangeText={setNickname}
            autoCapitalize="words"
            placeholder="Nickname"
            placeholderTextColor="#94a3b8"
            className="mt-5 rounded-2xl border border-slate-500 bg-slate-950 px-4 py-3 text-white"
          />
          <View className="mt-5 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-4">
            <Text className="text-sm font-semibold text-white">
              Queue status:{' '}
              {state.queueStatus === 'queued'
                ? 'Waiting for opponent'
                : state.queueStatus === 'matched'
                  ? 'Opponent found'
                  : 'Idle'}
            </Text>
            <Text className="mt-2 text-xs text-slate-400">
              {state.queueEntryId
                ? `Queue entry ${state.queueEntryId.slice(0, 8)}...`
                : 'Not currently queued.'}
            </Text>
          </View>
          <View className="mt-5 gap-3">
            <Pressable
              onPress={() => (canJoinQueue ? onJoinQueue((nickname || 'Player').trim()) : null)}
              disabled={!canJoinQueue}
              className={`rounded-2xl px-5 py-4 active:opacity-80 ${
                canJoinQueue ? 'bg-white' : 'bg-slate-700'
              }`}>
              <Text
                className={`text-center text-lg font-bold ${
                  canJoinQueue ? 'text-black' : 'text-slate-300'
                }`}>
                {state.pendingAction === 'queueing' ? 'Joining Queue...' : 'Join Paid Queue'}
              </Text>
            </Pressable>
            <Pressable
              onPress={onLeaveQueue}
              disabled={state.queueStatus !== 'queued' || state.pendingAction === 'leaving_queue'}
              className={`rounded-2xl px-5 py-4 active:opacity-80 ${
                state.queueStatus === 'queued' && state.pendingAction !== 'leaving_queue'
                  ? 'bg-slate-800'
                  : 'bg-slate-950'
              }`}>
              <Text className="text-center text-lg font-bold text-white">
                {state.pendingAction === 'leaving_queue' ? 'Leaving Queue...' : 'Leave Queue'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : !state.roomCode ? (
        <>
          <TextInput
            value={nickname}
            onChangeText={setNickname}
            autoCapitalize="words"
            placeholder="Nickname"
            placeholderTextColor="#94a3b8"
            className="mb-4 w-full max-w-sm rounded-2xl border border-slate-500 bg-slate-900 px-4 py-3 text-white"
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
            <View className="w-full items-center gap-4">
              <RoomCodeInput value={roomCodeInput} onChangeText={setRoomCodeInput} />
              <Pressable
                onPress={() =>
                  canJoin ? onJoinRoom(normalizedCode, (nickname || 'Player').trim()) : null
                }
                className={`w-full max-w-sm rounded-2xl px-8 py-4 active:opacity-80 ${
                  canJoin ? 'bg-white' : 'bg-slate-600'
                }`}>
                <Text
                  className={`text-center text-lg font-bold ${canJoin ? 'text-black' : 'text-slate-300'}`}>
                  {state.pendingAction === 'joining_room'
                    ? 'Joining...'
                    : isPaidPrivate
                      ? 'Join Paid Room'
                      : 'Join Room'}
                </Text>
              </Pressable>
              <Pressable onPress={() => setStep('mode')} className="px-4 py-2">
                <Text className="text-slate-300">Back</Text>
              </Pressable>
            </View>
          )}
        </>
      ) : (
        <View className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 px-5 py-6">
          <Text className="text-sm font-semibold tracking-[2px] text-slate-400">ROOM CODE</Text>
          <Text className="mb-4 text-3xl font-extrabold tracking-[5px] text-white">
            {state.roomCode}
          </Text>
          <Text className="text-slate-200">You: {state.localPlayer?.nickname ?? '-'}</Text>
          <Text className="text-slate-200">Your Character: {localCharacterName}</Text>
          <Text className="text-slate-200">You Ready: {state.localReady ? 'Yes' : 'No'}</Text>
          {isPaidPrivate ? (
            <Text className="text-slate-200">You Funded: {state.localFunded ? 'Yes' : 'No'}</Text>
          ) : null}
          <Text className="text-slate-200">
            Opponent: {state.opponent?.nickname ?? 'Waiting...'}
          </Text>
          <Text className="text-slate-200">Opponent Character: {opponentCharacterName}</Text>
          <Text className="mb-6 text-slate-200">
            Opponent Ready: {state.opponentReady ? 'Yes' : 'No'}
          </Text>
          {isPaidPrivate ? (
            <Text className="mb-6 text-slate-200">
              Opponent Funded: {state.opponentFunded ? 'Yes' : 'No'}
            </Text>
          ) : null}

          <Pressable
            onPress={onReady}
            disabled={!canReady}
            className={`rounded-2xl px-6 py-4 ${canReady ? 'bg-emerald-500' : 'bg-slate-700'}`}>
            <Text className="text-center text-lg font-bold text-white">
              {isPaidPrivate && !state.localFunded
                ? 'Funding required'
                : state.localReady
                  ? 'You are ready'
                  : state.pendingAction === 'readying'
                    ? 'Sending ready...'
                    : canReady
                      ? 'Ready'
                      : 'Waiting for opponent'}
            </Text>
          </Pressable>
        </View>
      )}

      {state.pendingAction === 'creating_room' && (
        <Text className="mt-4 text-amber-300">Creating room...</Text>
      )}
      {state.errorMessage && <Text className="mt-4 text-red-400">{state.errorMessage}</Text>}
      <Text className="mt-2 text-xs text-slate-500">Server: {state.serverUrl}</Text>

      <Pressable onPress={onBack} className="mt-8 rounded-full border border-slate-500 px-5 py-2">
        <Text className="text-slate-200">Back Home</Text>
      </Pressable>
    </View>
  );
};
