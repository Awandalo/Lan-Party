import type { AccountIdentity } from './contracts';
import { D1ActionTokenStore } from './action-state';
import type { EmailTransport } from './email';
import { digestToken } from './tokens';

export async function deliverVerification(db: D1Database, account: AccountIdentity, email: string,
  origin: string, transport: EmailTransport, now: number): Promise<boolean> {
  const actions = new D1ActionTokenStore(db);
  let digest: string | undefined;
  try {
    const issued = await actions.issue(account, 'email-verification', now, true);
    digest = await digestToken(issued.token, 'email-verification');
    const fragment = new URLSearchParams({ user: account.userId, token: issued.token });
    await transport.send({ to: email, url: `${origin}/verify-email#${fragment}`, expiresAt: issued.expiresAt,
      idempotencyKey: `verify-${digest}` });
    return true;
  } catch {
    // Delivery can fail or have an uncertain outcome. Never claim verification;
    // revoke this attempt, not a concurrently issued newer token. No auto retries.
    if (digest) await db.prepare(`UPDATE auth_action_tokens SET revoked_at=max(created_at,?)
      WHERE token_digest=? AND purpose='email-verification' AND consumed_at IS NULL AND revoked_at IS NULL`)
      .bind(now, digest).run();
    return false;
  }
}
