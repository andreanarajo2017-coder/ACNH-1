import { and, asc, eq, gt, isNull, or } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { events, reminders, tasks } from '../../db/schema.js';
import type { Clock } from '../../lib/clock.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { decodeCursor, encodeCursor, type CursorPage } from '../../lib/pagination.js';
import type {
  CreateReminderBody,
  ListRemindersQuery,
  ReminderResponse,
  UpdateReminderBody,
} from './reminders.schemas.js';

export class RemindersService {
  constructor(
    private db: Db,
    private clock: Clock,
  ) {}

  async list(userId: string, query: ListRemindersQuery): Promise<CursorPage<ReminderResponse>> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    const rows = await this.db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.userId, userId),
          isNull(reminders.deletedAt),
          query.target_type ? eq(reminders.targetType, query.target_type) : undefined,
          query.target_id ? eq(reminders.targetId, query.target_id) : undefined,
          cursor
            ? or(
                gt(reminders.createdAt, cursor.createdAt),
                and(eq(reminders.createdAt, cursor.createdAt), gt(reminders.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(asc(reminders.createdAt), asc(reminders.id))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const hasMore = rows.length > query.limit;
    const last = page.at(-1);

    return {
      data: page.map(toReminderResponse),
      next_cursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async create(userId: string, body: CreateReminderBody): Promise<ReminderResponse> {
    await this.assertTargetOwned(userId, body.target_type, body.target_id);
    const now = this.clock.now();
    const [row] = await this.db
      .insert(reminders)
      .values({
        userId,
        targetType: body.target_type,
        targetId: body.target_id,
        triggerType: body.trigger_type,
        triggerAt: body.trigger_at ? new Date(body.trigger_at) : null,
        offsetMinutes: body.offset_minutes ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return toReminderResponse(row!);
  }

  async update(userId: string, id: string, body: UpdateReminderBody): Promise<ReminderResponse> {
    await this.findOwned(userId, id);
    const [row] = await this.db
      .update(reminders)
      .set({
        ...(body.trigger_at !== undefined
          ? { triggerAt: body.trigger_at ? new Date(body.trigger_at) : null }
          : {}),
        ...(body.offset_minutes !== undefined ? { offsetMinutes: body.offset_minutes } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        updatedAt: this.clock.now(),
      })
      .where(eq(reminders.id, id))
      .returning();
    return toReminderResponse(row!);
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);
    await this.db
      .update(reminders)
      .set({ deletedAt: this.clock.now(), updatedAt: this.clock.now() })
      .where(eq(reminders.id, id));
  }

  private async findOwned(userId: string, id: string) {
    const rows = await this.db
      .select()
      .from(reminders)
      .where(and(eq(reminders.id, id), eq(reminders.userId, userId), isNull(reminders.deletedAt)))
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundError('Reminder not found.');
    return row;
  }

  private async assertTargetOwned(
    userId: string,
    targetType: 'task' | 'event',
    targetId: string,
  ): Promise<void> {
    const table = targetType === 'task' ? tasks : events;
    const rows = await this.db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.id, targetId), eq(table.userId, userId), isNull(table.deletedAt)))
      .limit(1);
    if (rows.length === 0) {
      throw new ValidationError(
        `target_id does not reference an existing ${targetType} owned by this user.`,
      );
    }
  }
}

function toReminderResponse(row: typeof reminders.$inferSelect): ReminderResponse {
  return {
    id: row.id,
    target_type: row.targetType,
    target_id: row.targetId,
    trigger_type: row.triggerType,
    trigger_at: row.triggerAt?.toISOString() ?? null,
    offset_minutes: row.offsetMinutes,
    status: row.status,
    sent_at: row.sentAt?.toISOString() ?? null,
  };
}
