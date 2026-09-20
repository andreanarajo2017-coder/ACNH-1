import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  authTokensSchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  logoutBodySchema,
  refreshBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
} from './auth.schemas.js';
import type { AuthService } from './auth.service.js';

export interface AuthRoutesDeps {
  authService: AuthService;
}

export async function authRoutes(app: FastifyInstance, deps: AuthRoutesDeps) {
  const instance = app.withTypeProvider<ZodTypeProvider>();

  // AC-F01-01, AC-F01-02
  instance.post(
    '/auth/register',
    { schema: { body: registerBodySchema, response: { 201: authTokensSchema } } },
    async (request, reply) => {
      const { email, password } = request.body;
      const { tokens } = await deps.authService.register(email.toLowerCase(), password);
      reply.status(201).send(tokens);
    },
  );

  // AC-F01-03
  instance.post(
    '/auth/login',
    { schema: { body: loginBodySchema, response: { 200: authTokensSchema } } },
    async (request, reply) => {
      const { email, password } = request.body;
      const tokens = await deps.authService.login(email.toLowerCase(), password, request.ip);
      reply.status(200).send(tokens);
    },
  );

  // AC-F01-04
  instance.post(
    '/auth/refresh',
    { schema: { body: refreshBodySchema, response: { 200: authTokensSchema } } },
    async (request, reply) => {
      const tokens = await deps.authService.refresh(request.body.refresh_token);
      reply.status(200).send(tokens);
    },
  );

  instance.post('/auth/logout', { schema: { body: logoutBodySchema } }, async (request, reply) => {
    await deps.authService.logout(request.body.refresh_token);
    reply.status(204).send();
  });

  instance.post('/auth/logout-all', { preHandler: app.authenticate }, async (request, reply) => {
    await deps.authService.logoutAll(request.userId!);
    reply.status(204).send();
  });

  // AC-F01-05
  instance.post(
    '/auth/password/forgot',
    { schema: { body: forgotPasswordBodySchema } },
    async (request, reply) => {
      await deps.authService.requestPasswordReset(request.body.email.toLowerCase());
      reply.status(202).send();
    },
  );

  instance.post(
    '/auth/password/reset',
    { schema: { body: resetPasswordBodySchema, response: { 204: z.void() } } },
    async (request, reply) => {
      await deps.authService.resetPassword(request.body.token, request.body.new_password);
      reply.status(204).send();
    },
  );
}
