import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestApp, createTestApp, truncateAll } from './helpers/app.js';

describe('auth: register & login', () => {
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

  it('AC-F01-01 registers a new user with default categories and returns tokens', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'ana@example.com', password: 'correct-horse-battery', accept_terms: true },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.access_token).toBeTypeOf('string');
    expect(body.refresh_token).toBeTypeOf('string');
    expect(body.expires_in).toBe(900);

    const me = await ctx.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${body.access_token}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe('ana@example.com');

    const categories = await ctx.db.execute(
      sql`SELECT name FROM categories WHERE user_id = ${me.json().id}`,
    );
    expect(categories.rows).toHaveLength(9);
  });

  it('AC-F01-02 rejects a duplicate email with 409 email_taken', async () => {
    const payload = {
      email: 'dup@example.com',
      password: 'correct-horse-battery',
      accept_terms: true,
    };
    const first = await ctx.app.inject({ method: 'POST', url: '/v1/auth/register', payload });
    expect(first.statusCode).toBe(201);

    const second = await ctx.app.inject({ method: 'POST', url: '/v1/auth/register', payload });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('email_taken');
  });

  it('registration is case-insensitive on email (citext)', async () => {
    const first = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'Case@Example.com', password: 'correct-horse-battery', accept_terms: true },
    });
    expect(first.statusCode).toBe(201);

    const second = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'case@example.com', password: 'correct-horse-battery', accept_terms: true },
    });
    expect(second.statusCode).toBe(409);
  });

  it('rejects passwords shorter than 10 characters', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'weak@example.com', password: 'short', accept_terms: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects registration without accepting terms', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'noterms@example.com', password: 'correct-horse-battery' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('logs in with correct credentials and rejects wrong ones with 401', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'login@example.com',
        password: 'correct-horse-battery',
        accept_terms: true,
      },
    });

    const wrong = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'login@example.com', password: 'nope-nope-nope' },
    });
    expect(wrong.statusCode).toBe(401);

    const right = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'login@example.com', password: 'correct-horse-battery' },
    });
    expect(right.statusCode).toBe(200);
    expect(right.json().access_token).toBeTypeOf('string');
  });

  it('AC-F01-03 returns 429 with Retry-After after 5 failed logins in the window', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'ratelimit@example.com',
        password: 'correct-horse-battery',
        accept_terms: true,
      },
    });

    for (let i = 0; i < 5; i++) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email: 'ratelimit@example.com', password: 'wrong-password' },
      });
      expect(res.statusCode).toBe(401);
    }

    const sixth = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'ratelimit@example.com', password: 'wrong-password' },
    });
    expect(sixth.statusCode).toBe(429);
    expect(Number(sixth.headers['retry-after'])).toBeGreaterThan(0);

    // A correct password is also blocked while rate-limited.
    const correctButBlocked = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'ratelimit@example.com', password: 'correct-horse-battery' },
    });
    expect(correctButBlocked.statusCode).toBe(429);
  });

  it('does not rate-limit a different IP for the same email', async () => {
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'perip@example.com',
        password: 'correct-horse-battery',
        accept_terms: true,
      },
    });

    for (let i = 0; i < 5; i++) {
      await ctx.app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email: 'perip@example.com', password: 'wrong-password' },
        remoteAddress: '10.0.0.1',
      });
    }

    const fromOtherIp = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'perip@example.com', password: 'correct-horse-battery' },
      remoteAddress: '10.0.0.2',
    });
    expect(fromOtherIp.statusCode).toBe(200);
  });
});
