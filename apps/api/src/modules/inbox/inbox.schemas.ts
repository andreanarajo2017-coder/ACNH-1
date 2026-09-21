import { z } from 'zod';

export const inboxStatusSchema = z.enum(['unprocessed', 'processed', 'discarded']);

export const inboxItemResponseSchema = z.object({
  id: z.string().uuid(),
  raw_text: z.string(),
  status: inboxStatusSchema,
  captured_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type InboxItemResponse = z.infer<typeof inboxItemResponseSchema>;

export const createInboxItemBodySchema = z.object({
  raw_text: z.string().min(1).max(1000),
  captured_at: z.string().datetime({ offset: true }).optional(),
});
export type CreateInboxItemBody = z.infer<typeof createInboxItemBodySchema>;

export const updateInboxItemBodySchema = z
  .object({
    status: inboxStatusSchema.optional(),
  })
  .strict();
export type UpdateInboxItemBody = z.infer<typeof updateInboxItemBodySchema>;

export const inboxItemIdParamsSchema = z.object({ id: z.string().uuid() });

export const listInboxQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  status: inboxStatusSchema.optional(),
});
export type ListInboxQuery = z.infer<typeof listInboxQuerySchema>;

export const listInboxResponseSchema = z.object({
  data: z.array(inboxItemResponseSchema),
  next_cursor: z.string().nullable(),
});
