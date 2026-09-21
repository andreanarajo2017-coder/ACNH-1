import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Clock } from '../../lib/clock.js';
import {
  createEventBodySchema,
  eventIdParamsSchema,
  eventResponseSchema,
  listEventsQuerySchema,
  listEventsResponseSchema,
  updateEventBodySchema,
} from './events.schemas.js';
import { EventsService } from './events.service.js';

export interface EventsRoutesDeps {
  clock: Clock;
}

export async function eventsRoutes(app: FastifyInstance, deps: EventsRoutesDeps) {
  const instance = app.withTypeProvider<ZodTypeProvider>();

  instance.get(
    '/events',
    {
      preHandler: app.authenticate,
      schema: { querystring: listEventsQuerySchema, response: { 200: listEventsResponseSchema } },
    },
    async (request) => {
      const service = new EventsService(request.db!, deps.clock);
      return service.list(request.userId!, request.query);
    },
  );

  instance.post(
    '/events',
    {
      preHandler: app.authenticate,
      schema: { body: createEventBodySchema, response: { 201: eventResponseSchema } },
    },
    async (request, reply) => {
      const service = new EventsService(request.db!, deps.clock);
      const event = await service.create(request.userId!, request.body);
      reply.status(201).send(event);
    },
  );

  instance.get(
    '/events/:id',
    {
      preHandler: app.authenticate,
      schema: { params: eventIdParamsSchema, response: { 200: eventResponseSchema } },
    },
    async (request) => {
      const service = new EventsService(request.db!, deps.clock);
      return service.get(request.userId!, request.params.id);
    },
  );

  instance.patch(
    '/events/:id',
    {
      preHandler: app.authenticate,
      schema: {
        params: eventIdParamsSchema,
        body: updateEventBodySchema,
        response: { 200: eventResponseSchema },
      },
    },
    async (request) => {
      const service = new EventsService(request.db!, deps.clock);
      return service.update(request.userId!, request.params.id, request.body);
    },
  );

  instance.delete(
    '/events/:id',
    {
      preHandler: app.authenticate,
      schema: { params: eventIdParamsSchema, response: { 204: z.void() } },
    },
    async (request, reply) => {
      const service = new EventsService(request.db!, deps.clock);
      await service.delete(request.userId!, request.params.id);
      reply.status(204).send();
    },
  );
}
