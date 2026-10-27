import type { AccountIdentity } from './contracts';

export function serverTime(now: number): void {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid authentication timestamp');
}

export function accountId(userId: string): void {
  if (typeof userId !== 'string' || userId.length !== 36 || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(userId)) {
    throw new Error('Invalid account identifier');
  }
}

export function tokenDigest(digest: string): void {
  if (typeof digest !== 'string' || digest.length !== 64 || !/^[0-9a-f]{64}$/.test(digest)) throw new Error('Invalid token digest');
}

export function accountVersion(account: AccountIdentity): void {
  accountId(account.userId);
  if (account.status !== 'active' || !Number.isSafeInteger(account.authVersion) || account.authVersion < 0) {
    throw new Error('Authentication account is unavailable');
  }
}

// Private credential snapshot: retain this exact generation through password verification
// and session issuance. Never reread a newer generation after verifying an older password.
export interface PasswordCredentialSnapshot extends AccountIdentity { passwordHash: string }

export async function findPasswordCredential(db: D1Database, emailNormalized: string): Promise<PasswordCredentialSnapshot | null> {
  if (typeof emailNormalized !== 'string' || emailNormalized.length > 254
    || emailNormalized !== emailNormalized.toLowerCase()) return null;
  return db.prepare(`SELECT u.id AS userId, u.status, u.email_verified_at AS emailVerifiedAt,
      u.auth_version AS authVersion, c.password_hash AS passwordHash
    FROM users u JOIN user_password_credentials c ON c.user_id = u.id
    WHERE u.email_normalized = ? AND u.status = 'active'`).bind(emailNormalized).first<PasswordCredentialSnapshot>();
}
