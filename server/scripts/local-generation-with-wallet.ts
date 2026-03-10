/**
 * Run character generation locally: wallet auth (devnet keypair) + optional payment + create job + poll.
 * Uses ~/.config/solana/id.json (or SOLANA_KEYPAIR_PATH) and SOLANA_RPC_HTTP for payment when required.
 *
 * Requires: server running with Postgres (worker starts only when DB is reachable) and GEMINI_API_KEY set.
 *
 *   cd server && pnpm run dev   # in one terminal (with Postgres up)
 *   pnpm run scripts:local-generation
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createSignInMessageText } from '@solana/wallet-standard-util';
import { Connection, Keypair, Transaction } from '@solana/web3.js';
import nacl from 'tweetnacl';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4100';
const SOLANA_RPC = process.env.SOLANA_RPC_HTTP ?? 'https://api.devnet.solana.com';

/** When running against localhost, asset URLs may point at SERVER_PUBLIC_BASE_URL (e.g. LAN IP). Rewrite to BACKEND_URL so fetch works. */
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
const KEYPAIR_PATH =
  process.env.SOLANA_KEYPAIR_PATH ?? path.join(os.homedir(), '.config/solana/id.json');
const OUTPUT_DIR = process.env.GENERATION_OUTPUT_DIR ?? path.join(process.cwd(), '.data', 'generation-output');

const DEFAULT_PROMPT =
  'A simple 2D runner character, pixel art style, full body visible, neutral pose.';

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
  const paymentIntentId = intent.paymentIntentId;

  const txRes = await fetch(`${base}/payments/intents/${paymentIntentId}/transaction`, {
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
  const built = (await txRes.json()) as { serializedTransactionBase64: string; minContextSlot: number };
  const tx = Transaction.from(Buffer.from(built.serializedTransactionBase64, 'base64'));
  tx.sign(keypair);
  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
    minContextSlot: built.minContextSlot,
  });
  await connection.confirmTransaction(signature, 'confirmed');

  const confirmRes = await fetch(`${base}/payments/intents/${paymentIntentId}/confirm`, {
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
  return paymentIntentId;
}

async function main() {
  const base = BACKEND_URL.replace(/\/$/, '');

  console.log('Loading keypair from', KEYPAIR_PATH);
  const keypair = await loadKeypair(KEYPAIR_PATH);
  const connection = new Connection(SOLANA_RPC, 'confirmed');

  console.log('Getting session (wallet auth)...');
  const accessToken = await getSession(base, keypair);
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
      'Worker is not running — jobs will stay queued. Start server with DB and CHARACTER_GENERATION_ENABLED=1.'
    );
    process.exit(1);
  }

  let paymentIntentId: string | undefined;
  if (config.pricing?.requiresPayment) {
    console.log('Payment required — creating and confirming payment intent on devnet...');
    paymentIntentId = await ensurePaymentIntent(base, accessToken, keypair, connection);
    console.log('Payment confirmed.');
  }

  const body: { prompt: string; paymentIntentId?: string } = { prompt: DEFAULT_PROMPT };
  if (paymentIntentId) body.paymentIntentId = paymentIntentId;

  console.log('Creating job with prompt:', DEFAULT_PROMPT);
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
      console.log('Success. Result:', result ?? 'no result object');
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
