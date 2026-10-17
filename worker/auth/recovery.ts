import { emailAddress } from './accounts';
import { D1ActionTokenStore } from './action-state';
import { clearSessionCookie } from './cookies';
import { accountId, findPasswordCredential } from './database';
import { authClientIP, authOrigin, authRouteEnabled, emailTransport, hostedDev, recipientAllowed } from './environment';
import { fromHex } from './encoding';
import type { AuthenticationEnvironment } from './http';
import { hashPassword, isValidPassword } from './passwords';
import { readInput } from './registration';
import { registrationLimiter, RegistrationRateLimit } from './registration-limits';
import { digestToken, isValidToken } from './tokens';
import { deliverPasswordReset } from './verification-service';

const generic = { message: 'If an eligible account exists, a password-reset email was requested. Check your messages. Delivery may be unavailable; try again later if needed.' };
const invalid = { error: 'This reset link is invalid, expired or already used. Request a new password reset.' };
function reply(status: number, body: object, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
    ...(status === 429 ? { 'Retry-After': '3600' } : {}), ...headers } });
}
export async function passwordRecovery(request: Request, env: AuthenticationEnvironment): Promise<Response> {
  const url = new URL(request.url), reset = url.pathname === '/api/auth/reset-password';
  if (!authRouteEnabled(request, env, env.AUTH_SESSION_MODE)
    || (!hostedDev(request, env) && env.AUTH_EMAIL_TRANSPORT !== 'local')) return reply(404, { error: 'Not found' });
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' }, { Allow: 'POST' });
  try {
    const origin = authOrigin(request, env), rate = env.AUTH_RATE_LIMIT_SECRET,
      pepper = env.PASSWORD_PEPPER, mail = env.AUTH_LOCAL_MAIL_SECRET;
    if (!rate || !fromHex(rate, 32) || !pepper || !fromHex(pepper, 32) || rate === pepper
      || (!hostedDev(request, env) && (!mail || !fromHex(mail, 32) || mail === pepper || mail === rate))) throw new Error('Invalid authentication configuration');
    const transport = emailTransport(request, env);
    // No ambient authority is accepted. Possession of the purpose-bound reset
    // proof plus exact Origin/JSON/custom header authorizes only password replacement.
    if (url.search || request.headers.has('Content-Encoding') || request.headers.get('Origin') !== origin.origin
      || request.headers.get('X-LAN-Request') !== '1'
      || request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
      || (request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin')) return reply(403, { error: 'Request rejected. Reload and try again.' });
    const now = Math.floor(Date.now() / 1000), limit = await registrationLimiter(env.DB, rate, now, reset ? 'password-reset' : 'password-forgot');
    await limit('global', 'all');
    const ip = authClientIP(request, env);
    if (ip.length > 45 || (ip !== 'loopback' && !/^[0-9a-fA-F:.]+$/.test(ip))) return reply(400, { error: 'Invalid request.' });
    await limit('ip', ip.toLowerCase());
    let input: Record<string, unknown>;
    try {
      const value = await readInput(request);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid body');
      input = value as Record<string, unknown>;
    } catch { return reply(400, { error: 'Invalid request.' }); }
    if (!reset) {
      let email: string;
      try {
        if (Object.keys(input).length !== 1 || !('email' in input)) throw new Error('Invalid fields');
        email = emailAddress(input.email).toLowerCase();
      } catch { return reply(400, { error: 'Check your email address.' }); }
      await limit('account', `email:${email}`);
      const account = await findPasswordCredential(env.DB, email);
      if (account && recipientAllowed(request, env, email)) {
        await limit('account', `user:${account.userId}`);
        await deliverPasswordReset(env.DB, account, email, origin.origin, transport, now);
      }
      return reply(202, generic);
    }
    try {
      if (Object.keys(input).length !== 3 || typeof input.userId !== 'string' || !isValidToken(input.token as string)
        || typeof input.password !== 'string') throw new Error('Invalid fields');
      accountId(input.userId);
    } catch { return reply(400, invalid); }
    await limit('account', input.userId as string);
    if (!isValidPassword(input.password as string)) return reply(400, { error: 'Use a password of 12–128 characters. Your password is never trimmed.' });
    // Avoid password hashing for arbitrary/expired proofs. The subsequent atomic
    // completion rechecks everything; this read alone never authorizes a mutation.
    const usable = await env.DB.prepare(`SELECT t.id FROM auth_action_tokens t JOIN users u ON u.id=t.user_id
      JOIN user_password_credentials c ON c.user_id=u.id
      WHERE t.token_digest=? AND t.user_id=? AND t.purpose='password-reset' AND t.consumed_at IS NULL
        AND t.revoked_at IS NULL AND t.created_at<=? AND t.expires_at>? AND u.status='active'
        AND u.auth_version=t.auth_version AND u.updated_at<=? AND c.updated_at<=?`)
      .bind(await digestToken(input.token as string, 'password-reset'), input.userId, now, now, now, now).first();
    if (!usable) return reply(400, invalid);
    const hash = await hashPassword(input.password as string, pepper);
    const completed = await new D1ActionTokenStore(env.DB).completePasswordReset(input.token as string, input.userId as string,
      hash, Math.floor(Date.now() / 1000));
    return completed ? reply(200, { message: 'Password reset. All previous sessions were revoked. Log in with your new password.' },
      { 'Set-Cookie': clearSessionCookie() }) : reply(400, invalid);
  } catch (error) {
    if (error instanceof RegistrationRateLimit) return reply(429, { error: 'Too many attempts. Please wait up to one hour.' });
    return reply(503, { error: 'Password recovery is temporarily unavailable.' });
  }
}
