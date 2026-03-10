import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPrompt,
  buildRetryCorrection,
} from '../modules/character-generation/pipeline/geminiSpritePipeline';

test('buildPrompt requires arcade sprint readability and locked idle baseline', () => {
  const prompt = buildPrompt('robot sprinter', 'prompt');

  assert.match(prompt, /arcade sprint/i);
  assert.match(prompt, /leg interchange/i);
  assert.match(prompt, /arm swing/i);
  assert.match(prompt, /feet stay planted/i);
  assert.match(prompt, /pelvis stays locked/i);
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
