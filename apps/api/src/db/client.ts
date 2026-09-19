import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

export function createDbPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString });
}

export function createDb(pool: pg.Pool) {
  return drizzle(pool);
}

export type Db = ReturnType<typeof createDb>;
