import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
let simulator;
let db;
let originalSchema;
const originalRecords = new Map();
const timestamp = 1790000000;
const retainedUserId = randomUUID();

async function insert(table, values) {
  // Identifiers are fixed test fixtures; all values are bound parameters.
  const columns = Object.keys(values);
  return db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    .bind(...Object.values(values)).run();
}

async function createUser() {
  const id = randomUUID();
  await insert('users', { id, first_name: 'Fictional', last_name: 'Player',
    email: `${id}@example.test`, email_normalized: `${id}@example.test`,
    created_at: timestamp, updated_at: timestamp });
  return id;
}

function identity(user_id, overrides = {}) {
  return { id: randomUUID(), user_id, provider: 'google',
    identity_namespace: 'https://accounts.google.com', provider_subject: `fictional-${randomUUID()}`,
    linked_at: timestamp, ...overrides };
}

function password(user_id, overrides = {}) {
  // Deliberately unusable dummy value; no real password hashing or credentials.
  return { user_id, password_hash: 'dummy-hash-like-test-value-not-a-credential',
    password_changed_at: timestamp, created_at: timestamp, updated_at: timestamp, ...overrides };
}

async function applyMigration(name) {
  const sql = await readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8');
  // Plain DDL only; these files contain no semicolons within SQL string literals.
  const statements = sql.replace(/--[^\n]*/g, '').split(';').map((value) => value.trim()).filter(Boolean);
  await db.batch(statements.map((statement) => db.prepare(statement)));
}

async function existingSchema() {
  return (await db.prepare("SELECT type, name, sql FROM sqlite_schema WHERE tbl_name IN ('locations', 'events', 'event_days', 'name_prefixes', 'users') ORDER BY type, name").all()).results;
}

before(async () => {
  simulator = new Miniflare(convertV4MiniflareOptions({ modules: true,
    script: 'export default { fetch() { return new Response("Local auth schema test"); } };',
    d1Databases: { DB: randomUUID() }, cf: false }));
  db = await simulator.getD1Database('DB');
  assert.equal(await db.prepare('PRAGMA foreign_keys').first('foreign_keys'), 1);
  await applyMigration('0001_create_event_structure.sql');
  await applyMigration('0002_create_accounts.sql');
  const locationId = randomUUID();
  const eventId = randomUUID();
  const prefixId = randomUUID();
  await insert('locations', { id: locationId, name: 'Fictional hall', address_line: 'Example Street 1',
    postal_code: '0000 AA', city: 'Example Town', country_code: 'NL', created_at: timestamp, updated_at: timestamp });
  await insert('events', { id: eventId, location_id: locationId, slug: 'fictional-auth-lan', title: 'Example LAN',
    description: 'Fictional fixture', publication_status: 'published', created_at: timestamp, updated_at: timestamp });
  await insert('event_days', { id: randomUUID(), event_id: eventId, attendance_date: '2026-10-16',
    starts_at: 1792173600, ends_at: 1792231200, created_at: timestamp, updated_at: timestamp });
  await insert('name_prefixes', { id: prefixId, label: 'Fictional prefix', created_at: timestamp, updated_at: timestamp });
  await insert('users', { id: retainedUserId, first_name: 'Existing', last_name: 'Fictional', name_prefix_id: prefixId,
    email: 'Existing@Example.test', email_normalized: 'existing@example.test', created_at: timestamp, updated_at: timestamp });
  originalSchema = await existingSchema();
  for (const table of ['locations', 'events', 'event_days', 'name_prefixes', 'users']) {
    originalRecords.set(table, (await db.prepare(`SELECT * FROM ${table}`).all()).results);
  }
  await applyMigration('0003_create_auth_credentials.sql');
});

after(async () => { await simulator?.dispose(); });

test('all migrations apply in order with strict auth tables and expected column types', async () => {
  assert.deepEqual((await db.prepare("SELECT name, strict FROM pragma_table_list WHERE name IN ('user_auth_providers', 'user_password_credentials') ORDER BY name").all()).results,
    [{ name: 'user_auth_providers', strict: 1 }, { name: 'user_password_credentials', strict: 1 }]);
  for (const [table, expected] of Object.entries({
    user_auth_providers: { id: 'TEXT', user_id: 'TEXT', provider: 'TEXT', identity_namespace: 'TEXT', provider_subject: 'TEXT', linked_at: 'INTEGER', last_login_at: 'INTEGER' },
    user_password_credentials: { user_id: 'TEXT', password_hash: 'TEXT', password_changed_at: 'INTEGER', created_at: 'INTEGER', updated_at: 'INTEGER' },
  })) {
    assert.deepEqual(Object.fromEntries((await db.prepare(`PRAGMA table_info(${table})`).all()).results.map((column) => [column.name, column.type])), expected);
    assert.equal(await db.prepare(`SELECT count(*) AS total FROM ${table}`).first('total'), 0);
  }
});

test('valid Google linkage succeeds with optional last login', async () => {
  const value = identity(await createUser());
  await insert('user_auth_providers', value);
  assert.equal(await db.prepare('SELECT last_login_at FROM user_auth_providers WHERE id = ?').bind(value.id).first('last_login_at'), null);
  await db.prepare('UPDATE user_auth_providers SET last_login_at = ? WHERE id = ?').bind(timestamp + 1, value.id).run();
});

test('duplicate external identity cannot link to the same or another user', async () => {
  const value = identity(await createUser());
  await insert('user_auth_providers', value);
  for (const user_id of [value.user_id, await createUser()]) {
    await assert.rejects(insert('user_auth_providers', { ...value, id: randomUUID(), user_id }), /UNIQUE constraint failed/);
  }
  await assert.rejects(insert('user_auth_providers', identity(value.user_id, { id: value.id })), /UNIQUE constraint failed/);
});

test('updating an external identity to duplicate another identity is rejected', async () => {
  const existing = identity(await createUser());
  const target = identity(await createUser(), { identity_namespace: 'https://issuer.example.test' });
  await insert('user_auth_providers', existing);
  await insert('user_auth_providers', target);
  await assert.rejects(db.prepare('UPDATE user_auth_providers SET provider = ?, identity_namespace = ?, provider_subject = ? WHERE id = ?')
    .bind(existing.provider, existing.identity_namespace, existing.provider_subject, target.id).run(), /UNIQUE constraint failed/);
  assert.deepEqual(await db.prepare('SELECT * FROM user_auth_providers WHERE id = ?').bind(target.id).first(),
    { ...target, last_login_at: null });
});

test('multiple subjects and distinct namespaces can link to one user', async () => {
  const userId = await createUser();
  const value = identity(userId);
  await insert('user_auth_providers', value);
  await insert('user_auth_providers', identity(userId));
  // Namespace isolation is a storage property, not authorization of this fictional issuer.
  await insert('user_auth_providers', identity(userId, { provider_subject: value.provider_subject, identity_namespace: 'https://issuer.example.test' }));
  assert.equal(await db.prepare('SELECT count(*) AS total FROM user_auth_providers WHERE user_id = ?').bind(userId).first('total'), 3);
});

test('invalid user foreign keys are rejected on insert and update', async () => {
  for (const [table, fixture] of [['user_auth_providers', identity], ['user_password_credentials', password]]) {
    await assert.rejects(insert(table, fixture(randomUUID())), /FOREIGN KEY constraint failed/);
    const userId = await createUser();
    await insert(table, fixture(userId));
    await assert.rejects(db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id = ?`).bind(randomUUID(), userId).run(), /FOREIGN KEY constraint failed/);
  }
});

test('user profiles remain valid without either authentication method', async () => {
  const userId = await createUser();
  for (const table of ['user_auth_providers', 'user_password_credentials']) {
    assert.equal(await db.prepare(`SELECT count(*) AS total FROM ${table} WHERE user_id = ?`).bind(userId).first('total'), 0);
  }
});

test('Google-only profiles need no password credential', async () => {
  const userId = await createUser();
  await insert('user_auth_providers', identity(userId));
  assert.equal(await db.prepare('SELECT count(*) AS total FROM user_password_credentials WHERE user_id = ?').bind(userId).first('total'), 0);
});

test('password-only profiles need no external provider and can later link Google', async () => {
  const userId = await createUser();
  await insert('user_password_credentials', password(userId));
  assert.equal(await db.prepare('SELECT count(*) AS total FROM user_auth_providers WHERE user_id = ?').bind(userId).first('total'), 0);
  await insert('user_auth_providers', identity(userId));
  assert.equal(await db.prepare('SELECT count(*) AS total FROM user_auth_providers WHERE user_id = ?').bind(userId).first('total'), 1);
  assert.equal(await db.prepare('SELECT count(*) AS total FROM user_password_credentials WHERE user_id = ?').bind(userId).first('total'), 1);
});

test('only one password credential per user is accepted', async () => {
  const userId = await createUser();
  await insert('user_password_credentials', password(userId));
  await assert.rejects(insert('user_password_credentials', password(userId)), /UNIQUE constraint failed/);
});

test('updating an existing password hash to an empty or whitespace-only value is rejected', async () => {
  const value = password(await createUser());
  await insert('user_password_credentials', value);
  for (const blank of ['', '   ', '\t\r\n']) {
    await assert.rejects(db.prepare('UPDATE user_password_credentials SET password_hash = ? WHERE user_id = ?')
      .bind(blank, value.user_id).run(), /CHECK constraint failed/);
    assert.equal(await db.prepare('SELECT password_hash FROM user_password_credentials WHERE user_id = ?')
      .bind(value.user_id).first('password_hash'), value.password_hash);
  }
});

test('required fields reject null or omission and text rejects blanks', async () => {
  for (const [table, fixture] of [['user_auth_providers', identity], ['user_password_credentials', password]]) {
    const values = fixture(await createUser());
    for (const column of (await db.prepare(`PRAGMA table_info(${table})`).all()).results.filter((column) => column.notnull)) {
      await assert.rejects(insert(table, { ...values, [column.name]: null }), /NOT NULL constraint failed/);
      const omitted = { ...values };
      delete omitted[column.name];
      await assert.rejects(insert(table, omitted), /NOT NULL constraint failed/);
      if (column.type === 'TEXT') {
        for (const blank of ['', '   ', '\t\r\n']) {
          await assert.rejects(insert(table, { ...values, [column.name]: blank }), /CHECK constraint failed/);
        }
      }
    }
  }
});

test('password is not an external provider entry', async () => {
  await assert.rejects(insert('user_auth_providers', identity(await createUser(), { provider: 'password' })), /CHECK constraint failed/);
});

test('timestamp types and temporal ordering are enforced', async () => {
  for (const [table, fixture, fields] of [
    ['user_auth_providers', identity, ['linked_at', 'last_login_at']],
    ['user_password_credentials', password, ['password_changed_at', 'created_at', 'updated_at']],
  ]) {
    const userId = await createUser();
    for (const field of fields) {
      for (const invalid of [-1, 1.5, 'invalid']) {
        await assert.rejects(insert(table, fixture(userId, { [field]: invalid })), /CHECK constraint failed|cannot store/);
      }
    }
  }
  await assert.rejects(insert('user_auth_providers', identity(await createUser(), { last_login_at: timestamp - 1 })), /CHECK constraint failed/);
  for (const overrides of [{ password_changed_at: timestamp - 1 }, { updated_at: timestamp - 1 }, { password_changed_at: timestamp + 1 }]) {
    await assert.rejects(insert('user_password_credentials', password(await createUser(), overrides)), /CHECK constraint failed/);
  }
  await insert('user_password_credentials', password(await createUser(), { password_changed_at: timestamp + 1, updated_at: timestamp + 2 }));
});

test('referenced users cannot be deleted or have IDs changed', async () => {
  for (const [table, fixture] of [['user_auth_providers', identity], ['user_password_credentials', password]]) {
    const userId = await createUser();
    await insert(table, fixture(userId));
    await assert.rejects(db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run(), /FOREIGN KEY constraint failed/);
    await assert.rejects(db.prepare('UPDATE users SET id = ? WHERE id = ?').bind(randomUUID(), userId).run(), /FOREIGN KEY constraint failed/);
  }
});

test('existing event and account schema and records remain intact', async () => {
  assert.deepEqual(await existingSchema(), originalSchema);
  for (const [table, expected] of originalRecords) {
    const actual = table === 'users'
      ? (await db.prepare('SELECT * FROM users WHERE id = ?').bind(retainedUserId).all()).results
      : (await db.prepare(`SELECT * FROM ${table}`).all()).results;
    assert.deepEqual(actual, expected);
  }
});

test('indexes and restrictive foreign keys exist with healthy database integrity', async () => {
  assert.deepEqual((await db.prepare('PRAGMA index_info(user_auth_providers_user_id_idx)').all()).results.map((column) => column.name), ['user_id']);
  for (const table of ['user_auth_providers', 'user_password_credentials']) {
    const keys = (await db.prepare(`PRAGMA foreign_key_list(${table})`).all()).results;
    assert.equal(keys.length, 1);
    assert.equal(keys[0].table, 'users');
    assert.equal(keys[0].from, 'user_id');
    assert.equal(keys[0].to, 'id');
    assert.equal(keys[0].on_delete, 'RESTRICT');
    assert.equal(keys[0].on_update, 'RESTRICT');
  }
  assert.equal(await db.prepare('PRAGMA foreign_keys').first('foreign_keys'), 1);
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  assert.equal(await db.prepare('PRAGMA quick_check').first('quick_check'), 'ok');
});
