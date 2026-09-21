import { z } from 'zod';

export const reminderTargetTypeSchema = z.enum(['task', 'event']);
export const reminderTriggerTypeSchema = z.enum(['absolute', 'relative_to_start', 'location']);
export const reminderStatusSchema = z.enum(['scheduled', 'sent', 'dismissed', 'cancelled']);

export const reminderResponseSchema = z.object({
  id: z.string().uuid(),
  target_type: reminderTargetTypeSchema,
  target_id: z.string().uuid(),
  trigger_type: reminderTriggerTypeSchema,
  trigger_at: z.string().nullable(),
  offset_minutes: z.number().nullable(),
  status: reminderStatusSchema,
  sent_at: z.string().nullable(),
});
export type ReminderResponse = z.infer<typeof reminderResponseSchema>;

export const createReminderBodySchema = z
  .object({
    target_type: reminderTargetTypeSchema,
    target_id: z.string().uuid(),
    trigger_type: reminderTriggerTypeSchema,
    trigger_at: z.string().datetime({ offset: true }).optional(),
    offset_minutes: z.number().int().min(0).max(43200).optional(),
  })
  .refine(
    (body) => {
      if (body.trigger_type === 'absolute') return body.trigger_at != null;
      if (body.trigger_type === 'relative_to_start') return body.offset_minutes != null;
      return true; // 'location' is reserved (P2) — no fields required yet.
    },
    {
      message: 'absolute needs trigger_at; relative_to_start needs offset_minutes.',
    },
  );
export type CreateReminderBody = z.infer<typeof createReminderBodySchema>;

export const updateReminderBodySchema = z
  .object({
    trigger_at: z.string().datetime({ offset: true }).nullable().optional(),
    offset_minutes: z.number().int().min(0).max(43200).nullable().optional(),
    status: reminderStatusSchema.optional(),
  })
  .strict();
export type UpdateReminderBody = z.infer<typeof updateReminderBodySchema>;

export const reminderIdParamsSchema = z.object({ id: z.string().uuid() });

export const listRemindersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  target_type: reminderTargetTypeSchema.optional(),
  target_id: z.string().uuid().optional(),
});
export type ListRemindersQuery = z.infer<typeof listRemindersQuerySchema>;

export const listRemindersResponseSchema = z.object({
  data: z.array(reminderResponseSchema),
  next_cursor: z.string().nullable(),
});
