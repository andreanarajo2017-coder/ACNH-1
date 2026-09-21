import { z } from 'zod';

export const calendarQuerySchema = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
  })
  .refine((q) => new Date(q.from).getTime() <= new Date(q.to).getTime(), {
    message: '`from` must be before or equal to `to`.',
  });
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;

export const calendarItemSchema = z.object({
  type: z.enum(['event', 'task']),
  id: z.string().uuid(),
  title: z.string(),
  start_at: z.string(),
  end_at: z.string().nullable(),
  all_day: z.boolean(),
  location_text: z.string().nullable(),
  person_id: z.string().uuid().nullable(),
  category_id: z.string().uuid().nullable(),
});
export type CalendarItem = z.infer<typeof calendarItemSchema>;

export const calendarResponseSchema = z.object({
  data: z.array(calendarItemSchema),
});
