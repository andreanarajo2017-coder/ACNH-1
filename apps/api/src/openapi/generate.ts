import { writeFile } from 'node:fs/promises';
import { buildApp } from '../app.js';
import { loadEnv } from '../config/env.js';
import { createDb, createDbPool } from '../db/client.js';
import { SystemClock } from '../lib/clock.js';
import { FakeProvider } from '../lib/llm/fake-provider.js';
import { ConsoleMailer } from '../lib/mailer.js';

async function main() {
  const env = loadEnv();
  const pool = createDbPool(env.DATABASE_URL);
  const app = buildApp({
    env,
    clock: new SystemClock(),
    pool,
    db: createDb(pool),
    mailer: new ConsoleMailer(),
    llmProvider: new FakeProvider(),
    llmProviderName: 'fake',
  });

  await app.ready();
  const spec = app.swagger();
  await writeFile('openapi.json', JSON.stringify(spec, null, 2));
  await app.close();
  await pool.end();
  console.log('Wrote openapi.json');
}

main().catch((err) => {
  console.error('Failed to generate OpenAPI spec:', err);
  process.exit(1);
});
