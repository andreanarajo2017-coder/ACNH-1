import { and, eq, gte, isNull } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { loginAttempts } from '../db/schema.js';
import type { Clock } from './clock.js';

// AC-F01-03: 5 failed logins / 15 min per email+IP -> 429 with Retry-After.
// Persisted (not in-memory) because the API is meant to run as multiple
// stateless instances (10.2).
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export class LoginRateLimiter {
  constructor(
    private db: Db,
    private clock: Clock,
  ) {}

  async checkAndRecord(
    email: string,
    ip: string,
  ): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
    const windowStart = new Date(this.clock.now().getTime() - WINDOW_MS);

    const recentFailures = await this.db
      .select({ createdAt: loginAttempts.createdAt })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.email, email),
          eq(loginAttempts.ip, ip),
          gte(loginAttempts.createdAt, windowStart),
          isNull(loginAttempts.succeededAt),
        ),
      );

    if (recentFailures.length >= MAX_ATTEMPTS) {
      const oldestInWindow = recentFailures.reduce(
        (min, row) => (row.createdAt < min ? row.createdAt : min),
        recentFailures[0]!.createdAt,
      );
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldestInWindow.getTime() + WINDOW_MS - this.clock.now().getTime()) / 1000),
      );
      return { allowed: false, retryAfterSeconds };
    }

    return { allowed: true };
  }

  async recordFailure(email: string, ip: string): Promise<void> {
    await this.db.insert(loginAttempts).values({ email, ip, createdAt: this.clock.now() });
  }

  async recordSuccess(email: string, ip: string): Promise<void> {
    await this.db
      .insert(loginAttempts)
      .values({ email, ip, createdAt: this.clock.now(), succeededAt: this.clock.now() });
  }
}
