/**
 * Test character generation with a reference image.
 *
 *   REFERENCE_IMAGE_PATH=/path/to/image.png pnpm run scripts:generation-with-reference
 *
 * Uses wallet auth (local-generation) or ACCESS_TOKEN (smoke-style).
 * The backend will use the uploaded image for identity lock and attach its
 * bundled run-cycle motion guide automatically.
 * Requires: server running with Postgres, GEMINI_API_KEY, CHARACTER_GENERATION_ENABLED=1.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createSignInMessageText } from '@solana/wallet-standard-util';
import { Connection, Keypair, Transaction } from '@solana/web3.js';
import nacl from 'tweetnacl';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4100';
const REFERENCE_IMAGE_PATH = process.env.REFERENCE_IMAGE_PATH ?? '';
const USE_WALLET_AUTH = !process.env.ACCESS_TOKEN;
const KEYPAIR_PATH =
  process.env.SOLANA_KEYPAIR_PATH ?? path.join(os.homedir(), '.config/solana/id.json');
const OUTPUT_DIR =
  process.env.GENERATION_OUTPUT_DIR ?? path.join(process.cwd(), '.data', 'generation-output');

const PROMPT =
  'A 2D runner character sprite sheet, pixel art style, full body visible, neutral pose. Match the style and character from the reference image.';

function assetUrlForFetch(url: string): string {
  try {
    const backendOrigin = new URL(BACKEND_URL).origin;
    const u = new URL(url);
    if (u.origin !== backendOrigin) return `${backendOrigin}${u.pathname}${u.search}`;
  } catch {
    /* ignore */
  }
  return url;
}

async function loadKeypair(filePath: string): Promise<Keypair> {
  const secretKey = JSON.parse(await readFile(filePath, 'utf8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

async function getSession(base: string, keypair: Keypair): Promise<string> {
  const walletAddress = keypair.publicKey.toBase58();
  const challengeRes = await fetch(`${base}/auth/wallet/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress }),
  });
  if (!challengeRes.ok) {
    throw new Error(`Challenge failed: ${challengeRes.status} ${await challengeRes.text()}`);
  }
  const challenge = (await challengeRes.json()) as {
    nonce: string;
    signInPayload: Parameters<typeof createSignInMessageText>[0];
  };
  const message = new TextEncoder().encode(createSignInMessageText(challenge.signInPayload));
  const signature = nacl.sign.detached(message, keypair.secretKey);
  const verifyRes = await fetch(`${base}/auth/wallet/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nonce: challenge.nonce,
      signedMessage: Buffer.from(message).toString('base64'),
      signature: Buffer.from(signature).toString('base64'),
    }),
  });
  if (!verifyRes.ok) {
    throw new Error(`Verify failed: ${verifyRes.status} ${await verifyRes.text()}`);
  }
  const session = (await verifyRes.json()) as { accessToken: string };
  return session.accessToken;
}

async function ensurePaymentIntent(
  base: string,
  accessToken: string,
  keypair: Keypair,
  connection: Connection
): Promise<string | undefined> {
  const configRes = await fetch(`${base}/character-generation/config`);
  const config = (await configRes.json()) as { pricing?: { requiresPayment?: boolean } };
  if (!config.pricing?.requiresPayment) return undefined;

  const intentRes = await fetch(`${base}/payments/intents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      tokenId: 'sol',
      entryFeeTierId: 'sol-001',
      purpose: 'character_generation',
    }),
  });
  if (!intentRes.ok) {
    throw new Error(`Create payment intent failed: ${intentRes.status} ${await intentRes.text()}`);
  }
  const intent = (await intentRes.json()) as { paymentIntentId: string };
  const txRes = await fetch(`${base}/payments/intents/${intent.paymentIntentId}/transaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ walletAddress: keypair.publicKey.toBase58() }),
  });
  if (!txRes.ok) {
    throw new Error(`Build transaction failed: ${txRes.status} ${await txRes.text()}`);
  }
  const built = (await txRes.json()) as {
    serializedTransactionBase64: string;
    minContextSlot: number;
  };
  const tx = Transaction.from(Buffer.from(built.serializedTransactionBase64, 'base64'));
  tx.sign(keypair);
  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
    minContextSlot: built.minContextSlot,
  });
  await connection.confirmTransaction(signature, 'confirmed');

  const confirmRes = await fetch(`${base}/payments/intents/${intent.paymentIntentId}/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      transactionSignature: signature,
      walletAddress: keypair.publicKey.toBase58(),
    }),
  });
  if (!confirmRes.ok) {
    throw new Error(`Confirm payment failed: ${confirmRes.status} ${await confirmRes.text()}`);
  }
  return intent.paymentIntentId;
}

async function main() {
  if (!REFERENCE_IMAGE_PATH) {
    console.error('Set REFERENCE_IMAGE_PATH to the path of your reference image.');
    process.exit(1);
  }

  let referenceImageDataUrl: string;
  try {
    const buf = await readFile(REFERENCE_IMAGE_PATH);
    const ext = path.extname(REFERENCE_IMAGE_PATH).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    referenceImageDataUrl = `data:${mime};base64,${buf.toString('base64')}`;
    console.log('Loaded reference image:', REFERENCE_IMAGE_PATH, `(${Math.round(buf.length / 1024)}KB)`);
  } catch (e) {
    console.error('Failed to read reference image:', e);
    process.exit(1);
  }

  const base = BACKEND_URL.replace(/\/$/, '');
  let accessToken: string;
  let keypair: Keypair | undefined;
  let connection: Connection | undefined;

  if (USE_WALLET_AUTH) {
    keypair = await loadKeypair(KEYPAIR_PATH);
    connection = new Connection(
      process.env.SOLANA_RPC_HTTP ?? 'https://api.devnet.solana.com',
      'confirmed'
    );
    accessToken = await getSession(base, keypair);
  } else {
    accessToken = process.env.ACCESS_TOKEN!;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  const configRes = await fetch(`${base}/character-generation/config`);
  if (!configRes.ok) {
    console.error('Config fetch failed:', configRes.status, await configRes.text());
    process.exit(1);
  }
  const config = (await configRes.json()) as {
    enabled?: boolean;
    workerRunning?: boolean;
    pricing?: { requiresPayment?: boolean };
  };
  if (!config.enabled) {
    console.error('Character generation is disabled on the server.');
    process.exit(1);
  }
  if (!config.workerRunning) {
    console.error(
      'Worker is not running. Start server with DB and CHARACTER_GENERATION_ENABLED=1.'
    );
    process.exit(1);
  }

  let paymentIntentId: string | undefined;
  if (config.pricing?.requiresPayment && keypair && connection) {
    paymentIntentId = await ensurePaymentIntent(base, accessToken, keypair, connection);
  }

  const body: {
    prompt: string;
    referenceImageDataUrl: string;
    paymentIntentId?: string;
  } = {
    prompt: PROMPT,
    referenceImageDataUrl,
  };
  if (paymentIntentId) body.paymentIntentId = paymentIntentId;

  console.log('Creating job with identity reference image and bundled motion guide:', PROMPT);
  const createRes = await fetch(`${base}/character-generation/jobs`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!createRes.ok) {
    console.error('Create job failed:', createRes.status, await createRes.text());
    process.exit(1);
  }
  const { job: created } = (await createRes.json()) as { job: { jobId: string; status: string } };
  const jobId = created.jobId;
  console.log('Job created:', jobId, 'status:', created.status);

  const maxWaitMs = 5 * 60 * 1000;
  const pollIntervalMs = 5000;
  const started = Date.now();

  while (Date.now() - started < maxWaitMs) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const getRes = await fetch(`${base}/character-generation/jobs/${jobId}`, { headers });
    if (!getRes.ok) {
      console.error('Get job failed:', getRes.status);
      continue;
    }
    const { job } = (await getRes.json()) as {
      job: {
        status: string;
        failureMessage?: string | null;
        result?: {
          characterId: string;
          versionId: string;
          displayName: string;
          asset?: { sheetUrl: string; thumbnailUrl?: string | null };
        } | null;
      };
    };
    console.log('  Poll:', job.status);
    if (job.status === 'succeeded') {
      const result = job.result;
      if (result?.asset?.sheetUrl) {
        await mkdir(OUTPUT_DIR, { recursive: true });
        const sheetPath = path.join(OUTPUT_DIR, `sprite-${jobId}.png`);
        const thumbPath = path.join(OUTPUT_DIR, `thumb-${jobId}.png`);
        const sheetFetchUrl = assetUrlForFetch(result.asset.sheetUrl);
        const sheetRes = await fetch(sheetFetchUrl);
        if (sheetRes.ok) {
          await writeFile(sheetPath, Buffer.from(await sheetRes.arrayBuffer()));
          console.log('Saved sprite sheet to', sheetPath);
        }
        if (result.asset.thumbnailUrl) {
          const thumbRes = await fetch(assetUrlForFetch(result.asset.thumbnailUrl));
          if (thumbRes.ok) {
            await writeFile(thumbPath, Buffer.from(await thumbRes.arrayBuffer()));
            console.log('Saved thumbnail to', thumbPath);
          }
        }
      }
      console.log('Success. Result:', JSON.stringify(result, null, 2));
      process.exit(0);
    }
    if (job.status === 'failed' || job.status === 'refunded') {
      console.error('Job failed:', job.failureMessage ?? job.status);
      process.exit(1);
    }
  }

  console.error('Timed out waiting for job to complete.');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
