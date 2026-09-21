import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  listNotificationSettingsResponseSchema,
  updateNotificationSettingsBodySchema,
} from './notification-settings.schemas.js';
import { NotificationSettingsService } from './notification-settings.service.js';

export async function notificationSettingsRoutes(app: FastifyInstance) {
  const instance = app.withTypeProvider<ZodTypeProvider>();

  instance.get(
    '/me/notification-settings',
    {
      preHandler: app.authenticate,
      schema: { response: { 200: listNotificationSettingsResponseSchema } },
    },
    async (request) => {
      const service = new NotificationSettingsService(request.db!);
      return { data: await service.list(request.userId!) };
    },
  );

  instance.patch(
    '/me/notification-settings',
    {
      preHandler: app.authenticate,
      schema: {
        body: updateNotificationSettingsBodySchema,
        response: { 200: listNotificationSettingsResponseSchema },
      },
    },
    async (request) => {
      const service = new NotificationSettingsService(request.db!);
      return { data: await service.update(request.userId!, request.body) };
    },
  );
}
