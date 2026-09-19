import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { FixedClock } from '../src/lib/clock.js';

describe('health routes', () => {
  let app: FastifyInstance;
  const fakePool = { query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) };

  beforeAll(async () => {
    const env = loadEnv({ NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    app = buildApp({
      env,
      clock: new FixedClock(new Date('2026-09-19T09:00:00-03:00')),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pool: fakePool as any,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC-M0-01 GET /healthz returns ok without touching dependencies', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', time: '2026-09-19T12:00:00.000Z' });
    expect(fakePool.query).not.toHaveBeenCalled();
  });

  it('AC-M0-02 GET /readyz returns ok when the database responds', async () => {
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('AC-M0-03 GET /readyz returns 503 when the database is unreachable', async () => {
    fakePool.query.mockRejectedValueOnce(new Error('connection refused'));
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(503);
  });
});
