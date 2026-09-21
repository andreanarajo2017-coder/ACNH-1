import { and, asc, eq, gt, isNull, or } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { events } from '../../db/schema.js';
import type { Clock } from '../../lib/clock.js';
import { NotFoundError } from '../../lib/errors.js';
import { decodeCursor, encodeCursor, type CursorPage } from '../../lib/pagination.js';
import { DefaultRemindersService } from '../reminders/default-reminders.service.js';
import type {
  CreateEventBody,
  EventResponse,
  ListEventsQuery,
  UpdateEventBody,
} from './events.schemas.js';

export class EventsService {
  private defaultReminders: DefaultRemindersService;

  constructor(
    private db: Db,
    private clock: Clock,
  ) {
    this.defaultReminders = new DefaultRemindersService(db, clock);
  }

  async list(userId: string, query: ListEventsQuery): Promise<CursorPage<EventResponse>> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    const rows = await this.db
      .select()
      .from(events)
      .where(
        and(
          eq(events.userId, userId),
          isNull(events.deletedAt),
          cursor
            ? or(
                gt(events.createdAt, cursor.createdAt),
                and(eq(events.createdAt, cursor.createdAt), gt(events.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(asc(events.createdAt), asc(events.id))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const hasMore = rows.length > query.limit;
    const last = page.at(-1);

    return {
      data: page.map(toEventResponse),
      next_cursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async create(userId: string, body: CreateEventBody): Promise<EventResponse> {
    const now = this.clock.now();
    const [row] = await this.db
      .insert(events)
      .values({
        userId,
        title: body.title,
        allDay: body.all_day ?? false,
        startAt: body.all_day ? null : body.start_at ? new Date(body.start_at) : null,
        endAt: body.end_at ? new Date(body.end_at) : null,
        startDate: body.all_day ? (body.start_date ?? null) : null,
        timezone: body.timezone ?? null,
        locationText: body.location_text ?? null,
        personId: body.person_id ?? null,
        categoryId: body.category_id ?? null,
        recurrenceRule: body.recurrence_rule ?? null,
        source: 'app',
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await this.defaultReminders.syncForEvent(userId, row!);
    return toEventResponse(row!);
  }

  async get(userId: string, id: string): Promise<EventResponse> {
    const row = await this.findOwned(userId, id);
    return toEventResponse(row);
  }

  async update(userId: string, id: string, body: UpdateEventBody): Promise<EventResponse> {
    await this.findOwned(userId, id);
    const [row] = await this.db
      .update(events)
      .set({
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.all_day !== undefined ? { allDay: body.all_day } : {}),
        ...(body.start_at !== undefined
          ? { startAt: body.start_at ? new Date(body.start_at) : null }
          : {}),
        ...(body.end_at !== undefined ? { endAt: body.end_at ? new Date(body.end_at) : null } : {}),
        ...(body.start_date !== undefined ? { startDate: body.start_date } : {}),
        ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
        ...(body.location_text !== undefined ? { locationText: body.location_text } : {}),
        ...(body.person_id !== undefined ? { personId: body.person_id } : {}),
        ...(body.category_id !== undefined ? { categoryId: body.category_id } : {}),
        ...(body.recurrence_rule !== undefined ? { recurrenceRule: body.recurrence_rule } : {}),
        updatedAt: this.clock.now(),
      })
      .where(eq(events.id, id))
      .returning();
    if (body.all_day !== undefined || body.start_at !== undefined) {
      await this.defaultReminders.syncForEvent(userId, row!);
    }
    return toEventResponse(row!);
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);
    await this.db
      .update(events)
      .set({ deletedAt: this.clock.now(), updatedAt: this.clock.now() })
      .where(eq(events.id, id));
    await this.defaultReminders.cancelAllForTarget(userId, 'event', id);
  }

  private async findOwned(userId: string, id: string) {
    const rows = await this.db
      .select()
      .from(events)
      .where(and(eq(events.id, id), eq(events.userId, userId), isNull(events.deletedAt)))
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundError('Event not found.');
    return row;
  }
}

export function toEventResponse(row: typeof events.$inferSelect): EventResponse {
  return {
    id: row.id,
    title: row.title,
    start_at: row.startAt?.toISOString() ?? null,
    end_at: row.endAt?.toISOString() ?? null,
    all_day: row.allDay,
    start_date: row.startDate,
    timezone: row.timezone,
    location_text: row.locationText,
    person_id: row.personId,
    category_id: row.categoryId,
    recurrence_rule: row.recurrenceRule,
    source: row.source,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
