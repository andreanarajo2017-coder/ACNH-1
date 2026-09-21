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
import { ApiError, TooManyRequestsError, ValidationError } from './lib/errors.js';
import type { Clock } from './lib/clock.js';
import type { LlmProvider } from './lib/llm/provider.js';
import type { Mailer } from './lib/mailer.js';
import { LoginRateLimiter } from './lib/login-rate-limiter.js';
import { aiRoutes } from './modules/ai/ai.routes.js';
import { AuthService } from './modules/auth/auth.service.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { calendarRoutes } from './modules/calendar/calendar.routes.js';
import { categoriesRoutes } from './modules/categories/categories.routes.js';
import { eventsRoutes } from './modules/events/events.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { inboxRoutes } from './modules/inbox/inbox.routes.js';
import { meRoutes } from './modules/me/me.routes.js';
import { peopleRoutes } from './modules/people/people.routes.js';
import { remindersRoutes } from './modules/reminders/reminders.routes.js';
import { tasksRoutes } from './modules/tasks/tasks.routes.js';
import { authPlugin } from './plugins/auth.js';
import { registerOpenApi } from './openapi/register.js';

export interface AppDeps {
  env: Env;
  clock: Clock;
  pool: pg.Pool;
  db: Db;
  mailer: Mailer;
  llmProvider: LlmProvider;
  llmProviderName: string;
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

    // Postgres check_violation (e.g. tasks' due_date XOR due_at, events'
    // start_at/all_day — section 6) surfaces as a business-rule error, not
    // a 500: the request was well-formed JSON but violates a data rule.
    if ('code' in error && error.code === '23514') {
      const businessRuleError = new ValidationError('The request violates a data rule.');
      reply.status(businessRuleError.statusCode).send({
        error: {
          code: businessRuleError.code,
          message: businessRuleError.message,
          details: [],
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

  // Release the per-request RLS-scoped client (see plugins/auth.ts) once the
  // response has been sent, whether the request succeeded or errored.
  app.addHook('onResponse', async (request) => {
    if (request.dbClient) {
      try {
        await request.dbClient.query('RESET app.user_id');
      } finally {
        request.dbClient.release();
      }
    }
  });

  const rateLimiter = new LoginRateLimiter(deps.db, deps.clock);
  const authService = new AuthService(
    deps.db,
    deps.clock,
    deps.env.JWT_ACCESS_SECRET,
    deps.mailer,
    rateLimiter,
  );

  app.register(authPlugin, { authService, pool: deps.pool });

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

  app.register(
    async (instance) => {
      await peopleRoutes(instance, { clock: deps.clock });
      await categoriesRoutes(instance, { clock: deps.clock });
      await tasksRoutes(instance, { clock: deps.clock });
      await eventsRoutes(instance, { clock: deps.clock });
      await inboxRoutes(instance, { clock: deps.clock });
      await remindersRoutes(instance, { clock: deps.clock });
      await calendarRoutes(instance);
      await aiRoutes(instance, {
        clock: deps.clock,
        llmProvider: deps.llmProvider,
        providerName: deps.llmProviderName,
      });
    },
    { prefix: '/v1' },
  );

  return app;
}
