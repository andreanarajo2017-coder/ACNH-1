import { and, eq, gte } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { aiInteractions } from '../db/schema.js';
import type { Clock } from './clock.js';
import { TooManyRequestsError } from './errors.js';

// 8.1: 60 parses/hora y 200/día por usuario. Persisted via ai_interactions
// itself (one row per parse attempt) rather than a separate counter table
// — same reasoning as LoginRateLimiter: the API runs as multiple stateless
// instances (10.2), so this can't be in-memory.
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PER_HOUR = 60;
const MAX_PER_DAY = 200;

export class AiRateLimiter {
  constructor(
    private db: Db,
    private clock: Clock,
  ) {}

  async check(userId: string): Promise<void> {
    const now = this.clock.now();
    const dayAgo = new Date(now.getTime() - DAY_MS);
    const hourAgo = new Date(now.getTime() - HOUR_MS);

    const rows = await this.db
      .select({ createdAt: aiInteractions.createdAt })
      .from(aiInteractions)
      .where(and(eq(aiInteractions.userId, userId), gte(aiInteractions.createdAt, dayAgo)));

    if (rows.length >= MAX_PER_DAY) {
      throw new TooManyRequestsError('AI parse rate limit exceeded (200/day).', 24 * 60 * 60);
    }
    const lastHour = rows.filter((r) => r.createdAt >= hourAgo).length;
    if (lastHour >= MAX_PER_HOUR) {
      throw new TooManyRequestsError('AI parse rate limit exceeded (60/hour).', 60 * 60);
    }
  }
}
