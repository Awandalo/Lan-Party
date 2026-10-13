import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';

// Reuse Wrangler's installed simulator and Node's test runner; no new dependency.
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
let simulator;
let db;
let originalEventSchema;
const timestamp = 1790000000;
const venueId = randomUUID();
const eventId = randomUUID();
const dayId = randomUUID();

async function applyMigration(name) {
  const sql = await readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8');
  // These migrations contain plain DDL with no semicolons in strings or comments.
  const statements = sql.replace(/--[^\n]*/g, '').split(';').map((statement) => statement.trim()).filter(Boolean);
  await db.batch(statements.map((statement) => db.prepare(statement)));
}

async function insert(table, values) {
  const columns = Object.keys(values);
  // Identifiers come from fixed test fixtures; all input values are bound.
  return db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    .bind(...Object.values(values)).run();
}

function prefix(overrides = {}) {
  return { id: randomUUID(), label: `Fictional prefix ${randomUUID()}`,
    created_at: timestamp, updated_at: timestamp, ...overrides };
}

function user(overrides = {}) {
  const email = `Example-${randomUUID()}@Example.test`;
  return { id: randomUUID(), first_name: 'Example', last_name: 'Participant',
    email, email_normalized: email.toLowerCase(), created_at: timestamp, updated_at: timestamp, ...overrides };
}

async function rejects(table, values, error) {
  await assert.rejects(insert(table, values), error);
}

async function eventSchema() {
  return (await db.prepare("SELECT type, name, sql FROM sqlite_schema WHERE tbl_name IN ('locations', 'events', 'event_days') ORDER BY type, name").all()).results;
}

before(async () => {
  simulator = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    script: 'export default { fetch() { return new Response("Local account schema test"); } };',
    d1Databases: { DB: randomUUID() },
    cf: false,
  }));
  db = await simulator.getD1Database('DB');
  assert.equal(await db.prepare('PRAGMA foreign_keys').first('foreign_keys'), 1);
  await applyMigration('0001_create_event_structure.sql');
  originalEventSchema = await eventSchema();
  await insert('locations', { id: venueId, name: 'Fictional hall', address_line: 'Example Street 1',
    postal_code: '0000 AA', city: 'Example Town', country_code: 'NL', created_at: timestamp, updated_at: timestamp });
  await insert('events', { id: eventId, location_id: venueId, slug: 'fictional-lan', title: 'Example LAN',
    description: 'Test fixture', publication_status: 'published', created_at: timestamp, updated_at: timestamp });
  await insert('event_days', { id: dayId, event_id: eventId, attendance_date: '2026-10-16',
    starts_at: 1792173600, ends_at: 1792231200, created_at: timestamp, updated_at: timestamp });
  await applyMigration('0002_create_accounts.sql');
});

after(async () => { await simulator?.dispose(); });

test('both migrations apply in order and new tables have the expected strict columns', async () => {
  assert.deepEqual((await db.prepare("SELECT name, strict FROM pragma_table_list WHERE name IN ('name_prefixes', 'users') ORDER BY name").all()).results,
    [{ name: 'name_prefixes', strict: 1 }, { name: 'users', strict: 1 }]);
  const expected = {
    name_prefixes: ['id', 'label', 'sort_order', 'is_active', 'created_at', 'updated_at'],
    users: ['id', 'first_name', 'last_name', 'display_name', 'name_prefix_id', 'email', 'email_normalized',
      'email_verified_at', 'status', 'created_at', 'updated_at'],
  };
  for (const [table, columns] of Object.entries(expected)) {
    assert.deepEqual((await db.prepare(`PRAGMA table_info(${table})`).all()).results.map((column) => column.name), columns);
  }
});

test('migration seeds no prefixes or users', async () => {
  assert.equal(await db.prepare('SELECT count(*) AS total FROM name_prefixes').first('total'), 0);
  assert.equal(await db.prepare('SELECT count(*) AS total FROM users').first('total'), 0);
});

test('valid records preserve email casing and default to unverified active profiles', async () => {
  const namePrefix = prefix();
  await insert('name_prefixes', namePrefix);
  assert.deepEqual(await db.prepare('SELECT sort_order, is_active FROM name_prefixes WHERE id = ?').bind(namePrefix.id).first(),
    { sort_order: 0, is_active: 1 });
  const profile = user({ name_prefix_id: namePrefix.id });
  await insert('users', profile);
  assert.deepEqual(await db.prepare('SELECT email, email_normalized, email_verified_at, status, display_name FROM users WHERE id = ?').bind(profile.id).first(),
    { email: profile.email, email_normalized: profile.email_normalized, email_verified_at: null, status: 'active', display_name: null });
});

test('users can omit prefixes and supply optional display names and verification instants', async () => {
  const profile = user({ display_name: 'Example Player', email_verified_at: timestamp + 1 });
  await insert('users', profile);
  assert.deepEqual(await db.prepare('SELECT name_prefix_id, display_name, email_verified_at FROM users WHERE id = ?').bind(profile.id).first(),
    { name_prefix_id: null, display_name: 'Example Player', email_verified_at: timestamp + 1 });
});

test('multiple users can reference the same prefix', async () => {
  const namePrefix = prefix();
  await insert('name_prefixes', namePrefix);
  await insert('users', user({ name_prefix_id: namePrefix.id }));
  await insert('users', user({ name_prefix_id: namePrefix.id }));
  assert.equal(await db.prepare('SELECT count(*) AS total FROM users WHERE name_prefix_id = ?').bind(namePrefix.id).first('total'), 2);
});

test('duplicate normalized email is rejected despite different original casing', async () => {
  const email_normalized = `duplicate-${randomUUID()}@example.test`;
  await insert('users', user({ email: email_normalized.toUpperCase(), email_normalized }));
  await rejects('users', user({ email: email_normalized, email_normalized }), /UNIQUE constraint failed: users.email_normalized/);
});

test('duplicate prefix labels and primary keys are rejected', async () => {
  const namePrefix = prefix();
  await insert('name_prefixes', namePrefix);
  await rejects('name_prefixes', prefix({ label: namePrefix.label }), /UNIQUE constraint failed: name_prefixes.label/);
  await rejects('name_prefixes', prefix({ id: namePrefix.id }), /UNIQUE constraint failed: name_prefixes.id/);
  const profile = user();
  await insert('users', profile);
  await rejects('users', user({ id: profile.id }), /UNIQUE constraint failed: users.id/);
});

test('only active and disabled account statuses are accepted', async () => {
  await insert('users', user({ status: 'disabled' }));
  await rejects('users', user({ status: 'pending' }), /CHECK constraint failed/);
  await rejects('users', user({ status: '' }), /CHECK constraint failed/);
});

test('timestamp types, nonnegative values, and update ordering are enforced', async () => {
  for (const [table, fixture] of [['name_prefixes', prefix], ['users', user]]) {
    for (const overrides of [{ created_at: -1 }, { updated_at: timestamp - 1 },
      { created_at: 1.5 }, { updated_at: 'invalid' }]) {
      await rejects(table, fixture(overrides), /CHECK constraint failed|cannot store/);
    }
  }
  for (const email_verified_at of [-1, 1.5, 'invalid']) {
    await rejects('users', user({ email_verified_at }), /CHECK constraint failed|cannot store/);
  }
});

test('prefix flags and sort order enforce integer domains', async () => {
  for (const is_active of [-1, 2, 0.5, 'invalid']) {
    await rejects('name_prefixes', prefix({ is_active }), /CHECK constraint failed|cannot store/);
  }
  for (const sort_order of [-1, 0.5, 'invalid']) {
    await rejects('name_prefixes', prefix({ sort_order }), /CHECK constraint failed|cannot store/);
  }
  await insert('name_prefixes', prefix({ is_active: 0, sort_order: 2 }));
});

test('required fields reject null and required strings reject blank values', async () => {
  const fixtures = { name_prefixes: prefix(), users: user() };
  for (const [table, fixture] of Object.entries(fixtures)) {
    for (const column of (await db.prepare(`PRAGMA table_info(${table})`).all()).results.filter((column) => column.notnull)) {
      await rejects(table, { ...fixture, [column.name]: null }, /NOT NULL constraint failed/);
      if (column.type === 'TEXT') {
        for (const blank of ['', '   ']) await rejects(table, { ...fixture, [column.name]: blank }, /CHECK constraint failed/);
        await rejects(table, { ...fixture, [column.name]: '\t\r\n' }, /CHECK constraint failed/);
      }
    }
  }
});

test('referenced prefixes cannot be deleted or have their IDs changed', async () => {
  const namePrefix = prefix();
  await insert('name_prefixes', namePrefix);
  await insert('users', user({ name_prefix_id: namePrefix.id }));
  await assert.rejects(db.prepare('DELETE FROM name_prefixes WHERE id = ?').bind(namePrefix.id).run(), /FOREIGN KEY constraint failed/);
  await assert.rejects(db.prepare('UPDATE name_prefixes SET id = ? WHERE id = ?').bind(randomUUID(), namePrefix.id).run(), /FOREIGN KEY constraint failed/);
});

test('deactivating a prefix preserves existing user references', async () => {
  const namePrefix = prefix();
  await insert('name_prefixes', namePrefix);
  const profile = user({ name_prefix_id: namePrefix.id });
  await insert('users', profile);
  await db.prepare('UPDATE name_prefixes SET is_active = 0, updated_at = ? WHERE id = ?').bind(timestamp + 1, namePrefix.id).run();
  assert.equal(await db.prepare('SELECT name_prefix_id FROM users WHERE id = ?').bind(profile.id).first('name_prefix_id'), namePrefix.id);
  assert.equal(await db.prepare('SELECT is_active FROM name_prefixes WHERE id = ?').bind(namePrefix.id).first('is_active'), 0);
});

test('invalid prefix foreign keys are rejected on insert and update', async () => {
  await rejects('users', user({ name_prefix_id: randomUUID() }), /FOREIGN KEY constraint failed/);
  const profile = user();
  await insert('users', profile);
  await assert.rejects(db.prepare('UPDATE users SET name_prefix_id = ? WHERE id = ?').bind(randomUUID(), profile.id).run(), /FOREIGN KEY constraint failed/);
});

test('event schema and existing event data survive migration 0002 unchanged', async () => {
  assert.deepEqual(await eventSchema(), originalEventSchema);
  assert.equal(await db.prepare('SELECT name FROM locations WHERE id = ?').bind(venueId).first('name'), 'Fictional hall');
  assert.equal(await db.prepare('SELECT location_id FROM events WHERE id = ?').bind(eventId).first('location_id'), venueId);
  assert.equal(await db.prepare('SELECT event_id FROM event_days WHERE id = ?').bind(dayId).first('event_id'), eventId);
  const indexes = (await db.prepare('PRAGMA index_list(users)').all()).results;
  assert.ok(indexes.some((index) => index.name === 'users_name_prefix_id_idx'));
  assert.ok(indexes.some((index) => index.unique === 1 && index.origin === 'u'));
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  assert.equal(await db.prepare('PRAGMA quick_check').first('quick_check'), 'ok');
});
