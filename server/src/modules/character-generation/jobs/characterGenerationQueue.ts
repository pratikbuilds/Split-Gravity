import PgBoss from 'pg-boss';
import { env } from '../../../config/env';

const QUEUE_NAME = 'character-generation';

export class CharacterGenerationQueue {
  private boss: PgBoss | null = null;
  private started = false;

  private getBoss() {
    if (!this.boss) {
      this.boss = new PgBoss({ connectionString: env.DATABASE_URL });
    }

    return this.boss;
  }

  async start(handler: (jobId: string) => Promise<void>) {
    if (this.started) return;

    const boss = this.getBoss();
    await boss.start();
    await boss.work<{ jobId?: string }>(QUEUE_NAME, async (jobs) => {
      const [job] = jobs;
      const jobId = String(job?.data?.jobId ?? '');
      if (!jobId) return;
      await handler(jobId);
    });
    this.started = true;
  }

  async enqueue(jobId: string) {
    await this.getBoss().send(QUEUE_NAME, { jobId });
  }
}
