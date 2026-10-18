import { fromHex, toHex } from './encoding';
import { serverTime } from './database';

// Conservative LOCAL development defaults, subject to owner review before DEV enablement.
export const REGISTRATION_LIMITS = Object.freeze({ global: 30, ip: 5, account: 3 });
export class RegistrationRateLimit extends Error {}

export async function registrationLimiter(db: D1Database, secret: string, now: number,
  action: 'registration' | 'login' | 'email-resend' | 'email-confirm' | 'password-forgot' | 'password-reset' | 'password-add' = 'registration') {
  serverTime(now);
  const bytes = fromHex(secret, 32);
  if (!bytes) throw new Error('Registration limiter unavailable');
  const key = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  // At most 61 admitted global/IP/email keys per hour; delete at most 100 expired
  // keys per request. Idle cleanup still needs an operational policy before public use.
  await db.prepare(`DELETE FROM registration_rate_limits WHERE key_hash IN
    (SELECT key_hash FROM registration_rate_limits WHERE expires_at<=? ORDER BY expires_at LIMIT 100)`)
    .bind(now).run();
  return async (scope: keyof typeof REGISTRATION_LIMITS, identifier: string) => {
    // Resend prefixes the normalized email to separate email and UUID buckets.
    // Preserve the full approved 254-character email boundary plus that prefix.
    if (identifier.length > (['email-resend', 'password-forgot'].includes(action) ? 260 : 254)) throw new Error('Invalid limiter identifier');
    const seconds = scope === 'ip' ? 900 : 3600;
    const window = Math.floor(now / seconds) * seconds;
    const digest = await crypto.subtle.sign('HMAC', key,
      new TextEncoder().encode(`lan-party:${action}:v1:${scope}:${window}:${identifier}`));
    const allowed = await db.prepare(`INSERT INTO registration_rate_limits (key_hash,hits,expires_at) VALUES (?,1,?)
      ON CONFLICT(key_hash) DO UPDATE SET hits=hits+1 WHERE hits<? RETURNING hits`)
      .bind(toHex(new Uint8Array(digest)), window + seconds,
        action === 'login' && scope === 'account' ? 5 : REGISTRATION_LIMITS[scope]).first<{ hits: number }>();
    if (!allowed) throw new RegistrationRateLimit('Registration rate limit reached');
  };
}
