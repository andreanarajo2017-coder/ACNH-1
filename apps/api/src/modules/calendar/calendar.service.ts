import { and, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { events, tasks } from '../../db/schema.js';
import type { CalendarItem, CalendarQuery } from './calendar.schemas.js';

// F07: "Eventos + tareas con hora, unificado" — tasks with only a due_date
// (no time of day) don't appear on the calendar (section 5, F07).
export class CalendarService {
  constructor(private db: Db) {}

  async list(userId: string, query: CalendarQuery): Promise<{ data: CalendarItem[] }> {
    const from = new Date(query.from);
    const to = new Date(query.to);

    const eventRows = await this.db
      .select()
      .from(events)
      .where(
        and(
          eq(events.userId, userId),
          isNull(events.deletedAt),
          or(
            and(
              sql`${events.startAt} is not null`,
              gte(events.startAt, from),
              lte(events.startAt, to),
            ),
            and(
              sql`${events.allDay} and ${events.startDate} is not null`,
              gte(events.startDate, query.from.slice(0, 10)),
              lte(events.startDate, query.to.slice(0, 10)),
            ),
          ),
        ),
      );

    const taskRows = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          isNull(tasks.deletedAt),
          sql`${tasks.dueAt} is not null`,
          gte(tasks.dueAt, from),
          lte(tasks.dueAt, to),
        ),
      );

    const items: CalendarItem[] = [
      ...eventRows.map((row): CalendarItem => ({
        type: 'event',
        id: row.id,
        title: row.title,
        start_at: row.allDay ? `${row.startDate}T00:00:00Z` : row.startAt!.toISOString(),
        end_at: row.endAt?.toISOString() ?? null,
        all_day: row.allDay,
        location_text: row.locationText,
        person_id: row.personId,
        category_id: row.categoryId,
      })),
      ...taskRows.map((row): CalendarItem => ({
        type: 'task',
        id: row.id,
        title: row.title,
        start_at: row.dueAt!.toISOString(),
        end_at: null,
        all_day: false,
        location_text: row.locationText,
        person_id: row.personId,
        category_id: row.categoryId,
      })),
    ];

    items.sort((a, b) => a.start_at.localeCompare(b.start_at));
    return { data: items };
  }
}
