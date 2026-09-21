import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Clock } from '../../lib/clock.js';
import { paginationQuerySchema } from '../../lib/pagination.js';
import {
  categoryIdParamsSchema,
  categoryResponseSchema,
  createCategoryBodySchema,
  listCategoriesResponseSchema,
  updateCategoryBodySchema,
} from './categories.schemas.js';
import { CategoriesService } from './categories.service.js';

export interface CategoriesRoutesDeps {
  clock: Clock;
}

export async function categoriesRoutes(app: FastifyInstance, deps: CategoriesRoutesDeps) {
  const instance = app.withTypeProvider<ZodTypeProvider>();

  instance.get(
    '/categories',
    {
      preHandler: app.authenticate,
      schema: {
        querystring: paginationQuerySchema,
        response: { 200: listCategoriesResponseSchema },
      },
    },
    async (request) => {
      const service = new CategoriesService(request.db!, deps.clock);
      return service.list(request.userId!, request.query);
    },
  );

  instance.post(
    '/categories',
    {
      preHandler: app.authenticate,
      schema: { body: createCategoryBodySchema, response: { 201: categoryResponseSchema } },
    },
    async (request, reply) => {
      const service = new CategoriesService(request.db!, deps.clock);
      const category = await service.create(request.userId!, request.body);
      reply.status(201).send(category);
    },
  );

  instance.patch(
    '/categories/:id',
    {
      preHandler: app.authenticate,
      schema: {
        params: categoryIdParamsSchema,
        body: updateCategoryBodySchema,
        response: { 200: categoryResponseSchema },
      },
    },
    async (request) => {
      const service = new CategoriesService(request.db!, deps.clock);
      return service.update(request.userId!, request.params.id, request.body);
    },
  );

  instance.delete(
    '/categories/:id',
    {
      preHandler: app.authenticate,
      schema: { params: categoryIdParamsSchema, response: { 204: z.void() } },
    },
    async (request, reply) => {
      const service = new CategoriesService(request.db!, deps.clock);
      await service.delete(request.userId!, request.params.id);
      reply.status(204).send();
    },
  );
}
