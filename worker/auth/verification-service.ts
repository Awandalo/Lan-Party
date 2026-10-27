import type { AccountIdentity } from './contracts';
import { D1ActionTokenStore } from './action-state';
import type { EmailTransport } from './email';
import { digestToken } from './tokens';

export async function deliverVerification(db: D1Database, account: AccountIdentity, email: string,
  origin: string, transport: EmailTransport, now: number): Promise<boolean> {
  return deliverAccountAction(db, account, email, origin, transport, now, 'email-verification');
}

export async function deliverPasswordReset(db: D1Database, account: AccountIdentity, email: string,
  origin: string, transport: EmailTransport, now: number): Promise<boolean> {
  return deliverAccountAction(db, account, email, origin, transport, now, 'password-reset');
}

async function deliverAccountAction(db: D1Database, account: AccountIdentity, email: string,
  origin: string, transport: EmailTransport, now: number, purpose: 'email-verification' | 'password-reset'): Promise<boolean> {
  const actions = new D1ActionTokenStore(db);
  let digest: string | undefined;
  try {
    const issued = await actions.issue(account, purpose, now, true);
    digest = await digestToken(issued.token, purpose);
    const fragment = new URLSearchParams({ user: account.userId, token: issued.token });
    const path = purpose === 'password-reset' ? 'reset-password' : 'verify-email';
    await transport.send({ to: email, url: `${origin}/${path}#${fragment}`, expiresAt: issued.expiresAt,
      idempotencyKey: `${purpose}-${digest}`, purpose });
    return true;
  } catch {
    // Delivery can fail or have an uncertain outcome. Never claim verification;
    // revoke this attempt, not a concurrently issued newer token. No auto retries.
    if (digest) await db.prepare(`UPDATE auth_action_tokens SET revoked_at=max(created_at,?)
      WHERE token_digest=? AND purpose=? AND consumed_at IS NULL AND revoked_at IS NULL`)
      .bind(now, digest, purpose).run();
    return false;
  }
}
