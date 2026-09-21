import { z } from 'zod';

export const eventResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  start_at: z.string().nullable(),
  end_at: z.string().nullable(),
  all_day: z.boolean(),
  start_date: z.string().nullable(),
  timezone: z.string().nullable(),
  location_text: z.string().nullable(),
  person_id: z.string().uuid().nullable(),
  category_id: z.string().uuid().nullable(),
  recurrence_rule: z.string().nullable(),
  source: z.enum(['app', 'device_calendar']),
  created_at: z.string(),
  updated_at: z.string(),
});
export type EventResponse = z.infer<typeof eventResponseSchema>;

export const createEventBodySchema = z
  .object({
    title: z.string().min(1).max(200),
    all_day: z.boolean().optional(),
    start_at: z.string().datetime({ offset: true }).optional(),
    end_at: z.string().datetime({ offset: true }).optional(),
    start_date: z.string().date().optional(),
    timezone: z.string().max(60).optional(),
    location_text: z.string().max(200).optional(),
    person_id: z.string().uuid().optional(),
    category_id: z.string().uuid().optional(),
    recurrence_rule: z.string().max(200).optional(),
  })
  .refine((body) => (body.all_day ? body.start_date != null : body.start_at != null), {
    message: 'Provide start_at, or all_day=true with start_date (section 6).',
  });
export type CreateEventBody = z.infer<typeof createEventBodySchema>;

export const updateEventBodySchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    all_day: z.boolean().optional(),
    start_at: z.string().datetime({ offset: true }).nullable().optional(),
    end_at: z.string().datetime({ offset: true }).nullable().optional(),
    start_date: z.string().date().nullable().optional(),
    timezone: z.string().max(60).nullable().optional(),
    location_text: z.string().max(200).nullable().optional(),
    person_id: z.string().uuid().nullable().optional(),
    category_id: z.string().uuid().nullable().optional(),
    recurrence_rule: z.string().max(200).nullable().optional(),
  })
  .strict();
export type UpdateEventBody = z.infer<typeof updateEventBodySchema>;

export const eventIdParamsSchema = z.object({ id: z.string().uuid() });

export const listEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;

export const listEventsResponseSchema = z.object({
  data: z.array(eventResponseSchema),
  next_cursor: z.string().nullable(),
});
