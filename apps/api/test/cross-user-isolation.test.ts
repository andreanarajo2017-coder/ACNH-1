import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, createTestApp, truncateAll } from './helpers/app.js';

type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

// M2 exit criterion (CLAUDE.md): every domain resource must 404 — never
// 200/403 — when a different authenticated user tries to read, edit, or
// delete it (R-13). RLS (ADR-007) is the backstop; the app-layer
// `WHERE user_id = ...` filter in each service is the primary defense —
// this test exercises the whole stack through real HTTP requests, not RLS
// in isolation.
describe('cross-user resource isolation (R-13)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let tokenA: string;
  let tokenB: string;
  let categoryId: string;
  let personId: string;
  let taskId: string;
  let eventId: string;
  let inboxItemId: string;
  let reminderId: string;

  function request(
    method: ApiMethod,
    url: string,
    token: string,
    payload?: Record<string, unknown>,
  ) {
    return ctx.app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      ...(payload ? { payload } : {}),
    });
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    await truncateAll(ctx.db);

    const register = async (email: string) => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: { email, password: 'correct-horse-battery', accept_terms: true },
      });
      return res.json().access_token as string;
    };
    tokenA = await register('owner-a@example.com');
    tokenB = await register('owner-b@example.com');

    const category = await request('POST', '/v1/categories', tokenA, { name: 'Trabajo A' });
    categoryId = category.json().id;

    const person = await request('POST', '/v1/people', tokenA, {
      name: 'Mateo',
      relationship: 'child',
    });
    personId = person.json().id;

    const task = await request('POST', '/v1/tasks', tokenA, {
      title: 'Tarea de A',
      person_id: personId,
      category_id: categoryId,
    });
    taskId = task.json().id;

    const event = await request('POST', '/v1/events', tokenA, {
      title: 'Evento de A',
      start_at: '2026-09-24T17:00:00-03:00',
      person_id: personId,
    });
    eventId = event.json().id;

    const inboxItem = await request('POST', '/v1/inbox', tokenA, {
      raw_text: 'texto privado de A',
    });
    inboxItemId = inboxItem.json().id;

    const reminder = await request('POST', '/v1/reminders', tokenA, {
      target_type: 'event',
      target_id: eventId,
      trigger_type: 'absolute',
      trigger_at: '2026-09-24T16:30:00-03:00',
    });
    reminderId = reminder.json().id;
  });

  afterAll(async () => {
    if (ctx) await closeTestApp(ctx);
  });

  it.each([
    ['GET', () => `/v1/people/${personId}`, undefined],
    ['PATCH', () => `/v1/people/${personId}`, { name: 'Hacked' }],
    ['DELETE', () => `/v1/people/${personId}`, undefined],
    ['PATCH', () => `/v1/categories/${categoryId}`, { name: 'Hacked' }],
    ['DELETE', () => `/v1/categories/${categoryId}`, undefined],
    ['GET', () => `/v1/tasks/${taskId}`, undefined],
    ['PATCH', () => `/v1/tasks/${taskId}`, { title: 'Hacked' }],
    ['DELETE', () => `/v1/tasks/${taskId}`, undefined],
    ['POST', () => `/v1/tasks/${taskId}/complete`, undefined],
    ['POST', () => `/v1/tasks/${taskId}/reopen`, undefined],
    ['POST', () => `/v1/tasks/${taskId}/postpone`, { preset: 'tomorrow' }],
    ['GET', () => `/v1/events/${eventId}`, undefined],
    ['PATCH', () => `/v1/events/${eventId}`, { title: 'Hacked' }],
    ['DELETE', () => `/v1/events/${eventId}`, undefined],
    ['PATCH', () => `/v1/inbox/${inboxItemId}`, { status: 'discarded' }],
    ['DELETE', () => `/v1/inbox/${inboxItemId}`, undefined],
    ['PATCH', () => `/v1/reminders/${reminderId}`, { status: 'dismissed' }],
    ['DELETE', () => `/v1/reminders/${reminderId}`, undefined],
  ] as [ApiMethod, () => string, Record<string, unknown> | undefined][])(
    '%s %s as a different user returns 404, never 200/403',
    async (method, urlFn, payload) => {
      const res = await request(method, urlFn(), tokenB, payload);
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('not_found');
    },
  );

  it('the owning user can still read/act on their own resources (sanity check)', async () => {
    const person = await request('GET', `/v1/people/${personId}`, tokenA);
    expect(person.statusCode).toBe(200);

    const task = await request('GET', `/v1/tasks/${taskId}`, tokenA);
    expect(task.statusCode).toBe(200);

    const event = await request('GET', `/v1/events/${eventId}`, tokenA);
    expect(event.statusCode).toBe(200);
  });

  it("user B's own list endpoints never include user A's rows", async () => {
    const people = await request('GET', '/v1/people', tokenB);
    expect(people.json().data).toHaveLength(0);

    const tasks = await request('GET', '/v1/tasks', tokenB);
    expect(tasks.json().data).toHaveLength(0);

    const events = await request('GET', '/v1/events', tokenB);
    expect(events.json().data).toHaveLength(0);

    const inbox = await request('GET', '/v1/inbox', tokenB);
    expect(inbox.json().data).toHaveLength(0);

    const reminders = await request('GET', '/v1/reminders', tokenB);
    expect(reminders.json().data).toHaveLength(0);

    // B has their own 9 seeded categories, but none of A's.
    const categories = await request('GET', '/v1/categories?limit=100', tokenB);
    const names: string[] = categories.json().data.map((c: { name: string }) => c.name);
    expect(names).not.toContain('Trabajo A');
    expect(categories.json().data).toHaveLength(9);
  });
});
