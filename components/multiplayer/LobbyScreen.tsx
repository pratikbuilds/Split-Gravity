import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import type { MultiplayerViewState } from '../../services/multiplayer/matchController';
import { getCharacterDefinitionOrDefault } from '../game/characterSpritePresets';
import { ModeSelect } from './ModeSelect';
import { RoomCodeInput } from './RoomCodeInput';

interface LobbyScreenProps {
  state: MultiplayerViewState;
  onBack: () => void;
  onCreateRoom: (nickname: string) => void;
  onJoinRoom: (roomCode: string, nickname: string) => void;
  onReady: () => void;
}

export const LobbyScreen = ({
  state,
  onBack,
  onCreateRoom,
  onJoinRoom,
  onReady,
}: LobbyScreenProps) => {
  const [nickname, setNickname] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [step, setStep] = useState<'mode' | 'join'>('mode');

  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  const normalizedCode = useMemo(() => roomCodeInput.toUpperCase().trim(), [roomCodeInput]);
  const canReady =
    Boolean(state.roomCode && state.opponent && state.localPlayer) &&
    !state.localReady &&
    state.pendingAction !== 'readying';
  const canCreate = nickname.trim().length > 0 && state.pendingAction === 'none';
  const canJoin =
    nickname.trim().length > 0 && normalizedCode.length === 5 && state.pendingAction === 'none';
  const localCharacterName = state.localPlayer
    ? getCharacterDefinitionOrDefault(state.localPlayer.characterId).displayName
    : '-';
  const opponentCharacterName = state.opponent
    ? getCharacterDefinitionOrDefault(state.opponent.characterId).displayName
    : 'Waiting...';

  return (
    <View className="flex-1 items-center justify-center bg-[#030712] px-6">
      <Text className="mb-2 text-4xl font-extrabold text-white">Multiplay</Text>
      <Text className="mb-6 text-center text-slate-300">2 players. Last one standing wins.</Text>

      {!state.roomCode ? (
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
              createLabel={state.pendingAction === 'creating_room' ? 'Creating...' : 'Create Room'}
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
                  {state.pendingAction === 'joining_room' ? 'Joining...' : 'Join Room'}
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
          <Text className="text-slate-200">
            Opponent: {state.opponent?.nickname ?? 'Waiting...'}
          </Text>
          <Text className="text-slate-200">Opponent Character: {opponentCharacterName}</Text>
          <Text className="mb-6 text-slate-200">
            Opponent Ready: {state.opponentReady ? 'Yes' : 'No'}
          </Text>

          <Pressable
            onPress={onReady}
            disabled={!canReady}
            className={`rounded-2xl px-6 py-4 ${canReady ? 'bg-emerald-500' : 'bg-slate-700'}`}>
            <Text className="text-center text-lg font-bold text-white">
              {state.localReady
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
