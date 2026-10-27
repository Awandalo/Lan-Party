import {mfaSchemaReady} from './mfa-session';
import { emailAddress, publicAccount } from './accounts';
import { fromHex } from './encoding';
import { findPasswordCredential } from './database';
import { isValidPassword, verifyPassword } from './passwords';
import { readInput } from './registration';
import { authClientIP, authOrigin, authRouteEnabled, validAuthMutation, hosted } from './environment';
import type { RegistrationEnvironment } from './registration';
import { LoginLimiter, LoginLimited, LoginBusy } from './login-limits';
import { LoginChallenge, turnstileConfiguration, verifyLoginChallenge } from './turnstile';
import type { TurnstileEnvironment } from './turnstile';
import { D1SessionStore, resolveSession, revokeSession } from './sessions';
import {completePrimary} from './mfa-login';
import {primaryResponse,supersedePending} from './mfa-http';
import { clearSessionCookie, readSessionCookie } from './cookies';
import { digestToken } from './tokens';
import { sessionCsrfToken } from './csrf';

export interface AuthenticationEnvironment extends RegistrationEnvironment, TurnstileEnvironment { AUTH_SESSION_MODE?: string }
const invalid = { error: 'Email or password is incorrect.' };
// A public, synthetic, deliberately nonmatching record performs the same native
// 20k verification work for missing/disabled accounts. It is never persisted.
const dummyRecord = `lp-pbkdf2-hmac-sha256-v2$20000$${'00'.repeat(16)}$${'00'.repeat(32)}`;
function reply(status: number, body: object, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}
function unauthorized() { return reply(401, { error: 'Please log in.' }, { 'Set-Cookie': clearSessionCookie() }); }

export async function authentication(request: Request, env: AuthenticationEnvironment): Promise<Response> {
  const url = new URL(request.url);
  if (!authRouteEnabled(request, env, env.AUTH_SESSION_MODE)) return reply(404, { error: 'Not found' });
  const action = url.pathname.split('/').pop();
  const method = action === 'session' ? 'GET' : 'POST';
  if (request.method !== method) return reply(405, { error: 'Method not allowed' }, { Allow: method });
  try {
    const origin = authOrigin(request, env);
    if (!env.PASSWORD_PEPPER || !fromHex(env.PASSWORD_PEPPER, 32)
      || !env.AUTH_RATE_LIMIT_SECRET || !fromHex(env.AUTH_RATE_LIMIT_SECRET, 32)
      || env.PASSWORD_PEPPER === env.AUTH_RATE_LIMIT_SECRET) throw new Error('Unavailable configuration');
    // JSON/custom headers, exact Origin on mutations and no CORS also prevent login CSRF.
    if (url.search || request.headers.has('Content-Encoding') || request.headers.get('X-LAN-Request') !== '1'
      || (request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin')
      || (request.headers.has('Origin') && request.headers.get('Origin') !== origin.origin)
      || (method === 'POST' && (request.headers.get('Origin') !== origin.origin
        || request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json'))) {
      return reply(403, { error: 'Request rejected. Reload the page and try again.' });
    }
    const now = Math.floor(Date.now() / 1000), store = new D1SessionStore(env.DB);
    if (action === 'login') {
      // Do not deploy hosted login without the challenge configuration ready.
      if (hosted(request, env)) turnstileConfiguration(env);
      const ip = authClientIP(request, env);
      if (ip.length > 45 || (ip !== 'loopback' && !/^[0-9a-fA-F:.]+$/.test(ip))) return reply(400, invalid);
      const limiter = await LoginLimiter.create(env.DB, env.AUTH_RATE_LIMIT_SECRET, ip.toLowerCase());
      const challengeRequired = await limiter.observe();
      let email: string, password: string, challengeToken: unknown;
      try {
        const input = await readInput(request);
        if (!input || typeof input !== 'object' || Array.isArray(input)
          || !Object.keys(input).every(key => ['email', 'password', 'turnstileToken'].includes(key))
          || !('email' in input) || !('password' in input)) throw new Error('Invalid input');
        email = emailAddress(input.email).toLowerCase();
        if (typeof input.password !== 'string' || !isValidPassword(input.password)) throw new Error('Invalid password');
        password = input.password;
        challengeToken = 'turnstileToken' in input ? input.turnstileToken : undefined;
        if (challengeToken !== undefined && (typeof challengeToken !== 'string' || challengeToken.length > 2048)) throw new Error('Invalid proof');
      } catch { return reply(400, invalid); }
      if (challengeRequired || challengeToken !== undefined) await verifyLoginChallenge(env.DB, env, challengeToken, origin.hostname);
      const reservation = await limiter.reserve(email);
      let finalized = false;
      try {
        const credential = await findPasswordCredential(env.DB, email);
        const verified = await verifyPassword(password, credential?.passwordHash ?? dummyRecord, env.PASSWORD_PEPPER);
        if (!await reservation.finish(!verified || !credential)) throw new Error('Expired sign-in check');
        finalized = true;
        if (!verified || !credential) return reply(401, invalid);
        // Disclose verification state only after password proof; do not issue a session.
        if (credential.emailVerifiedAt === null) return reply(403, { code: 'verification_required', error: 'Verify your email before logging in.' });
        // Keep the generation read BEFORE verification: D1 fences concurrent credential changes.
        await supersedePending(request,env.DB);
        const session = await completePrimary(env.DB, credential, 'password', now);
        const previous = readSessionCookie(request);
        if (previous) await revokeSession(store, previous, now);
        return primaryResponse(request,session);
      } finally { if (!finalized) await reservation.finish(false); }
    }
    const token = readSessionCookie(request);
    const account = token ? await resolveSession(env.DB, token, now) : null;
    if (!token || !account || account.emailVerifiedAt === null) return unauthorized();
    const digest = await digestToken(token, 'session');
    if (action === 'logout') {
      if (!await validAuthMutation(request, origin.origin, digest, env.AUTH_RATE_LIMIT_SECRET)) {
        return reply(403, { error: 'Request rejected. Reload the page and try again.' });
      }
      let input;
      try { input = await readInput(request); } catch { return reply(400, { error: 'Invalid request.' }); }
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) return reply(400, { error: 'Invalid request.' });
      await revokeSession(store, token, now);
      return reply(200, { message: 'Logged out.' }, { 'Set-Cookie': clearSessionCookie() });
    }
    const nickname = await env.DB.prepare('SELECT nickname FROM user_nicknames WHERE user_id=?')
      .bind(account.userId).first<string>('nickname');
    if (!nickname) throw new Error('Account nickname unavailable');
    const memberNumber = await env.DB.prepare('SELECT CAST(member_number AS TEXT) AS value FROM member_numbers WHERE user_id=? AND registered=1')
      .bind(account.userId).first<string>('value');
    if (!memberNumber) throw new Error('Account member number unavailable');
    let recoveryCodesRemaining:number|undefined;
    // Optional owner-only warning data must never turn a committed login into a failure.
    try{if(await mfaSchemaReady(env.DB)){
      const result=await env.DB.prepare(`SELECT count(c.verifier) AS remaining FROM auth_session_mfa m
       JOIN auth_totp_factors f ON f.user_id=m.user_id AND f.factor_id=m.factor_id
       LEFT JOIN auth_mfa_recovery_codes c ON c.user_id=f.user_id AND c.set_id=f.recovery_set_id AND c.consumed_at IS NULL
       WHERE m.session_digest=? AND m.user_id=? AND m.auth_version=? AND m.method='recovery' GROUP BY m.session_digest`)
       .bind(digest,account.userId,account.authVersion).first<{remaining:number}>();
      if(result&&Number.isSafeInteger(result.remaining)&&result.remaining>=0&&result.remaining<=10)recoveryCodesRemaining=result.remaining;
    }}catch{/* Login remains valid; warning metadata can be refreshed later. */}
    return reply(200, { account: publicAccount({ userId: account.userId, nickname, memberNumber }), emailVerified: account.emailVerifiedAt !== null,
      csrfToken: await sessionCsrfToken(digest, env.AUTH_RATE_LIMIT_SECRET),...(recoveryCodesRemaining===undefined?{}:{recoveryCodesRemaining}) });
  } catch (error) {
    if (error instanceof LoginLimited) return reply(429,
      { error: 'Too many login attempts. Please wait before trying again.' }, { 'Retry-After': String(error.retryAfter) });
    if (error instanceof LoginBusy) return reply(503, { code: 'login_busy', error: 'Another sign-in check is in progress. Try again shortly.' }, { 'Retry-After': '1' });
    if (error instanceof LoginChallenge) return reply(403, { code: error.invalid ? 'challenge_failed' : 'challenge_required',
      error: 'Complete the security check before trying again.', siteKey: error.siteKey });
    return reply(503, { error: 'Authentication is temporarily unavailable.' });
  }
}
