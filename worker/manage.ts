import {sessionCsrfToken} from './auth/csrf';
import {digestToken} from './auth/tokens';
import {fromHex} from './auth/encoding';
import type { AuthenticationEnvironment } from './auth/http';
import { authOrigin, authRouteEnabled, hostedDev, loopback } from './auth/environment';
import { readSessionCookie } from './auth/cookies';
import { resolveSession } from './auth/sessions';

const sectionPermissions = {
  users: ['users.view', 'users.manage'],
  roles: ['roles.manage'],
  events: ['events.create', 'events.update', 'events.publish', 'events.cancel', 'events.manage_registrations'],
} as const;

// Resolve current grants for every request. Role names never imply permissions.
export async function administrationPermissions(db: D1Database, userId: string, now: number) {
  const rows = await db.prepare(`SELECT DISTINCT p.code FROM user_roles ur
    JOIN roles r ON r.id=ur.role_id JOIN role_permissions rp ON rp.role_id=r.id
    JOIN permissions p ON p.id=rp.permission_id
    WHERE ur.user_id=? AND r.is_active=1 AND ur.assigned_at<=? AND rp.granted_at<=?`)
    .bind(userId, now, now).all<{code: string}>();
  return rows.results.map(row => row.code);
}

export async function manage(request: Request, env: AuthenticationEnvironment): Promise<Response> {
  const reply = (status: number, data: object) => Response.json(data, {
    status, headers: {'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'},
  });
  const url = new URL(request.url);
  // This first iteration is DEV/local only; PROD activation requires separate approval.
  if (!(loopback(url) || hostedDev(request, env)) || !authRouteEnabled(request, env, env.AUTH_SESSION_MODE)
    || url.pathname !== '/api/manage/capabilities') return reply(404, {error: 'Not found'});
  if (request.method !== 'GET') return reply(405, {error: 'Method not allowed'});
  try {
    const origin = authOrigin(request, env);
    if (url.search || request.headers.has('Content-Encoding') || request.headers.get('X-LAN-Request') !== '1'
      || request.headers.has('Origin') && request.headers.get('Origin') !== origin.origin
      || request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin') {
      return reply(403, {error: 'Request rejected'});
    }
    const now = Math.floor(Date.now()/1000), token = readSessionCookie(request);
    const account = token ? await resolveSession(env.DB, token, now) : null;
    if (!account || account.emailVerifiedAt === null) return reply(401, {error: 'Please log in'});
    // Optional correlation proof prevents applying user B's grants to user A's
    // session snapshot if another tab changes cookies between the two reads.
    const submitted = request.headers.get('X-LAN-Session-Proof');
    if (submitted !== null) {
      const bytes = fromHex(submitted, 32);
      const expected = fromHex(await sessionCsrfToken(await digestToken(token!, 'session'), env.AUTH_RATE_LIMIT_SECRET!), 32)!;
      if (!bytes || !crypto.subtle.timingSafeEqual(bytes, expected)) return reply(409, {error: 'Session context changed'});
    }
    const permissions = await administrationPermissions(env.DB, account.userId, now);
    const sections = Object.entries(sectionPermissions).filter(([, required]) => required.some(p => permissions.includes(p))).map(([key]) => key);
    if (!sections.length) return reply(403, {error: 'Administration access is not available'});
    return reply(200, {sections});
  } catch {
    return reply(503, {error: 'Administration is temporarily unavailable'});
  }
}
