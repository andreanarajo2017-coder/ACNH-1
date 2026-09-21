import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Clock } from '../../lib/clock.js';
import {
  createInboxItemBodySchema,
  inboxItemIdParamsSchema,
  inboxItemResponseSchema,
  listInboxQuerySchema,
  listInboxResponseSchema,
  updateInboxItemBodySchema,
} from './inbox.schemas.js';
import { InboxService } from './inbox.service.js';

export interface InboxRoutesDeps {
  clock: Clock;
}

export async function inboxRoutes(app: FastifyInstance, deps: InboxRoutesDeps) {
  const instance = app.withTypeProvider<ZodTypeProvider>();

  instance.get(
    '/inbox',
    {
      preHandler: app.authenticate,
      schema: { querystring: listInboxQuerySchema, response: { 200: listInboxResponseSchema } },
    },
    async (request) => {
      const service = new InboxService(request.db!, deps.clock);
      return service.list(request.userId!, request.query);
    },
  );

  instance.post(
    '/inbox',
    {
      preHandler: app.authenticate,
      schema: { body: createInboxItemBodySchema, response: { 201: inboxItemResponseSchema } },
    },
    async (request, reply) => {
      const service = new InboxService(request.db!, deps.clock);
      const item = await service.create(request.userId!, request.body);
      reply.status(201).send(item);
    },
  );

  instance.patch(
    '/inbox/:id',
    {
      preHandler: app.authenticate,
      schema: {
        params: inboxItemIdParamsSchema,
        body: updateInboxItemBodySchema,
        response: { 200: inboxItemResponseSchema },
      },
    },
    async (request) => {
      const service = new InboxService(request.db!, deps.clock);
      return service.update(request.userId!, request.params.id, request.body);
    },
  );

  instance.delete(
    '/inbox/:id',
    {
      preHandler: app.authenticate,
      schema: { params: inboxItemIdParamsSchema, response: { 204: z.void() } },
    },
    async (request, reply) => {
      const service = new InboxService(request.db!, deps.clock);
      await service.delete(request.userId!, request.params.id);
      reply.status(204).send();
    },
  );
}
