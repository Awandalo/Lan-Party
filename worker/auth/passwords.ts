import { AUTH_POLICY } from './config';
import { fromHex, toHex } from './encoding';

const encoder = new TextEncoder();
const recordPrefix = 'lp-pbkdf2-sha256-v1';

export function isValidPassword(password: string): boolean {
  // TextEncoder replaces lone surrogates; reject them to prevent distinct inputs aliasing.
  if (typeof password !== 'string' || password.length > 256
    || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(password)) return false;
  const length = Array.from(password).length;
  return length >= AUTH_POLICY.minimumPasswordCharacters
    && length <= AUTH_POLICY.maximumPasswordCharacters;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashPassword(password: string): Promise<string> {
  if (!isValidPassword(password)) throw new Error('Password does not satisfy length policy');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, AUTH_POLICY.passwordIterations);
  return `${recordPrefix}$${AUTH_POLICY.passwordIterations}$${toHex(salt)}$${toHex(new Uint8Array(hash))}`;
}

export async function verifyPassword(password: string, record: string): Promise<boolean> {
  if (!isValidPassword(password) || typeof record !== 'string' || record.length > 150) return false;
  const fields = record.split('$');
  if (fields.length !== 4 || fields[0] !== recordPrefix || !/^[1-9][0-9]{5,6}$/.test(fields[1])) return false;
  const iterations = Number(fields[1]);
  // Reject cheap/unknown hashes and excessive costs before running expensive crypto.
  if (iterations < AUTH_POLICY.passwordIterations || iterations > AUTH_POLICY.maximumPasswordIterations) return false;
  const salt = fromHex(fields[2], 16);
  const expected = fromHex(fields[3], 32);
  if (!salt || !expected) return false;
  const actual = await derive(password, salt, iterations);
  // Workers native comparison; do not substitute a JavaScript comparison loop.
  return crypto.subtle.timingSafeEqual(actual, expected);
}
