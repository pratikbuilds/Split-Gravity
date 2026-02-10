#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_RETRIES = 3;
const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const API_BASE_URL = 'https://api.elevenlabs.io/v1';
const SOUND_GENERATION_ENDPOINT = `${API_BASE_URL}/sound-generation?output_format=pcm_44100`;
const SAMPLE_RATE = 44100;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const promptsFile = path.resolve(scriptDir, 'sfx-prompts.json');
const force = process.argv.includes('--force');

function isRetryable(error, statusCode) {
  if (typeof statusCode === 'number') {
    return RETRYABLE_STATUS_CODES.has(statusCode);
  }
  return (
    error instanceof TypeError ||
    (typeof error?.code === 'string' &&
      ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND'].includes(error.code))
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestSfx({ apiKey, prompt, durationSeconds }) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    let response;
    try {
      response = await fetch(SOUND_GENERATION_ENDPOINT, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          Accept: 'application/octet-stream',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: prompt,
          duration_seconds: durationSeconds,
        }),
      });

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }

      const errorText = await response.text();
      const status = response.status;
      const error = new Error(`HTTP ${status}: ${errorText || 'Request failed'}`);
      if (!isRetryable(error, status) || attempt === MAX_RETRIES) {
        throw error;
      }
      const backoffMs = 500 * 2 ** (attempt - 1);
      console.warn(`  Retry ${attempt}/${MAX_RETRIES} after ${status} (${backoffMs}ms)`);
      await wait(backoffMs);
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === MAX_RETRIES) {
        throw error;
      }
      const backoffMs = 500 * 2 ** (attempt - 1);
      console.warn(`  Retry ${attempt}/${MAX_RETRIES} after network error (${backoffMs}ms)`);
      await wait(backoffMs);
    }
  }
  throw lastError ?? new Error('Unknown sound generation error');
}

function pcm16leToWavBuffer(pcmBuffer) {
  if (pcmBuffer.length === 0) {
    throw new Error('Received empty PCM payload from ElevenLabs');
  }
  const alignedPcm =
    pcmBuffer.length % 2 === 0 ? pcmBuffer : Buffer.concat([pcmBuffer, Buffer.from([0x00])]);
  const byteRate = (SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE) / 8;
  const blockAlign = (CHANNELS * BITS_PER_SAMPLE) / 8;
  const dataSize = alignedPcm.length;
  const fileSize = 36 + dataSize;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, alignedPcm]);
}

function validatePrompt(entry) {
  const requiredStringFields = ['id', 'prompt', 'output_path'];
  for (const field of requiredStringFields) {
    if (!entry?.[field] || typeof entry[field] !== 'string') {
      throw new Error(`Prompt entry is missing required string field "${field}"`);
    }
  }
  if (typeof entry.duration_seconds !== 'number' || entry.duration_seconds <= 0) {
    throw new Error(`Prompt "${entry.id}" has invalid "duration_seconds"`);
  }
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('Missing ELEVENLABS_API_KEY. Export it before running this script.');
    process.exit(1);
  }

  const promptsRaw = await readFile(promptsFile, 'utf8');
  const prompts = JSON.parse(promptsRaw);
  if (!Array.isArray(prompts) || prompts.length === 0) {
    throw new Error('No prompts found in scripts/sfx-prompts.json');
  }

  console.log(`Generating ${prompts.length} SFX (${force ? 'force overwrite' : 'skip existing'})`);
  const failures = [];
  let createdCount = 0;
  let skippedCount = 0;

  for (const entry of prompts) {
    try {
      validatePrompt(entry);
      const destination = path.resolve(projectRoot, entry.output_path);
      if (!destination.startsWith(projectRoot)) {
        throw new Error(`Output path resolves outside project root: ${entry.output_path}`);
      }

      await mkdir(path.dirname(destination), { recursive: true });
      const fileAlreadyExists = await exists(destination);
      if (fileAlreadyExists && !force) {
        skippedCount += 1;
        console.log(`- ${entry.id}: skipped (${entry.output_path} already exists)`);
        continue;
      }

      console.log(`- ${entry.id}: generating...`);
      const pcm = await requestSfx({
        apiKey,
        prompt: entry.prompt,
        durationSeconds: entry.duration_seconds,
      });
      const wav = pcm16leToWavBuffer(pcm);
      await writeFile(destination, wav);
      createdCount += 1;
      console.log(`  saved ${entry.output_path}`);
    } catch (error) {
      failures.push({ id: entry?.id ?? 'unknown', error });
      console.error(`  failed ${entry?.id ?? 'unknown'}: ${error.message}`);
    }
  }

  console.log(`Done. created=${createdCount}, skipped=${skippedCount}, failed=${failures.length}`);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Fatal: ${error.message}`);
  process.exit(1);
});
