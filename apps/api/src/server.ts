import 'dotenv/config';
import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createDb, createDbPool } from './db/client.js';
import { SystemClock } from './lib/clock.js';
import { AnthropicProvider } from './lib/llm/anthropic-provider.js';
import { FakeProvider } from './lib/llm/fake-provider.js';
import { ConsoleMailer } from './lib/mailer.js';
import { FakePushProvider } from './lib/push/fake-provider.js';
import { FirebasePushProvider } from './lib/push/firebase-provider.js';
import { startNotificationScheduler } from './scheduler/notification-scheduler.js';

async function main() {
  const env = loadEnv();
  const pool = createDbPool(env.DATABASE_URL);

  // D-04: FakeProvider is a dev-only fallback when no key is configured —
  // never in production (ADR: a prod deploy without a real LLM is a
  // config error, not a silent downgrade to canned responses).
  const llmProviderName = env.ANTHROPIC_API_KEY ? 'anthropic' : 'fake';
  if (!env.ANTHROPIC_API_KEY && env.NODE_ENV === 'production') {
    throw new Error('ANTHROPIC_API_KEY is required in production (D-04).');
  }
  const llmProvider = env.ANTHROPIC_API_KEY
    ? new AnthropicProvider(env.ANTHROPIC_API_KEY)
    : new FakeProvider();

  // D-06: same dev-fallback rule as D-04's LlmProvider — never fall back to
  // FakePushProvider in production.
  if (!env.FCM_SERVICE_ACCOUNT_JSON && env.NODE_ENV === 'production') {
    throw new Error('FCM_SERVICE_ACCOUNT_JSON is required in production (D-06).');
  }
  const pushProvider = env.FCM_SERVICE_ACCOUNT_JSON
    ? new FirebasePushProvider(env.FCM_SERVICE_ACCOUNT_JSON)
    : new FakePushProvider();

  const clock = new SystemClock();
  const app = buildApp({
    env,
    clock,
    pool,
    db: createDb(pool),
    mailer: new ConsoleMailer(),
    llmProvider,
    llmProviderName,
    pushProvider,
  });

  const boss = await startNotificationScheduler(env.DATABASE_URL, pool, clock, pushProvider);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await boss.stop();
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
