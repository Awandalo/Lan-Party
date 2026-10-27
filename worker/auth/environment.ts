import { assertDevEmailRecipient, DevResendEmailTransport } from './dev-email';
import { localMailbox } from './email';
import type { EmailEnvironment } from './email';
import { isValidLocalMutationRequest, isValidMutationRequest } from './csrf';

export const DEV_AUTH_ORIGIN = 'https://dev.lan-party.club';
export function loopback(url: URL): boolean {
  return url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
}
export function hostedDev(request: Request, env: EmailEnvironment): boolean {
  return env.AUTH_ENVIRONMENT === 'dev' && new URL(request.url).origin === DEV_AUTH_ORIGIN;
}
export function authRouteEnabled(request: Request, env: EmailEnvironment, mode?: string): boolean {
  return mode === 'local-only' && loopback(new URL(request.url))
    || mode === 'hosted-dev' && hostedDev(request, env);
}
export function authClientIP(request: Request, env: EmailEnvironment): string {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip && hostedDev(request, env)) throw new Error('Trusted client address unavailable');
  return ip ?? 'loopback';
}
export function recipientAllowed(request: Request, env: EmailEnvironment, email: string): boolean {
  if (!hostedDev(request, env)) return true;
  try { assertDevEmailRecipient(env, email); return true; } catch { return false; }
}
export function authOrigin(request: Request, env: EmailEnvironment): URL {
  const origin = new URL(env.AUTH_PUBLIC_ORIGIN ?? '');
  if (origin.origin !== env.AUTH_PUBLIC_ORIGIN
    || !(loopback(new URL(request.url)) ? loopback(origin) : hostedDev(request, env)
      && origin.origin === DEV_AUTH_ORIGIN && env.AUTH_EMAIL_TRANSPORT === 'resend')) {
    throw new Error('Authentication configuration unavailable');
  }
  return origin;
}
export function emailTransport(request: Request, env: EmailEnvironment & { DB: D1Database }) {
  if (hostedDev(request, env)) return new DevResendEmailTransport(env.DB, env);
  if (loopback(new URL(request.url)) && env.AUTH_EMAIL_TRANSPORT === 'local') return localMailbox;
  return { async send() { throw new Error('Email delivery unavailable'); } };
}
export function validAuthMutation(request: Request, origin: string, digest: string, secret: string) {
  return (loopback(new URL(request.url)) ? isValidLocalMutationRequest : isValidMutationRequest)(request, origin, digest, secret);
}
