import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Db } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import type { AuthService } from '../auth/auth.service.js';
import {
  meResponseSchema,
  settingsResponseSchema,
  updateMeBodySchema,
  updateSettingsBodySchema,
} from './me.schemas.js';
import { MeService } from './me.service.js';

export interface MeRoutesDeps {
  db: Db;
  clock: Clock;
  authService: AuthService;
}

export async function meRoutes(app: FastifyInstance, deps: MeRoutesDeps) {
  const instance = app.withTypeProvider<ZodTypeProvider>();
  const meService = new MeService(deps.db, deps.clock, deps.authService);

  instance.get(
    '/me',
    { preHandler: app.authenticate, schema: { response: { 200: meResponseSchema } } },
    async (request) => meService.getMe(request.userId!),
  );

  instance.patch(
    '/me',
    {
      preHandler: app.authenticate,
      schema: { body: updateMeBodySchema, response: { 200: meResponseSchema } },
    },
    async (request) => meService.updateMe(request.userId!, request.body),
  );

  instance.delete('/me', { preHandler: app.authenticate }, async (request, reply) => {
    await meService.deleteAccount(request.userId!);
    reply.status(204).send();
  });

  instance.get(
    '/me/settings',
    { preHandler: app.authenticate, schema: { response: { 200: settingsResponseSchema } } },
    async (request) => meService.getSettings(request.userId!),
  );

  instance.patch(
    '/me/settings',
    {
      preHandler: app.authenticate,
      schema: { body: updateSettingsBodySchema, response: { 200: settingsResponseSchema } },
    },
    async (request) => meService.updateSettings(request.userId!, request.body),
  );
}
