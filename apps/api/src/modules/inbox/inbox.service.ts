import { and, asc, eq, gt, isNull, or } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { inboxItems } from '../../db/schema.js';
import type { Clock } from '../../lib/clock.js';
import { NotFoundError } from '../../lib/errors.js';
import { decodeCursor, encodeCursor, type CursorPage } from '../../lib/pagination.js';
import type {
  CreateInboxItemBody,
  InboxItemResponse,
  ListInboxQuery,
  UpdateInboxItemBody,
} from './inbox.schemas.js';

export class InboxService {
  constructor(
    private db: Db,
    private clock: Clock,
  ) {}

  async list(userId: string, query: ListInboxQuery): Promise<CursorPage<InboxItemResponse>> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    const rows = await this.db
      .select()
      .from(inboxItems)
      .where(
        and(
          eq(inboxItems.userId, userId),
          isNull(inboxItems.deletedAt),
          query.status ? eq(inboxItems.status, query.status) : undefined,
          cursor
            ? or(
                gt(inboxItems.createdAt, cursor.createdAt),
                and(eq(inboxItems.createdAt, cursor.createdAt), gt(inboxItems.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(asc(inboxItems.createdAt), asc(inboxItems.id))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const hasMore = rows.length > query.limit;
    const last = page.at(-1);

    return {
      data: page.map(toInboxItemResponse),
      next_cursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async create(userId: string, body: CreateInboxItemBody): Promise<InboxItemResponse> {
    const now = this.clock.now();
    const [row] = await this.db
      .insert(inboxItems)
      .values({
        userId,
        rawText: body.raw_text,
        capturedAt: body.captured_at ? new Date(body.captured_at) : now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return toInboxItemResponse(row!);
  }

  // AC-F05-02: discarding (status -> 'discarded') is a plain field update —
  // it never creates a task or event as a side effect.
  async update(userId: string, id: string, body: UpdateInboxItemBody): Promise<InboxItemResponse> {
    await this.findOwned(userId, id);
    const [row] = await this.db
      .update(inboxItems)
      .set({
        ...(body.status !== undefined ? { status: body.status } : {}),
        updatedAt: this.clock.now(),
      })
      .where(eq(inboxItems.id, id))
      .returning();
    return toInboxItemResponse(row!);
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);
    await this.db
      .update(inboxItems)
      .set({ deletedAt: this.clock.now(), updatedAt: this.clock.now() })
      .where(eq(inboxItems.id, id));
  }

  private async findOwned(userId: string, id: string) {
    const rows = await this.db
      .select()
      .from(inboxItems)
      .where(
        and(eq(inboxItems.id, id), eq(inboxItems.userId, userId), isNull(inboxItems.deletedAt)),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundError('Inbox item not found.');
    return row;
  }
}

function toInboxItemResponse(row: typeof inboxItems.$inferSelect): InboxItemResponse {
  return {
    id: row.id,
    raw_text: row.rawText,
    status: row.status,
    captured_at: row.capturedAt.toISOString(),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
