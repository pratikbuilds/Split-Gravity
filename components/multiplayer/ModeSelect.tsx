import { Pressable, Text, View } from 'react-native';

interface ModeSelectProps {
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  createDisabled?: boolean;
  createLabel?: string;
  joinDisabled?: boolean;
}

export const ModeSelect = ({
  onCreateRoom,
  onJoinRoom,
  createDisabled = false,
  createLabel = 'Create Room',
  joinDisabled = false,
}: ModeSelectProps) => {
  return (
    <View className="w-full max-w-sm gap-4">
      <Pressable
        onPress={onCreateRoom}
        disabled={createDisabled}
        className={`rounded-2xl px-8 py-4 active:opacity-80 ${
          createDisabled ? 'bg-slate-600' : 'bg-white'
        }`}>
        <Text
          className={`text-center text-lg font-bold ${createDisabled ? 'text-slate-300' : 'text-black'}`}>
          {createLabel}
        </Text>
      </Pressable>
      <Pressable
        onPress={onJoinRoom}
        disabled={joinDisabled}
        className={`rounded-2xl border px-8 py-4 active:opacity-80 ${
          joinDisabled ? 'border-slate-600' : 'border-white'
        }`}>
        <Text
          className={`text-center text-lg font-bold ${joinDisabled ? 'text-slate-500' : 'text-white'}`}>
          Join Room
        </Text>
      </Pressable>
    </View>
  );
};
