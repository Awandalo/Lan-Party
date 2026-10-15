import { AUTH_POLICY, expiresAt } from './config';
import type { AccountIdentity, SessionRecord, SessionStore } from './contracts';
import { accountId, accountVersion, serverTime, tokenDigest } from './database';
import { digestToken, generateToken, isValidToken } from './tokens';

const sessionColumns = `s.token_digest AS tokenDigest, s.user_id AS userId, s.created_at AS createdAt,
  s.expires_at AS expiresAt, s.revoked_at AS revokedAt, s.auth_version AS authVersion`;

export class D1SessionStore implements SessionStore {
  constructor(private readonly db: D1Database) {}

  async create(record: SessionRecord): Promise<void> {
    accountVersion({ userId: record.userId, status: 'active', authVersion: record.authVersion, emailVerifiedAt: null });
    tokenDigest(record.tokenDigest);
    serverTime(record.createdAt);
    if (record.revokedAt !== null || record.expiresAt !== expiresAt(record.createdAt, AUTH_POLICY.sessionLifetimeSeconds)) {
      throw new Error('Invalid session lifetime or state');
    }
    const created = await this.db.prepare(`INSERT INTO auth_sessions
      (id,user_id,token_digest,auth_version,created_at,expires_at)
      SELECT ?,id,?,auth_version,?,? FROM users
      WHERE id=? AND status='active' AND auth_version=? AND updated_at<=? RETURNING id`)
      .bind(crypto.randomUUID(), record.tokenDigest, record.createdAt, record.expiresAt,
        record.userId, record.authVersion, record.createdAt).first<{ id: string }>();
    if (!created) throw new Error('Authentication account changed or is unavailable');
  }

  async findByDigest(digest: string): Promise<SessionRecord | null> {
    tokenDigest(digest);
    return this.db.prepare(`SELECT ${sessionColumns} FROM auth_sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_digest=? AND u.status='active' AND u.auth_version=s.auth_version`)
      .bind(digest).first<SessionRecord>();
  }

  async revokeByDigest(digest: string, now: number): Promise<void> {
    tokenDigest(digest); serverTime(now);
    await this.db.prepare(`UPDATE auth_sessions SET revoked_at=?
      WHERE token_digest=? AND revoked_at IS NULL AND created_at<=?`).bind(now, digest, now).run();
  }

  async revokeAllForUser(userId: string, now: number): Promise<void> {
    accountId(userId); serverTime(now);
    // Advancing the generation also fences a concurrent login's old credential snapshot.
    await this.db.prepare(`UPDATE users SET auth_version=auth_version+1,updated_at=?
      WHERE id=? AND updated_at<=?`).bind(now, userId, now).run();
  }
}

// Internal services only. Rate limits, cookie/CSRF middleware and routes come later.
export async function issueSession(store: SessionStore, verifiedAccount: AccountIdentity, now: number) {
  accountVersion(verifiedAccount); serverTime(now);
  const token = generateToken();
  const expiry = expiresAt(now, AUTH_POLICY.sessionLifetimeSeconds);
  await store.create({ tokenDigest: await digestToken(token, 'session'), userId: verifiedAccount.userId,
    authVersion: verifiedAccount.authVersion, createdAt: now, expiresAt: expiry, revokedAt: null });
  return { token, expiresAt: expiry }; // Raw token returned once, never persisted or logged.
}

export async function resolveSession(db: D1Database, token: string, now: number): Promise<AccountIdentity | null> {
  serverTime(now);
  if (!isValidToken(token)) return null;
  return db.prepare(`SELECT u.id AS userId,u.status,u.auth_version AS authVersion,u.email_verified_at AS emailVerifiedAt
    FROM auth_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_digest=? AND s.revoked_at IS NULL AND s.created_at<=? AND s.expires_at>?
      AND u.status='active' AND u.auth_version=s.auth_version AND u.updated_at<=?`)
    .bind(await digestToken(token, 'session'), now, now, now).first<AccountIdentity>();
}

export async function revokeSession(store: SessionStore, token: string, now: number): Promise<void> {
  serverTime(now);
  if (isValidToken(token)) await store.revokeByDigest(await digestToken(token, 'session'), now);
}
