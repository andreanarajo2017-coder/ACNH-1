import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Clock } from '../../lib/clock.js';
import { paginationQuerySchema } from '../../lib/pagination.js';
import {
  createPersonBodySchema,
  listPeopleResponseSchema,
  personIdParamsSchema,
  personResponseSchema,
  updatePersonBodySchema,
} from './people.schemas.js';
import { PeopleService } from './people.service.js';

export interface PeopleRoutesDeps {
  clock: Clock;
}

export async function peopleRoutes(app: FastifyInstance, deps: PeopleRoutesDeps) {
  const instance = app.withTypeProvider<ZodTypeProvider>();

  instance.get(
    '/people',
    {
      preHandler: app.authenticate,
      schema: { querystring: paginationQuerySchema, response: { 200: listPeopleResponseSchema } },
    },
    async (request) => {
      const service = new PeopleService(request.db!, deps.clock);
      return service.list(request.userId!, request.query);
    },
  );

  instance.post(
    '/people',
    {
      preHandler: app.authenticate,
      schema: { body: createPersonBodySchema, response: { 201: personResponseSchema } },
    },
    async (request, reply) => {
      const service = new PeopleService(request.db!, deps.clock);
      const person = await service.create(request.userId!, request.body);
      reply.status(201).send(person);
    },
  );

  instance.get(
    '/people/:id',
    {
      preHandler: app.authenticate,
      schema: { params: personIdParamsSchema, response: { 200: personResponseSchema } },
    },
    async (request) => {
      const service = new PeopleService(request.db!, deps.clock);
      return service.get(request.userId!, request.params.id);
    },
  );

  instance.patch(
    '/people/:id',
    {
      preHandler: app.authenticate,
      schema: {
        params: personIdParamsSchema,
        body: updatePersonBodySchema,
        response: { 200: personResponseSchema },
      },
    },
    async (request) => {
      const service = new PeopleService(request.db!, deps.clock);
      return service.update(request.userId!, request.params.id, request.body);
    },
  );

  instance.delete(
    '/people/:id',
    {
      preHandler: app.authenticate,
      schema: { params: personIdParamsSchema, response: { 204: z.void() } },
    },
    async (request, reply) => {
      const service = new PeopleService(request.db!, deps.clock);
      await service.delete(request.userId!, request.params.id);
      reply.status(204).send();
    },
  );
}
