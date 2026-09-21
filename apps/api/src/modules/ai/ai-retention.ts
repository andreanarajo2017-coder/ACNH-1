import { and, eq, lt } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { aiInteractions } from '../../db/schema.js';

const RETENTION_DAYS = 30;

// 10.5: "limpieza" — D-05's third pg-boss job, alongside reminders and the
// daily summary. Runs per-user (see notification-cycle.ts) since
// ai_interactions has RLS forced, same as every other M4+ domain table.
export async function purgeOldAiInteractions(db: Db, userId: string, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await db
    .delete(aiInteractions)
    .where(and(eq(aiInteractions.userId, userId), lt(aiInteractions.createdAt, cutoff)));
}
