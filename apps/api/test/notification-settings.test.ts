import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestApp, createTestApp, truncateAll } from './helpers/app.js';

describe('notification type settings (F16)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let token: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    if (ctx) await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await truncateAll(ctx.db);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'perfil@example.com',
        password: 'correct-horse-battery',
        accept_terms: true,
      },
    });
    token = res.json().access_token;
  });

  it('AC-F16-seed: registration seeds all 6 types with F16 defaults (contextual_recommendation off)', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/v1/me/notification-settings',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data as { type: string; enabled: boolean }[];
    expect(data).toHaveLength(6);
    const byType = Object.fromEntries(data.map((d) => [d.type, d.enabled]));
    expect(byType).toEqual({
      reminder: true,
      upcoming_event: true,
      overdue_task: true,
      daily_summary: true,
      conflict_alert: true,
      contextual_recommendation: false,
    });
  });

  it('AC-F16-03: turning a type off persists and is reflected on the next read', async () => {
    const patch = await ctx.app.inject({
      method: 'PATCH',
      url: '/v1/me/notification-settings',
      headers: { authorization: `Bearer ${token}` },
      payload: { settings: [{ type: 'overdue_task', enabled: false }] },
    });
    expect(patch.statusCode).toBe(200);

    const get = await ctx.app.inject({
      method: 'GET',
      url: '/v1/me/notification-settings',
      headers: { authorization: `Bearer ${token}` },
    });
    const data = get.json().data as { type: string; enabled: boolean }[];
    expect(data.find((d) => d.type === 'overdue_task')?.enabled).toBe(false);
    expect(data.find((d) => d.type === 'reminder')?.enabled).toBe(true);
  });
});
