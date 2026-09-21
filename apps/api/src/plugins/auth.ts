import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { createDb, type Db } from '../db/client.js';
import { UnauthorizedError } from '../lib/errors.js';
import type { AuthService } from '../modules/auth/auth.service.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    userId?: string;
    // RLS-scoped connection (section 6): a dedicated pooled client with
    // `app.user_id` set for this request's duration. Domain modules (M2+)
    // query through this instead of the app-wide pool-backed `db`, so a
    // missing `WHERE user_id = ...` clause is still caught by Postgres.
    // Released by the onResponse hook in app.ts.
    db?: Db;
    dbClient?: pg.PoolClient;
  }
}

export interface AuthPluginOptions {
  authService: AuthService;
  pool: pg.Pool;
}

const plugin: FastifyPluginAsync<AuthPluginOptions> = async (app, opts) => {
  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing bearer token.');
    }
    const token = header.slice('Bearer '.length);
    const { userId } = opts.authService.verifyAccessToken(token);
    request.userId = userId;

    const client = await opts.pool.connect();
    try {
      // `SET app.user_id = $1` isn't valid Postgres syntax (SET doesn't take
      // bind parameters); set_config() is the parameterized equivalent.
      // is_local=false: this setting lives for the connection's checkout
      // duration (the whole request), reset in app.ts's onResponse hook.
      await client.query("SELECT set_config('app.user_id', $1, false)", [userId]);
    } catch (err) {
      client.release();
      throw err;
    }
    request.dbClient = client;
    request.db = createDb(client);
  });
};

export const authPlugin = fp(plugin, { name: 'auth-plugin' });
