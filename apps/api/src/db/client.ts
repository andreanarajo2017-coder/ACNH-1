import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

export function createDbPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString });
}

// Accepts a Pool (app-wide, no RLS context) or a checked-out PoolClient
// (per-request, RLS-scoped — see src/plugins/auth.ts).
export function createDb(client: pg.Pool | pg.PoolClient) {
  return drizzle(client);
}

export type Db = ReturnType<typeof createDb>;
