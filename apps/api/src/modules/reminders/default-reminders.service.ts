import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { events, reminders, tasks, userSettings, users } from '../../db/schema.js';
import type { Clock } from '../../lib/clock.js';
import { zonedTimeToUtc } from '../../lib/timezone.js';

type ReminderRow = typeof reminders.$inferSelect;
type EventRow = typeof events.$inferSelect;
type TaskRow = typeof tasks.$inferSelect;

/**
 * F13's per-item default reminder (event → 30 min before; task with a time
 * → at that time; task with only a date → 09:00 local) — auto-created and
 * kept in sync by TasksService/EventsService on create/update/delete.
 * `reminders.is_default` marks the one row this owns per item; anything
 * the user added by hand through POST /reminders is never touched here.
 */
export class DefaultRemindersService {
  constructor(
    private db: Db,
    private clock: Clock,
  ) {}

  async syncForEvent(userId: string, event: EventRow): Promise<void> {
    const now = this.clock.now();
    const existing = await this.findDefault(userId, 'event', event.id);
    const shouldExist = !event.allDay && event.startAt != null;

    if (!shouldExist) {
      if (existing && existing.status === 'scheduled') await this.cancel(existing.id, now);
      return;
    }

    // relative_to_start reads the event's live start_at at send time (the
    // scheduler joins to it) — AC-F13-02's "editar la hora reprograma" is
    // automatic, no field to update here when only the time changes.
    if (existing) {
      if (existing.status === 'cancelled') {
        await this.db
          .update(reminders)
          .set({ status: 'scheduled', updatedAt: now })
          .where(eq(reminders.id, existing.id));
      }
      return;
    }

    const offsetMinutes = await this.getDefaultEventReminderMin(userId);
    await this.db.insert(reminders).values({
      userId,
      targetType: 'event',
      targetId: event.id,
      triggerType: 'relative_to_start',
      offsetMinutes,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  async syncForTask(userId: string, task: TaskRow): Promise<void> {
    const now = this.clock.now();
    const existing = await this.findDefault(userId, 'task', task.id);

    if (task.dueAt) {
      // "tarea con hora → a la hora": relative_to_start off the task's
      // live due_at, offset 0 — same auto-reschedule-for-free as events.
      if (existing) {
        if (existing.status === 'cancelled') {
          await this.db
            .update(reminders)
            .set({
              status: 'scheduled',
              triggerType: 'relative_to_start',
              offsetMinutes: 0,
              triggerAt: null,
              updatedAt: now,
            })
            .where(eq(reminders.id, existing.id));
        } else if (
          existing.status === 'scheduled' &&
          (existing.triggerType !== 'relative_to_start' || existing.offsetMinutes !== 0)
        ) {
          await this.db
            .update(reminders)
            .set({
              triggerType: 'relative_to_start',
              offsetMinutes: 0,
              triggerAt: null,
              updatedAt: now,
            })
            .where(eq(reminders.id, existing.id));
        }
        return;
      }
      await this.db.insert(reminders).values({
        userId,
        targetType: 'task',
        targetId: task.id,
        triggerType: 'relative_to_start',
        offsetMinutes: 0,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
      return;
    }

    if (task.dueDate) {
      // "tarea solo con fecha → 09:00 locales del día de vencimiento": no
      // live "start" field to read at send time, so this one *is* a stored
      // absolute instant — recomputed here whenever due_date changes.
      const triggerAt = await this.computeTaskDateOnlyTrigger(userId, task.dueDate);
      if (existing) {
        const needsUpdate =
          existing.status === 'cancelled' ||
          (existing.status === 'scheduled' &&
            (existing.triggerType !== 'absolute' ||
              existing.triggerAt?.getTime() !== triggerAt.getTime()));
        if (needsUpdate) {
          await this.db
            .update(reminders)
            .set({
              status: 'scheduled',
              triggerType: 'absolute',
              triggerAt,
              offsetMinutes: null,
              updatedAt: now,
            })
            .where(eq(reminders.id, existing.id));
        }
        return;
      }
      await this.db.insert(reminders).values({
        userId,
        targetType: 'task',
        targetId: task.id,
        triggerType: 'absolute',
        triggerAt,
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
      return;
    }

    // No due date/time at all — nothing to remind about.
    if (existing && existing.status === 'scheduled') await this.cancel(existing.id, now);
  }

  // AC-F13-02 "eliminarlo los cancela": every still-scheduled reminder for
  // the item, default or user-added — the item is gone, none of them can
  // fire meaningfully anymore.
  async cancelAllForTarget(
    userId: string,
    targetType: 'task' | 'event',
    targetId: string,
  ): Promise<void> {
    await this.db
      .update(reminders)
      .set({ status: 'cancelled', updatedAt: this.clock.now() })
      .where(
        and(
          eq(reminders.userId, userId),
          eq(reminders.targetType, targetType),
          eq(reminders.targetId, targetId),
          eq(reminders.status, 'scheduled'),
        ),
      );
  }

  private async cancel(reminderId: string, now: Date): Promise<void> {
    await this.db
      .update(reminders)
      .set({ status: 'cancelled', updatedAt: now })
      .where(eq(reminders.id, reminderId));
  }

  private async findDefault(
    userId: string,
    targetType: 'task' | 'event',
    targetId: string,
  ): Promise<ReminderRow | undefined> {
    const rows = await this.db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.userId, userId),
          eq(reminders.targetType, targetType),
          eq(reminders.targetId, targetId),
          eq(reminders.isDefault, true),
          isNull(reminders.deletedAt),
        ),
      )
      .limit(1);
    return rows[0];
  }

  private async getDefaultEventReminderMin(userId: string): Promise<number> {
    const rows = await this.db
      .select({ value: userSettings.defaultEventReminderMin })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    return rows[0]?.value ?? 30;
  }

  private async computeTaskDateOnlyTrigger(userId: string, dueDate: string): Promise<Date> {
    const rows = await this.db
      .select({ time: userSettings.defaultTaskReminderTime, timezone: users.timezone })
      .from(userSettings)
      .innerJoin(users, eq(users.id, userSettings.userId))
      .where(eq(userSettings.userId, userId))
      .limit(1);
    const time = rows[0]?.time ?? '09:00';
    const timezone = rows[0]?.timezone ?? 'America/Argentina/Buenos_Aires';
    return zonedTimeToUtc(dueDate, time, timezone);
  }
}
