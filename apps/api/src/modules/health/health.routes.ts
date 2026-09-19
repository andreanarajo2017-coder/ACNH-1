import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Clock } from '../../lib/clock.js';

export interface HealthDeps {
  clock: Clock;
  pool: pg.Pool;
}

export async function healthRoutes(app: FastifyInstance, deps: HealthDeps) {
  // Liveness: the process is up. No dependency checks.
  app.get('/healthz', async () => {
    return { status: 'ok', time: deps.clock.now().toISOString() };
  });

  // Readiness: the process can serve traffic (its dependencies respond).
  app.get('/readyz', async (_request, reply) => {
    try {
      await deps.pool.query('SELECT 1');
      return { status: 'ok', time: deps.clock.now().toISOString() };
    } catch (err) {
      app.log.error({ err }, 'readiness check failed');
      return reply.status(503).send({ status: 'error' });
    }
  });
}
