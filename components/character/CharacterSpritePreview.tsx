import React, { memo, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Atlas, Canvas, Group, rect, useRSXformBuffer } from '@shopify/react-native-skia';
import type { CharacterId } from '../../shared/characters';
import { getCharacterPresetOrDefault } from '../game/characterSpritePresets';
import { useSkiaImageAsset } from '../game/skiaImageCache';

type CharacterSpritePreviewProps = {
  characterId?: CharacterId;
  size?: number;
  frameIntervalMs?: number;
  backgroundColor?: string;
};

export const CharacterSpritePreview = memo(
  ({
    characterId,
    size = 220,
    frameIntervalMs = 220,
    backgroundColor = '#111827',
  }: CharacterSpritePreviewProps) => {
    const preset = getCharacterPresetOrDefault(characterId);
    const image = useSkiaImageAsset(preset.imageSource);
    const idleFrames = preset.actions.idle;
    const [frameIndex, setFrameIndex] = useState(0);

    useEffect(() => {
      setFrameIndex(0);
    }, [characterId]);

    useEffect(() => {
      const timer = setInterval(() => {
        setFrameIndex((current) => (current + 1) % idleFrames.length);
      }, frameIntervalMs);
      return () => {
        clearInterval(timer);
      };
    }, [frameIntervalMs, idleFrames.length]);

    const frame = idleFrames[frameIndex % idleFrames.length];
    const spriteRect = useMemo(() => {
      const horizontalBleed = Math.max(4, Math.round(frame.width * 0.06));
      const verticalBleed = Math.max(6, Math.round(frame.height * 0.07));

      if (!image) {
        return rect(
          Math.max(0, frame.x - horizontalBleed),
          Math.max(0, frame.y - verticalBleed),
          frame.width + horizontalBleed * 2,
          frame.height + verticalBleed * 2
        );
      }

      const imageWidth = image.width();
      const imageHeight = image.height();
      const x = Math.max(0, frame.x - horizontalBleed);
      const y = Math.max(0, frame.y - verticalBleed);
      const maxWidth = imageWidth - x;
      const maxHeight = imageHeight - y;

      return rect(
        x,
        y,
        Math.min(frame.width + horizontalBleed * 2, maxWidth),
        Math.min(frame.height + verticalBleed * 2, maxHeight)
      );
    }, [frame.height, frame.width, frame.x, frame.y, image]);

    const spriteRects = useMemo(() => [spriteRect], [spriteRect]);

    const transforms = useRSXformBuffer(1, (value) => {
      'worklet';
      const horizontalInset = size * 0.1;
      const topInset = size * 0.11;
      const bottomInset = size * 0.13;
      const availableWidth = size - horizontalInset * 2;
      const availableHeight = size - topInset - bottomInset;
      const scale =
        Math.min(availableWidth / spriteRect.width, availableHeight / spriteRect.height) * 1.01;
      const renderWidth = spriteRect.width * scale;
      const renderHeight = spriteRect.height * scale;
      const x = (size - renderWidth) / 2;
      const y = topInset + (availableHeight - renderHeight) / 2;
      value.set(scale, 0, x, y);
    });

    return (
      <View style={[styles.frame, { width: size, height: size, backgroundColor }]}>
        {!image ? (
          <View pointerEvents="none" style={styles.loadingOverlay}>
            <ActivityIndicator color="#e5e7eb" size="small" />
            <Text style={styles.loadingText}>Loading character…</Text>
          </View>
        ) : null}
        <Canvas style={styles.canvas}>
          {image ? (
            <Group>
              <Atlas image={image} sprites={spriteRects} transforms={transforms} />
            </Group>
          ) : null}
        </Canvas>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  canvas: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
  },
});
