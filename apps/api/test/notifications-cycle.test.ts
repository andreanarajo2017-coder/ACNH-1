import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestApp, createTestApp, truncateAll } from './helpers/app.js';
import { runNotificationCycle } from '../src/modules/notifications/notification-cycle.js';
import type { FakePushProvider } from '../src/lib/push/fake-provider.js';

// F13/F16 — all with a FixedClock (CLAUDE.md's M6 exit criterion): every
// "due at X" assertion moves the clock forward and re-runs the cycle
// instead of waiting on real time or pg-boss's cron.
describe('notification cycle (F13/F16)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let token: string;
  let pushProvider: FakePushProvider;

  beforeAll(async () => {
    ctx = await createTestApp('2026-09-24T12:00:00-03:00');
    pushProvider = ctx.pushProvider as FakePushProvider;
  });

  afterAll(async () => {
    if (ctx) await closeTestApp(ctx);
  });

  async function registerWithDevice(email: string) {
    const reg = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: 'correct-horse-battery', accept_terms: true },
    });
    const t = reg.json().access_token as string;
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/devices',
      headers: { authorization: `Bearer ${t}` },
      payload: { platform: 'android', push_token: `tok-${email}` },
    });
    // The daily summary defaults to on at 07:30 local — every scenario
    // below runs well after that, so it would otherwise show up in
    // `pushProvider.sent` alongside the thing under test.
    await ctx.app.inject({
      method: 'PATCH',
      url: '/v1/me/notification-settings',
      headers: { authorization: `Bearer ${t}` },
      payload: { settings: [{ type: 'daily_summary', enabled: false }] },
    });
    return t;
  }

  beforeEach(async () => {
    await truncateAll(ctx.db);
    ctx.clock.set(new Date('2026-09-24T12:00:00-03:00'));
    pushProvider.sent = [];
  });

  it('AC-F13-01: an event at 17:00 with the 30-min default fires at 16:30 local', async () => {
    token = await registerWithDevice('f13-01@example.com');
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Reunión', start_at: '2026-09-24T17:00:00-03:00' },
    });

    ctx.clock.set(new Date('2026-09-24T16:29:00-03:00'));
    await runNotificationCycle(ctx.pool, ctx.clock, ctx.pushProvider);
    expect(pushProvider.sent).toHaveLength(0);

    ctx.clock.set(new Date('2026-09-24T16:30:00-03:00'));
    await runNotificationCycle(ctx.pool, ctx.clock, ctx.pushProvider);
    expect(pushProvider.sent).toHaveLength(1);
    expect(pushProvider.sent[0]!.message).toMatchObject({
      title: 'Evento próximo',
      body: 'Reunión',
    });
  });

  it('AC-F13-02: editing the event time reprograms the reminder; deleting cancels it', async () => {
    token = await registerWithDevice('f13-02@example.com');
    const event = await ctx.app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Reunión', start_at: '2026-09-24T17:00:00-03:00' },
    });
    const eventId = event.json().id as string;

    await ctx.app.inject({
      method: 'PATCH',
      url: `/v1/events/${eventId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { start_at: '2026-09-24T18:00:00-03:00' },
    });

    // The old 16:30 trigger no longer applies — nothing fires there.
    ctx.clock.set(new Date('2026-09-24T16:30:00-03:00'));
    await runNotificationCycle(ctx.pool, ctx.clock, ctx.pushProvider);
    expect(pushProvider.sent).toHaveLength(0);

    // The new 17:30 trigger (30 min before the rescheduled 18:00) does.
    ctx.clock.set(new Date('2026-09-24T17:30:00-03:00'));
    await runNotificationCycle(ctx.pool, ctx.clock, ctx.pushProvider);
    expect(pushProvider.sent).toHaveLength(1);

    // A second event, deleted before its trigger — never fires.
    pushProvider.sent = [];
    const event2 = await ctx.app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Cancelado', start_at: '2026-09-24T20:00:00-03:00' },
    });
    await ctx.app.inject({
      method: 'DELETE',
      url: `/v1/events/${event2.json().id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    ctx.clock.set(new Date('2026-09-24T19:30:00-03:00'));
    await runNotificationCycle(ctx.pool, ctx.clock, ctx.pushProvider);
    expect(pushProvider.sent).toHaveLength(0);
  });

  it('AC-F13-03: a reminder is never sent twice (idempotent across cycles)', async () => {
    token = await registerWithDevice('f13-03@example.com');
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Llamar al banco', due_at: '2026-09-24T15:00:00-03:00' },
    });

    ctx.clock.set(new Date('2026-09-24T15:00:00-03:00'));
    await runNotificationCycle(ctx.pool, ctx.clock, ctx.pushProvider);
    await runNotificationCycle(ctx.pool, ctx.clock, ctx.pushProvider);
    await runNotificationCycle(ctx.pool, ctx.clock, ctx.pushProvider);

    expect(pushProvider.sent).toHaveLength(1);
    expect(pushProvider.sent[0]!.message.title).toBe('Recordatorio');
  });

  it('AC-F16-01: 10 overdue tasks still produce at most 1 overdue_task push per day', async () => {
    token = await registerWithDevice('f16-01@example.com');
    // Isolate overdue_task counting: a due_date in the past also fires
    // each task's own default `reminder` (also already overdue) — turn
    // that type off so only the overdue_task summary push is observed.
    await ctx.app.inject({
      method: 'PATCH',
      url: '/v1/me/notification-settings',
      headers: { authorization: `Bearer ${token}` },
      payload: { settings: [{ type: 'reminder', enabled: false }] },
    });
    for (let i = 0; i < 10; i++) {
      await ctx.app.inject({
        method: 'POST',
        url: '/v1/tasks',
        headers: { authorization: `Bearer ${token}` },
        payload: { title: `Tarea ${i}`, due_date: '2026-09-20' },
      });
    }

    await runNotificationCycle(ctx.pool, ctx.clock, ctx.pushProvider);
    expect(pushProvider.sent).toHaveLength(1);
    expect(pushProvider.sent[0]!.message).toMatchObject({
      title: 'Tareas vencidas',
      body: 'Tenés 10 tareas vencidas.',
    });

    // Later the same local day — no second push.
    ctx.clock.set(new Date('2026-09-24T20:00:00-03:00'));
    await runNotificationCycle(ctx.pool, ctx.clock, ctx.pushProvider);
    expect(pushProvider.sent).toHaveLength(1);
  });

  it('AC-F16-02: a non-critical push due inside quiet hours is postponed to the end of them', async () => {
    token = await registerWithDevice('f16-02@example.com');
    // Same isolation as AC-F16-01 — only overdue_task (non-critical) is
    // under test here, not the task's own (critical, quiet-hours-exempt)
    // default reminder.
    await ctx.app.inject({
      method: 'PATCH',
      url: '/v1/me/notification-settings',
      headers: { authorization: `Bearer ${token}` },
      payload: { settings: [{ type: 'reminder', enabled: false }] },
    });
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Vencida', due_date: '2026-09-20' },
    });

    // 23:00 local is inside the default 22:00–07:00 quiet window.
    ctx.clock.set(new Date('2026-09-24T23:00:00-03:00'));
    await runNotificationCycle(ctx.pool, ctx.clock, ctx.pushProvider);
    expect(pushProvider.sent).toHaveLength(0);

    // Still inside quiet hours a bit later — still nothing.
    ctx.clock.set(new Date('2026-09-25T03:00:00-03:00'));
    await runNotificationCycle(ctx.pool, ctx.clock, ctx.pushProvider);
    expect(pushProvider.sent).toHaveLength(0);

    // 07:00 local is the end of quiet hours — it fires right then.
    ctx.clock.set(new Date('2026-09-25T07:00:00-03:00'));
    await runNotificationCycle(ctx.pool, ctx.clock, ctx.pushProvider);
    expect(pushProvider.sent).toHaveLength(1);
  });

  it('AC-F16-03: a disabled type never generates a push', async () => {
    token = await registerWithDevice('f16-03@example.com');
    // overdue_task is unrelated to this test but would otherwise fire once
    // the task (still pending) turns overdue by the 14:00 check below.
    await ctx.app.inject({
      method: 'PATCH',
      url: '/v1/me/notification-settings',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        settings: [
          { type: 'reminder', enabled: false },
          { type: 'overdue_task', enabled: false },
        ],
      },
    });
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Sin aviso', due_at: '2026-09-24T13:00:00-03:00' },
    });

    ctx.clock.set(new Date('2026-09-24T13:00:00-03:00'));
    await runNotificationCycle(ctx.pool, ctx.clock, ctx.pushProvider);
    expect(pushProvider.sent).toHaveLength(0);

    // The reminder is still consumed (not stuck retrying forever) even
    // though its type was disabled.
    ctx.clock.set(new Date('2026-09-24T14:00:00-03:00'));
    await runNotificationCycle(ctx.pool, ctx.clock, ctx.pushProvider);
    expect(pushProvider.sent).toHaveLength(0);
  });

  it('daily cap: a 2nd non-critical push in the same local day is skipped', async () => {
    token = await registerWithDevice('cap@example.com');
    await ctx.app.inject({
      method: 'PATCH',
      url: '/v1/me/settings',
      headers: { authorization: `Bearer ${token}` },
      payload: { max_push_per_day: 1 },
    });
    await ctx.app.inject({
      method: 'PATCH',
      url: '/v1/me/notification-settings',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        settings: [
          { type: 'daily_summary', enabled: true },
          { type: 'reminder', enabled: false },
        ],
      },
    });
    await ctx.app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: { authorization: `Bearer ${token}` },
      payload: { title: 'Vencida', due_date: '2026-09-20' },
    });

    // Within one cycle, NotificationService checks overdue_task before
    // daily_summary — with a cap of 1, overdue_task claims the day's only
    // non-critical slot and daily_summary (also due, past its 07:30
    // default) is skipped in the very same run.
    await runNotificationCycle(ctx.pool, ctx.clock, ctx.pushProvider);
    expect(pushProvider.sent).toHaveLength(1);
    expect(pushProvider.sent[0]!.message.title).toBe('Tareas vencidas');

    // Still capped later the same day.
    ctx.clock.set(new Date('2026-09-24T13:00:00-03:00'));
    await runNotificationCycle(ctx.pool, ctx.clock, ctx.pushProvider);
    expect(pushProvider.sent).toHaveLength(1);
  });
});
