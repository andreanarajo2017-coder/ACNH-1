import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadEnv } from '../config/env.js';
import { createDb, createDbPool } from './client.js';

async function main() {
  const env = loadEnv();
  const pool = createDbPool(env.DATABASE_URL);
  const db = createDb(pool);
  await migrate(db, { migrationsFolder: './drizzle' });
  await pool.end();
  console.log('Migrations applied.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
