import { fromHex, toHex } from './encoding';

export async function sessionCsrfToken(sessionDigest: string, secret: string): Promise<string> {
  const keyBytes = typeof secret === 'string' ? fromHex(secret, 32) : null;
  if (!keyBytes || typeof sessionDigest !== 'string' || !fromHex(sessionDigest, 32)) {
    throw new Error('Invalid CSRF configuration or session digest');
  }
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key,
    new TextEncoder().encode(`lan-party:csrf:v1:${sessionDigest}`));
  return toHex(new Uint8Array(signature));
}

// Authenticated mutations only. Pre-login flows will need their own short-lived context.
export async function isValidMutationRequest(request: Request, trustedOrigin: string,
  sessionDigest: string, csrfSecret: string): Promise<boolean> {
  const origin = new URL(trustedOrigin);
  if (origin.protocol !== 'https:' || origin.origin !== trustedOrigin) throw new Error('Invalid trusted origin');
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
    || request.headers.get('Origin') !== trustedOrigin
    || request.headers.get('X-LAN-Request') !== '1'
    || request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return false;
  const submitted = request.headers.get('X-CSRF-Token');
  const bytes = submitted ? fromHex(submitted, 32) : null;
  if (!bytes) return false;
  const expected = fromHex(await sessionCsrfToken(sessionDigest, csrfSecret), 32)!;
  return crypto.subtle.timingSafeEqual(bytes, expected);
}
