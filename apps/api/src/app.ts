import cors from '@fastify/cors';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Env } from './config/env.js';
import type { Db } from './db/client.js';
import { ApiError, TooManyRequestsError } from './lib/errors.js';
import type { Clock } from './lib/clock.js';
import type { Mailer } from './lib/mailer.js';
import { LoginRateLimiter } from './lib/login-rate-limiter.js';
import { AuthService } from './modules/auth/auth.service.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { meRoutes } from './modules/me/me.routes.js';
import { authPlugin } from './plugins/auth.js';
import { registerOpenApi } from './openapi/register.js';

export interface AppDeps {
  env: Env;
  clock: Clock;
  pool: pg.Pool;
  db: Db;
  mailer: Mailer;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    genReqId: () => randomUUID(),
    logger: {
      level: deps.env.LOG_LEVEL,
      // 10.4: never log sensitive data (capture text, titles, emails, tokens).
      redact: ['req.headers.authorization'],
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((error: FastifyError | ApiError, request, reply) => {
    if (error instanceof ApiError) {
      if (error instanceof TooManyRequestsError) {
        reply.header('Retry-After', String(error.retryAfterSeconds));
      }
      reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          request_id: request.id,
        },
      });
      return;
    }

    request.log.error({ err: error, requestId: request.id }, 'unhandled error');
    const statusCode = error.statusCode ?? 500;
    const isClientError = statusCode >= 400 && statusCode < 500;
    reply.status(statusCode).send({
      error: {
        code: isClientError ? (error.code ?? 'validation_error') : 'internal_error',
        message: isClientError ? error.message : 'Internal server error',
        details: [],
        request_id: request.id,
      },
    });
  });

  app.register(cors, { origin: false });

  const rateLimiter = new LoginRateLimiter(deps.db, deps.clock);
  const authService = new AuthService(
    deps.db,
    deps.clock,
    deps.env.JWT_ACCESS_SECRET,
    deps.mailer,
    rateLimiter,
  );

  app.register(authPlugin, { authService });

  registerOpenApi(app);

  app.register(async (instance) => {
    await healthRoutes(instance, { clock: deps.clock, pool: deps.pool });
  });

  app.register(
    async (instance) => {
      await authRoutes(instance, { authService });
    },
    { prefix: '/v1' },
  );

  app.register(
    async (instance) => {
      await meRoutes(instance, { db: deps.db, clock: deps.clock, authService });
    },
    { prefix: '/v1' },
  );

  return app;
}
