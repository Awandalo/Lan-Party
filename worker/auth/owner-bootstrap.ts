import { emailAddress, newAccountId, validateRegistration } from './accounts';
import type { RegistrationInput } from './accounts';
import { fromHex } from './encoding';
import { hashPassword } from './passwords';
import { hostedProd } from './production';
import type { EmailEnvironment } from './email';

// A private capability prevents someone who merely knows the owner's email from
// choosing the initial password. It is never stored in URLs, D1 or responses.
export async function createFirstOwner(request: Request, env: EmailEnvironment & { DB: D1Database; PASSWORD_PEPPER?: string },
  input: RegistrationInput, now: number): Promise<string | null> {
  if (!hostedProd(request, env) || env.PROD_OWNER_BOOTSTRAP_MODE !== 'enabled') throw Error('Owner setup unavailable');
  const owner = emailAddress(env.PROD_OWNER_BOOTSTRAP_EMAIL).toLowerCase();
  const expected = fromHex(env.PROD_OWNER_BOOTSTRAP_TOKEN ?? '', 32);
  if (!expected || !env.PASSWORD_PEPPER) throw Error('Owner setup unavailable');
  const profile = validateRegistration(input);
  const proof = fromHex(request.headers.get('X-LAN-Owner-Bootstrap') ?? '', 32);
  if (profile.emailNormalized !== owner || !proof || !crypto.subtle.timingSafeEqual(proof, expected)) return null;
  const id = newAccountId(), password = await hashPassword(profile.password, env.PASSWORD_PEPPER);
  // One D1 batch: the singleton and zero-account predicate serialize races. Any
  // failed insert rolls back the receipt AND ledger claim; no partial reservation.
  const result = await env.DB.batch([
    env.DB.prepare(`INSERT INTO owner_bootstrap(singleton,user_id,email_normalized,created_at)
      SELECT 1,?,?,? WHERE NOT EXISTS(SELECT 1 FROM owner_bootstrap)
      AND NOT EXISTS(SELECT 1 FROM users)
      AND EXISTS(SELECT 1 FROM member_numbers WHERE member_number=1 AND user_id IS NULL AND registered=0 AND retired=0)`).bind(id, owner, now),
    env.DB.prepare(`UPDATE member_numbers SET user_id=?,reserved_by_user_id=? WHERE member_number=1
      AND user_id IS NULL AND registered=0 AND retired=0
      AND EXISTS(SELECT 1 FROM owner_bootstrap WHERE user_id=? AND completed_at IS NULL)`).bind(id,id,id),
    env.DB.prepare(`INSERT INTO users(id,first_name,last_name,email,email_normalized,created_at,updated_at)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM member_numbers WHERE member_number=1 AND user_id=? AND registered=0) RETURNING id`)
      .bind(id,profile.firstName,profile.lastName,profile.email,owner,now,now,id),
    env.DB.prepare(`INSERT INTO user_nicknames(user_id,nickname,created_at,updated_at)
      SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=?)`).bind(id,profile.nickname,now,now,id),
    env.DB.prepare(`INSERT INTO user_password_credentials(user_id,password_hash,password_changed_at,created_at,updated_at)
      SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=?)`).bind(id,password,now,now,now,id),
  ]);
  return result[2].results.length === 1 ? id : null;
}
