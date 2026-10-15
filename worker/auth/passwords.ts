import { AUTH_POLICY } from './config';
import { fromHex, toHex } from './encoding';

const encoder = new TextEncoder();
const recordPrefix = 'lp-pbkdf2-hmac-sha256-v2';
const legacyPrefix = 'lp-pbkdf2-sha256-v1';

// Supply PASSWORD_PEPPER from a Worker secret. Never persist it with the record.
async function pepperKey(pepper: unknown): Promise<CryptoKey> {
  if (typeof pepper !== 'string' || pepper.length !== 64 || !/^[0-9a-f]{64}$/.test(pepper)) {
    throw new Error('Password pepper configuration is unavailable');
  }
  return crypto.subtle.importKey('raw', fromHex(pepper, 32)!,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

export function passwordNeedsUpgrade(record: string): boolean {
  const parsed = parseRecord(record);
  return parsed !== null && (parsed.legacy || parsed.iterations < AUTH_POLICY.passwordIterations);
}

export function isCurrentPasswordRecord(record: string): boolean {
  const parsed = parseRecord(record);
  return parsed !== null && !parsed.legacy && parsed.iterations === AUTH_POLICY.passwordIterations;
}

function parseRecord(record: string) {
  if (typeof record !== 'string' || record.length > 150) return null;
  const fields = record.split('$');
  if (fields.length !== 4 || ![recordPrefix, legacyPrefix].includes(fields[0])
    || !/^[1-9][0-9]{4,6}$/.test(fields[1])) return null;
  const legacy = fields[0] === legacyPrefix;
  const iterations = Number(fields[1]);
  if (String(iterations) !== fields[1]) return null;
  // Format floors stay fixed when the target policy rises, so older valid records
  // remain verifiable and can be identified for an explicit work-factor upgrade.
  if (iterations < (legacy ? 600_000 : 20_000)
    || iterations > AUTH_POLICY.maximumPasswordIterations) return null;
  const salt = fromHex(fields[2], 16);
  const verifier = fromHex(fields[3], 32);
  return salt && verifier ? { legacy, iterations, salt, verifier } : null;
}

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

export async function hashPassword(password: string, pepper: unknown): Promise<string> {
  const key = await pepperKey(pepper);
  if (!isValidPassword(password)) throw new Error('Password does not satisfy length policy');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derive(password, salt, AUTH_POLICY.passwordIterations);
  const verifier = await crypto.subtle.sign('HMAC', key, derived);
  return `${recordPrefix}$${AUTH_POLICY.passwordIterations}$${toHex(salt)}$${toHex(new Uint8Array(verifier))}`;
}

export async function verifyPassword(password: string, record: string, pepper: unknown): Promise<boolean> {
  const key = await pepperKey(pepper); // Misconfiguration fails closed, even for legacy records.
  if (!isValidPassword(password)) return false;
  const parsed = parseRecord(record);
  if (!parsed) return false;
  const derived = await derive(password, parsed.salt, parsed.iterations);
  // Preserve explicit v1 compatibility; never reinterpret an unpeppered record as v2.
  // Hosted v1 iteration limits propagate as unavailable, not an incorrect password.
  const actual = parsed.legacy ? derived : await crypto.subtle.sign('HMAC', key, derived);
  // Workers native comparison; do not substitute a JavaScript comparison loop.
  return crypto.subtle.timingSafeEqual(actual, parsed.verifier);
}
