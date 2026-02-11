import { TextInput, View } from 'react-native';

interface RoomCodeInputProps {
  value: string;
  onChangeText: (text: string) => void;
}

export const RoomCodeInput = ({ value, onChangeText }: RoomCodeInputProps) => {
  return (
    <View className="w-full max-w-sm">
      <TextInput
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="characters"
        maxLength={5}
        placeholder="ROOM CODE"
        placeholderTextColor="#94a3b8"
        className="rounded-2xl border border-slate-400 bg-slate-900 px-4 py-3 text-center text-xl font-bold tracking-[6px] text-white"
      />
    </View>
  );
};
