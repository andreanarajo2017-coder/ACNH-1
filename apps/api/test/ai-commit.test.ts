import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestApp, createTestApp, queryAsUser, truncateAll } from './helpers/app.js';

async function register(ctx: Awaited<ReturnType<typeof createTestApp>>, email: string) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'correct-horse-battery', accept_terms: true },
  });
  const body = res.json() as { access_token: string };
  const me = await ctx.app.inject({
    method: 'GET',
    url: '/v1/me',
    headers: { authorization: `Bearer ${body.access_token}` },
  });
  return { token: body.access_token, userId: me.json().id as string };
}

function authed(ctx: Awaited<ReturnType<typeof createTestApp>>, token: string) {
  return {
    parse: (payload: Record<string, unknown>) =>
      ctx.app.inject({
        method: 'POST',
        url: '/v1/ai/parse',
        headers: { authorization: `Bearer ${token}` },
        payload,
      }),
    commit: (parseId: string, payload: Record<string, unknown>) =>
      ctx.app.inject({
        method: 'POST',
        url: `/v1/ai/parse/${parseId}/commit`,
        headers: { authorization: `Bearer ${token}` },
        payload,
      }),
    inject: (method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) =>
      ctx.app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${token}` },
        ...(payload ? { payload } : {}),
      }),
  };
}

describe('POST /v1/ai/parse/:parse_id/commit (F04, R-02, AC-F04-07)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let token: string;
  let userId: string;
  let api: ReturnType<typeof authed>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await truncateAll(ctx.db);
    ({ token, userId } = await register(ctx, 'ai-commit@example.com'));
    api = authed(ctx, token);
  });

  afterAll(async () => {
    if (ctx) await closeTestApp(ctx);
  });

  it('AC-F04-07 nada se persiste antes del commit', async () => {
    await api.parse({ text: 'Mañana a las 5 tengo médico.' });
    const list = await api.inject('GET', '/v1/events');
    expect(list.json().data).toHaveLength(0);
  });

  it('commit crea el evento con source=app y ai_interaction_id = parse_id', async () => {
    const parsed = (await api.parse({ text: 'Mañana a las 5 tengo médico.' })).json();
    const res = await api.commit(parsed.parse_id, { items: parsed.items, relations: [] });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.created.events).toHaveLength(1);

    const rows = await queryAsUser(
      ctx.pool,
      userId,
      sql`SELECT title, source, ai_interaction_id FROM events WHERE id = ${body.created.events[0].id}`,
    );
    expect(rows.rows[0]).toMatchObject({
      title: 'Médico',
      source: 'app',
      ai_interaction_id: parsed.parse_id,
    });
  });

  it('AC-F04-07 un commit repetido con el mismo parse_id es idempotente', async () => {
    const parsed = (await api.parse({ text: 'Comprar leche mañana.' })).json();
    const first = await api.commit(parsed.parse_id, { items: parsed.items, relations: [] });
    const second = await api.commit(parsed.parse_id, { items: parsed.items, relations: [] });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());

    const rows = await queryAsUser(
      ctx.pool,
      userId,
      sql`SELECT id FROM tasks WHERE ai_interaction_id = ${parsed.parse_id}`,
    );
    expect(rows.rows).toHaveLength(1);
  });

  it('rechaza el commit si algún ítem todavía tiene missing_fields (R-01/R-02)', async () => {
    const parsed = (await api.parse({ text: 'Tengo médico mañana.' })).json();
    const res = await api.commit(parsed.parse_id, { items: parsed.items, relations: [] });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('unresolved_clarifications');

    const rows = await queryAsUser(ctx.pool, userId, sql`SELECT id FROM events`);
    expect(rows.rows).toHaveLength(0);
  });

  it('crea las relaciones y las personas nuevas confirmadas (R-08)', async () => {
    const parsed = (
      await api.parse({
        text: 'El sábado a las 10 tengo turno con el dentista y después tengo que comprar el regalo de cumpleaños de Ana.',
      })
    ).json();

    const res = await api.commit(parsed.parse_id, {
      items: parsed.items,
      relations: parsed.relations,
      create_people: [{ name: 'Ana', relationship: 'friend' }],
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.created.people).toEqual([{ id: expect.any(String), name: 'Ana' }]);
    expect(body.relations_created).toBe(1);

    const rows = await queryAsUser(
      ctx.pool,
      userId,
      sql`SELECT person_id FROM tasks WHERE ai_interaction_id = ${parsed.parse_id}`,
    );
    expect(rows.rows[0]!.person_id).toBe(body.created.people[0].id);
  });

  it('marca el inbox_item como procesado (AC-F05-01)', async () => {
    const inbox = await api.inject('POST', '/v1/inbox', {
      raw_text: 'Mañana a las 5 tengo médico.',
    });
    const inboxItemId = inbox.json().id;

    const parsed = (await api.parse({ text: 'Mañana a las 5 tengo médico.' })).json();
    await api.commit(parsed.parse_id, {
      items: parsed.items,
      relations: [],
      inbox_item_id: inboxItemId,
    });

    const after = await api.inject('GET', `/v1/inbox?status=processed`);
    expect(after.json().data.map((i: { id: string }) => i.id)).toContain(inboxItemId);
  });

  it('rechaza ítems de compra (F09/P1 todavía no soportado en commit)', async () => {
    const parsed = (
      await api.parse({ text: 'Agregá huevos y frutas a la lista del súper.' })
    ).json();
    const res = await api.commit(parsed.parse_id, { items: parsed.items, relations: [] });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('shopping_lists_not_available');
  });

  it('un commit de otro usuario sobre el mismo parse_id devuelve 404 (R-13)', async () => {
    const parsed = (await api.parse({ text: 'Mañana a las 5 tengo médico.' })).json();
    const other = await register(ctx, 'ai-commit-other@example.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/v1/ai/parse/${parsed.parse_id}/commit`,
      headers: { authorization: `Bearer ${other.token}` },
      payload: { items: parsed.items, relations: [] },
    });
    expect(res.statusCode).toBe(404);
  });
});
