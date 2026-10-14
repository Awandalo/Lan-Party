import { AUTH_POLICY, expiresAt } from './config';
import { fromHex, toHex } from './encoding';

export type TokenPurpose = 'session' | 'email-verification' | 'password-reset';
const encoder = new TextEncoder();

export function isValidToken(token: string): boolean {
  return typeof token === 'string' && /^[0-9a-f]{64}$/.test(token);
}

function validatePurpose(purpose: TokenPurpose): void {
  if (purpose !== 'session' && purpose !== 'email-verification' && purpose !== 'password-reset') {
    throw new Error('Invalid token purpose');
  }
}

export function generateToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

// Persist only the digest. Domain separation prevents reuse across token purposes.
export async function digestToken(token: string, purpose: TokenPurpose): Promise<string> {
  validatePurpose(purpose);
  if (!isValidToken(token)) throw new Error('Invalid token format');
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`lan-party:${purpose}:v1:${token}`));
  return toHex(new Uint8Array(digest));
}

export async function matchesToken(token: string, purpose: TokenPurpose, digest: string): Promise<boolean> {
  validatePurpose(purpose);
  if (!isValidToken(token) || typeof digest !== 'string') return false;
  const expected = fromHex(digest, 32);
  if (!expected) return false;
  const actual = fromHex(await digestToken(token, purpose), 32)!;
  return crypto.subtle.timingSafeEqual(actual, expected);
}

export function actionTokenExpiresAt(purpose: Exclude<TokenPurpose, 'session'>, now: number): number {
  if (purpose !== 'email-verification' && purpose !== 'password-reset') throw new Error('Invalid action token purpose');
  return expiresAt(now, purpose === 'email-verification'
    ? AUTH_POLICY.emailVerificationSeconds : AUTH_POLICY.passwordResetSeconds);
}

export function isTokenUsable(record: { createdAt: number; expiresAt: number; consumedAt: number | null }, now: number): boolean {
  return Number.isSafeInteger(now) && now >= 0 && Number.isSafeInteger(record.createdAt)
    && record.createdAt >= 0 && Number.isSafeInteger(record.expiresAt)
    && record.expiresAt > record.createdAt && record.createdAt <= now
    && now < record.expiresAt && record.consumedAt === null;
}
