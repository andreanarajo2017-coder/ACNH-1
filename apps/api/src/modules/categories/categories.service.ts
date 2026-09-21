import { and, asc, eq, gt, isNull, or } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { categories, events, tasks } from '../../db/schema.js';
import type { Clock } from '../../lib/clock.js';
import { NotFoundError } from '../../lib/errors.js';
import {
  decodeCursor,
  encodeCursor,
  type CursorPage,
  type PaginationQuery,
} from '../../lib/pagination.js';
import type {
  CategoryResponse,
  CreateCategoryBody,
  UpdateCategoryBody,
} from './categories.schemas.js';

export class CategoriesService {
  constructor(
    private db: Db,
    private clock: Clock,
  ) {}

  async list(userId: string, query: PaginationQuery): Promise<CursorPage<CategoryResponse>> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    const rows = await this.db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.userId, userId),
          isNull(categories.deletedAt),
          cursor
            ? or(
                gt(categories.createdAt, cursor.createdAt),
                and(eq(categories.createdAt, cursor.createdAt), gt(categories.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(asc(categories.createdAt), asc(categories.id))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const hasMore = rows.length > query.limit;
    const last = page.at(-1);

    return {
      data: page.map(toCategoryResponse),
      next_cursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async create(userId: string, body: CreateCategoryBody): Promise<CategoryResponse> {
    const now = this.clock.now();
    const [row] = await this.db
      .insert(categories)
      .values({
        userId,
        name: body.name,
        color: body.color ?? null,
        icon: body.icon ?? null,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return toCategoryResponse(row!);
  }

  async update(userId: string, id: string, body: UpdateCategoryBody): Promise<CategoryResponse> {
    await this.findOwned(userId, id);
    const [row] = await this.db
      .update(categories)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.icon !== undefined ? { icon: body.icon } : {}),
        updatedAt: this.clock.now(),
      })
      .where(eq(categories.id, id))
      .returning();
    return toCategoryResponse(row!);
  }

  // Deleting a category (default or custom) leaves its tasks/events with
  // category_id = null — same reasoning as people (see PeopleService.delete).
  async delete(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);
    const now = this.clock.now();
    await this.db.transaction(async (tx) => {
      await tx
        .update(tasks)
        .set({ categoryId: null, updatedAt: now })
        .where(eq(tasks.categoryId, id));
      await tx
        .update(events)
        .set({ categoryId: null, updatedAt: now })
        .where(eq(events.categoryId, id));
      await tx
        .update(categories)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(categories.id, id));
    });
  }

  private async findOwned(userId: string, id: string) {
    const rows = await this.db
      .select()
      .from(categories)
      .where(
        and(eq(categories.id, id), eq(categories.userId, userId), isNull(categories.deletedAt)),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundError('Category not found.');
    return row;
  }
}

function toCategoryResponse(row: typeof categories.$inferSelect): CategoryResponse {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    is_default: row.isDefault,
  };
}
