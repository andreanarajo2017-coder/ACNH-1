import { and, eq, gte, isNull, lt, ne, notInArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { events, notificationLog, reminders, tasks, userSettings } from '../../db/schema.js';
import type { Clock } from '../../lib/clock.js';
import {
  isWithinQuietHours,
  localDateString,
  localTimeHHMM,
  zonedTimeToUtc,
} from '../../lib/timezone.js';
import type { PushMessage, PushProvider } from '../../lib/push/provider.js';
import { DevicesService } from '../devices/devices.service.js';
import { NotificationSettingsService } from './notification-settings.service.js';
import { CRITICAL_NOTIFICATION_TYPES, type NotificationType } from './notification-types.js';

type ReminderRow = typeof reminders.$inferSelect;

export interface NotificationCycleResult {
  remindersSent: number;
  overdueTaskSent: boolean;
  dailySummarySent: boolean;
}

/**
 * F13/F16: one user's slice of a notification cycle — always called within
 * an RLS-scoped `db` for that user (see notification-cycle.ts), the same
 * pattern every other per-request service uses.
 */
export class NotificationService {
  private settings: NotificationSettingsService;
  private devices: DevicesService;

  constructor(
    private db: Db,
    private clock: Clock,
    private pushProvider: PushProvider,
  ) {
    this.settings = new NotificationSettingsService(db);
    this.devices = new DevicesService(db, clock);
  }

  async runForUser(userId: string, timezone: string, now: Date): Promise<NotificationCycleResult> {
    const remindersSent = await this.processReminders(userId, now);
    const overdueTaskSent = await this.processOverdueTasks(userId, now, timezone);
    const dailySummarySent = await this.processDailySummary(userId, now, timezone);
    return { remindersSent, overdueTaskSent, dailySummarySent };
  }

  // F13 + AC-F13-01/02/03: task/event reminders (default or user-added).
  // Always critical (`reminder`/`upcoming_event`) — bypasses quiet hours
  // and the daily cap (F16: "no cuentan para el tope").
  async processReminders(userId: string, now: Date): Promise<number> {
    const due = await this.findDueReminders(userId, now);
    let sentCount = 0;
    for (const { reminder, title } of due) {
      const type: NotificationType =
        reminder.targetType === 'event' ? 'upcoming_event' : 'reminder';
      const enabled = await this.settings.isEnabled(userId, type);
      if (enabled) {
        // AC-F13-03 idempotency: the unique (user_id, dedupe_key) index on
        // notification_log is the actual guard — a concurrent cycle racing
        // on the same reminder loses the insert and never dispatches twice.
        const logged = await this.tryLog(userId, type, reminder.id, now);
        if (logged) {
          await this.dispatch(
            userId,
            type === 'upcoming_event'
              ? this.eventMessage(title, reminder)
              : this.taskMessage(title, reminder),
          );
          sentCount++;
        }
      }
      // Consumed either way — a disabled type still retires the occurrence
      // instead of re-checking it every cycle forever.
      await this.db
        .update(reminders)
        .set({ status: 'sent', sentAt: now, updatedAt: now })
        .where(eq(reminders.id, reminder.id));
    }
    return sentCount;
  }

  // AC-F16-01: at most one overdue_task push per local day, however many
  // tasks are overdue.
  async processOverdueTasks(userId: string, now: Date, timezone: string): Promise<boolean> {
    const enabled = await this.settings.isEnabled(userId, 'overdue_task');
    if (!enabled) return false;

    const overdueCount = await this.countOverdueTasks(userId, now, timezone);
    if (overdueCount === 0) return false;

    const dedupeKey = `overdue_task:${localDateString(now, timezone)}`;
    if (!(await this.nonCriticalAllowed(userId, now, timezone))) return false;
    const logged = await this.tryLog(userId, 'overdue_task', dedupeKey, now);
    if (!logged) return false;

    await this.dispatch(userId, {
      title: 'Tareas vencidas',
      body:
        overdueCount === 1 ? 'Tenés 1 tarea vencida.' : `Tenés ${overdueCount} tareas vencidas.`,
      data: { type: 'tasks_overdue' },
    });
    return true;
  }

  // D-05 ("resumen diario"), F16's `daily_summary` type — sent once per
  // local day at the user's configured time.
  async processDailySummary(userId: string, now: Date, timezone: string): Promise<boolean> {
    const enabled = await this.settings.isEnabled(userId, 'daily_summary');
    if (!enabled) return false;

    const [settings] = await this.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    if (!settings?.dailySummaryEnabled) return false;
    // Postgres `time` columns come back as "HH:MM:SS" — compare on the
    // same "HH:MM" precision as localTimeHHMM, or "07:00" < "07:00:00"
    // (true, as a string) makes the exact minute miss by one tick.
    if (localTimeHHMM(now, timezone) < settings.dailySummaryTime.slice(0, 5)) return false;

    const dedupeKey = `daily_summary:${localDateString(now, timezone)}`;
    if (!(await this.nonCriticalAllowed(userId, now, timezone))) return false;
    const logged = await this.tryLog(userId, 'daily_summary', dedupeKey, now);
    if (!logged) return false;

    const { taskCount, eventCount } = await this.countTodayItems(userId, now, timezone);
    await this.dispatch(userId, {
      title: 'Tu resumen de hoy',
      body: `${taskCount} tareas y ${eventCount} eventos para hoy.`,
      data: { type: 'daily_summary' },
    });
    return true;
  }

  private eventMessage(title: string, reminder: ReminderRow): PushMessage {
    return {
      title: 'Evento próximo',
      body: title,
      data: { type: 'event', id: reminder.targetId },
    };
  }

  private taskMessage(title: string, reminder: ReminderRow): PushMessage {
    return {
      title: 'Recordatorio',
      body: title,
      data: { type: 'task', id: reminder.targetId },
    };
  }

  private async dispatch(userId: string, message: PushMessage): Promise<void> {
    const userDevices = await this.devices.listActive(userId);
    for (const device of userDevices) {
      const result = await this.pushProvider.send(device.pushToken, message);
      if (result.invalidToken) {
        await this.devices.deleteByToken(userId, device.pushToken);
      }
    }
  }

  // Atomic dedup gate: only the caller that wins the unique-index race gets
  // `true` back and actually dispatches.
  private async tryLog(
    userId: string,
    type: NotificationType,
    dedupeKey: string,
    now: Date,
  ): Promise<boolean> {
    const rows = await this.db
      .insert(notificationLog)
      .values({ userId, type, dedupeKey, sentAt: now })
      .onConflictDoNothing({ target: [notificationLog.userId, notificationLog.dedupeKey] })
      .returning({ id: notificationLog.id });
    return rows.length > 0;
  }

  // AC-F16-02: quiet hours postpone a non-critical push to right after
  // quiet hours end (the next cycle where this returns true); the daily
  // cap (F16, "no cuentan" clause excludes reminder/upcoming_event, see
  // notification-types.ts) is checked the same way.
  private async nonCriticalAllowed(userId: string, now: Date, timezone: string): Promise<boolean> {
    const [settings] = await this.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    // Postgres `time` columns come back as "HH:MM:SS" — isWithinQuietHours
    // compares against localTimeHHMM's "HH:MM", so trim to match (see the
    // same fix in processDailySummary).
    const quietStart = (settings?.quietHoursStart ?? '22:00').slice(0, 5);
    const quietEnd = (settings?.quietHoursEnd ?? '07:00').slice(0, 5);
    const maxPerDay = settings?.maxPushPerDay ?? 6;

    if (isWithinQuietHours(localTimeHHMM(now, timezone), quietStart, quietEnd)) return false;

    const sentToday = await this.countNonCriticalSentToday(userId, now, timezone);
    return sentToday < maxPerDay;
  }

  private async countNonCriticalSentToday(
    userId: string,
    now: Date,
    timezone: string,
  ): Promise<number> {
    const dayStart = zonedTimeToUtc(localDateString(now, timezone), '00:00', timezone);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const rows = await this.db
      .select({ id: notificationLog.id })
      .from(notificationLog)
      .where(
        and(
          eq(notificationLog.userId, userId),
          notInArray(notificationLog.type, [...CRITICAL_NOTIFICATION_TYPES]),
          gte(notificationLog.sentAt, dayStart),
          lt(notificationLog.sentAt, dayEnd),
        ),
      );
    return rows.length;
  }

  private async countOverdueTasks(userId: string, now: Date, timezone: string): Promise<number> {
    // Two separate, simply-typed queries beat one dueDate/dueAt-coalescing
    // SQL expression here — this runs once a cycle, not hot-path. dueAt
    // (has a time) compares as an instant; a date-only task is overdue
    // once its due_date is before *today*, not before "now".
    const overdueByTime = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          isNull(tasks.deletedAt),
          ne(tasks.status, 'completed'),
          ne(tasks.status, 'cancelled'),
          lt(tasks.dueAt, now),
        ),
      );
    const today = localDateString(now, timezone);
    const overdueByDate = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          isNull(tasks.deletedAt),
          ne(tasks.status, 'completed'),
          ne(tasks.status, 'cancelled'),
          lt(tasks.dueDate, today),
        ),
      );
    return new Set([...overdueByTime.map((r) => r.id), ...overdueByDate.map((r) => r.id)]).size;
  }

  private async countTodayItems(
    userId: string,
    now: Date,
    timezone: string,
  ): Promise<{ taskCount: number; eventCount: number }> {
    const today = localDateString(now, timezone);
    const dayStart = zonedTimeToUtc(today, '00:00', timezone);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const tasksToday = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          isNull(tasks.deletedAt),
          ne(tasks.status, 'completed'),
          ne(tasks.status, 'cancelled'),
          eq(tasks.dueDate, today),
        ),
      );
    const eventsToday = await this.db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.userId, userId),
          isNull(events.deletedAt),
          gte(events.startAt, dayStart),
          lt(events.startAt, dayEnd),
        ),
      );
    return { taskCount: tasksToday.length, eventCount: eventsToday.length };
  }

  private async findDueReminders(
    userId: string,
    now: Date,
  ): Promise<{ reminder: ReminderRow; title: string }[]> {
    const scheduled = await this.db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.userId, userId),
          eq(reminders.status, 'scheduled'),
          isNull(reminders.deletedAt),
        ),
      );

    const due: { reminder: ReminderRow; title: string }[] = [];
    for (const reminder of scheduled) {
      if (reminder.triggerType === 'location') continue; // P2, reserved — never fires

      let title: string | undefined;
      let effectiveAt: Date | null = null;

      if (reminder.targetType === 'event') {
        const [event] = await this.db
          .select({ startAt: events.startAt, title: events.title })
          .from(events)
          .where(and(eq(events.id, reminder.targetId), isNull(events.deletedAt)))
          .limit(1);
        title = event?.title;
        if (event) {
          effectiveAt =
            reminder.triggerType === 'absolute'
              ? reminder.triggerAt
              : event.startAt
                ? new Date(event.startAt.getTime() - (reminder.offsetMinutes ?? 0) * 60_000)
                : null;
        }
      } else {
        const [task] = await this.db
          .select({ dueAt: tasks.dueAt, title: tasks.title })
          .from(tasks)
          .where(and(eq(tasks.id, reminder.targetId), isNull(tasks.deletedAt)))
          .limit(1);
        title = task?.title;
        if (task) {
          effectiveAt =
            reminder.triggerType === 'absolute'
              ? reminder.triggerAt
              : task.dueAt
                ? new Date(task.dueAt.getTime() - (reminder.offsetMinutes ?? 0) * 60_000)
                : null;
        }
      }

      if (title === undefined || effectiveAt === null) {
        // The target was deleted (or lost its date) outside the normal
        // cascade — cancel instead of retrying it every cycle forever.
        await this.db
          .update(reminders)
          .set({ status: 'cancelled', updatedAt: now })
          .where(eq(reminders.id, reminder.id));
        continue;
      }

      if (effectiveAt.getTime() <= now.getTime()) {
        due.push({ reminder, title });
      }
    }
    return due;
  }
}
