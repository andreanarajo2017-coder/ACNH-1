import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AiRateLimiter } from '../../lib/ai-rate-limiter.js';
import type { Clock } from '../../lib/clock.js';
import type { LlmProvider } from '../../lib/llm/provider.js';
import {
  commitBodySchema,
  commitResponseSchema,
  parseIdParamsSchema,
  parseRequestBodySchema,
  parseResponseSchema,
} from './ai.schemas.js';
import { AiService } from './ai.service.js';

export interface AiRoutesDeps {
  clock: Clock;
  llmProvider: LlmProvider;
  providerName: string;
}

export async function aiRoutes(app: FastifyInstance, deps: AiRoutesDeps) {
  const instance = app.withTypeProvider<ZodTypeProvider>();

  instance.post(
    '/ai/parse',
    {
      preHandler: app.authenticate,
      schema: { body: parseRequestBodySchema, response: { 200: parseResponseSchema } },
    },
    async (request) => {
      const service = new AiService(
        request.db!,
        deps.clock,
        deps.llmProvider,
        deps.providerName,
        new AiRateLimiter(request.db!, deps.clock),
      );
      return service.parse(request.userId!, request.body);
    },
  );

  instance.post(
    '/ai/parse/:parse_id/commit',
    {
      preHandler: app.authenticate,
      schema: {
        params: parseIdParamsSchema,
        body: commitBodySchema,
        response: { 200: commitResponseSchema },
      },
    },
    async (request) => {
      const service = new AiService(
        request.db!,
        deps.clock,
        deps.llmProvider,
        deps.providerName,
        new AiRateLimiter(request.db!, deps.clock),
      );
      return service.commit(request.userId!, request.params.parse_id, request.body);
    },
  );
}
