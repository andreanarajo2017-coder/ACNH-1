import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Clock } from '../../lib/clock.js';
import {
  createReminderBodySchema,
  listRemindersQuerySchema,
  listRemindersResponseSchema,
  reminderIdParamsSchema,
  reminderResponseSchema,
  updateReminderBodySchema,
} from './reminders.schemas.js';
import { RemindersService } from './reminders.service.js';

export interface RemindersRoutesDeps {
  clock: Clock;
}

export async function remindersRoutes(app: FastifyInstance, deps: RemindersRoutesDeps) {
  const instance = app.withTypeProvider<ZodTypeProvider>();

  instance.get(
    '/reminders',
    {
      preHandler: app.authenticate,
      schema: {
        querystring: listRemindersQuerySchema,
        response: { 200: listRemindersResponseSchema },
      },
    },
    async (request) => {
      const service = new RemindersService(request.db!, deps.clock);
      return service.list(request.userId!, request.query);
    },
  );

  instance.post(
    '/reminders',
    {
      preHandler: app.authenticate,
      schema: { body: createReminderBodySchema, response: { 201: reminderResponseSchema } },
    },
    async (request, reply) => {
      const service = new RemindersService(request.db!, deps.clock);
      const reminder = await service.create(request.userId!, request.body);
      reply.status(201).send(reminder);
    },
  );

  instance.patch(
    '/reminders/:id',
    {
      preHandler: app.authenticate,
      schema: {
        params: reminderIdParamsSchema,
        body: updateReminderBodySchema,
        response: { 200: reminderResponseSchema },
      },
    },
    async (request) => {
      const service = new RemindersService(request.db!, deps.clock);
      return service.update(request.userId!, request.params.id, request.body);
    },
  );

  instance.delete(
    '/reminders/:id',
    {
      preHandler: app.authenticate,
      schema: { params: reminderIdParamsSchema, response: { 204: z.void() } },
    },
    async (request, reply) => {
      const service = new RemindersService(request.db!, deps.clock);
      await service.delete(request.userId!, request.params.id);
      reply.status(204).send();
    },
  );
}
