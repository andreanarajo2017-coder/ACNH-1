import { randomBytes, randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import {
  authIdentities,
  categories,
  passwordResetTokens,
  refreshTokens,
  userSettings,
  users,
} from '../../db/schema.js';
import { CURRENT_TERMS_VERSION } from '../../config/terms.js';
import {
  ApiError,
  ConflictError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from '../../lib/errors.js';
import type { Clock } from '../../lib/clock.js';
import { signAccessToken, verifyAccessToken } from '../../lib/jwt.js';
import type { LoginRateLimiter } from '../../lib/login-rate-limiter.js';
import type { Mailer } from '../../lib/mailer.js';
import { hashPassword, isPasswordAcceptable, verifyPassword } from '../../lib/password.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_MS,
} from '../../lib/refresh-token.js';
import { DEFAULT_CATEGORIES } from '../categories/default-categories.js';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

// Postgres error code 23505 = unique_violation.
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505'
  );
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export class AuthService {
  constructor(
    private db: Db,
    private clock: Clock,
    private jwtAccessSecret: string,
    private mailer: Mailer,
    private rateLimiter: LoginRateLimiter,
  ) {}

  private async issueTokens(userId: string, deviceId?: string): Promise<AuthTokens> {
    const accessToken = signAccessToken(this.jwtAccessSecret, { sub: userId });
    const refreshToken = generateRefreshToken();
    await this.db.insert(refreshTokens).values({
      userId,
      familyId: randomUUID(),
      tokenHash: hashRefreshToken(refreshToken),
      ...(deviceId ? { deviceId } : {}),
      expiresAt: new Date(this.clock.now().getTime() + REFRESH_TOKEN_TTL_MS),
      createdAt: this.clock.now(),
    });
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  // AC-F01-01, AC-F01-02
  async register(email: string, password: string): Promise<{ userId: string; tokens: AuthTokens }> {
    if (!isPasswordAcceptable(password)) {
      throw new ValidationError('Password does not meet the minimum requirements.');
    }

    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);
    if (existing.length > 0) {
      throw new ConflictError('email_taken', 'Email is already registered.');
    }

    const passwordHash = await hashPassword(password);
    const now = this.clock.now();

    let userId: string;
    try {
      userId = await this.db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({
            email,
            termsVersion: CURRENT_TERMS_VERSION,
            termsAcceptedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: users.id });
        if (!user) throw new Error('user_insert_failed');

        await tx.insert(authIdentities).values({
          userId: user.id,
          provider: 'password',
          passwordHash,
          createdAt: now,
          updatedAt: now,
        });

        await tx.insert(userSettings).values({ userId: user.id });

        await tx.insert(categories).values(
          DEFAULT_CATEGORIES.map((c) => ({
            userId: user.id,
            name: c.name,
            color: c.color,
            icon: c.icon,
            isDefault: true,
            createdAt: now,
            updatedAt: now,
          })),
        );

        return user.id;
      });
    } catch (err) {
      // Defense in depth against the race where two requests for the same
      // email both pass the SELECT check above (see ADR-005's partial
      // unique index).
      if (isUniqueViolation(err)) {
        throw new ConflictError('email_taken', 'Email is already registered.');
      }
      throw err;
    }

    const tokens = await this.issueTokens(userId);
    return { userId, tokens };
  }

  // AC-F01-03
  async login(email: string, password: string, ip: string): Promise<AuthTokens> {
    const rateLimit = await this.rateLimiter.checkAndRecord(email, ip);
    if (!rateLimit.allowed) {
      throw new TooManyRequestsError('Too many login attempts.', rateLimit.retryAfterSeconds);
    }

    const rows = await this.db
      .select({ userId: users.id, passwordHash: authIdentities.passwordHash })
      .from(users)
      .innerJoin(
        authIdentities,
        and(eq(authIdentities.userId, users.id), eq(authIdentities.provider, 'password')),
      )
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    const row = rows[0];
    const valid = row?.passwordHash ? await verifyPassword(row.passwordHash, password) : false;

    if (!row || !valid) {
      await this.rateLimiter.recordFailure(email, ip);
      throw new UnauthorizedError('Invalid email or password.');
    }

    await this.rateLimiter.recordSuccess(email, ip);
    return this.issueTokens(row.userId);
  }

  // AC-F01-04
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = hashRefreshToken(refreshToken);
    const rows = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    const row = rows[0];

    if (!row) {
      throw new UnauthorizedError('Invalid refresh token.');
    }

    if (row.revokedAt) {
      // Presenting an already-revoked token again — either genuine reuse of
      // a rotated token (compromise) or a replay of an explicitly logged-out
      // one. Either way the token is no longer valid, and since we can't
      // tell the two apart we conservatively burn the rest of this chain
      // (AC-F01-04). This never reaches other devices/sessions: each
      // login/register issues its own family (see issueTokens).
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedError('Refresh token is no longer valid.');
    }

    if (row.expiresAt.getTime() <= this.clock.now().getTime()) {
      throw new UnauthorizedError('Refresh token expired.');
    }

    const newRefreshToken = generateRefreshToken();
    const newTokenId = randomUUID();
    const now = this.clock.now();

    await this.db.transaction(async (tx) => {
      await tx.insert(refreshTokens).values({
        id: newTokenId,
        userId: row.userId,
        familyId: row.familyId,
        tokenHash: hashRefreshToken(newRefreshToken),
        deviceId: row.deviceId,
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
        createdAt: now,
      });
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now, replacedBy: newTokenId })
        .where(eq(refreshTokens.id, row.id));
    });

    const accessToken = signAccessToken(this.jwtAccessSecret, { sub: row.userId });
    return {
      access_token: accessToken,
      refresh_token: newRefreshToken,
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(refreshToken);
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: this.clock.now() })
      .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));
  }

  async logoutAll(userId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: this.clock.now() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: this.clock.now() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }

  // AC-F01-05: identical response whether or not the email exists.
  async requestPasswordReset(email: string): Promise<void> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);
    const user = rows[0];
    if (!user) return;

    const token = randomBytes(32).toString('base64url');
    await this.db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashRefreshToken(token),
      expiresAt: new Date(this.clock.now().getTime() + PASSWORD_RESET_TTL_MS),
      createdAt: this.clock.now(),
    });

    await this.mailer.sendPasswordReset({ to: email, resetToken: token });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (!isPasswordAcceptable(newPassword)) {
      throw new ValidationError('Password does not meet the minimum requirements.');
    }

    const tokenHash = hashRefreshToken(token);
    const rows = await this.db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.usedAt)))
      .limit(1);
    const row = rows[0];

    if (!row || row.expiresAt.getTime() <= this.clock.now().getTime()) {
      throw new ApiError(400, 'invalid_token', 'Reset token is invalid or expired.');
    }

    const passwordHash = await hashPassword(newPassword);
    const now = this.clock.now();

    await this.db.transaction(async (tx) => {
      await tx
        .update(authIdentities)
        .set({ passwordHash, updatedAt: now })
        .where(and(eq(authIdentities.userId, row.userId), eq(authIdentities.provider, 'password')));
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(eq(passwordResetTokens.id, row.id));
    });

    // Resetting the password invalidates existing sessions.
    await this.logoutAll(row.userId);
  }

  verifyAccessToken(token: string): { userId: string } {
    try {
      const payload = verifyAccessToken(this.jwtAccessSecret, token);
      return { userId: payload.sub };
    } catch {
      throw new UnauthorizedError('Invalid or expired access token.');
    }
  }
}
