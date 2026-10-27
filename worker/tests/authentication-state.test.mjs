import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const now = 1791849600;
const migrations = ['0001_create_event_structure.sql', '0002_create_accounts.sql', '0003_create_auth_credentials.sql',
  '0004_create_authorization.sql', '0005_create_registrations.sql', '0006_seed_reference_data.sql', '0007_create_news_articles.sql'];
const next = '0008_create_authentication_state.sql';
const sqlFiles = new Map();
let simulator;
let db;
let originalData;
let originalSchema;
let legacyUser;

// Migration 0008 includes triggers: semicolons inside BEGIN/END are not separators.
function statements(sql) {
  const result = [];
  let rest = sql.replace(/--[^\n]*/g, '').trim();
  while (rest) {
    const end = rest.startsWith('CREATE TRIGGER') ? rest.indexOf('\nEND;') + 5 : rest.indexOf(';') + 1;
    if (end <= 0 || (rest.startsWith('CREATE TRIGGER') && end === 4)) throw new Error('Incomplete migration statement');
    result.push(rest.slice(0, end));
    rest = rest.slice(end).trim();
  }
  return result;
}
async function apply(database, name) {
  await database.batch(statements(sqlFiles.get(name)).map((sql) => database.prepare(sql)));
}
async function localDatabase() {
  const instance = new Miniflare(convertV4MiniflareOptions({ modules: true, cf: false,
    script: 'export default { fetch() { return new Response("Local authentication schema test"); } };',
    d1Databases: { DB: randomUUID() } }));
  const database = await instance.getD1Database('DB');
  for (const name of migrations) await apply(database, name);
  return { instance, database };
}
async function insert(database, table, values) {
  const columns = Object.keys(values); // fixed fixtures, never public input
  return database.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
    .bind(...Object.values(values)).run();
}
async function user(database = db, display_name = null) {
  const id = randomUUID();
  await insert(database, 'users', { id, first_name: 'Fictional', last_name: 'Participant', display_name,
    email: `${id}@example.test`, email_normalized: `${id}@example.test`, created_at: now, updated_at: now });
  return id;
}
function digest() { return createHash('sha256').update(randomUUID()).digest('hex'); }
function session(user_id, overrides = {}) {
  return { id: randomUUID(), user_id, token_digest: digest(), auth_version: 0, created_at: now,
    expires_at: now + 3600, ...overrides };
}
function token(user_id, overrides = {}) {
  return { id: randomUUID(), user_id, purpose: 'password-reset', token_digest: digest(), auth_version: 0,
    created_at: now, expires_at: now + 1800, ...overrides };
}
async function snapshot(database) {
  const tables = (await database.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all()).results;
  const records = {};
  for (const { name } of tables) records[name] = (await database.prepare(`SELECT * FROM ${name} ORDER BY 1,2`).all()).results;
  return records;
}
before(async () => {
  for (const name of [...migrations, next]) sqlFiles.set(name, await readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8'));
  const local = await localDatabase();
  simulator = local.instance;
  db = local.database;
  legacyUser = await user(db, 'Legacy Player');
  await user(db); // unclaimed legacy profile
  const eventId = randomUUID();
  const dayId = randomUUID();
  const registrationId = randomUUID();
  await insert(db, 'events', { id: eventId, slug: 'fictional-auth-state', title: 'Fictional event', description: '', created_at: now, updated_at: now });
  await insert(db, 'event_days', { id: dayId, event_id: eventId, attendance_date: '2026-10-16', starts_at: now,
    ends_at: now + 3600, created_at: now, updated_at: now });
  await insert(db, 'registrations', { id: registrationId, user_id: legacyUser, event_id: eventId,
    registered_at: now, created_at: now, updated_at: now });
  await insert(db, 'registration_days', { registration_id: registrationId, event_id: eventId, event_day_id: dayId, selected_at: now });
  await insert(db, 'user_auth_providers', { id: randomUUID(), user_id: legacyUser, provider: 'google',
    identity_namespace: 'https://accounts.google.com', provider_subject: 'fictional-0008', linked_at: now });
  await insert(db, 'user_password_credentials', { user_id: legacyUser, password_hash: 'dummy-unusable-legacy-value',
    password_changed_at: now, created_at: now, updated_at: now });
  await insert(db, 'news_articles', { id: randomUUID(), title: 'Fictional', slug: 'fictional-0008', content: '',
    author_user_id: legacyUser, created_at: now, updated_at: now });
  originalData = await snapshot(db);
  originalSchema = (await db.prepare("SELECT name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND tbl_name <> 'users' ORDER BY name").all()).results;
  await apply(db, next);
});
after(async () => { await simulator?.dispose(); });

test('0008 preserves all prior records and foreign keys with additive user state', async () => {
  const current = await snapshot(db);
  for (const [table, records] of Object.entries(originalData)) {
    assert.deepEqual(current[table], table === 'users' ? records.map((record) => ({ ...record, auth_version: 0 })) : records);
  }
  for (const { name, sql } of originalSchema) assert.equal(await db.prepare('SELECT sql FROM sqlite_schema WHERE name=?').bind(name).first('sql'), sql);
  const nickname = await db.prepare('SELECT * FROM user_nicknames WHERE user_id=?').bind(legacyUser).first();
  assert.equal(nickname.nickname, 'Legacy Player');
  assert.equal(nickname.nickname_key, 'legacy player');
  assert.equal(nickname.nickname_changed_at, null);
  assert.equal(await db.prepare('SELECT count(*) AS n FROM user_nicknames').first('n'), 1);
  assert.equal(await db.prepare('PRAGMA foreign_keys').first('foreign_keys'), 1);
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  assert.equal(await db.prepare('PRAGMA quick_check').first('quick_check'), 'ok');
});

test('nickname key is generated and D1 rejects case duplicates and malformed/reserved names', async () => {
  const first = await user();
  const second = await user();
  const values = { user_id: first, nickname: 'MiXeD Player', created_at: now, updated_at: now };
  await insert(db, 'user_nicknames', values);
  assert.equal(await db.prepare('SELECT nickname_key FROM user_nicknames WHERE user_id=?').bind(first).first('nickname_key'), 'mixed player');
  await assert.rejects(() => insert(db, 'user_nicknames', { ...values, user_id: second, nickname: 'mixed player' }));
  await assert.rejects(() => insert(db, 'user_nicknames', { ...values, user_id: second, nickname_key: 'invented', nickname: 'Another' }));
  for (const nickname of ['ab', 'a'.repeat(25), ' abc', 'abc ', 'A  B', 'A _B', 'A_ B', 'A -B', 'A- B',
    'Admin', 'MODERATOR', 'S Y S T E M', 'a_d_m_i_n', 'Pläyer', 'A\tB', 'A\0B', 'A!B', 'A\nB']) {
    await assert.rejects(() => insert(db, 'user_nicknames', { ...values, user_id: second, nickname }));
  }
  await assert.rejects(() => db.prepare('UPDATE user_nicknames SET nickname=? WHERE user_id=?').bind('Admin', first).run());
  await insert(db, 'user_nicknames', { ...values, user_id: second, nickname: 'Another' });
  await assert.rejects(() => db.prepare('UPDATE user_nicknames SET nickname=? WHERE user_id=?').bind('MIXED PLAYER', second).run());
  await assert.rejects(() => db.prepare('DELETE FROM users WHERE id=?').bind(first).run());
});

test('nickname participant tracking is retained during correction and timestamps stay constrained', async () => {
  const id = await user();
  await insert(db, 'user_nicknames', { user_id: id, nickname: 'Original Name', created_at: now, updated_at: now });
  const change = now + 14 * 86400;
  await db.prepare('UPDATE user_nicknames SET nickname=?,nickname_changed_at=?,updated_at=? WHERE user_id=?')
    .bind('Changed Name', change, change, id).run();
  await db.prepare('UPDATE user_nicknames SET nickname=?,updated_at=? WHERE user_id=?').bind('Corrected Name', change + 10, id).run();
  assert.equal(await db.prepare('SELECT nickname_changed_at FROM user_nicknames WHERE user_id=?').bind(id).first('nickname_changed_at'), change);
  await assert.rejects(() => db.prepare('UPDATE user_nicknames SET nickname_changed_at=? WHERE user_id=?').bind(now - 1, id).run());
  await assert.rejects(() => db.prepare('UPDATE user_nicknames SET nickname_changed_at=? WHERE user_id=?').bind(change + 11, id).run());
});

test('sessions and action tokens enforce STRICT constraints, digests, TTL, FKs and indexes', async () => {
  const id = await user();
  for (const table of ['user_nicknames', 'auth_sessions', 'auth_action_tokens']) {
    const entry = (await db.prepare('PRAGMA table_list').all()).results.find((value) => value.name === table);
    assert.equal(entry.strict, 1);
  }
  const s = session(id);
  await insert(db, 'auth_sessions', s);
  await assert.rejects(() => insert(db, 'auth_sessions', { ...s, id: randomUUID() }));
  for (const overrides of [{ token_digest: 'raw-token' }, { token_digest: 'G'.repeat(64) }, { token_digest: 'a'.repeat(63) + '\0' },
    { created_at: -1 }, { expires_at: now }, { auth_version: 0.5 }, { user_id: randomUUID() }]) {
    await assert.rejects(() => insert(db, 'auth_sessions', session(id, overrides)));
  }
  const reset = token(id);
  await insert(db, 'auth_action_tokens', reset);
  await assert.rejects(() => insert(db, 'auth_action_tokens', { ...reset, id: randomUUID() }));
  for (const overrides of [{ token_digest: 'raw-token' }, { purpose: 'unknown' }, { expires_at: now + 1799 },
    { email_normalized: 'wrong@example.test' }, { consumed_at: now }, { created_at: -1 }]) {
    await assert.rejects(() => insert(db, 'auth_action_tokens', token(id, overrides)));
  }
  await insert(db, 'auth_action_tokens', token(id, { purpose: 'email-verification', expires_at: now + 86400,
    email_normalized: `${id}@example.test` }));
  await assert.rejects(() => insert(db, 'auth_action_tokens', token(id, { purpose: 'email-verification', expires_at: now + 86400,
    email_normalized: 'other@example.test' })));
  await assert.rejects(() => db.prepare('UPDATE auth_action_tokens SET consumed_at=? WHERE id=?').bind(reset.expires_at, reset.id).run());
  await assert.rejects(() => db.prepare('DELETE FROM users WHERE id=?').bind(id).run());
  const indexes = (await db.prepare("SELECT name FROM sqlite_schema WHERE type='index'").all()).results.map((value) => value.name);
  for (const name of ['auth_sessions_user_id_idx', 'auth_sessions_expires_at_idx', 'auth_action_tokens_user_purpose_idx', 'auth_action_tokens_expires_at_idx']) assert.ok(indexes.includes(name));
});

async function passwordUser() {
  const id = await user();
  await insert(db, 'user_password_credentials', { user_id: id, password_hash: 'dummy-before-reset',
    password_changed_at: now, created_at: now, updated_at: now });
  return id;
}

test('password credential ownership cannot be reassigned, including during a hash update', async () => {
  const source = await passwordUser();
  const target = await user();
  const existingSession = session(source);
  await insert(db, 'auth_sessions', existingSession);
  for (const sql of ['UPDATE user_password_credentials SET user_id=? WHERE user_id=?',
    "UPDATE user_password_credentials SET user_id=?,password_hash='dummy-moved-hash' WHERE user_id=?"]) {
    await assert.rejects(() => db.prepare(sql).bind(target, source).run(), /ownership is immutable/);
    assert.equal(await db.prepare('SELECT user_id FROM user_password_credentials WHERE user_id=?').bind(source).first('user_id'), source);
    assert.equal(await db.prepare('SELECT count(*) AS n FROM user_password_credentials WHERE user_id=?').bind(target).first('n'), 0);
    assert.equal(await db.prepare('SELECT auth_version FROM users WHERE id=?').bind(source).first('auth_version'), 0);
    assert.equal(await db.prepare('SELECT revoked_at FROM auth_sessions WHERE id=?').bind(existingSession.id).first('revoked_at'), null);
  }
  await db.prepare('UPDATE user_password_credentials SET password_hash=?,password_changed_at=?,updated_at=? WHERE user_id=?')
    .bind('dummy-legitimate-change', now + 10, now + 10, source).run();
  assert.equal(await db.prepare('SELECT auth_version FROM users WHERE id=?').bind(source).first('auth_version'), 1);
  assert.equal(await db.prepare('SELECT revoked_at FROM auth_sessions WHERE id=?').bind(existingSession.id).first('revoked_at'), now + 10);
});
function resetBatch(reset, at, passwordHash) {
  // changes() gates the second statement on winning exactly one conditional consume.
  // This local compatibility recipe is not a production adapter or endpoint.
  return db.batch([
    db.prepare(`UPDATE auth_action_tokens SET consumed_at=? WHERE id=? AND user_id=? AND purpose='password-reset'
      AND consumed_at IS NULL AND revoked_at IS NULL AND created_at<=? AND expires_at>?
      AND EXISTS (SELECT 1 FROM user_password_credentials WHERE user_id=auth_action_tokens.user_id)
      AND auth_version=(SELECT auth_version FROM users WHERE id=? AND status='active')`)
      .bind(at, reset.id, reset.user_id, at, at, reset.user_id),
    db.prepare(`UPDATE user_password_credentials SET password_hash=?,password_changed_at=?,updated_at=?
      WHERE user_id=? AND changes()=1`).bind(passwordHash, at, at, reset.user_id),
  ]);
}
test('single-use reset atomically consumes token, changes password and invalidates every session', async () => {
  const id = await passwordUser();
  const reset = token(id);
  await insert(db, 'auth_action_tokens', reset);
  for (let i = 0; i < 2; i++) await insert(db, 'auth_sessions', session(id));
  const results = await resetBatch(reset, now + 10, 'dummy-after-reset');
  assert.equal(results[0].meta.changes, 1);
  assert.equal(await db.prepare('SELECT auth_version FROM users WHERE id=?').bind(id).first('auth_version'), 1);
  assert.equal(await db.prepare('SELECT count(*) AS n FROM auth_sessions WHERE user_id=? AND revoked_at IS NULL').bind(id).first('n'), 0);
  const repeat = await resetBatch(reset, now + 10, 'dummy-replay');
  assert.equal(repeat[0].meta.changes, 0);
  assert.equal(repeat[1].meta.changes, 0);
  assert.equal(await db.prepare('SELECT password_hash FROM user_password_credentials WHERE user_id=?').bind(id).first('password_hash'), 'dummy-after-reset');
  await assert.rejects(() => insert(db, 'auth_sessions', session(id))); // stale login fenced
  await insert(db, 'auth_sessions', session(id, { auth_version: 1 }));
  await assert.rejects(() => db.prepare('UPDATE users SET auth_version=0 WHERE id=?').bind(id).run());
  await assert.rejects(() => db.prepare('UPDATE auth_action_tokens SET consumed_at=NULL WHERE id=?').bind(reset.id).run());
  await assert.rejects(() => db.prepare('UPDATE auth_action_tokens SET revoked_at=NULL WHERE id=?').bind(reset.id).run());
  await assert.rejects(() => db.prepare('UPDATE auth_sessions SET revoked_at=NULL WHERE user_id=? AND auth_version=0').bind(id).run());
});

test('verification consumption is single-use, purpose-bound and atomic with account verification', async () => {
  const id = await user();
  const verification = token(id, { purpose: 'email-verification', expires_at: now + 86400, email_normalized: `${id}@example.test` });
  await insert(db, 'auth_action_tokens', verification);
  async function verify(at, purpose = 'email-verification') {
    return db.batch([
      db.prepare(`UPDATE auth_action_tokens SET consumed_at=? WHERE id=? AND user_id=? AND purpose=?
        AND consumed_at IS NULL AND revoked_at IS NULL AND created_at<=? AND expires_at>?
        AND EXISTS (SELECT 1 FROM users WHERE id=auth_action_tokens.user_id AND status='active'
          AND auth_version=auth_action_tokens.auth_version AND email_normalized=auth_action_tokens.email_normalized)`)
        .bind(at, verification.id, id, purpose, at, at),
      db.prepare('UPDATE users SET email_verified_at=?,updated_at=? WHERE id=? AND changes()=1').bind(at, at, id),
    ]);
  }
  assert.equal((await verify(now + 10, 'password-reset'))[0].meta.changes, 0);
  const outcomes = await Promise.all([verify(now + 10), verify(now + 10)]);
  assert.equal(outcomes.reduce((sum, result) => sum + result[0].meta.changes, 0), 1);
  assert.equal(await db.prepare('SELECT email_verified_at FROM users WHERE id=?').bind(id).first('email_verified_at'), now + 10);
  assert.equal((await verify(now + 11))[0].meta.changes, 0);
});

test('failed reset mutation rolls back consumption and revocation', async () => {
  const id = await passwordUser();
  const reset = token(id);
  await insert(db, 'auth_action_tokens', reset);
  await insert(db, 'auth_sessions', session(id));
  await assert.rejects(() => resetBatch(reset, now + 10, ''));
  assert.equal(await db.prepare('SELECT consumed_at FROM auth_action_tokens WHERE id=?').bind(reset.id).first('consumed_at'), null);
  assert.equal(await db.prepare('SELECT auth_version FROM users WHERE id=?').bind(id).first('auth_version'), 0);
  assert.equal(await db.prepare('SELECT count(*) AS n FROM auth_sessions WHERE user_id=? AND revoked_at IS NULL').bind(id).first('n'), 1);
});

test('credential timestamp changes and deletion revoke existing authentication state', async () => {
  const id = await passwordUser();
  await insert(db, 'auth_sessions', session(id));
  await insert(db, 'auth_action_tokens', token(id));
  await db.prepare('UPDATE user_password_credentials SET password_changed_at=?,updated_at=? WHERE user_id=?')
    .bind(now + 10, now + 10, id).run();
  assert.equal(await db.prepare('SELECT auth_version FROM users WHERE id=?').bind(id).first('auth_version'), 1);
  await insert(db, 'auth_sessions', session(id, { auth_version: 1, created_at: now + 10 }));
  await db.prepare('UPDATE users SET updated_at=? WHERE id=?').bind(now + 20, id).run();
  await db.prepare('DELETE FROM user_password_credentials WHERE user_id=?').bind(id).run();
  assert.equal(await db.prepare('SELECT auth_version FROM users WHERE id=?').bind(id).first('auth_version'), 2);
  assert.equal(await db.prepare('SELECT count(*) AS n FROM auth_sessions WHERE user_id=? AND revoked_at IS NULL').bind(id).first('n'), 0);
  const resetWithoutPassword = token(id, { auth_version: 2 });
  await insert(db, 'auth_action_tokens', resetWithoutPassword);
  assert.equal((await resetBatch(resetWithoutPassword, now + 30, 'dummy-no-credential'))[0].meta.changes, 0);
});

test('concurrent resets have exactly one winner and expired tokens cannot mutate credentials', async () => {
  const id = await passwordUser();
  const reset = token(id);
  await insert(db, 'auth_action_tokens', reset);
  const results = await Promise.all([resetBatch(reset, now + 10, 'dummy-race-a'), resetBatch(reset, now + 10, 'dummy-race-b')]);
  assert.equal(results.reduce((sum, batch) => sum + batch[0].meta.changes, 0), 1);
  assert.equal(await db.prepare('SELECT auth_version FROM users WHERE id=?').bind(id).first('auth_version'), 1);
  const expired = token(id, { auth_version: 1 });
  await insert(db, 'auth_action_tokens', expired);
  const denied = await resetBatch(expired, now + 1800, 'dummy-expired');
  assert.equal(denied[0].meta.changes, 0);
  assert.equal(denied[1].meta.changes, 0);
});

test('email and status changes invalidate state and clear outdated email verification', async () => {
  const id = await user();
  await db.prepare('UPDATE users SET email_verified_at=? WHERE id=?').bind(now, id).run();
  await insert(db, 'auth_sessions', session(id));
  const verification = token(id, { purpose: 'email-verification', expires_at: now + 86400, email_normalized: `${id}@example.test` });
  await insert(db, 'auth_action_tokens', verification);
  await db.prepare('UPDATE users SET email=?,email_normalized=?,updated_at=? WHERE id=?')
    .bind('new@example.test', 'new@example.test', now + 10, id).run();
  assert.equal(await db.prepare('SELECT email_verified_at FROM users WHERE id=?').bind(id).first('email_verified_at'), null);
  assert.equal(await db.prepare('SELECT auth_version FROM users WHERE id=?').bind(id).first('auth_version'), 1);
  await assert.rejects(() => db.prepare('UPDATE auth_action_tokens SET consumed_at=? WHERE id=?').bind(now + 10, verification.id).run());
  await insert(db, 'auth_sessions', session(id, { auth_version: 1 }));
  await db.prepare("UPDATE users SET status='disabled',updated_at=? WHERE id=?").bind(now + 20, id).run();
  await assert.rejects(() => insert(db, 'auth_sessions', session(id, { auth_version: 2 })));
  assert.equal(await db.prepare('SELECT count(*) AS n FROM auth_sessions WHERE user_id=? AND revoked_at IS NULL').bind(id).first('n'), 0);
});

test('migration refuses incompatible legacy nicknames and rolls back without changing records', async () => {
  for (const names of [['Admin'], ['Duplicate', 'dUPLICATE'], [' Invalid']]) {
    const local = await localDatabase();
    try {
      for (const name of names) await user(local.database, name);
      const before = await snapshot(local.database);
      await assert.rejects(() => apply(local.database, next));
      assert.deepEqual(await snapshot(local.database), before);
      assert.equal(await local.database.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name='auth_sessions'").first('n'), 0);
      assert.ok(!(await local.database.prepare('PRAGMA table_info(users)').all()).results.some((column) => column.name === 'auth_version'));
    } finally { await local.instance.dispose(); }
  }
});
