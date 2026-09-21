import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Clock } from '../../lib/clock.js';
import {
  createTaskBodySchema,
  listTasksQuerySchema,
  listTasksResponseSchema,
  postponeBodySchema,
  taskIdParamsSchema,
  taskResponseSchema,
  updateTaskBodySchema,
} from './tasks.schemas.js';
import { TasksService } from './tasks.service.js';

export interface TasksRoutesDeps {
  clock: Clock;
}

export async function tasksRoutes(app: FastifyInstance, deps: TasksRoutesDeps) {
  const instance = app.withTypeProvider<ZodTypeProvider>();

  instance.get(
    '/tasks',
    {
      preHandler: app.authenticate,
      schema: { querystring: listTasksQuerySchema, response: { 200: listTasksResponseSchema } },
    },
    async (request) => {
      const service = new TasksService(request.db!, deps.clock);
      return service.list(request.userId!, request.query);
    },
  );

  instance.post(
    '/tasks',
    {
      preHandler: app.authenticate,
      schema: { body: createTaskBodySchema, response: { 201: taskResponseSchema } },
    },
    async (request, reply) => {
      const service = new TasksService(request.db!, deps.clock);
      const task = await service.create(request.userId!, request.body);
      reply.status(201).send(task);
    },
  );

  instance.get(
    '/tasks/:id',
    {
      preHandler: app.authenticate,
      schema: { params: taskIdParamsSchema, response: { 200: taskResponseSchema } },
    },
    async (request) => {
      const service = new TasksService(request.db!, deps.clock);
      return service.get(request.userId!, request.params.id);
    },
  );

  instance.patch(
    '/tasks/:id',
    {
      preHandler: app.authenticate,
      schema: {
        params: taskIdParamsSchema,
        body: updateTaskBodySchema,
        response: { 200: taskResponseSchema },
      },
    },
    async (request) => {
      const service = new TasksService(request.db!, deps.clock);
      return service.update(request.userId!, request.params.id, request.body);
    },
  );

  instance.delete(
    '/tasks/:id',
    {
      preHandler: app.authenticate,
      schema: { params: taskIdParamsSchema, response: { 204: z.void() } },
    },
    async (request, reply) => {
      const service = new TasksService(request.db!, deps.clock);
      await service.delete(request.userId!, request.params.id);
      reply.status(204).send();
    },
  );

  instance.post(
    '/tasks/:id/complete',
    {
      preHandler: app.authenticate,
      schema: { params: taskIdParamsSchema, response: { 200: taskResponseSchema } },
    },
    async (request) => {
      const service = new TasksService(request.db!, deps.clock);
      return service.complete(request.userId!, request.params.id);
    },
  );

  instance.post(
    '/tasks/:id/reopen',
    {
      preHandler: app.authenticate,
      schema: { params: taskIdParamsSchema, response: { 200: taskResponseSchema } },
    },
    async (request) => {
      const service = new TasksService(request.db!, deps.clock);
      return service.reopen(request.userId!, request.params.id);
    },
  );

  instance.post(
    '/tasks/:id/postpone',
    {
      preHandler: app.authenticate,
      schema: {
        params: taskIdParamsSchema,
        body: postponeBodySchema,
        response: { 200: taskResponseSchema },
      },
    },
    async (request) => {
      const service = new TasksService(request.db!, deps.clock);
      return service.postpone(request.userId!, request.params.id, request.body);
    },
  );
}
