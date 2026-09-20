import jwt from 'jsonwebtoken';

export interface AccessTokenPayload {
  sub: string; // user id
}

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // D-11: 15 min

export function signAccessToken(secret: string, payload: AccessTokenPayload): string {
  return jwt.sign(payload, secret, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
}

export function verifyAccessToken(secret: string, token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, secret);
  if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
    throw new Error('invalid_token_payload');
  }
  return { sub: decoded.sub };
}
