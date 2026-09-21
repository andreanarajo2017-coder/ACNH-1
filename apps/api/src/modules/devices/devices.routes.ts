import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Clock } from '../../lib/clock.js';
import {
  deviceIdParamsSchema,
  deviceResponseSchema,
  registerDeviceBodySchema,
} from './devices.schemas.js';
import { DevicesService } from './devices.service.js';

export interface DevicesRoutesDeps {
  clock: Clock;
}

export async function devicesRoutes(app: FastifyInstance, deps: DevicesRoutesDeps) {
  const instance = app.withTypeProvider<ZodTypeProvider>();

  instance.post(
    '/devices',
    {
      preHandler: app.authenticate,
      schema: { body: registerDeviceBodySchema, response: { 201: deviceResponseSchema } },
    },
    async (request, reply) => {
      const service = new DevicesService(request.db!, deps.clock);
      const device = await service.register(request.userId!, request.body);
      reply.status(201).send(device);
    },
  );

  instance.delete(
    '/devices/:id',
    {
      preHandler: app.authenticate,
      schema: { params: deviceIdParamsSchema, response: { 204: z.void() } },
    },
    async (request, reply) => {
      const service = new DevicesService(request.db!, deps.clock);
      await service.delete(request.userId!, request.params.id);
      reply.status(204).send();
    },
  );
}
