import { z } from 'zod';

export const meResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable(),
  display_name: z.string().nullable(),
  timezone: z.string(),
  locale: z.string().nullable(),
  onboarding_completed_at: z.string().nullable(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const updateMeBodySchema = z
  .object({
    display_name: z.string().max(120).nullable().optional(),
    timezone: z.string().max(60).optional(),
    locale: z.string().max(20).optional(),
    onboarding_completed_at: z.string().datetime().nullable().optional(),
  })
  .strict();
export type UpdateMeBody = z.infer<typeof updateMeBodySchema>;

export const settingsResponseSchema = z.object({
  daily_summary_enabled: z.boolean(),
  daily_summary_time: z.string(),
  quiet_hours_start: z.string(),
  quiet_hours_end: z.string(),
  max_push_per_day: z.number(),
  default_event_reminder_min: z.number(),
  default_task_reminder_time: z.string(),
});
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;

export const updateSettingsBodySchema = z
  .object({
    daily_summary_enabled: z.boolean().optional(),
    daily_summary_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    quiet_hours_start: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    quiet_hours_end: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    max_push_per_day: z.number().int().min(0).max(50).optional(),
    default_event_reminder_min: z.number().int().min(0).optional(),
    default_task_reminder_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
  })
  .strict();
export type UpdateSettingsBody = z.infer<typeof updateSettingsBodySchema>;
