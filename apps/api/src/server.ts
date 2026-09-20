import 'dotenv/config';
import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createDb, createDbPool } from './db/client.js';
import { SystemClock } from './lib/clock.js';
import { ConsoleMailer } from './lib/mailer.js';

async function main() {
  const env = loadEnv();
  const pool = createDbPool(env.DATABASE_URL);
  const app = buildApp({
    env,
    clock: new SystemClock(),
    pool,
    db: createDb(pool),
    mailer: new ConsoleMailer(),
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
