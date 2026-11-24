import { readSessionCookie } from './auth/cookies';
import { sessionCsrfToken } from './auth/csrf';
import { fromHex } from './auth/encoding';
import type { AuthenticationEnvironment } from './auth/http';
import { resolveSession } from './auth/sessions';
import { digestToken } from './auth/tokens';

export interface NewsMember { userId: string; digest: string }

export async function verifiedNewsMember(request: Request, env: AuthenticationEnvironment): Promise<NewsMember | undefined> {
  const token = readSessionCookie(request);
  const proof = fromHex(request.headers.get('X-LAN-Session-Proof') ?? '', 32);
  if (!token || !proof || !env.AUTH_RATE_LIMIT_SECRET) return;
  const account = await resolveSession(env.DB, token, Math.floor(Date.now() / 1000));
  if (!account || account.emailVerifiedAt === null) return;
  const digest = await digestToken(token, 'session');
  const expected = fromHex(await sessionCsrfToken(digest, env.AUTH_RATE_LIMIT_SECRET), 32)!;
  if (crypto.subtle.timingSafeEqual(proof, expected)) return { userId: account.userId, digest };
}
