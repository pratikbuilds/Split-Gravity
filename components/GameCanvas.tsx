import React, { useEffect, useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Canvas, Fill, matchFont, Text as SkiaText } from '@shopify/react-native-skia';

type GameCanvasProps = {
  onExit?: () => void;
};

const fontFamily = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });
const fontStyle = { fontFamily, fontSize: 24, fontWeight: 'bold' as const };

export const GameCanvas = ({ onExit }: GameCanvasProps) => {
  const { width, height } = useWindowDimensions();

  const font = useMemo(() => matchFont(fontStyle), []);

  const textLayout = useMemo(() => {
    if (!font || width <= 0 || height <= 0) return null;
    const text = 'Game';
    const textWidth = font.measureText(text).width;
    return {
      x: (width - textWidth) / 2,
      y: height / 2 + fontStyle.fontSize / 2,
    };
  }, [font, width, height]);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => {
      ScreenOrientation.unlockAsync();
    };
  }, []);

  return (
    <View style={[styles.container, { width, height }]}>
      <Canvas style={styles.canvas}>
        <Fill color="#add8e6" />
        {font && textLayout && (
          <SkiaText
            x={textLayout.x}
            y={textLayout.y}
            text="Game"
            font={font}
            color="#1a1a1a"
          />
        )}
      </Canvas>
      {onExit && (
        <View style={styles.exitWrapper}>
          <Pressable onPress={onExit} style={styles.exitButton}>
            <Text style={styles.exitText}>EXIT</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#add8e6',
  },
  canvas: {
    flex: 1,
  },
  exitWrapper: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitButton: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  exitText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2b2b2b',
    letterSpacing: 2,
  },
});
