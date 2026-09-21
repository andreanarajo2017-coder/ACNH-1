import { and, asc, eq, gt, isNull, or } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { events, people, tasks } from '../../db/schema.js';
import type { Clock } from '../../lib/clock.js';
import { NotFoundError } from '../../lib/errors.js';
import {
  decodeCursor,
  encodeCursor,
  type CursorPage,
  type PaginationQuery,
} from '../../lib/pagination.js';
import type { CreatePersonBody, PersonResponse, UpdatePersonBody } from './people.schemas.js';

export class PeopleService {
  constructor(
    private db: Db,
    private clock: Clock,
  ) {}

  async list(userId: string, query: PaginationQuery): Promise<CursorPage<PersonResponse>> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    const rows = await this.db
      .select()
      .from(people)
      .where(
        and(
          eq(people.userId, userId),
          isNull(people.deletedAt),
          cursor
            ? or(
                gt(people.createdAt, cursor.createdAt),
                and(eq(people.createdAt, cursor.createdAt), gt(people.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(asc(people.createdAt), asc(people.id))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const hasMore = rows.length > query.limit;
    const last = page.at(-1);

    return {
      data: page.map(toPersonResponse),
      next_cursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async create(userId: string, body: CreatePersonBody): Promise<PersonResponse> {
    const now = this.clock.now();
    const [row] = await this.db
      .insert(people)
      .values({
        userId,
        name: body.name,
        relationship: body.relationship,
        aliases: body.aliases ?? [],
        birthday: body.birthday ?? null,
        notes: body.notes ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return toPersonResponse(row!);
  }

  async get(userId: string, id: string): Promise<PersonResponse> {
    const row = await this.findOwned(userId, id);
    return toPersonResponse(row);
  }

  async update(userId: string, id: string, body: UpdatePersonBody): Promise<PersonResponse> {
    await this.findOwned(userId, id);
    const [row] = await this.db
      .update(people)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.relationship !== undefined ? { relationship: body.relationship } : {}),
        ...(body.aliases !== undefined ? { aliases: body.aliases } : {}),
        ...(body.birthday !== undefined ? { birthday: body.birthday } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        updatedAt: this.clock.now(),
      })
      .where(eq(people.id, id))
      .returning();
    return toPersonResponse(row!);
  }

  // F08: deleting a person leaves their tasks/events with person_id = null.
  // Soft delete never triggers `ON DELETE SET NULL` (that only fires on a
  // hard DELETE), so this is done explicitly.
  async delete(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);
    const now = this.clock.now();
    await this.db.transaction(async (tx) => {
      await tx.update(tasks).set({ personId: null, updatedAt: now }).where(eq(tasks.personId, id));
      await tx
        .update(events)
        .set({ personId: null, updatedAt: now })
        .where(eq(events.personId, id));
      await tx.update(people).set({ deletedAt: now, updatedAt: now }).where(eq(people.id, id));
    });
  }

  private async findOwned(userId: string, id: string) {
    const rows = await this.db
      .select()
      .from(people)
      .where(and(eq(people.id, id), eq(people.userId, userId), isNull(people.deletedAt)))
      .limit(1);
    const row = rows[0];
    // R-13: RLS already hides other users' rows; this 404s a missing or
    // foreign id identically either way.
    if (!row) throw new NotFoundError('Person not found.');
    return row;
  }
}

function toPersonResponse(row: typeof people.$inferSelect): PersonResponse {
  return {
    id: row.id,
    name: row.name,
    relationship: row.relationship,
    aliases: row.aliases,
    birthday: row.birthday,
    notes: row.notes,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
