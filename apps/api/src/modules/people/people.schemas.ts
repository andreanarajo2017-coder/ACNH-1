import { z } from 'zod';

export const relationshipSchema = z.enum(['child', 'partner', 'family', 'friend', 'other']);

export const personResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  relationship: relationshipSchema,
  aliases: z.array(z.string()),
  birthday: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type PersonResponse = z.infer<typeof personResponseSchema>;

export const createPersonBodySchema = z.object({
  name: z.string().min(1).max(120),
  relationship: relationshipSchema,
  aliases: z.array(z.string().min(1).max(60)).max(20).optional(),
  birthday: z.string().date().optional(),
  notes: z.string().max(1000).optional(),
});
export type CreatePersonBody = z.infer<typeof createPersonBodySchema>;

export const updatePersonBodySchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    relationship: relationshipSchema.optional(),
    aliases: z.array(z.string().min(1).max(60)).max(20).optional(),
    birthday: z.string().date().nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
  })
  .strict();
export type UpdatePersonBody = z.infer<typeof updatePersonBodySchema>;

export const personIdParamsSchema = z.object({ id: z.string().uuid() });

export const listPeopleResponseSchema = z.object({
  data: z.array(personResponseSchema),
  next_cursor: z.string().nullable(),
});
