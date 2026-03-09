import { PNG } from 'pngjs';
import Jimp from 'jimp-compact';

const MAGENTA: [number, number, number] = [255, 0, 255];
const DEFAULT_THRESHOLD = 85;

export const applyMagentaTransparency = (buffer: Buffer) => {
  const png = PNG.sync.read(buffer);
  const [targetR, targetG, targetB] = MAGENTA;

  for (let index = 0; index < png.data.length; index += 4) {
    const r = png.data[index];
    const g = png.data[index + 1];
    const b = png.data[index + 2];

    const diff = Math.sqrt(
      (r - targetR) ** 2 + (g - targetG) ** 2 + (b - targetB) ** 2
    );

    if (diff < DEFAULT_THRESHOLD) {
      png.data[index + 3] = 0;
    } else if (diff < DEFAULT_THRESHOLD * 1.4) {
      const alpha = Math.max(
        0,
        Math.min(255, ((diff - DEFAULT_THRESHOLD) / (DEFAULT_THRESHOLD * 0.4)) * 255)
      );
      png.data[index + 3] = alpha;
    }
  }

  return PNG.sync.write(png);
};

export const createThumbnail = async (buffer: Buffer) => {
  const image = await Jimp.read(buffer);
  image.contain(256, 256);
  return image.getBufferAsync(Jimp.MIME_PNG);
};
