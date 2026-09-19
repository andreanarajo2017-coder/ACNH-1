import cors from '@fastify/cors';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Env } from './config/env.js';
import type { Clock } from './lib/clock.js';
import { healthRoutes } from './modules/health/health.routes.js';

export interface AppDeps {
  env: Env;
  clock: Clock;
  pool: pg.Pool;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    genReqId: () => randomUUID(),
    logger: {
      level: deps.env.LOG_LEVEL,
      // R-10.4: never log sensitive data (capture text, titles, emails, tokens).
      redact: ['req.headers.authorization'],
    },
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ err: error, requestId: request.id }, 'unhandled error');
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({
      error: {
        code: statusCode === 500 ? 'internal_error' : error.code,
        message: statusCode === 500 ? 'Internal server error' : error.message,
        details: [],
        request_id: request.id,
      },
    });
  });

  app.register(cors, { origin: false });

  app.register(async (instance) => {
    await healthRoutes(instance, { clock: deps.clock, pool: deps.pool });
  });

  return app;
}
