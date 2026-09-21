import { isNull } from 'drizzle-orm';
import type pg from 'pg';
import { createDb } from '../../db/client.js';
import { users } from '../../db/schema.js';
import type { Clock } from '../../lib/clock.js';
import type { PushProvider } from '../../lib/push/provider.js';
import { purgeOldAiInteractions } from '../ai/ai-retention.js';
import { NotificationService } from './notification.service.js';

/**
 * Cross-user driver: `reminders`/`notification_log`/etc. have RLS forced
 * (ADR-007), so — same as every request — each user's slice runs on a
 * connection with `app.user_id` set, not the app-wide pool. With no
 * privileged "process every user" role, this iterates active users and
 * scopes a connection per user, same as `plugins/auth.ts`/`queryAsUser`
 * (test/helpers/app.ts). Fine at this app's scale; ADR-018 documents the
 * simpler alternative to a superuser/bypass-RLS role.
 */
export async function runNotificationCycle(
  pool: pg.Pool,
  clock: Clock,
  pushProvider: PushProvider,
): Promise<void> {
  const appDb = createDb(pool);
  const now = clock.now();
  const activeUsers = await appDb
    .select({ id: users.id, timezone: users.timezone })
    .from(users)
    .where(isNull(users.deletedAt));

  for (const user of activeUsers) {
    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('app.user_id', $1, false)", [user.id]);
      const scopedDb = createDb(client);
      const service = new NotificationService(scopedDb, clock, pushProvider);
      await service.runForUser(user.id, user.timezone, now);
      await purgeOldAiInteractions(scopedDb, user.id, now);
    } finally {
      await client.query('RESET app.user_id');
      client.release();
    }
  }
}
