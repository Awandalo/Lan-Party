// Test-only Worker: never imported by the application or deployed.
import { D1ActionTokenStore } from '../auth/action-state';
import { findGoogleAccount, findPasswordCredential } from '../auth/database';
import { hashPassword, verifyPassword } from '../auth/passwords';
import { D1SessionStore, issueSession, resolveSession, revokeSession } from '../auth/sessions';
import { digestToken } from '../auth/tokens';
import type { AccountIdentity } from '../auth/contracts';

interface Env { DB: D1Database }
const now = 1791849600;
const pepper = '07'.repeat(32); // Synthetic fixture, not deployment configuration.
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(action: () => Promise<unknown>) {
  let failed = false; try { await action(); } catch { failed = true; }
  check(failed, 'Operation must reject');
}
async function user(db: D1Database) {
  const userId = crypto.randomUUID(), email = `${userId}@example.test`;
  const record = await hashPassword('fictional account password', pepper);
  await db.batch([
    db.prepare(`INSERT INTO users (id,first_name,last_name,email,email_normalized,created_at,updated_at)
      VALUES (?,'Fictional','Participant',?,?,?,?)`).bind(userId, email, email, now, now),
    db.prepare(`INSERT INTO user_nicknames (user_id,nickname,created_at,updated_at) VALUES (?,?,?,?)`)
      .bind(userId, `Player_${userId.slice(0, 8)}`, now, now),
    db.prepare(`INSERT INTO user_password_credentials (user_id,password_hash,password_changed_at,created_at,updated_at)
      VALUES (?,?,?,?,?)`).bind(userId, record, now, now, now),
  ]);
  const account: AccountIdentity = { userId, status: 'active', emailVerifiedAt: null, authVersion: 0 };
  return { account, email, record };
}

const cases: Record<string, (db: D1Database) => Promise<void>> = {
  async sessions(db) {
    const { account, email } = await user(db), store = new D1SessionStore(db);
    const snapshot = await findPasswordCredential(db, email);
    check(snapshot && await verifyPassword('fictional account password', snapshot.passwordHash, pepper), 'Private credential snapshot');
    const first = await issueSession(store, snapshot, now);
    const second = await issueSession(store, snapshot, now);
    check(first.token !== second.token && first.expiresAt === now + 604800, 'Unique seven-day session tokens');
    const resolved = await resolveSession(db, first.token, now);
    check(resolved?.userId === account.userId && resolved.emailVerifiedAt === null, 'Unverified active account may have a session');
    check(!('email' in resolved) && !('firstName' in resolved) && !('passwordHash' in resolved), 'Minimal identity projection');
    const persisted = JSON.stringify((await db.prepare('SELECT * FROM auth_sessions WHERE user_id=?').bind(account.userId).all()).results);
    check(!persisted.includes(first.token) && !persisted.includes(second.token), 'Raw session tokens never stored');
    check(await store.findByDigest(await digestToken(first.token, 'session')), 'Digest lookup');
    check(!await resolveSession(db, 'malformed', now), 'Malformed session rejected');
    check(!await resolveSession(db, first.token, now - 1), 'Future session rejected');
    check(!await resolveSession(db, first.token, first.expiresAt), 'Expiry boundary');
    await revokeSession(store, first.token, now + 1);
    await revokeSession(store, first.token, now + 2);
    check(!await resolveSession(db, first.token, now + 2), 'Logout revokes stored digest idempotently');
    check(await resolveSession(db, second.token, now + 2), 'Other sessions survive single logout');
    await store.revokeAllForUser(account.userId, now + 3);
    check(!await resolveSession(db, second.token, now + 3), 'Logout all revokes sessions');
    await rejects(() => issueSession(store, snapshot, now + 3));
    await rejects(() => issueSession(store, { ...account, userId: 'bad' }, now));
    await rejects(() => store.findByDigest('bad'));
  },
  async verification(db) {
    const { account } = await user(db), other = await user(db);
    const actions = new D1ActionTokenStore(db);
    const link = await actions.issue(account, 'email-verification', now);
    check(link.expiresAt === now + 86400, 'Verification TTL');
    const saved = await db.prepare('SELECT * FROM auth_action_tokens WHERE user_id=?').bind(account.userId).first();
    check(saved && !JSON.stringify(saved).includes(link.token), 'Action token digest only');
    check(!await actions.completeEmailVerification(link.token, other.account.userId, now + 1), 'Wrong user rejected');
    check(!await actions.completeEmailVerification(link.token, account.userId, now - 1), 'Future token rejected');
    check(!await actions.completeEmailVerification(link.token, account.userId, link.expiresAt), 'Expired token rejected');
    const won = await Promise.all([actions.completeEmailVerification(link.token, account.userId, now + 1),
      actions.completeEmailVerification(link.token, account.userId, now + 1)]);
    check(won.filter(Boolean).length === 1, 'Concurrent verification has exactly one winner');
    check(await db.prepare('SELECT email_verified_at FROM users WHERE id=?').bind(account.userId).first('email_verified_at') === now + 1, 'Verification persisted');
    check(!await actions.completeEmailVerification(link.token, account.userId, now + 2), 'No replay');
    await rejects(() => actions.issue(account, 'email-verification', now + 2));
  },
  async reset(db) {
    const { account, email } = await user(db), actions = new D1ActionTokenStore(db), sessions = new D1SessionStore(db);
    const snapshot = await findPasswordCredential(db, email);
    check(snapshot, 'Credential snapshot exists');
    const session = await issueSession(sessions, snapshot, now);
    const reset = await actions.issue(snapshot, 'password-reset', now);
    const verification = await actions.issue(snapshot, 'email-verification', now);
    check(reset.expiresAt === now + 1800, 'Reset TTL');
    const replacement = await hashPassword('a different fictional password', pepper);
    check(!await actions.completePasswordReset(verification.token, account.userId, replacement, now + 1), 'Purpose separation');
    await rejects(() => actions.completePasswordReset(reset.token, account.userId, 'plaintext-is-not-a-record', now + 1));
    check(!await actions.completePasswordReset(reset.token, account.userId, replacement, reset.expiresAt), 'Reset expiry boundary');
    const won = await Promise.all([actions.completePasswordReset(reset.token, account.userId, replacement, now + 1),
      actions.completePasswordReset(reset.token, account.userId, replacement, now + 1)]);
    check(won.filter(Boolean).length === 1, 'Concurrent reset has one winner');
    check(!await resolveSession(db, session.token, now + 1), 'Reset invalidates every session');
    check(!await actions.completeEmailVerification(verification.token, account.userId, now + 1), 'Reset revokes other action tokens');
    await rejects(() => issueSession(sessions, snapshot, now + 1));
    const current = await findPasswordCredential(db, email);
    check(current?.authVersion === 1 && await verifyPassword('a different fictional password', current.passwordHash, pepper), 'Versioned peppered credential persisted');
    check(!await verifyPassword('fictional account password', current.passwordHash, pepper), 'Old password rejected');
    check(await issueSession(sessions, current, now + 1), 'New credential generation issues session');
  },
  async rollback(db) {
    const { account } = await user(db), actions = new D1ActionTokenStore(db);
    const link = await actions.issue(account, 'password-reset', now);
    const replacement = await hashPassword('a different fictional password', pepper);
    // Intentional local-only storage failure after consumption, to prove batch rollback.
    await db.exec(`CREATE TRIGGER test_password_write_failure BEFORE UPDATE ON user_password_credentials BEGIN SELECT RAISE(ABORT,'Fictional storage failure'); END;`);
    try { await rejects(() => actions.completePasswordReset(link.token, account.userId, replacement, now + 1)); }
    finally { await db.exec('DROP TRIGGER test_password_write_failure;'); }
    const stored = await db.prepare('SELECT consumed_at FROM auth_action_tokens WHERE user_id=?').bind(account.userId).first<{ consumed_at: number | null }>();
    check(stored?.consumed_at === null, 'Failed mutation rolls back token consumption');
    check(await actions.completePasswordReset(link.token, account.userId, replacement, now + 2), 'Unconsumed token still works');
  },
  async accountChanges(db) {
    const { account } = await user(db), actions = new D1ActionTokenStore(db), sessions = new D1SessionStore(db);
    const session = await issueSession(sessions, account, now);
    const verify = await actions.issue(account, 'email-verification', now);
    await db.prepare('UPDATE users SET email=?,email_normalized=?,updated_at=? WHERE id=?')
      .bind('other-fictional@example.test', 'other-fictional@example.test', now + 1, account.userId).run();
    check(!await actions.completeEmailVerification(verify.token, account.userId, now + 1), 'Changed email invalidates original binding');
    check(!await resolveSession(db, session.token, now + 1), 'Email change revokes session');
    await rejects(() => actions.issue(account, 'password-reset', now + 1));
    await db.prepare("UPDATE users SET status='disabled',updated_at=? WHERE id=?").bind(now + 2, account.userId).run();
    check(!await findPasswordCredential(db, 'other-fictional@example.test'), 'Disabled credential unavailable');
    await rejects(() => issueSession(sessions, { ...account, authVersion: 2 }, now + 2));
    await rejects(() => actions.issue({ ...account, authVersion: 2 }, 'password-reset', now + 2));
  },
  async identities(db) {
    const { account, email } = await user(db);
    const subject = crypto.randomUUID();
    check(!await findGoogleAccount(db, 'https://accounts.google.com', subject), 'No email-based automatic linking');
    await db.prepare(`INSERT INTO user_auth_providers (id,user_id,provider,identity_namespace,provider_subject,linked_at)
      VALUES (?,?,'google','https://accounts.google.com',?,?)`).bind(crypto.randomUUID(), account.userId, subject, now).run();
    check((await findGoogleAccount(db, 'https://accounts.google.com', subject))?.userId === account.userId, 'Exact issuer subject mapping');
    check(!await findGoogleAccount(db, 'https://untrusted.example.test', subject), 'Untrusted issuer rejected');
    check(!await findGoogleAccount(db, 'https://accounts.google.com', email), 'Email is not provider subject');
    check(!await findPasswordCredential(db, "' OR 1=1 --"), 'Parameterized credential lookup');
  },
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const run = cases[new URL(request.url).pathname.slice(1)];
    if (!run) return new Response(null, { status: 404 });
    try { await run(env.DB); return Response.json({ passed: true }); }
    catch (error) { return Response.json({ failure: error instanceof Error ? error.message : 'Local test failed' }, { status: 500 }); }
  },
};
