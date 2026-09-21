import 'dotenv/config';
import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createDb, createDbPool } from './db/client.js';
import { SystemClock } from './lib/clock.js';
import { AnthropicProvider } from './lib/llm/anthropic-provider.js';
import { FakeProvider } from './lib/llm/fake-provider.js';
import { ConsoleMailer } from './lib/mailer.js';

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

  const app = buildApp({
    env,
    clock: new SystemClock(),
    pool,
    db: createDb(pool),
    mailer: new ConsoleMailer(),
    llmProvider,
    llmProviderName,
  });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
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
