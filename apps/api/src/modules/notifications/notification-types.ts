import type { notificationTypeEnum } from '../../db/schema.js';

export type NotificationType = (typeof notificationTypeEnum.enumValues)[number];

export const ALL_NOTIFICATION_TYPES: NotificationType[] = [
  'reminder',
  'upcoming_event',
  'overdue_task',
  'daily_summary',
  'conflict_alert',
  'contextual_recommendation',
];

// F16: default per type — everything on except the P2-reserved one.
export const DEFAULT_NOTIFICATION_TYPE_ENABLED: Record<NotificationType, boolean> = {
  reminder: true,
  upcoming_event: true,
  overdue_task: true,
  daily_summary: true,
  conflict_alert: true,
  contextual_recommendation: false,
};

// F16: "los recordatorios de eventos próximos y del usuario no cuentan
// para el tope [diario]" — `reminder` (task reminders) and `upcoming_event`
// (event reminders) are time-critical: they bypass both the quiet-hours
// postponement and the daily cap. Everything else is a "push no crítico".
export const CRITICAL_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set([
  'reminder',
  'upcoming_event',
]);

export function isCriticalNotificationType(type: NotificationType): boolean {
  return CRITICAL_NOTIFICATION_TYPES.has(type);
}
