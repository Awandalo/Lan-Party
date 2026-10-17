import { emailAddress } from './accounts';
import { D1ActionTokenStore } from './action-state';
import type { AccountIdentity } from './contracts';
import { accountId } from './database';
import { fromHex } from './encoding';
import { localMailbox } from './email';
import { loopback, readInput } from './registration';
import type { AuthenticationEnvironment } from './http';
import { registrationLimiter, RegistrationRateLimit } from './registration-limits';
import { readSessionCookie } from './cookies';
import { resolveSession } from './sessions';
import { digestToken, isValidToken } from './tokens';
import { isValidLocalMutationRequest } from './csrf';
import { deliverVerification } from './verification-service';

const accepted = { message: 'If an eligible unverified account exists, a verification email was requested. Check the local mailbox or try again later if delivery was unavailable.' };
const badToken = { error: 'This verification link is invalid, expired or already used. Request a new email.' };
function reply(status: number, body: object) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
    ...(status === 429 ? { 'Retry-After': '3600' } : {}) } });
}
export async function verification(request: Request, env: AuthenticationEnvironment): Promise<Response> {
  const url = new URL(request.url), action = url.pathname.split('/').pop();
  if (env.AUTH_SESSION_MODE !== 'local-only' || !loopback(url) || env.AUTH_EMAIL_TRANSPORT !== 'local') {
    return reply(404, { error: 'Not found' });
  }
  if (request.method !== 'POST') return reply(405, { error: 'Use an explicit confirmation request.' });
  try {
    const origin = new URL(env.AUTH_PUBLIC_ORIGIN ?? '');
    const rateSecret = env.AUTH_RATE_LIMIT_SECRET, mailSecret = env.AUTH_LOCAL_MAIL_SECRET;
    if (!loopback(origin) || origin.origin !== env.AUTH_PUBLIC_ORIGIN || !rateSecret || !fromHex(rateSecret, 32)
      || rateSecret === env.PASSWORD_PEPPER || !mailSecret || !fromHex(mailSecret, 32)
      || mailSecret === rateSecret || mailSecret === env.PASSWORD_PEPPER) {
      throw new Error('Unavailable local email configuration');
    }
    if (url.search || request.headers.has('Content-Encoding') || request.headers.get('Origin') !== origin.origin
      || request.headers.get('X-LAN-Request') !== '1'
      || request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
      || (request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin')) {
      return reply(403, { error: 'Request rejected. Reload and try again.' });
    }
    // The mailbox grants access to disposable test messages, not participant sessions.
    if (action === 'local-mail') {
      const authorization = request.headers.get('Authorization');
      const supplied = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
      const bytes = supplied ? fromHex(supplied, 32) : null;
      if (!bytes || !crypto.subtle.timingSafeEqual(bytes, fromHex(mailSecret, 32)!)) return reply(401, { error: 'Local mailbox access denied.' });
      let input;
      try {
        input = await readInput(request);
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1
          || !('email' in input)) throw new Error('Invalid mailbox request');
        const email = emailAddress(input.email);
        if (!email.toLowerCase().endsWith('.test')) throw new Error('Fictional address required');
        const now = Math.floor(Date.now() / 1000);
        for (let i = 0; i < 50; i++) {
          const mail = localMailbox.take(email, now);
          if (!mail) break;
          const params = new URLSearchParams(new URL(mail.url).hash.slice(1));
          const token = params.get('token');
          if (!token || !isValidToken(token)) continue;
          const active = await env.DB.prepare(`SELECT t.id FROM auth_action_tokens t JOIN users u ON u.id=t.user_id
            WHERE t.token_digest=? AND t.purpose='email-verification' AND t.consumed_at IS NULL AND t.revoked_at IS NULL
            AND t.created_at<=? AND t.expires_at>? AND u.status='active' AND u.auth_version=t.auth_version
            AND u.email_verified_at IS NULL AND u.email_normalized=t.email_normalized`)
            .bind(await digestToken(token, 'email-verification'), now, now).first();
          if (active) return reply(200, { mail });
        }
        return reply(200, { mail: null });
      } catch { return reply(400, { error: 'Use one fictional .test email address.' }); }
    }
    const now = Math.floor(Date.now() / 1000);
    const limit = await registrationLimiter(env.DB, rateSecret, now, action === 'verify-email' ? 'email-confirm' : 'email-resend');
    await limit('global', 'all');
    const ip = request.headers.get('CF-Connecting-IP') ?? 'loopback';
    if (ip.length > 45 || (ip !== 'loopback' && !/^[0-9a-fA-F:.]+$/.test(ip))) return reply(400, { error: 'Invalid request.' });
    await limit('ip', ip.toLowerCase());
    let input: Record<string, unknown>;
    try {
      const value = await readInput(request);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid fields');
      input = value as Record<string, unknown>;
    } catch { return reply(400, { error: 'Invalid request.' }); }
    if (action === 'verify-email') {
      try {
        if (Object.keys(input).length !== 2 || typeof input.userId !== 'string' || !isValidToken(input.token as string)) throw new Error('Invalid link');
        accountId(input.userId);
      } catch { return reply(400, badToken); }
      await limit('account', input.userId as string);
      const completed = await new D1ActionTokenStore(env.DB).completeEmailVerification(input.token as string, input.userId as string, now);
      return completed ? reply(200, { message: 'Email verified. You can now log in.' }) : reply(400, badToken);
    }
    let email: string, account: (AccountIdentity & { email: string }) | null;
    if (Object.keys(input).length === 0) {
      const token = readSessionCookie(request), session = token ? await resolveSession(env.DB, token, now) : null;
      if (!token || !session) return reply(401, { error: 'Please log in.' });
      if (!await isValidLocalMutationRequest(request, origin.origin, await digestToken(token, 'session'), rateSecret)) {
        return reply(403, { error: 'Request rejected. Reload and try again.' });
      }
      account = await env.DB.prepare(`SELECT id AS userId,status,auth_version AS authVersion,email_verified_at AS emailVerifiedAt,email
        FROM users WHERE id=? AND status='active' AND auth_version=?`)
        .bind(session.userId, session.authVersion).first();
      if (!account) return reply(401, { error: 'Please log in.' });
      email = account.email.toLowerCase();
      await limit('account', `email:${email}`);
    } else {
      try {
        if (Object.keys(input).length !== 1 || !('email' in input)) throw new Error('Invalid fields');
        email = emailAddress(input.email).toLowerCase();
      } catch { return reply(400, { error: 'Check your email address.' }); }
      await limit('account', `email:${email}`); // Missing/existing emails have identical buckets.
      account = await env.DB.prepare(`SELECT id AS userId,status,auth_version AS authVersion,email_verified_at AS emailVerifiedAt,email
        FROM users WHERE email_normalized=? AND status='active'`).bind(email).first();
    }
    if (account) {
      await limit('account', `user:${account.userId}`);
      if (account.emailVerifiedAt === null) await deliverVerification(env.DB, account, account.email, origin.origin, localMailbox, now);
    }
    return reply(202, accepted);
  } catch (error) {
    if (error instanceof RegistrationRateLimit) return reply(429, { error: 'Too many attempts. Please wait up to one hour.' });
    return reply(503, { error: 'Email verification is temporarily unavailable.' });
  }
}
