import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';

// Use Wrangler's installed local D1 simulator without adding a test framework.
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const migration = await readFile(new URL('../../migrations/0001_create_event_structure.sql', import.meta.url), 'utf8');
let simulator;
let db;
const timestamp = 1790000000;

before(async () => {
  simulator = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    script: 'export default { fetch() { return new Response("Local schema test"); } };',
    d1Databases: { DB: randomUUID() },
    cf: false,
  }));
  db = await simulator.getD1Database('DB');
  // This migration contains plain DDL only, with no semicolons inside strings/comments.
  const statements = migration.replace(/--[^\n]*/g, '').split(';').map((sql) => sql.trim()).filter(Boolean);
  await db.batch(statements.map((sql) => db.prepare(sql)));
  assert.equal(await db.prepare('PRAGMA foreign_keys').first('foreign_keys'), 1);
});

after(async () => { await simulator?.dispose(); });

async function insert(table, values) {
  const columns = Object.keys(values);
  // Table/column names come only from fixed test fixtures; all values are bound.
  return db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    .bind(...Object.values(values)).run();
}

function location(overrides = {}) {
  return { id: randomUUID(), name: 'Fictional LAN Hall', address_line: 'Example Street 1',
    postal_code: '0000 AA', city: 'Example Town', country_code: 'NL',
    created_at: timestamp, updated_at: timestamp, ...overrides };
}

function event(overrides = {}) {
  return { id: randomUUID(), slug: `example-${randomUUID()}`, title: 'Fictional LAN',
    description: 'Schema test only', created_at: timestamp, updated_at: timestamp, ...overrides };
}

function day(eventId, overrides = {}) {
  return { id: randomUUID(), event_id: eventId, attendance_date: '2026-10-16',
    starts_at: 1792173600, ends_at: 1792231200,
    created_at: timestamp, updated_at: timestamp, ...overrides };
}

async function rejects(table, values, error) {
  await assert.rejects(insert(table, values), error);
}

test('migration creates all three strict application tables', async () => {
  const { results } = await db.prepare("SELECT name, strict FROM pragma_table_list WHERE name IN ('locations', 'events', 'event_days') ORDER BY name").all();
  assert.deepEqual(results, [
    { name: 'event_days', strict: 1 }, { name: 'events', strict: 1 }, { name: 'locations', strict: 1 },
  ]);
});

test('a location supports multiple events, multiple days, and overnight sessions', async () => {
  const venue = location();
  await insert('locations', venue);
  const first = event({ location_id: venue.id });
  const second = event({ location_id: venue.id });
  await insert('events', first);
  await insert('events', second);
  await insert('event_days', day(first.id));
  await insert('event_days', day(first.id, { attendance_date: '2026-10-17', starts_at: 1792260000, ends_at: 1792317600 }));
  await insert('event_days', day(second.id));
  assert.equal(await db.prepare('SELECT count(*) AS total FROM events WHERE location_id = ?').bind(venue.id).first('total'), 2);
  assert.equal(await db.prepare('SELECT count(*) AS total FROM event_days WHERE event_id = ?').bind(first.id).first('total'), 2);
  assert.equal(new Date(1792173600 * 1000).toISOString().slice(0, 10), '2026-10-16');
  assert.equal(new Date(1792231200 * 1000).toISOString().slice(0, 10), '2026-10-17');
});

test('duplicate slugs, primary keys, and event attendance dates are rejected', async () => {
  const parent = event();
  await insert('events', parent);
  await rejects('events', event({ slug: parent.slug }), /UNIQUE constraint failed/);
  await rejects('events', event({ id: parent.id }), /UNIQUE constraint failed/);
  await insert('event_days', day(parent.id));
  await rejects('event_days', day(parent.id), /UNIQUE constraint failed/);
});

test('foreign keys reject invalid inserts and updates', async () => {
  await rejects('events', event({ location_id: randomUUID() }), /FOREIGN KEY constraint failed/);
  await rejects('event_days', day(randomUUID()), /FOREIGN KEY constraint failed/);
  const parent = event();
  await insert('events', parent);
  await assert.rejects(db.prepare('UPDATE events SET location_id = ? WHERE id = ?').bind(randomUUID(), parent.id).run(), /FOREIGN KEY constraint failed/);
});

test('referenced locations and events cannot be deleted; cancellation retains days', async () => {
  const venue = location();
  await insert('locations', venue);
  const parent = event({ location_id: venue.id });
  await insert('events', parent);
  await insert('event_days', day(parent.id));
  await assert.rejects(db.prepare('DELETE FROM locations WHERE id = ?').bind(venue.id).run(), /FOREIGN KEY constraint failed/);
  await assert.rejects(db.prepare('DELETE FROM events WHERE id = ?').bind(parent.id).run(), /FOREIGN KEY constraint failed/);
  await db.prepare("UPDATE events SET publication_status = 'cancelled' WHERE id = ?").bind(parent.id).run();
  assert.equal(await db.prepare('SELECT count(*) AS total FROM event_days WHERE event_id = ?').bind(parent.id).first('total'), 1);
});

test('defaults and nullable draft fields are accepted', async () => {
  const venue = location();
  await insert('locations', venue);
  assert.equal(await db.prepare('SELECT is_active FROM locations WHERE id = ?').bind(venue.id).first('is_active'), 1);
  const parent = event();
  await insert('events', parent);
  const row = await db.prepare('SELECT location_id, timezone, publication_status, registration_status, location_visibility, registration_opens_at, registration_closes_at FROM events WHERE id = ?').bind(parent.id).first();
  assert.deepEqual(row, { location_id: null, timezone: 'Europe/Amsterdam', publication_status: 'draft',
    registration_status: 'closed', location_visibility: 'public', registration_opens_at: null, registration_closes_at: null });
  const session = day(parent.id);
  await insert('event_days', session);
  assert.deepEqual(await db.prepare('SELECT label, sort_order, status FROM event_days WHERE id = ?').bind(session.id).first(),
    { label: null, sort_order: 0, status: 'scheduled' });
});

test('draft event without a location succeeds', async () => {
  const draft = event({ publication_status: 'draft', location_id: null });
  await insert('events', draft);
  assert.equal(await db.prepare('SELECT location_id FROM events WHERE id = ?').bind(draft.id).first('location_id'), null);
});

test('published event without a location fails, including a draft publication update', async () => {
  await rejects('events', event({ publication_status: 'published', location_id: null }), /CHECK constraint failed/);
  const draft = event({ location_id: null });
  await insert('events', draft);
  await assert.rejects(db.prepare("UPDATE events SET publication_status = 'published' WHERE id = ?").bind(draft.id).run(), /CHECK constraint failed/);
});

test('published event with a valid location succeeds and cannot have its location cleared', async () => {
  const venue = location();
  await insert('locations', venue);
  const published = event({ publication_status: 'published', location_id: venue.id });
  await insert('events', published);
  assert.equal(await db.prepare('SELECT location_id FROM events WHERE id = ?').bind(published.id).first('location_id'), venue.id);
  await assert.rejects(db.prepare('UPDATE events SET location_id = NULL WHERE id = ?').bind(published.id).run(), /CHECK constraint failed/);
});

test('published event with a nonexistent location fails', async () => {
  await rejects('events', event({ publication_status: 'published', location_id: randomUUID() }), /FOREIGN KEY constraint failed/);
});

test('all documented statuses and visibility values are accepted; others are rejected', async () => {
  const venue = location();
  await insert('locations', venue);
  for (const publication_status of ['draft', 'published', 'archived', 'cancelled']) {
    await insert('events', event({ publication_status, location_id: venue.id }));
  }
  for (const registration_status of ['closed', 'open']) await insert('events', event({ registration_status }));
  for (const location_visibility of ['public', 'authenticated']) await insert('events', event({ location_visibility }));
  for (const column of ['publication_status', 'registration_status', 'location_visibility']) {
    await rejects('events', event({ [column]: 'invalid' }), /CHECK constraint failed/);
  }
  const parent = event();
  await insert('events', parent);
  await insert('event_days', day(parent.id, { status: 'cancelled' }));
  await rejects('event_days', day(parent.id, { status: 'invalid', attendance_date: '2026-10-17' }), /CHECK constraint failed/);
  await rejects('locations', location({ is_active: 2 }), /CHECK constraint failed/);
  await insert('locations', location({ is_active: 0 }));
});

test('every required field rejects NULL', async () => {
  const parent = event();
  await insert('events', parent);
  const fixtures = { locations: location(), events: event(), event_days: day(parent.id) };
  for (const [table, fixture] of Object.entries(fixtures)) {
    const { results } = await db.prepare(`PRAGMA table_info(${table})`).all();
    for (const column of results.filter((column) => column.notnull)) {
      await rejects(table, { ...fixture, [column.name]: null }, /NOT NULL constraint failed/);
    }
  }
});

test('timestamps require integers, nonnegative instants, and valid ordering', async () => {
  for (const table of ['locations', 'events']) {
    const fixture = table === 'locations' ? location : event;
    await rejects(table, fixture({ created_at: -1 }), /CHECK constraint failed/);
    await rejects(table, fixture({ updated_at: timestamp - 1 }), /CHECK constraint failed/);
    await rejects(table, fixture({ created_at: 1.5 }), /cannot store REAL value/);
    await rejects(table, fixture({ updated_at: 'invalid' }), /cannot store TEXT value/);
  }
  await rejects('events', event({ registration_opens_at: -1 }), /CHECK constraint failed/);
  await rejects('events', event({ registration_closes_at: -1 }), /CHECK constraint failed/);
  await rejects('events', event({ registration_opens_at: timestamp, registration_closes_at: timestamp }), /CHECK constraint failed/);
  await rejects('events', event({ registration_opens_at: timestamp + 1, registration_closes_at: timestamp }), /CHECK constraint failed/);
  await insert('events', event({ registration_opens_at: timestamp, registration_closes_at: timestamp + 1 }));
  const parent = event();
  await insert('events', parent);
  for (const overrides of [{ starts_at: -1 }, { ends_at: 1792173600 }, { ends_at: 1792173599 },
    { starts_at: 1.5 }, { ends_at: 'invalid' }, { created_at: -1 }, { updated_at: timestamp - 1 }, { sort_order: -1 }]) {
    await rejects('event_days', day(parent.id, overrides), /CHECK constraint failed|cannot store/);
  }
});

test('attendance dates reject impossible dates and accept leap days', async () => {
  const parent = event();
  await insert('events', parent);
  for (const attendance_date of ['2026-2-01', '2026-02-29', '2026-02-30', '2026-13-01', '2026-01-00', 'not-a-date']) {
    await rejects('event_days', day(parent.id, { attendance_date }), /CHECK constraint failed/);
  }
  await insert('event_days', day(parent.id, { attendance_date: '2028-02-29' }));
});

test('composite day foreign key accepts matching events and rejects mismatched events', async () => {
  // Test-only table, deliberately outside the migration; no registration implementation.
  await db.prepare('CREATE TABLE day_reference_probe (day_id TEXT NOT NULL, event_id TEXT NOT NULL, FOREIGN KEY (day_id, event_id) REFERENCES event_days(id, event_id)) STRICT').run();
  const first = event();
  const second = event();
  await insert('events', first);
  await insert('events', second);
  const session = day(first.id);
  await insert('event_days', session);
  await insert('day_reference_probe', { day_id: session.id, event_id: first.id });
  await rejects('day_reference_probe', { day_id: session.id, event_id: second.id }, /FOREIGN KEY constraint failed/);
  await db.prepare('DROP TABLE day_reference_probe').run();
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
});
