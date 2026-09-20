import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { createDb, createDbPool } from '../../src/db/client.js';
import { FixedClock } from '../../src/lib/clock.js';
import type { Mailer } from '../../src/lib/mailer.js';

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://copiloto:copiloto@localhost:5432/copiloto';

let migrated = false;

export class RecordingMailer implements Mailer {
  public sent: { to: string; resetToken: string }[] = [];

  async sendPasswordReset(params: { to: string; resetToken: string }): Promise<void> {
    this.sent.push(params);
  }
}

export async function createTestApp(initialTime = '2026-09-21T09:00:00-03:00') {
  const env = loadEnv({ NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL } as NodeJS.ProcessEnv);
  const pool = createDbPool(env.DATABASE_URL);
  const db = createDb(pool);

  if (!migrated) {
    await migrate(db, { migrationsFolder: './drizzle' });
    migrated = true;
  }

  const clock = new FixedClock(new Date(initialTime));
  const mailer = new RecordingMailer();
  const app = buildApp({ env, clock, pool, db, mailer });
  await app.ready();

  return { app, db, pool, clock, mailer };
}

export async function truncateAll(db: Awaited<ReturnType<typeof createTestApp>>['db']) {
  await db.execute(
    sql`TRUNCATE TABLE users, auth_identities, refresh_tokens, user_settings, categories, login_attempts, password_reset_tokens RESTART IDENTITY CASCADE`,
  );
}

export async function closeTestApp(ctx: {
  app: FastifyInstance;
  pool: Awaited<ReturnType<typeof createTestApp>>['pool'];
}) {
  await ctx.app.close();
  await ctx.pool.end();
}
