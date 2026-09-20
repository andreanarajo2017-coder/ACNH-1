import { createHash, randomBytes } from 'node:crypto';

// D-11: opaque, rotating refresh tokens (30 days). The token itself is a
// random string handed to the client; only its hash is ever persisted, so a
// database leak doesn't expose usable tokens.
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
