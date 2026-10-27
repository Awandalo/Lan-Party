import { newAccountId, validateRegistration } from './accounts';
import type { RegistrationInput } from './accounts';
import { serverTime } from './database';
import { hashPassword } from './passwords';
import { digestToken, isValidToken } from './tokens';

// Internal provisioning adapter, NOT an HTTP endpoint. A future admin route must
// add its ordinary CSRF/request protections. No roles or emails are issued here.
const administrator = `SELECT a.id FROM auth_sessions s JOIN users a ON a.id=s.user_id
  JOIN user_roles ur ON ur.user_id=a.id JOIN roles r ON r.id=ur.role_id
  JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id
  WHERE s.token_digest=? AND s.revoked_at IS NULL AND s.created_at<=? AND s.expires_at>?
    AND a.status='active' AND a.email_verified_at IS NOT NULL AND a.updated_at<=?
    AND a.auth_version=s.auth_version AND r.code='admin' AND r.is_active=1 AND p.code='users.manage'`;

export async function createOrganizationAccount(db: D1Database, adminSessionToken: string,
  reservedNumber: number, input: RegistrationInput, pepper: string, now: number): Promise<string | null> {
  serverTime(now);
  if (!Number.isInteger(reservedNumber) || reservedNumber < 1 || reservedNumber > 10 || !isValidToken(adminSessionToken)) {
    throw new Error('Organization provisioning denied');
  }
  const digest = await digestToken(adminSessionToken, 'session');
  const actor = await db.prepare(administrator).bind(digest, now, now, now).first<{ id: string }>();
  if (!actor) throw new Error('Organization provisioning denied');
  const profile = validateRegistration(input), userId = newAccountId();
  const passwordHash = await hashPassword(profile.password, pepper);
  const result = await db.batch([
    // Recheck the session and explicit RBAC grant inside the creation transaction.
    db.prepare(`UPDATE member_numbers SET user_id=?,reserved_by_user_id=?
      WHERE member_number=? AND user_id IS NULL AND registered=0 AND EXISTS (${administrator}) RETURNING member_number`)
      .bind(userId, actor.id, reservedNumber, digest, now, now, now),
    db.prepare(`INSERT INTO users (id,first_name,last_name,email,email_normalized,created_at,updated_at)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM member_numbers WHERE member_number=? AND user_id=? AND registered=0)
      RETURNING id`).bind(userId, profile.firstName, profile.lastName, profile.email, profile.emailNormalized,
        now, now, reservedNumber, userId),
    db.prepare(`INSERT INTO user_nicknames (user_id,nickname,created_at,updated_at)
      SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM users WHERE id=?)`).bind(userId, profile.nickname, now, now, userId),
    db.prepare(`INSERT INTO user_password_credentials (user_id,password_hash,password_changed_at,created_at,updated_at)
      SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM users WHERE id=?)`).bind(userId, passwordHash, now, now, now, userId),
  ]);
  return result[1].results.length === 1 ? userId : null;
}
