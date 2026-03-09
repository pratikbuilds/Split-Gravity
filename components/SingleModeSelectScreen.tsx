import { Pressable, Text, View, StyleSheet } from 'react-native';
import type { SinglePlayerMenuMode } from '../types/payments';

type SingleModeSelectScreenProps = {
  onBack: () => void;
  onSelect: (mode: SinglePlayerMenuMode) => void;
};

export const SingleModeSelectScreen = ({ onBack, onSelect }: SingleModeSelectScreenProps) => {
  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none"><View style={styles.splitDiagonal} /></View>
      

      <View className="flex-1 px-6 py-16 z-10">
        <Text 
          className="text-5xl font-black tracking-widest text-white italic"
          style={{ textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 10 }}
        >
          SOLO RUN
        </Text>
        <Text className="mt-3 max-w-sm text-sm leading-5 text-slate-300">
          Choose a free practice run or enter the paid daily distance contest.
        </Text>

        <View className="mt-10 gap-5">
          <Pressable
            onPress={() => onSelect('practice')}
            className="rounded-[28px] bg-slate-800 border border-slate-700 overflow-hidden active:scale-95 transition-transform"
          >
            <View className="px-6 py-6">
              <View className="flex-row items-center gap-3">
                <View className="px-3 py-1 rounded-full bg-slate-700">
                  <Text className="text-xs font-black uppercase tracking-widest text-slate-300">
                    Free
                  </Text>
                </View>
              </View>
              <Text className="mt-4 text-3xl font-black text-white italic tracking-wider">Practice</Text>
              <Text className="mt-2 text-sm leading-5 text-slate-400">
                Instant run. No wallet required. Perfect for warm-up and learning the terrain.
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => onSelect('paid_contest')}
            className="rounded-[28px] bg-orange-500 overflow-hidden active:scale-95 transition-transform"
            style={styles.primaryButton}
          >
            <View className="px-6 py-6 bg-white/10">
              <View className="flex-row items-center gap-3">
                <View className="px-3 py-1 rounded-full bg-orange-900/50 border border-orange-300/30">
                  <Text className="text-xs font-black uppercase tracking-widest text-orange-200">
                    Paid
                  </Text>
                </View>
              </View>
              <Text className="mt-4 text-3xl font-black text-white italic tracking-wider">Daily Contest</Text>
              <Text className="mt-2 text-sm leading-5 text-orange-100/80">
                Pay the entry fee, post your best distance for the UTC day, and compete for the prize pool.
              </Text>
            </View>
          </Pressable>
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
