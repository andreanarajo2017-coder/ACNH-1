import { z } from 'zod';

export const categoryResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  is_default: z.boolean(),
});
export type CategoryResponse = z.infer<typeof categoryResponseSchema>;

export const createCategoryBodySchema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().max(20).optional(),
  icon: z.string().max(60).optional(),
});
export type CreateCategoryBody = z.infer<typeof createCategoryBodySchema>;

export const updateCategoryBodySchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    color: z.string().max(20).nullable().optional(),
    icon: z.string().max(60).nullable().optional(),
  })
  .strict();
export type UpdateCategoryBody = z.infer<typeof updateCategoryBodySchema>;

export const categoryIdParamsSchema = z.object({ id: z.string().uuid() });

export const listCategoriesResponseSchema = z.object({
  data: z.array(categoryResponseSchema),
  next_cursor: z.string().nullable(),
});
