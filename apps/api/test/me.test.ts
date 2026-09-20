import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestApp, createTestApp, truncateAll } from './helpers/app.js';

async function register(
  ctx: Awaited<ReturnType<typeof createTestApp>>,
  email: string,
  password = 'correct-horse-battery',
) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password, accept_terms: true },
  });
  return res.json() as { access_token: string; refresh_token: string };
}

describe('/me and /me/settings', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await truncateAll(ctx.db);
  });

  afterAll(async () => {
    if (ctx) await closeTestApp(ctx);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns and updates the profile', async () => {
    const { access_token } = await register(ctx, 'profile@example.com');

    const get = await ctx.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${access_token}` },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json()).toMatchObject({
      email: 'profile@example.com',
      display_name: null,
      timezone: 'America/Argentina/Buenos_Aires',
    });

    const patch = await ctx.app.inject({
      method: 'PATCH',
      url: '/v1/me',
      headers: { authorization: `Bearer ${access_token}` },
      payload: { display_name: 'Ana', timezone: 'America/Montevideo' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json()).toMatchObject({ display_name: 'Ana', timezone: 'America/Montevideo' });
  });

  it('returns default settings and updates them', async () => {
    const { access_token } = await register(ctx, 'settings@example.com');

    const get = await ctx.app.inject({
      method: 'GET',
      url: '/v1/me/settings',
      headers: { authorization: `Bearer ${access_token}` },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json()).toMatchObject({ daily_summary_enabled: true, max_push_per_day: 6 });

    const patch = await ctx.app.inject({
      method: 'PATCH',
      url: '/v1/me/settings',
      headers: { authorization: `Bearer ${access_token}` },
      payload: { max_push_per_day: 3, daily_summary_time: '08:15' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json()).toMatchObject({ max_push_per_day: 3, daily_summary_time: '08:15:00' });
  });

  it('DELETE /me soft-deletes the account, revokes sessions, and frees the email (ADR-005)', async () => {
    const { access_token, refresh_token } = await register(ctx, 'delete@example.com');

    const del = await ctx.app.inject({
      method: 'DELETE',
      url: '/v1/me',
      headers: { authorization: `Bearer ${access_token}` },
    });
    expect(del.statusCode).toBe(204);

    const getAfterDelete = await ctx.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${access_token}` },
    });
    expect(getAfterDelete.statusCode).toBe(404);

    const refreshAfterDelete = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refresh_token },
    });
    expect(refreshAfterDelete.statusCode).toBe(401);

    const loginAfterDelete = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'delete@example.com', password: 'correct-horse-battery' },
    });
    expect(loginAfterDelete.statusCode).toBe(401);

    const reRegister = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'delete@example.com',
        password: 'another-fresh-password',
        accept_terms: true,
      },
    });
    expect(reRegister.statusCode).toBe(201);
  });
});
