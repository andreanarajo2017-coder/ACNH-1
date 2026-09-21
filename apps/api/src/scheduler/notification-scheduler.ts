import { PgBoss } from 'pg-boss';
import type pg from 'pg';
import type { Clock } from '../lib/clock.js';
import { runNotificationCycle } from '../modules/notifications/notification-cycle.js';
import type { PushProvider } from '../lib/push/provider.js';

const CYCLE_QUEUE = 'notification-cycle';

// D-05: pg-boss over Postgres, no Redis — one recurring minute-tick job
// drives reminders, the daily summary, and the ai_interactions retention
// purge (see notification-cycle.ts). The cron itself only matters in
// production; tests call runNotificationCycle directly with a FixedClock
// instead of waiting on this (CLAUDE.md's M6 exit criterion).
export async function startNotificationScheduler(
  databaseUrl: string,
  pool: pg.Pool,
  clock: Clock,
  pushProvider: PushProvider,
): Promise<PgBoss> {
  const boss = new PgBoss(databaseUrl);
  boss.on('error', (err: Error) => console.error('pg-boss error', err));

  await boss.start();
  await boss.createQueue(CYCLE_QUEUE);
  await boss.schedule(CYCLE_QUEUE, '* * * * *', {}, { tz: 'UTC' });
  await boss.work(CYCLE_QUEUE, async () => {
    await runNotificationCycle(pool, clock, pushProvider);
  });

  return boss;
}
