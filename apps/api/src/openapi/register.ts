import swagger from '@fastify/swagger';
import type { FastifyInstance } from 'fastify';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

// Section 7: "OpenAPI 3.1 generada desde los esquemas Zod es la fuente de
// verdad". Registering @fastify/swagger with fastify-type-provider-zod's
// transform turns every route's Zod schema into the spec automatically —
// nothing here is hand-written per endpoint.
export function registerOpenApi(app: FastifyInstance): void {
  app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Copiloto API',
        version: '0.1.0',
        description: 'Copiloto Personal de Carga Mental — API (ver docs/spec.md, sección 7).',
      },
      servers: [{ url: '/v1' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());
}
