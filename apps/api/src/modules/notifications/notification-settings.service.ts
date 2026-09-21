import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { notificationTypeSettings } from '../../db/schema.js';
import {
  ALL_NOTIFICATION_TYPES,
  DEFAULT_NOTIFICATION_TYPE_ENABLED,
  type NotificationType,
} from './notification-types.js';
import type {
  NotificationTypeSettingDto,
  UpdateNotificationSettingsBody,
} from './notification-settings.schemas.js';

export class NotificationSettingsService {
  constructor(private db: Db) {}

  async list(userId: string): Promise<NotificationTypeSettingDto[]> {
    const rows = await this.db
      .select()
      .from(notificationTypeSettings)
      .where(eq(notificationTypeSettings.userId, userId));
    const byType = new Map(rows.map((r) => [r.type, r.enabled]));
    // Defends against a user registered before M6 (or any row that never
    // got seeded) — reads never 404 on a missing row, they fall back to
    // the type's default instead.
    return ALL_NOTIFICATION_TYPES.map((type) => ({
      type,
      enabled: byType.get(type) ?? DEFAULT_NOTIFICATION_TYPE_ENABLED[type],
    }));
  }

  async update(
    userId: string,
    body: UpdateNotificationSettingsBody,
  ): Promise<NotificationTypeSettingDto[]> {
    for (const setting of body.settings) {
      await this.db
        .insert(notificationTypeSettings)
        .values({ userId, type: setting.type, enabled: setting.enabled })
        .onConflictDoUpdate({
          target: [notificationTypeSettings.userId, notificationTypeSettings.type],
          set: { enabled: setting.enabled },
        });
    }
    return this.list(userId);
  }

  // Used by NotificationService when deciding whether to send — a missing
  // row (legacy user) defaults to the type's default, same as list().
  async isEnabled(userId: string, type: NotificationType): Promise<boolean> {
    const rows = await this.db
      .select({ enabled: notificationTypeSettings.enabled })
      .from(notificationTypeSettings)
      .where(
        and(eq(notificationTypeSettings.userId, userId), eq(notificationTypeSettings.type, type)),
      )
      .limit(1);
    return rows[0]?.enabled ?? DEFAULT_NOTIFICATION_TYPE_ENABLED[type];
  }
}
