import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestApp, createTestApp, truncateAll } from './helpers/app.js';

async function register(ctx: Awaited<ReturnType<typeof createTestApp>>, email: string) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'correct-horse-battery', accept_terms: true },
  });
  return res.json() as { access_token: string; refresh_token: string };
}

describe('auth: refresh token rotation', () => {
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

  it('rotates the refresh token on use', async () => {
    const { refresh_token } = await register(ctx, 'rotate@example.com');

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refresh_token },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.refresh_token).not.toBe(refresh_token);
  });

  it('AC-F01-04 revokes the whole family on reuse of an already-rotated token', async () => {
    const { refresh_token: original } = await register(ctx, 'reuse@example.com');

    const first = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refresh_token: original },
    });
    expect(first.statusCode).toBe(200);
    const rotated = first.json().refresh_token as string;

    // Reusing the original (already-rotated) token is reuse -> 401 + family revoked.
    const reuse = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refresh_token: original },
    });
    expect(reuse.statusCode).toBe(401);

    // The legitimately-rotated token is now also dead, because the whole family was burned.
    const afterReuse = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refresh_token: rotated },
    });
    expect(afterReuse.statusCode).toBe(401);
  });

  it('rejects an unknown refresh token', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refresh_token: 'not-a-real-token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('logout revokes the token; logout-all revokes every session for the user', async () => {
    const { refresh_token } = await register(ctx, 'logout@example.com');

    const logout = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      payload: { refresh_token },
    });
    expect(logout.statusCode).toBe(204);

    const afterLogout = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refresh_token },
    });
    expect(afterLogout.statusCode).toBe(401);

    const login = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'logout@example.com', password: 'correct-horse-battery' },
    });
    const { access_token: access2, refresh_token: refresh2 } = login.json();

    const logoutAll = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/logout-all',
      headers: { authorization: `Bearer ${access2}` },
    });
    expect(logoutAll.statusCode).toBe(204);

    const afterLogoutAll = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refresh_token: refresh2 },
    });
    expect(afterLogoutAll.statusCode).toBe(401);
  });
});
