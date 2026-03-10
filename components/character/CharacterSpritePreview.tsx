import React, { memo, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Atlas, Canvas, Group, rect, useRSXformBuffer } from '@shopify/react-native-skia';
import type { CharacterId } from '../../shared/characters';
import { getCharacterPresetOrDefault } from '../game/characterSpritePresets';
import { useSkiaImageAsset } from '../game/skiaImageCache';

type CharacterSpritePreviewProps = {
  characterId?: CharacterId;
  sheetUrl?: string | null;
  size?: number;
  frameIntervalMs?: number;
  backgroundColor?: string;
  previewMode?: 'default' | 'jobCard';
};

export const CharacterSpritePreview = memo(
  ({
    characterId,
    sheetUrl,
    size = 220,
    frameIntervalMs = 220,
    backgroundColor = '#111827',
    previewMode = 'default',
  }: CharacterSpritePreviewProps) => {
    const preset = getCharacterPresetOrDefault(characterId);
    const image = useSkiaImageAsset(sheetUrl ?? preset.imageSource);
    const [frameIndex, setFrameIndex] = useState(0);

    useEffect(() => {
      setFrameIndex(0);
    }, [characterId, sheetUrl]);

    const idleFrames = useMemo(() => {
      if (!sheetUrl || !image) {
        return preset.actions.idle;
      }

      const cellWidth = Math.floor(image.width() / 6);
      const cellHeight = Math.floor(image.height() / 3);
      return Array.from({ length: 6 }, (_, index) =>
        rect(index * cellWidth, cellHeight * 2, cellWidth, cellHeight)
      );
    }, [image, preset.actions.idle, sheetUrl]);

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

    const previewRect = useMemo(() => {
      if (previewMode !== 'jobCard') {
        return spriteRect;
      }

      const portraitWidth = spriteRect.width * 0.78;
      const portraitHeight = spriteRect.height * 0.52;
      const portraitX = spriteRect.x + (spriteRect.width - portraitWidth) / 2;

      return rect(portraitX, spriteRect.y, portraitWidth, portraitHeight);
    }, [previewMode, spriteRect]);

    const spriteRects = useMemo(() => [previewRect], [previewRect]);

    const transforms = useRSXformBuffer(1, (value) => {
      'worklet';
      const isJobCard = previewMode === 'jobCard';
      const horizontalInset = size * (isJobCard ? 0.08 : 0.1);
      const topInset = size * (isJobCard ? 0.05 : 0.11);
      const bottomInset = size * (isJobCard ? 0.06 : 0.13);
      const availableWidth = size - horizontalInset * 2;
      const availableHeight = size - topInset - bottomInset;
      const scaleMultiplier = isJobCard ? 1.08 : 1.01;
      const scale =
        Math.min(availableWidth / previewRect.width, availableHeight / previewRect.height) *
        scaleMultiplier;
      const renderWidth = previewRect.width * scale;
      const renderHeight = previewRect.height * scale;
      const x = (size - renderWidth) / 2;
      const verticalBias = isJobCard ? -size * 0.02 : 0;
      const y = topInset + (availableHeight - renderHeight) / 2 + verticalBias;
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
