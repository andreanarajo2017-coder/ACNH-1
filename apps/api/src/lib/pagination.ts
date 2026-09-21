import { z } from 'zod';

// Section 7: `?limit=50&cursor=…` -> `{ data: [], next_cursor: null }`.
// The cursor encodes (created_at, id) of the last row returned, so list
// queries order by `created_at, id` and keyset-paginate on that pair.
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface CursorPage<T> {
  data: T[];
  next_cursor: string | null;
}

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!iso || !id) return null;
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
