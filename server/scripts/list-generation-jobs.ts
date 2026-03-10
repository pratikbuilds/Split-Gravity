/**
 * One-off script to list character generation jobs (all statuses).
 * Run from server dir: pnpm run scripts:jobs
 */
import { desc } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { characterGenerationJobs } from '../src/db/schema';

async function main() {
  const jobs = await db
    .select({
      id: characterGenerationJobs.id,
      status: characterGenerationJobs.status,
      playerId: characterGenerationJobs.playerId,
      displayName: characterGenerationJobs.displayName,
      createdAt: characterGenerationJobs.createdAt,
      startedAt: characterGenerationJobs.startedAt,
      completedAt: characterGenerationJobs.completedAt,
      failureMessage: characterGenerationJobs.failureMessage,
    })
    .from(characterGenerationJobs)
    .orderBy(desc(characterGenerationJobs.createdAt))
    .limit(50);

  if (jobs.length === 0) {
    console.log('No character generation jobs found.');
    return;
  }

  console.log('Recent character generation jobs (newest first):\n');
  for (const j of jobs) {
    console.log(
      [
        j.id,
        j.status.padEnd(10),
        j.displayName ?? '(no name)',
        j.createdAt.toISOString(),
        j.startedAt?.toISOString() ?? '-',
        j.completedAt?.toISOString() ?? '-',
        j.failureMessage ? `err: ${j.failureMessage.slice(0, 40)}` : '',
      ].join('  ')
    );
  }
  const queued = jobs.filter((j) => j.status === 'queued').length;
  const running = jobs.filter((j) => j.status === 'running').length;
  if (queued > 0 || running > 0) {
    console.log(`\nQueued: ${queued}, Running: ${running}. If worker is not running, start the server with CHARACTER_GENERATION_ENABLED=1 and a reachable DATABASE_URL.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
