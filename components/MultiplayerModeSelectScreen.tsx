import { Pressable, Text, View, StyleSheet } from 'react-native';
import type { MultiplayerMenuMode } from '../types/payments';

type MultiplayerModeSelectScreenProps = {
  onBack: () => void;
  onSelect: (mode: MultiplayerMenuMode) => void;
};

const OPTIONS: {
  mode: MultiplayerMenuMode;
  eyebrow: string;
  title: string;
  description: string;
  isPaid: boolean;
}[] = [
  {
    mode: 'casual_room',
    eyebrow: 'Free',
    title: 'Casual Room',
    description: 'Create or join a normal room with no wallet or wager required.',
    isPaid: false,
  },
  {
    mode: 'paid_private_room',
    eyebrow: 'Paid',
    title: 'Private Room',
    description: 'Lock in a token and entry fee, then challenge a specific opponent.',
    isPaid: true,
  },
  {
    mode: 'paid_matchmaking',
    eyebrow: 'Paid',
    title: 'Matchmaking',
    description: 'Queue into a public bucket and get matched against another funded player.',
    isPaid: true,
  },
];

export const MultiplayerModeSelectScreen = ({
  onBack,
  onSelect,
}: MultiplayerModeSelectScreenProps) => {
  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none"><View style={styles.splitDiagonal} /></View>
      

      <View className="flex-1 px-6 py-16 z-10">
        <Text 
          className="text-5xl font-black tracking-widest text-white italic"
          style={{ textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 10 }}
        >
          MULTIPLAYER
        </Text>
        <Text className="mt-3 max-w-sm text-sm leading-5 text-slate-300">
          Choose a casual room or a paid mode. Wallet steps only appear when money is involved.
        </Text>

        <View className="mt-10 gap-5">
          {OPTIONS.map((option) => (
            <Pressable
              key={option.mode}
              onPress={() => onSelect(option.mode)}
              className={`rounded-[28px] overflow-hidden active:scale-95 transition-transform ${
                option.isPaid
                  ? 'bg-orange-500'
                  : 'bg-slate-800 border border-slate-700'
              }`}
              style={option.isPaid ? styles.primaryButton : undefined}
            >
              <View className={`px-6 py-6 ${option.isPaid ? 'bg-white/10' : ''}`}>
                <View className="flex-row items-center gap-3">
                  <View className={`px-3 py-1 rounded-full ${
                    option.isPaid 
                      ? 'bg-orange-900/50 border border-orange-300/30' 
                      : 'bg-slate-700'
                  }`}>
                    <Text className={`text-xs font-black uppercase tracking-widest ${
                      option.isPaid ? 'text-orange-200' : 'text-slate-300'
                    }`}>
                      {option.eyebrow}
                    </Text>
                  </View>
                </View>
                <Text className="mt-4 text-3xl font-black text-white italic tracking-wider">
                  {option.title}
                </Text>
                <Text className={`mt-2 text-sm leading-5 ${
                  option.isPaid ? 'text-orange-100/80' : 'text-slate-400'
                }`}>
                  {option.description}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={onBack}
          className="mt-8 self-start rounded-full bg-white/5 border border-white/10 px-6 py-3 active:bg-white/10 transition-colors"
        >
          <Text className="font-bold text-slate-300 uppercase tracking-wider text-sm">Back</Text>
        </Pressable>
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
  primaryButton: {
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  }
});
