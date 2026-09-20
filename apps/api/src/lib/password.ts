import argon2 from 'argon2';

// D-11: passwords hashed with argon2id.
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}

// F01: minimum 10 characters, no composition rules, reject very common
// passwords. This list is intentionally short — a real deny-list (e.g. the
// top 10k leaked passwords) is a later hardening pass, not core to M1.
const COMMON_PASSWORDS = new Set([
  '123456789a',
  'password123',
  'qwertyuiop',
  '1234567890',
  'abcdefghij',
  'iloveyou12',
  'letmein123',
  'admin12345',
  'welcome123',
  '0123456789',
]);

export function isPasswordAcceptable(plain: string): boolean {
  if (plain.length < 10) return false;
  if (COMMON_PASSWORDS.has(plain.toLowerCase())) return false;
  return true;
}
