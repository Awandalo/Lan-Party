import { AUTH_POLICY } from './config';
import { isValidToken } from './tokens';

export const SESSION_COOKIE_NAME = '__Host-lan_session';
const attributes = 'Secure; HttpOnly; SameSite=Lax; Path=/';

export function sessionCookie(token: string): string {
  if (!isValidToken(token)) throw new Error('Invalid session token');
  return `${SESSION_COOKIE_NAME}=${token}; Max-Age=${AUTH_POLICY.sessionLifetimeSeconds}; ${attributes}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Max-Age=0; ${attributes}`;
}

export function readSessionCookie(request: Request): string | null {
  const cookies = (request.headers.get('Cookie') ?? '').split(';')
    .map((cookie) => cookie.trim()).filter((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (cookies.length !== 1) return null;
  const token = cookies[0].slice(SESSION_COOKIE_NAME.length + 1);
  return isValidToken(token) ? token : null;
}

// Clearing the browser cookie is not logout: the adapter must also revoke its D1 digest.
