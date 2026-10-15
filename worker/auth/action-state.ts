import type { AccountIdentity, ActionTokenStore } from './contracts';
import { accountId, accountVersion, serverTime, tokenDigest } from './database';
import { isCurrentPasswordRecord } from './passwords';
import { actionTokenExpiresAt, digestToken, generateToken, isValidToken } from './tokens';
import type { TokenPurpose } from './tokens';

type ActionPurpose = Exclude<TokenPurpose, 'session'>;
function purposeCheck(purpose: ActionPurpose): void {
  if (purpose !== 'email-verification' && purpose !== 'password-reset') throw new Error('Invalid action token purpose');
}

export class D1ActionTokenStore implements ActionTokenStore {
  constructor(private readonly db: D1Database) {}

  async issue(account: AccountIdentity, purpose: ActionPurpose, now: number) {
    accountVersion(account); purposeCheck(purpose); serverTime(now);
    const token = generateToken(), digest = await digestToken(token, purpose), expiry = actionTokenExpiresAt(purpose, now);
    const created = await this.db.prepare(`INSERT INTO auth_action_tokens
      (id,user_id,purpose,token_digest,auth_version,email_normalized,created_at,expires_at)
      SELECT ?,id,?,?,auth_version,CASE WHEN ?='email-verification' THEN email_normalized ELSE NULL END,?,?
      FROM users WHERE id=? AND status='active' AND auth_version=? AND updated_at<=?
        AND ((?='email-verification' AND email_verified_at IS NULL) OR
          (?='password-reset' AND EXISTS (SELECT 1 FROM user_password_credentials WHERE user_id=users.id))) RETURNING id`)
      .bind(crypto.randomUUID(), purpose, digest, purpose, now, expiry, account.userId, account.authVersion, now,
        purpose, purpose).first<{ id: string }>();
    if (!created) throw new Error('Authentication account changed or is unavailable');
    return { token, expiresAt: expiry }; // Only digests are stored; delivery is not implemented.
  }

  private consumption(digest: string, userId: string, purpose: ActionPurpose, now: number) {
    tokenDigest(digest); accountId(userId); purposeCheck(purpose); serverTime(now);
    return this.db.prepare(`UPDATE auth_action_tokens SET consumed_at=?
      WHERE token_digest=? AND user_id=? AND purpose=? AND consumed_at IS NULL AND revoked_at IS NULL
        AND created_at<=? AND expires_at>?
        AND EXISTS (SELECT 1 FROM users u WHERE u.id=auth_action_tokens.user_id
          AND u.status='active' AND u.auth_version=auth_action_tokens.auth_version AND u.updated_at<=?
          AND ((auth_action_tokens.purpose='email-verification' AND u.email_verified_at IS NULL
            AND u.email_normalized=auth_action_tokens.email_normalized)
            OR (auth_action_tokens.purpose='password-reset' AND EXISTS
              (SELECT 1 FROM user_password_credentials c WHERE c.user_id=u.id AND c.updated_at<=?))))`)
      .bind(now, digest, userId, purpose, now, now, now, now);
  }

  // Low-level contract only: consuming by itself is not completion of verification/reset.
  async consume(digest: string, userId: string, purpose: ActionPurpose, now: number): Promise<boolean> {
    const result = await this.consumption(digest, userId, purpose, now).run();
    return result.meta.changes === 1;
  }

  async completeEmailVerification(token: string, userId: string, now: number): Promise<boolean> {
    accountId(userId); serverTime(now);
    if (!isValidToken(token)) return false;
    const result = await this.db.batch([
      this.consumption(await digestToken(token, 'email-verification'), userId, 'email-verification', now),
      this.db.prepare(`UPDATE users SET email_verified_at=?,updated_at=? WHERE id=? AND changes()=1 RETURNING id`).bind(now, now, userId),
    ]);
    return result[1].results.length === 1;
  }

  async completePasswordReset(token: string, userId: string, passwordHash: string, now: number): Promise<boolean> {
    accountId(userId); serverTime(now);
    // Accept only a trusted hasher's current versioned record, never plaintext/unversioned data.
    if (!isCurrentPasswordRecord(passwordHash)) throw new Error('Invalid replacement password record');
    if (!isValidToken(token)) return false;
    const result = await this.db.batch([
      this.consumption(await digestToken(token, 'password-reset'), userId, 'password-reset', now),
      this.db.prepare(`UPDATE user_password_credentials SET password_hash=?,password_changed_at=?,updated_at=?
        WHERE user_id=? AND changes()=1 RETURNING user_id`).bind(passwordHash, now, now, userId),
    ]);
    // Migration 0008's credential trigger advances the generation and revokes all state.
    // D1 meta.changes includes trigger side effects; RETURNING counts the intended row.
    return result[1].results.length === 1;
  }
}
