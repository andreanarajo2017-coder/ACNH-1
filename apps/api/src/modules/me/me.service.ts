import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { userSettings, users } from '../../db/schema.js';
import type { Clock } from '../../lib/clock.js';
import { NotFoundError } from '../../lib/errors.js';
import type { AuthService } from '../auth/auth.service.js';
import type {
  MeResponse,
  SettingsResponse,
  UpdateMeBody,
  UpdateSettingsBody,
} from './me.schemas.js';

export class MeService {
  constructor(
    private db: Db,
    private clock: Clock,
    private authService: AuthService,
  ) {}

  private async findActiveUser(userId: string) {
    const rows = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    const user = rows[0];
    // R-13: a deleted/missing user is 404, never a distinguishable error.
    if (!user) throw new NotFoundError('User not found.');
    return user;
  }

  async getMe(userId: string): Promise<MeResponse> {
    const user = await this.findActiveUser(userId);
    return toMeResponse(user);
  }

  async updateMe(userId: string, body: UpdateMeBody): Promise<MeResponse> {
    await this.findActiveUser(userId);
    const [updated] = await this.db
      .update(users)
      .set({
        ...(body.display_name !== undefined ? { displayName: body.display_name } : {}),
        ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
        ...(body.locale !== undefined ? { locale: body.locale } : {}),
        ...(body.onboarding_completed_at !== undefined
          ? {
              onboardingCompletedAt: body.onboarding_completed_at
                ? new Date(body.onboarding_completed_at)
                : null,
            }
          : {}),
        updatedAt: this.clock.now(),
      })
      .where(eq(users.id, userId))
      .returning();
    return toMeResponse(updated!);
  }

  async getSettings(userId: string): Promise<SettingsResponse> {
    await this.findActiveUser(userId);
    const rows = await this.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    const settings = rows[0];
    if (!settings) throw new NotFoundError('Settings not found.');
    return toSettingsResponse(settings);
  }

  async updateSettings(userId: string, body: UpdateSettingsBody): Promise<SettingsResponse> {
    await this.findActiveUser(userId);
    const patch: Partial<typeof userSettings.$inferInsert> = {};
    if (body.daily_summary_enabled !== undefined)
      patch.dailySummaryEnabled = body.daily_summary_enabled;
    if (body.daily_summary_time !== undefined) patch.dailySummaryTime = body.daily_summary_time;
    if (body.quiet_hours_start !== undefined) patch.quietHoursStart = body.quiet_hours_start;
    if (body.quiet_hours_end !== undefined) patch.quietHoursEnd = body.quiet_hours_end;
    if (body.max_push_per_day !== undefined) patch.maxPushPerDay = body.max_push_per_day;
    if (body.default_event_reminder_min !== undefined)
      patch.defaultEventReminderMin = body.default_event_reminder_min;
    if (body.default_task_reminder_time !== undefined)
      patch.defaultTaskReminderTime = body.default_task_reminder_time;

    const [updated] = await this.db
      .update(userSettings)
      .set(patch)
      .where(eq(userSettings.userId, userId))
      .returning();
    if (!updated) throw new NotFoundError('Settings not found.');
    return toSettingsResponse(updated);
  }

  // 10.5: deletion is immediate from the user's point of view (soft delete +
  // session revocation); a hard purge job (<=30 days) lands with the
  // scheduler in M6.
  async deleteAccount(userId: string): Promise<void> {
    await this.findActiveUser(userId);
    await this.db
      .update(users)
      .set({ deletedAt: this.clock.now(), updatedAt: this.clock.now() })
      .where(eq(users.id, userId));
    await this.authService.logoutAll(userId);
  }
}

function toMeResponse(user: typeof users.$inferSelect): MeResponse {
  return {
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    timezone: user.timezone,
    locale: user.locale,
    onboarding_completed_at: user.onboardingCompletedAt?.toISOString() ?? null,
  };
}

function toSettingsResponse(settings: typeof userSettings.$inferSelect): SettingsResponse {
  return {
    daily_summary_enabled: settings.dailySummaryEnabled,
    daily_summary_time: settings.dailySummaryTime,
    quiet_hours_start: settings.quietHoursStart,
    quiet_hours_end: settings.quietHoursEnd,
    max_push_per_day: settings.maxPushPerDay,
    default_event_reminder_min: settings.defaultEventReminderMin,
    default_task_reminder_time: settings.defaultTaskReminderTime,
  };
}
