import assert from 'node:assert/strict';
import test from 'node:test';
import { PNG } from 'pngjs';
import { removeKeyedBackground } from '../modules/character-generation/pipeline/imageProcessing';

type PngImage = InstanceType<typeof PNG>;

const readPixel = (png: PngImage, x: number, y: number) => {
  const index = (y * png.width + x) * 4;
  return {
    r: png.data[index],
    g: png.data[index + 1],
    b: png.data[index + 2],
    a: png.data[index + 3],
  };
};

test('removeKeyedBackground clears keyed magenta backgrounds and despills semi-transparent edges', () => {
  const png = new PNG({ width: 4, height: 4 });

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const index = (y * png.width + x) * 4;
      png.data[index] = 255;
      png.data[index + 1] = 0;
      png.data[index + 2] = 255;
      png.data[index + 3] = 255;
    }
  }

  const subjectIndex = (1 * png.width + 1) * 4;
  png.data[subjectIndex] = 160;
  png.data[subjectIndex + 1] = 100;
  png.data[subjectIndex + 2] = 160;
  png.data[subjectIndex + 3] = 255;

  const processed = PNG.sync.read(removeKeyedBackground(PNG.sync.write(png), [255, 0, 255], 120));
  const background = readPixel(processed, 0, 0);
  const edge = readPixel(processed, 1, 1);

  assert.equal(background.a, 0);
  assert.ok(edge.a > 0 && edge.a < 255);
  assert.ok(edge.g > edge.r);
  assert.ok(edge.g > edge.b);
});

test('removeKeyedBackground detects and clears flat non-magenta backgrounds', () => {
  const png = new PNG({ width: 4, height: 4 });

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const index = (y * png.width + x) * 4;
      png.data[index] = 255;
      png.data[index + 1] = 255;
      png.data[index + 2] = 255;
      png.data[index + 3] = 255;
    }
  }

  const subjectIndex = (2 * png.width + 2) * 4;
  png.data[subjectIndex] = 255;
  png.data[subjectIndex + 1] = 210;
  png.data[subjectIndex + 2] = 0;
  png.data[subjectIndex + 3] = 255;

  const processed = PNG.sync.read(removeKeyedBackground(PNG.sync.write(png)));
  const background = readPixel(processed, 0, 0);
  const subject = readPixel(processed, 2, 2);

  assert.equal(background.a, 0);
  assert.equal(subject.a, 255);
});
