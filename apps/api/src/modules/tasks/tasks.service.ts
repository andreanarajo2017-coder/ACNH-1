import { and, asc, eq, gt, ilike, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { tasks } from '../../db/schema.js';
import type { Clock } from '../../lib/clock.js';
import { ApiError, NotFoundError } from '../../lib/errors.js';
import { decodeCursor, encodeCursor, type CursorPage } from '../../lib/pagination.js';
import { DefaultRemindersService } from '../reminders/default-reminders.service.js';
import type {
  CreateTaskBody,
  ListTasksQuery,
  PostponeBody,
  TaskResponse,
  UpdateTaskBody,
} from './tasks.schemas.js';

const POSTPONE_PRESET_MS: Record<'later_today' | 'tomorrow' | 'next_week', number> = {
  later_today: 3 * 60 * 60 * 1000,
  // No user timezone/day-boundary math yet (see docs/decisions.md ADR-008)
  // — a fixed offset from "now" until the UI (M3) needs calendar-day precision.
  tomorrow: 24 * 60 * 60 * 1000,
  next_week: 7 * 24 * 60 * 60 * 1000,
};

export class TasksService {
  private defaultReminders: DefaultRemindersService;

  constructor(
    private db: Db,
    private clock: Clock,
  ) {
    this.defaultReminders = new DefaultRemindersService(db, clock);
  }

  async list(userId: string, query: ListTasksQuery): Promise<CursorPage<TaskResponse>> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    const rows = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          isNull(tasks.deletedAt),
          query.status ? eq(tasks.status, query.status) : undefined,
          query.category_id ? eq(tasks.categoryId, query.category_id) : undefined,
          query.person_id ? eq(tasks.personId, query.person_id) : undefined,
          query.q ? ilike(tasks.title, `%${query.q}%`) : undefined,
          query.due_from
            ? sql`coalesce(${tasks.dueDate}, ${tasks.dueAt}::date) >= ${query.due_from}`
            : undefined,
          query.due_to
            ? sql`coalesce(${tasks.dueDate}, ${tasks.dueAt}::date) <= ${query.due_to}`
            : undefined,
          cursor
            ? or(
                gt(tasks.createdAt, cursor.createdAt),
                and(eq(tasks.createdAt, cursor.createdAt), gt(tasks.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(asc(tasks.createdAt), asc(tasks.id))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const hasMore = rows.length > query.limit;
    const last = page.at(-1);

    return {
      data: page.map(toTaskResponse),
      next_cursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async create(userId: string, body: CreateTaskBody): Promise<TaskResponse> {
    const now = this.clock.now();
    const [row] = await this.db
      .insert(tasks)
      .values({
        userId,
        title: body.title,
        description: body.description ?? null,
        // R-01: priority defaults to 'medium' when not stated (DB default).
        ...(body.priority ? { priority: body.priority } : {}),
        categoryId: body.category_id ?? null,
        personId: body.person_id ?? null,
        locationText: body.location_text ?? null,
        dueDate: body.due_date ?? null,
        dueAt: body.due_at ? new Date(body.due_at) : null,
        estimatedMinutes: body.estimated_minutes ?? null,
        recurrenceRule: body.recurrence_rule ?? null,
        source: 'manual',
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await this.defaultReminders.syncForTask(userId, row!);
    return toTaskResponse(row!);
  }

  async get(userId: string, id: string): Promise<TaskResponse> {
    const row = await this.findOwned(userId, id);
    return toTaskResponse(row);
  }

  async update(userId: string, id: string, body: UpdateTaskBody): Promise<TaskResponse> {
    await this.findOwned(userId, id);
    const [row] = await this.db
      .update(tasks)
      .set({
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.category_id !== undefined ? { categoryId: body.category_id } : {}),
        ...(body.person_id !== undefined ? { personId: body.person_id } : {}),
        ...(body.location_text !== undefined ? { locationText: body.location_text } : {}),
        ...(body.due_date !== undefined ? { dueDate: body.due_date, dueAt: null } : {}),
        ...(body.due_at !== undefined
          ? { dueAt: body.due_at ? new Date(body.due_at) : null, dueDate: null }
          : {}),
        ...(body.estimated_minutes !== undefined
          ? { estimatedMinutes: body.estimated_minutes }
          : {}),
        ...(body.recurrence_rule !== undefined ? { recurrenceRule: body.recurrence_rule } : {}),
        updatedAt: this.clock.now(),
      })
      .where(eq(tasks.id, id))
      .returning();
    if (body.due_date !== undefined || body.due_at !== undefined) {
      await this.defaultReminders.syncForTask(userId, row!);
    }
    return toTaskResponse(row!);
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);
    await this.db
      .update(tasks)
      .set({ deletedAt: this.clock.now(), updatedAt: this.clock.now() })
      .where(eq(tasks.id, id));
    await this.defaultReminders.cancelAllForTarget(userId, 'task', id);
  }

  // AC-F06-01: completing fixes completed_at.
  async complete(userId: string, id: string): Promise<TaskResponse> {
    const task = await this.findOwned(userId, id);
    if (task.status === 'cancelled') {
      throw new ApiError(
        422,
        'invalid_transition',
        'A cancelled task must be reopened before it can be completed.',
      );
    }
    const now = this.clock.now();
    const [row] = await this.db
      .update(tasks)
      .set({ status: 'completed', completedAt: now, updatedAt: now })
      .where(eq(tasks.id, id))
      .returning();
    return toTaskResponse(row!);
  }

  async reopen(userId: string, id: string): Promise<TaskResponse> {
    await this.findOwned(userId, id);
    const now = this.clock.now();
    const [row] = await this.db
      .update(tasks)
      .set({ status: 'pending', completedAt: null, postponedUntil: null, updatedAt: now })
      .where(eq(tasks.id, id))
      .returning();
    return toTaskResponse(row!);
  }

  // AC-F06-02: a postponed task drops out of Hoy/Ahora until postponed_until.
  async postpone(userId: string, id: string, body: PostponeBody): Promise<TaskResponse> {
    const task = await this.findOwned(userId, id);
    const now = this.clock.now();
    const target = body.until
      ? new Date(body.until)
      : new Date(now.getTime() + POSTPONE_PRESET_MS[body.preset!]);

    const patch: Partial<typeof tasks.$inferInsert> = {
      status: 'postponed',
      postponedUntil: target,
      updatedAt: now,
    };
    // "si el vencimiento es anterior, se mueve a postponed_until" (F06).
    if (task.dueAt && task.dueAt.getTime() < target.getTime()) {
      patch.dueAt = target;
    } else if (task.dueDate && new Date(task.dueDate) < target) {
      patch.dueDate = target.toISOString().slice(0, 10);
    }

    const [row] = await this.db.update(tasks).set(patch).where(eq(tasks.id, id)).returning();
    if (patch.dueAt !== undefined || patch.dueDate !== undefined) {
      await this.defaultReminders.syncForTask(userId, row!);
    }
    return toTaskResponse(row!);
  }

  private async findOwned(userId: string, id: string) {
    const rows = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundError('Task not found.');
    return row;
  }
}

function toTaskResponse(row: typeof tasks.$inferSelect): TaskResponse {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    category_id: row.categoryId,
    person_id: row.personId,
    location_text: row.locationText,
    due_date: row.dueDate,
    due_at: row.dueAt?.toISOString() ?? null,
    estimated_minutes: row.estimatedMinutes,
    postponed_until: row.postponedUntil?.toISOString() ?? null,
    completed_at: row.completedAt?.toISOString() ?? null,
    recurrence_rule: row.recurrenceRule,
    series_id: row.seriesId,
    source: row.source,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
