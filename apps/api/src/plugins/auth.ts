import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthService } from '../modules/auth/auth.service.js';
import { UnauthorizedError } from '../lib/errors.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    userId?: string;
  }
}

export interface AuthPluginOptions {
  authService: AuthService;
}

const plugin: FastifyPluginAsync<AuthPluginOptions> = async (app, opts) => {
  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing bearer token.');
    }
    const token = header.slice('Bearer '.length);
    const { userId } = opts.authService.verifyAccessToken(token);
    request.userId = userId;
  });
};

export const authPlugin = fp(plugin, { name: 'auth-plugin' });
