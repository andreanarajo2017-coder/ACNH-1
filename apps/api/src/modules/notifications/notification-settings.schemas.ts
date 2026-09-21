import { z } from 'zod';
import { notificationTypeEnum } from '../../db/schema.js';
import { ALL_NOTIFICATION_TYPES } from './notification-types.js';

export const notificationTypeSchema = z.enum(notificationTypeEnum.enumValues);

export const notificationTypeSettingSchema = z.object({
  type: notificationTypeSchema,
  enabled: z.boolean(),
});
export type NotificationTypeSettingDto = z.infer<typeof notificationTypeSettingSchema>;

export const listNotificationSettingsResponseSchema = z.object({
  data: z.array(notificationTypeSettingSchema),
});

// F16: "configurables por tipo desde Perfil" — a partial batch of
// {type, enabled}, one entry per type the user actually toggled.
export const updateNotificationSettingsBodySchema = z
  .object({
    settings: z.array(notificationTypeSettingSchema).min(1).max(ALL_NOTIFICATION_TYPES.length),
  })
  .strict();
export type UpdateNotificationSettingsBody = z.infer<typeof updateNotificationSettingsBodySchema>;
