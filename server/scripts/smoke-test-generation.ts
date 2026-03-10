/**
 * Smoke test: create one character generation job and poll until it completes.
 * Use against a running server (local or Railway) to confirm the backend returns a generation.
 *
 *   BACKEND_URL=http://localhost:4100 ACCESS_TOKEN=<bearer-token> pnpm run scripts:smoke-generation
 *
 * Get ACCESS_TOKEN by signing in via the app and copying the Bearer token from a backend request (network tab).
 */

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4100';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN ?? '';

const DEFAULT_PROMPT =
  'A simple 2D runner character, pixel art style, full body visible, neutral pose.';

async function main() {
  if (!ACCESS_TOKEN) {
    console.error('Set ACCESS_TOKEN (e.g. sign in via app, copy Bearer token from network tab).');
    process.exit(1);
  }

  const base = BACKEND_URL.replace(/\/$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ACCESS_TOKEN}`,
  };

  // Check config and worker status
  const configRes = await fetch(`${base}/character-generation/config`);
  if (!configRes.ok) {
    console.error('Config fetch failed:', configRes.status, await configRes.text());
    process.exit(1);
  }
  const config = (await configRes.json()) as { enabled?: boolean; workerRunning?: boolean };
  if (!config.enabled) {
    console.error('Character generation is disabled on the server.');
    process.exit(1);
  }
  if (!config.workerRunning) {
    console.error(
      'Worker is not running — jobs will stay queued. Fix DB/env and restart the server.'
    );
    process.exit(1);
  }

  console.log('Creating job with prompt:', DEFAULT_PROMPT);
  const createRes = await fetch(`${base}/character-generation/jobs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt: DEFAULT_PROMPT }),
  });
  if (!createRes.ok) {
    const body = await createRes.text();
    console.error('Create job failed:', createRes.status, body);
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
        result?: { characterId: string; versionId: string; displayName: string } | null;
      };
    };
    console.log('  Poll:', job.status);
    if (job.status === 'succeeded') {
      console.log('Success. Result:', job.result ?? 'no result object');
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

main();
