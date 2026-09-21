import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { calendarQuerySchema, calendarResponseSchema } from './calendar.schemas.js';
import { CalendarService } from './calendar.service.js';

export async function calendarRoutes(app: FastifyInstance) {
  const instance = app.withTypeProvider<ZodTypeProvider>();

  instance.get(
    '/calendar',
    {
      preHandler: app.authenticate,
      schema: { querystring: calendarQuerySchema, response: { 200: calendarResponseSchema } },
    },
    async (request) => {
      const service = new CalendarService(request.db!);
      return service.list(request.userId!, request.query);
    },
  );
}
