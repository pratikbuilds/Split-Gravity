import { PNG } from 'pngjs';
import Jimp from 'jimp-compact';

const MAGENTA: [number, number, number] = [255, 0, 255];
const DEFAULT_THRESHOLD = 85;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const colorDistance = (
  r: number,
  g: number,
  b: number,
  target: [number, number, number]
) => Math.sqrt((r - target[0]) ** 2 + (g - target[1]) ** 2 + (b - target[2]) ** 2);

const averageColor = (
  data: Buffer,
  samples: number[],
  fallback: [number, number, number]
): [number, number, number] => {
  if (samples.length === 0) return fallback;

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;

  for (const offset of samples) {
    totalR += data[offset];
    totalG += data[offset + 1];
    totalB += data[offset + 2];
  }

  return [
    Math.round(totalR / samples.length),
    Math.round(totalG / samples.length),
    Math.round(totalB / samples.length),
  ];
};

const detectBackgroundColor = (
  data: Buffer,
  width: number,
  height: number,
  targetColor: [number, number, number]
): [number, number, number] => {
  const candidateBuckets = new Map<string, number[]>();
  const insetX = Math.max(1, Math.floor(width * 0.02));
  const insetY = Math.max(1, Math.floor(height * 0.02));
  const candidatePoints = [
    [insetX, insetY],
    [width - 1 - insetX, insetY],
    [insetX, height - 1 - insetY],
    [width - 1 - insetX, height - 1 - insetY],
    [Math.floor(width / 2), insetY],
    [Math.floor(width / 2), height - 1 - insetY],
    [insetX, Math.floor(height / 2)],
    [width - 1 - insetX, Math.floor(height / 2)],
  ];

  for (const [x, y] of candidatePoints) {
    const offset = (y * width + x) * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const bucketKey = [
      Math.round(r / 16) * 16,
      Math.round(g / 16) * 16,
      Math.round(b / 16) * 16,
    ].join(',');
    const bucket = candidateBuckets.get(bucketKey);
    if (bucket) {
      bucket.push(offset);
    } else {
      candidateBuckets.set(bucketKey, [offset]);
    }
  }

  const dominantBucket = [...candidateBuckets.values()].sort((a, b) => b.length - a.length)[0];
  if (!dominantBucket || dominantBucket.length === 0) {
    return targetColor;
  }

  const detected = averageColor(data, dominantBucket, targetColor);
  const isCloseToTarget = colorDistance(detected[0], detected[1], detected[2], targetColor) <= 120;
  return isCloseToTarget || dominantBucket.length >= 3 ? detected : targetColor;
};

export const removeKeyedBackground = (
  buffer: Buffer,
  targetColor: [number, number, number] = MAGENTA,
  threshold = DEFAULT_THRESHOLD
) => {
  const png = PNG.sync.read(buffer);
  const detectedBackground = detectBackgroundColor(png.data, png.width, png.height, targetColor);
  const hardCutoff = threshold * 0.9;
  const softCutoff = threshold * 1.9;

  for (let index = 0; index < png.data.length; index += 4) {
    const r = png.data[index];
    const g = png.data[index + 1];
    const b = png.data[index + 2];
    const diff = colorDistance(r, g, b, detectedBackground);

    if (diff <= hardCutoff) {
      png.data[index] = 0;
      png.data[index + 1] = 0;
      png.data[index + 2] = 0;
      png.data[index + 3] = 0;
      continue;
    }

    if (diff >= softCutoff) continue;

    const alphaRatio = clamp((diff - hardCutoff) / (softCutoff - hardCutoff), 0, 1);
    const restoredR = clamp(
      (r - detectedBackground[0] * (1 - alphaRatio)) / alphaRatio,
      0,
      255
    );
    const restoredG = clamp(
      (g - detectedBackground[1] * (1 - alphaRatio)) / alphaRatio,
      0,
      255
    );
    const restoredB = clamp(
      (b - detectedBackground[2] * (1 - alphaRatio)) / alphaRatio,
      0,
      255
    );

    png.data[index] = Math.round(restoredR);
    png.data[index + 1] = Math.round(restoredG);
    png.data[index + 2] = Math.round(restoredB);
    png.data[index + 3] = Math.round(alphaRatio * 255);
  }

  for (let index = 0; index < png.data.length; index += 4) {
    const alpha = png.data[index + 3];
    if (alpha === 0 || alpha === 255) continue;

    const r = png.data[index];
    const g = png.data[index + 1];
    const b = png.data[index + 2];
    const spillAmount = Math.max(0, Math.min(r, b) - g);

    if (spillAmount > 0) {
      png.data[index] = clamp(r - spillAmount, 0, 255);
      png.data[index + 2] = clamp(b - spillAmount, 0, 255);
    }
  }

  return PNG.sync.write(png);
};

export const createThumbnail = async (buffer: Buffer) => {
  const image = await Jimp.read(buffer);
  image.contain(256, 256);
  return image.getBufferAsync(Jimp.MIME_PNG);
};
