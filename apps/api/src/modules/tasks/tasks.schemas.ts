import { z } from 'zod';

export const taskStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'postponed',
  'cancelled',
]);
export const prioritySchema = z.enum(['low', 'medium', 'high']);

export const taskResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  status: taskStatusSchema,
  priority: prioritySchema,
  category_id: z.string().uuid().nullable(),
  person_id: z.string().uuid().nullable(),
  location_text: z.string().nullable(),
  due_date: z.string().nullable(),
  due_at: z.string().nullable(),
  estimated_minutes: z.number().nullable(),
  postponed_until: z.string().nullable(),
  completed_at: z.string().nullable(),
  recurrence_rule: z.string().nullable(),
  series_id: z.string().uuid().nullable(),
  source: z.enum(['manual', 'ai', 'device_calendar']),
  created_at: z.string(),
  updated_at: z.string(),
});
export type TaskResponse = z.infer<typeof taskResponseSchema>;

export const createTaskBodySchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(4000).optional(),
    priority: prioritySchema.optional(),
    category_id: z.string().uuid().optional(),
    person_id: z.string().uuid().optional(),
    location_text: z.string().max(200).optional(),
    due_date: z.string().date().optional(),
    due_at: z.string().datetime({ offset: true }).optional(),
    estimated_minutes: z.number().int().min(1).max(1440).optional(),
    recurrence_rule: z.string().max(200).optional(),
  })
  .refine((body) => !(body.due_date != null && body.due_at != null), {
    message: 'due_date and due_at are mutually exclusive (section 6)',
  });
export type CreateTaskBody = z.infer<typeof createTaskBodySchema>;

export const updateTaskBodySchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(4000).nullable().optional(),
    priority: prioritySchema.optional(),
    category_id: z.string().uuid().nullable().optional(),
    person_id: z.string().uuid().nullable().optional(),
    location_text: z.string().max(200).nullable().optional(),
    due_date: z.string().date().nullable().optional(),
    due_at: z.string().datetime({ offset: true }).nullable().optional(),
    estimated_minutes: z.number().int().min(1).max(1440).nullable().optional(),
    recurrence_rule: z.string().max(200).nullable().optional(),
  })
  .strict()
  .refine((body) => !(body.due_date != null && body.due_at != null), {
    message: 'due_date and due_at are mutually exclusive (section 6)',
  });
export type UpdateTaskBody = z.infer<typeof updateTaskBodySchema>;

export const taskIdParamsSchema = z.object({ id: z.string().uuid() });

export const listTasksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  status: taskStatusSchema.optional(),
  due_from: z.string().date().optional(),
  due_to: z.string().date().optional(),
  category_id: z.string().uuid().optional(),
  person_id: z.string().uuid().optional(),
  q: z.string().max(200).optional(),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

export const listTasksResponseSchema = z.object({
  data: z.array(taskResponseSchema),
  next_cursor: z.string().nullable(),
});

export const postponeBodySchema = z
  .object({
    preset: z.enum(['later_today', 'tomorrow', 'next_week']).optional(),
    until: z.string().datetime({ offset: true }).optional(),
  })
  .refine((body) => (body.preset != null) !== (body.until != null), {
    message: 'Provide exactly one of preset or until.',
  });
export type PostponeBody = z.infer<typeof postponeBodySchema>;
