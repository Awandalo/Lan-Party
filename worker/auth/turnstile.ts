import { toHex } from './encoding';
export interface TurnstileEnvironment { AUTH_TURNSTILE_SITE_KEY?: string; TURNSTILE_SECRET_KEY?: string }
export class LoginChallenge extends Error {
  constructor(readonly siteKey: string, readonly invalid = false) { super('Security check required'); }
}
export function turnstileConfiguration(env: TurnstileEnvironment) {
  const siteKey = env.AUTH_TURNSTILE_SITE_KEY, secret = env.TURNSTILE_SECRET_KEY;
  if (!siteKey || siteKey.length > 200 || /\s/.test(siteKey) || !secret || secret.length < 20 || secret.length > 512) {
    throw new Error('Security check unavailable');
  }
  return { siteKey, secret };
}
export async function verifyLoginChallenge(db: D1Database, env: TurnstileEnvironment, token: unknown,
  hostname: string, sendRequest: typeof fetch = fetch): Promise<void> {
  const { siteKey, secret } = turnstileConfiguration(env);
  if (typeof token !== 'string' || !token || token.length > 2048) throw new LoginChallenge(siteKey);
  // No retries: a network failure can mean Siteverify consumed the single-use token.
  const response = await sendRequest('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5000),
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret, response: token }),
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error('Security check unavailable'); }
  const result: { success?: boolean; hostname?: string; action?: string } = await response.json();
  if (result.success !== true || result.hostname !== hostname || result.action !== 'login') throw new LoginChallenge(siteKey, true);
  // Siteverify is authoritative; this extra atomic replay fence also protects against
  // concurrent acceptance and inaccurate/replayed provider responses. Store no raw token.
  const digest = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(`lan-party:turnstile-used:v1:${token}`))));
  const used = await db.prepare(`INSERT INTO registration_rate_limits(key_hash,hits,expires_at)
    VALUES (?,1,?) ON CONFLICT(key_hash) DO NOTHING RETURNING key_hash`)
    .bind(digest, Math.floor(Date.now() / 1000) + 300).first();
  if (!used) throw new LoginChallenge(siteKey, true);
}
