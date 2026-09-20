import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestApp, createTestApp, truncateAll } from './helpers/app.js';

describe('auth: password reset', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await truncateAll(ctx.db);
    ctx.mailer.sent = [];
  });

  afterAll(async () => {
    if (ctx) await closeTestApp(ctx);
  });

  it('AC-F01-05 responds identically (202) whether or not the email exists', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'reset@example.com',
        password: 'correct-horse-battery',
        accept_terms: true,
      },
    });

    const existing = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/password/forgot',
      payload: { email: 'reset@example.com' },
    });
    const missing = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/password/forgot',
      payload: { email: 'nobody@example.com' },
    });

    expect(existing.statusCode).toBe(202);
    expect(missing.statusCode).toBe(202);
    expect(existing.body).toBe(missing.body);

    // Only the existing user actually gets an email.
    expect(ctx.mailer.sent).toHaveLength(1);
    expect(ctx.mailer.sent[0]!.to).toBe('reset@example.com');
  });

  it('resets the password with a valid token and revokes existing sessions', async () => {
    const registered = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'reset2@example.com',
        password: 'correct-horse-battery',
        accept_terms: true,
      },
    });
    const { refresh_token } = registered.json();

    await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/password/forgot',
      payload: { email: 'reset2@example.com' },
    });
    const token = ctx.mailer.sent[0]!.resetToken;

    const reset = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      payload: { token, new_password: 'brand-new-password-1' },
    });
    expect(reset.statusCode).toBe(204);

    const oldSessionRefresh = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refresh_token },
    });
    expect(oldSessionRefresh.statusCode).toBe(401);

    const loginOld = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'reset2@example.com', password: 'correct-horse-battery' },
    });
    expect(loginOld.statusCode).toBe(401);

    const loginNew = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'reset2@example.com', password: 'brand-new-password-1' },
    });
    expect(loginNew.statusCode).toBe(200);
  });

  it('rejects reusing the same reset token twice', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'reset3@example.com',
        password: 'correct-horse-battery',
        accept_terms: true,
      },
    });
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/password/forgot',
      payload: { email: 'reset3@example.com' },
    });
    const token = ctx.mailer.sent[0]!.resetToken;

    const first = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      payload: { token, new_password: 'brand-new-password-1' },
    });
    expect(first.statusCode).toBe(204);

    const second = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      payload: { token, new_password: 'another-password-2' },
    });
    expect(second.statusCode).toBe(400);
  });

  it('rejects an unknown reset token', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      payload: { token: 'not-a-real-token', new_password: 'brand-new-password-1' },
    });
    expect(res.statusCode).toBe(400);
  });
});
