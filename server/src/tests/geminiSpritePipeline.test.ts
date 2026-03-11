import assert from 'node:assert/strict';
import test from 'node:test';
import { PNG } from 'pngjs';
import {
  buildPrompt,
  buildRetryCorrection,
  detectGridDividerArtifacts,
} from '../modules/character-generation/pipeline/geminiSpritePipeline';

test('buildPrompt requires arcade sprint readability and locked idle baseline', () => {
  const prompt = buildPrompt('robot sprinter', 'prompt');

  assert.match(prompt, /arcade sprint/i);
  assert.match(prompt, /leg interchange/i);
  assert.match(prompt, /arm swing/i);
  assert.match(prompt, /feet stay planted/i);
  assert.match(prompt, /pelvis stays locked/i);
});

test('buildPrompt separates uploaded identity reference from bundled motion guide', () => {
  const prompt = buildPrompt('masked runner', 'image');

  assert.match(prompt, /uploaded character reference image/i);
  assert.match(prompt, /preserve the uploaded character identity/i);
  assert.match(prompt, /separate attached run-cycle reference image/i);
  assert.match(prompt, /motion-only guide/i);
  assert.match(prompt, /do not copy the motion reference character's design/i);
});

test('buildRetryCorrection calls out the stronger run and idle constraints', () => {
  const correction = buildRetryCorrection(
    ['visible run-row arm swing', 'pixel-detected idle pelvis drift'],
    2,
    3
  );

  assert.match(correction, /visible run-row arm swing/i);
  assert.match(correction, /idle pelvis drift/i);
  assert.match(correction, /left\/right leg interchange/i);
  assert.match(correction, /feet planted to one baseline/i);
});

test('detectGridDividerArtifacts flags opaque grid divider lines', () => {
  const png = new PNG({ width: 60, height: 30 });

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const index = (y * png.width + x) * 4;
      png.data[index + 3] = 0;
    }
  }

  for (const x of [10, 20, 30, 40, 50]) {
    for (let y = 0; y < png.height; y += 1) {
      const index = (y * png.width + x) * 4;
      png.data[index] = 0;
      png.data[index + 1] = 0;
      png.data[index + 2] = 0;
      png.data[index + 3] = 255;
    }
  }

  const result = detectGridDividerArtifacts(PNG.sync.write(png));

  assert.equal(result.hasDividerArtifacts, true);
  assert.ok(result.maxVerticalDividerOpacity >= 0.8);
});
