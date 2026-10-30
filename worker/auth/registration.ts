import { createFirstOwner } from './owner-bootstrap';
import {userActivityReady} from './user-activity';
import { hostedProd } from './production';
import { validateRegistration, newAccountId } from './accounts';
import { hashPassword } from './passwords';
import { fromHex } from './encoding';
import { registrationLimiter, RegistrationRateLimit } from './registration-limits';
import { authClientIP, authOrigin, recipientAllowed, authRouteEnabled, emailTransport, hosted } from './environment';
export { loopback } from './environment';
import type { EmailEnvironment } from './email';
import { deliverVerification } from './verification-service';

export interface RegistrationEnvironment extends EmailEnvironment {
  DB: D1Database;
  REGISTRATION_MODE?: string;
  AUTH_PUBLIC_ORIGIN?: string;
  PASSWORD_PEPPER?: string;
  AUTH_RATE_LIMIT_SECRET?: string;
}
const fields = ['nickname', 'firstName', 'lastName', 'email', 'password'];
const accepted = { message: 'Registration request processed. If the details were available, your account was created with unverified email. Otherwise, use your existing account or try another nickname.' };
function reply(status: number, body: object, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}
export async function readInput(request: Request): Promise<unknown> {
  const declared = request.headers.get('Content-Length');
  if (declared !== null && (!/^[0-9]+$/.test(declared) || Number(declared) > 4096)) throw new Error('Invalid body size');
  if (!request.body) throw new Error('Missing body');
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) { await reader.cancel(); throw new Error('Body too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes));
}

export async function registerAccount(request: Request, env: RegistrationEnvironment): Promise<Response> {
  // Default off; hosted modes require their explicit environment and exact hostname.
  if (!authRouteEnabled(request, env, env.REGISTRATION_MODE)) {
    return reply(404, { error: 'Not found' });
  }
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' }, { Allow: 'POST' });
  let origin: URL;
  try {
    if(env.AUTH_LIFECYCLE_ADMIN_MODE==='enabled'&&!await userActivityReady(env.DB))throw Error('Lifecycle log migration unavailable');
    origin = authOrigin(request, env);
    if (!env.PASSWORD_PEPPER || !fromHex(env.PASSWORD_PEPPER, 32)
      || !env.AUTH_RATE_LIMIT_SECRET || !fromHex(env.AUTH_RATE_LIMIT_SECRET, 32)
      || env.AUTH_RATE_LIMIT_SECRET === env.PASSWORD_PEPPER) throw new Error('Unavailable configuration');
  } catch { return reply(503, { error: 'Registration is temporarily unavailable.' }); }
  // Anonymous registration has no ambient session authority. Exact Origin plus
  // JSON/custom header and no CORS support prevents browser cross-site submissions.
  if (request.headers.get('Origin') !== origin.origin || request.headers.get('X-LAN-Request') !== '1'
    || request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
    || request.headers.has('Content-Encoding') || new URL(request.url).search
    || (request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin')) {
    return reply(403, { error: 'Registration request rejected. Reload the page and try again.' });
  }
  try {
    const now = Math.floor(Date.now() / 1000);
    const limit = await registrationLimiter(env.DB, env.AUTH_RATE_LIMIT_SECRET!, now);
    await limit('global', 'all'); // Admission first: bounds downstream key cardinality.
    // CF-Connecting-IP is platform-supplied in hosted DEV, never
    // X-Forwarded-For. Local requests without it share a conservative loopback bucket.
    const ip = authClientIP(request, env);
    if (ip.length > 45 || (ip !== 'loopback' && !/^[0-9a-fA-F:.]+$/.test(ip))) return reply(400, { error: 'Invalid registration request.' });
    await limit('ip', ip.toLowerCase());
    let input;
    try {
      const raw = await readInput(request);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)
        || Object.keys(raw).length !== fields.length || Object.keys(raw).some(key => !fields.includes(key))) throw new Error('Invalid fields');
      input = validateRegistration(raw as Parameters<typeof validateRegistration>[0]);
    } catch { return reply(400, { error: 'Check your nickname, first and last name, email and password. Nicknames must follow the displayed rules; passwords need 12–128 characters.' }); }
    await limit('account', input.emailNormalized);
    if (hosted(request, env)) {
      // Deny before hashing or writing personal data, without revealing the allowlist.
      try { if (!recipientAllowed(request, env, input.emailNormalized)) throw new Error('Recipient denied');
        emailTransport(request, env); }
      catch { return reply(202, accepted); }
    }
    if (hostedProd(request, env) && env.PROD_OWNER_BOOTSTRAP_MODE !== undefined
      && env.PROD_OWNER_BOOTSTRAP_MODE !== 'disabled') {
      if (env.PROD_OWNER_BOOTSTRAP_MODE !== 'enabled') throw Error('Owner setup unavailable');
      const ownerId = await createFirstOwner(request, env, input, now);
      if (ownerId) await deliverVerification(env.DB, { userId: ownerId, status: 'active', authVersion: 0, emailVerifiedAt: null },
        input.email, origin.origin, emailTransport(request, env), now);
      return reply(202, accepted);
    }
    const passwordHash = await hashPassword(input.password, env.PASSWORD_PEPPER);
    const id = newAccountId();
    let created = false;
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO users (id,first_name,last_name,email,email_normalized,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?)`).bind(id, input.firstName, input.lastName, input.email, input.emailNormalized, now, now),
        env.DB.prepare(`INSERT INTO user_nicknames (user_id,nickname,created_at,updated_at) VALUES (?,?,?,?)`)
          .bind(id, input.nickname, now, now),
        env.DB.prepare(`INSERT INTO user_password_credentials (user_id,password_hash,password_changed_at,created_at,updated_at)
          VALUES (?,?,?,?,?)`).bind(id, passwordHash, now, now, now),
      ]);
      created = true;
    } catch (error) {
      // A uniqueness failure rolls back the entire batch. Return the SAME response
      // as success for both existing emails and nicknames; never reveal an account.
      if (!(error instanceof Error) || !/UNIQUE constraint failed: (users\.email_normalized|user_nicknames\.nickname_key)/.test(error.message)) throw error;
    }
    // Preserve the same response for creation, duplicates and delivery failure.
    // Legacy local setups without a transport remain unverified and can resend
    // once the explicit local transport has been configured; never send real email.
    if (created) {
      try {
        await deliverVerification(env.DB, { userId: id, status: 'active', authVersion: 0, emailVerifiedAt: null },
          input.email, origin.origin, emailTransport(request, env), now);
      } catch { /* Account stays unverified. Explicit anonymous resend can recover. */ }
    }
    return reply(202, accepted); // No private profile, credential, session or token response.
  } catch (error) {
    if (error instanceof RegistrationRateLimit) return reply(429,
      { error: 'Too many registration attempts. Please wait before trying again.' }, { 'Retry-After': '3600' });
    return reply(503, { error: 'Registration is temporarily unavailable.' });
  }
}
