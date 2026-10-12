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
const events = [randomUUID(), randomUUID()];
const days = [[randomUUID(), randomUUID()], [randomUUID(), randomUUID()]];

async function insert(table, values) {
  // Identifiers are fixed fixtures; values are always bound parameters.
  const columns = Object.keys(values);
  return db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    .bind(...Object.values(values)).run();
}

async function createUser() {
  const id = randomUUID();
  await insert('users', { id, first_name: 'Fictional', last_name: 'Participant', email: `${id}@example.test`,
    email_normalized: `${id}@example.test`, created_at: timestamp, updated_at: timestamp });
  return id;
}

async function registration(overrides = {}) {
  return { id: randomUUID(), user_id: await createUser(), event_id: events[0],
    registered_at: timestamp, created_at: timestamp, updated_at: timestamp, ...overrides };
}

async function createRegistration(overrides = {}) {
  const value = await registration(overrides);
  await insert('registrations', value);
  return value;
}

function selection(value, overrides = {}) {
  return { registration_id: value.id, event_id: value.event_id, event_day_id: days[0][0], selected_at: timestamp, ...overrides };
}

async function applyMigration(name) {
  const sql = await readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8');
  const statements = sql.replace(/--[^\n]*/g, '').split(';').map((value) => value.trim()).filter(Boolean);
  await db.batch(statements.map((statement) => db.prepare(statement)));
}

async function previousSchema() {
  return (await db.prepare("SELECT type, name, sql FROM sqlite_schema WHERE tbl_name NOT IN ('registrations','registration_days') AND name NOT LIKE 'sqlite_%' ORDER BY type, name").all()).results;
}

before(async () => {
  simulator = new Miniflare(convertV4MiniflareOptions({ modules: true,
    script: 'export default { fetch() { return new Response("Local registration schema test"); } };',
    d1Databases: { DB: randomUUID() }, cf: false }));
  db = await simulator.getD1Database('DB');
  assert.equal(await db.prepare('PRAGMA foreign_keys').first('foreign_keys'), 1);
  for (const name of ['0001_create_event_structure.sql', '0002_create_accounts.sql',
    '0003_create_auth_credentials.sql', '0004_create_authorization.sql']) await applyMigration(name);
  const venueId = randomUUID();
  await insert('locations', { id: venueId, name: 'Fictional hall', address_line: 'Example Street 1',
    postal_code: '0000 AA', city: 'Example Town', country_code: 'NL', created_at: timestamp, updated_at: timestamp });
  for (const [index, eventId] of events.entries()) {
    await insert('events', { id: eventId, location_id: venueId, slug: `fictional-registration-${index}`, title: 'Example LAN',
      description: 'Fictional fixture', publication_status: 'published', registration_status: 'open', created_at: timestamp, updated_at: timestamp });
    for (const [day, id] of days[index].entries()) {
      await insert('event_days', { id, event_id: eventId, attendance_date: `2026-10-${16 + day}`,
        starts_at: 1792173600 + day * 86400, ends_at: 1792231200 + day * 86400, created_at: timestamp, updated_at: timestamp });
    }
  }
  const userId = await createUser();
  const prefixId = randomUUID();
  const roleId = randomUUID();
  const permissionId = randomUUID();
  await insert('name_prefixes', { id: prefixId, label: 'Fictional prefix', created_at: timestamp, updated_at: timestamp });
  await db.prepare('UPDATE users SET name_prefix_id = ? WHERE id = ?').bind(prefixId, userId).run();
  await insert('user_auth_providers', { id: randomUUID(), user_id: userId, provider: 'google',
    identity_namespace: 'https://accounts.google.com', provider_subject: 'fictional-registration-subject', linked_at: timestamp });
  await insert('user_password_credentials', { user_id: userId, password_hash: 'dummy-unusable-test-hash',
    password_changed_at: timestamp, created_at: timestamp, updated_at: timestamp });
  await insert('roles', { id: roleId, code: 'fictional_role', name: 'Fictional role', created_at: timestamp, updated_at: timestamp });
  await insert('permissions', { id: permissionId, code: 'fictional.action', description: 'Fictional action', created_at: timestamp });
  await insert('user_roles', { user_id: userId, role_id: roleId, assigned_at: timestamp });
  await insert('role_permissions', { role_id: roleId, permission_id: permissionId, granted_at: timestamp });
  originalSchema = await previousSchema();
  for (const table of ['locations','events','event_days','name_prefixes','users','user_auth_providers',
    'user_password_credentials','roles','permissions','user_roles','role_permissions']) {
    const keys = (await db.prepare(`PRAGMA table_info(${table})`).all()).results.filter((column) => column.pk).map((column) => column.name);
    originalRecords.set(table, { keys, rows: (await db.prepare(`SELECT * FROM ${table}`).all()).results });
  }
  await applyMigration('0005_create_registrations.sql');
});

after(async () => { await simulator?.dispose(); });

test('five migrations apply with STRICT registration tables, expected columns and keys', async () => {
  for (const [table, fields, keys] of [
    ['registrations', { id:'TEXT', user_id:'TEXT', event_id:'TEXT', status:'TEXT', registered_at:'INTEGER', cancelled_at:'INTEGER', created_at:'INTEGER', updated_at:'INTEGER' }, ['id']],
    ['registration_days', { registration_id:'TEXT', event_id:'TEXT', event_day_id:'TEXT', selected_at:'INTEGER' }, ['registration_id','event_day_id']],
  ]) {
    assert.equal(await db.prepare('SELECT strict FROM pragma_table_list WHERE name = ?').bind(table).first('strict'), 1);
    const columns = (await db.prepare(`PRAGMA table_info(${table})`).all()).results;
    assert.deepEqual(Object.fromEntries(columns.map((column) => [column.name, column.type])), fields);
    assert.deepEqual(columns.filter((column) => column.pk).sort((a,b) => a.pk-b.pk).map((column) => column.name), keys);
    assert.deepEqual(columns.filter((column) => !column.notnull).map((column) => column.name), table === 'registrations' ? ['cancelled_at'] : []);
  }
});

test('migration seeds no registrations, selected days or participant profiles', async () => {
  for (const table of ['registrations','registration_days']) assert.equal(await db.prepare(`SELECT count(*) AS total FROM ${table}`).first('total'), 0);
  assert.equal(await db.prepare('SELECT count(*) AS total FROM users').first('total'), 1);
});

test('valid registrations default to registered with null cancellation', async () => {
  const value = await createRegistration();
  assert.deepEqual(await db.prepare('SELECT status, cancelled_at FROM registrations WHERE id = ?').bind(value.id).first(), { status:'registered', cancelled_at:null });
});

test('duplicate user/event and registration IDs are rejected on insert and update', async () => {
  const first = await createRegistration();
  await assert.rejects(insert('registrations', { ...first, id:randomUUID() }), /UNIQUE constraint failed/);
  await assert.rejects(insert('registrations', await registration({ id:first.id })), /UNIQUE constraint failed/);
  const second = await createRegistration();
  await assert.rejects(db.prepare('UPDATE registrations SET user_id = ? WHERE id = ?').bind(first.user_id, second.id).run(), /UNIQUE constraint failed/);
  await insert('registrations', { ...first, id:randomUUID(), event_id:events[1] });
});

test('invalid registration statuses fail on insert and update', async () => {
  const value = await createRegistration();
  for (const status of ['pending','', 'REGISTERED']) {
    await assert.rejects(insert('registrations', await registration({ status })), /CHECK constraint failed/);
    await assert.rejects(db.prepare('UPDATE registrations SET status = ? WHERE id = ?').bind(status,value.id).run(), /CHECK constraint failed/);
  }
});

test('required fields reject null, blanks and missing nondefaulted values', async () => {
  const values = await registration();
  const parent = await createRegistration();
  for (const [table, fixture] of [['registrations',values], ['registration_days',selection(parent)]]) {
    for (const column of (await db.prepare(`PRAGMA table_info(${table})`).all()).results.filter((column) => column.notnull)) {
      await assert.rejects(insert(table,{ ...fixture,[column.name]:null }), /NOT NULL constraint failed/);
      if (column.dflt_value === null) {
        const omitted = { ...fixture }; delete omitted[column.name];
        await assert.rejects(insert(table,omitted), /NOT NULL constraint failed/);
      }
      if (column.type === 'TEXT') for (const blank of ['', '   ', '\t\r\n']) {
        await assert.rejects(insert(table,{ ...fixture,[column.name]:blank }), /CHECK constraint failed/);
      }
    }
  }
});

test('timestamp types, nonnegative values and ordering are enforced', async () => {
  const parent = await createRegistration();
  for (const field of ['registered_at','cancelled_at','created_at','updated_at']) {
    for (const invalid of [-1,1.5,'invalid']) await assert.rejects(insert('registrations', await registration({ [field]:invalid })), /CHECK constraint failed|cannot store/);
  }
  for (const overrides of [{ registered_at:timestamp-1 },{ updated_at:timestamp-1 },
    { status:'cancelled',cancelled_at:timestamp-1 },{ status:'cancelled',cancelled_at:timestamp+1 }]) {
    await assert.rejects(insert('registrations',await registration(overrides)), /CHECK constraint failed/);
  }
  for (const selected_at of [-1,1.5,'invalid']) await assert.rejects(insert('registration_days',selection(parent,{ selected_at })), /CHECK constraint failed|cannot store/);
});

test('registration status and cancellation timestamp must agree on insert and update', async () => {
  for (const overrides of [{ status:'cancelled' },{ status:'registered',cancelled_at:timestamp }]) {
    await assert.rejects(insert('registrations',await registration(overrides)), /CHECK constraint failed/);
  }
  const value = await createRegistration();
  await assert.rejects(db.prepare("UPDATE registrations SET status = 'cancelled' WHERE id = ?").bind(value.id).run(), /CHECK constraint failed/);
  await assert.rejects(db.prepare('UPDATE registrations SET cancelled_at = ? WHERE id = ?').bind(timestamp,value.id).run(), /CHECK constraint failed/);
});

test('invalid user/event references fail on INSERT and UPDATE', async () => {
  const value = await createRegistration();
  for (const field of ['user_id','event_id']) {
    await assert.rejects(insert('registrations',await registration({ [field]:randomUUID() })), /FOREIGN KEY constraint failed/);
    await assert.rejects(db.prepare(`UPDATE registrations SET ${field} = ? WHERE id = ?`).bind(randomUUID(),value.id).run(), /FOREIGN KEY constraint failed/);
  }
});

test('multiple selected days from the same event are accepted and duplicates fail', async () => {
  const value = await createRegistration();
  for (const event_day_id of days[0]) await insert('registration_days',selection(value,{ event_day_id }));
  assert.equal(await db.prepare('SELECT count(*) AS total FROM registration_days WHERE registration_id = ?').bind(value.id).first('total'),2);
  await assert.rejects(insert('registration_days',selection(value)), /UNIQUE constraint failed/);
  await assert.rejects(db.prepare('UPDATE registration_days SET event_day_id = ? WHERE registration_id = ? AND event_day_id = ?')
    .bind(days[0][0],value.id,days[0][1]).run(), /UNIQUE constraint failed/);
});

test('cross-event day selections and mismatched registration/event pairs fail', async () => {
  const value = await createRegistration();
  await assert.rejects(insert('registration_days',selection(value,{ event_day_id:days[1][0] })), /FOREIGN KEY constraint failed/);
  await assert.rejects(insert('registration_days',selection(value,{ event_id:events[1],event_day_id:days[1][0] })), /FOREIGN KEY constraint failed/);
});

test('invalid and cross-event composite references fail on INSERT and UPDATE', async () => {
  const value = await createRegistration();
  for (const field of ['registration_id','event_id','event_day_id']) {
    await assert.rejects(insert('registration_days',selection(value,{ [field]:randomUUID() })), /FOREIGN KEY constraint failed/);
  }
  await insert('registration_days',selection(value));
  for (const field of ['registration_id','event_id','event_day_id']) {
    await assert.rejects(db.prepare(`UPDATE registration_days SET ${field} = ? WHERE registration_id = ?`)
      .bind(randomUUID(),value.id).run(), /FOREIGN KEY constraint failed/);
  }
  await assert.rejects(db.prepare('UPDATE registration_days SET event_day_id = ? WHERE registration_id = ?').bind(days[1][0],value.id).run(), /FOREIGN KEY constraint failed/);
  await assert.rejects(db.prepare('UPDATE registration_days SET event_id = ?, event_day_id = ? WHERE registration_id = ?').bind(events[1],days[1][0],value.id).run(), /FOREIGN KEY constraint failed/);
  const other = await createRegistration({ event_id:events[1] });
  await assert.rejects(db.prepare('UPDATE registration_days SET registration_id = ? WHERE registration_id = ?').bind(other.id,value.id).run(), /FOREIGN KEY constraint failed/);
});

test('referenced users/events, registrations and event days restrict deletion and key updates', async () => {
  const value = await createRegistration();
  await insert('registration_days',selection(value));
  for (const [table,id] of [['users',value.user_id],['events',value.event_id],['registrations',value.id],['event_days',days[0][0]]]) {
    await assert.rejects(db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run(), /FOREIGN KEY constraint failed/);
    await assert.rejects(db.prepare(`UPDATE ${table} SET id = ? WHERE id = ?`).bind(randomUUID(),id).run(), /FOREIGN KEY constraint failed/);
  }
  await assert.rejects(db.prepare('UPDATE registrations SET event_id = ? WHERE id = ?').bind(events[1],value.id).run(), /FOREIGN KEY constraint failed/);
  await assert.rejects(db.prepare('UPDATE event_days SET event_id = ? WHERE id = ?').bind(events[1],days[0][0]).run(), /FOREIGN KEY constraint failed|UNIQUE constraint failed/);
});

test('supporting indexes cover composite parents, event/status, user and reverse day lookups', async () => {
  for (const [index,columns] of Object.entries({ registrations_event_status_idx:['event_id','status'], registrations_status_idx:['status'],
    registration_days_event_day_event_idx:['event_day_id','event_id'] })) {
    assert.deepEqual((await db.prepare(`PRAGMA index_info(${index})`).all()).results.map((value) => value.name),columns);
  }
  const uniqueKeys=[];
  for (const index of (await db.prepare('PRAGMA index_list(registrations)').all()).results.filter((index) => index.unique)) {
    uniqueKeys.push((await db.prepare(`PRAGMA index_info(${index.name})`).all()).results.map((column) => column.name));
  }
  for (const expected of [['id'],['user_id','event_id'],['id','event_id']]) assert.ok(uniqueKeys.some((actual) => JSON.stringify(actual)===JSON.stringify(expected)));
});

test('composite foreign keys pair both parent columns with restrictive actions', async () => {
  const keys=(await db.prepare('PRAGMA foreign_key_list(registration_days)').all()).results;
  assert.equal(keys.length,4);
  for (const [parent,columns] of [['registrations',['registration_id','event_id']],['event_days',['event_day_id','event_id']]]) {
    const group=keys.filter((key) => key.table===parent).sort((a,b) => a.seq-b.seq);
    assert.deepEqual(group.map((key) => key.from),columns);
    assert.deepEqual(group.map((key) => key.to),['id','event_id']);
    assert.equal(group[0].id,group[1].id);
    for (const key of group) { assert.equal(key.on_delete,'RESTRICT'); assert.equal(key.on_update,'RESTRICT'); }
  }
});

test('cancellation retains selections and re-registration reuses the ID and original registration time', async () => {
  const value=await createRegistration();
  await insert('registration_days',selection(value));
  await db.prepare("UPDATE registrations SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?")
    .bind(timestamp+1,timestamp+1,value.id).run();
  assert.equal(await db.prepare('SELECT count(*) AS total FROM registration_days WHERE registration_id = ?').bind(value.id).first('total'),1);
  assert.equal(await db.prepare("SELECT count(*) AS total FROM registrations WHERE id = ? AND status = 'registered'").bind(value.id).first('total'),0);
  await assert.rejects(insert('registrations',{ ...value,id:randomUUID() }), /UNIQUE constraint failed/);
  await assert.rejects(db.prepare("UPDATE registrations SET status = 'registered' WHERE id = ?").bind(value.id).run(), /CHECK constraint failed/);
  await db.batch([
    db.prepare('DELETE FROM registration_days WHERE registration_id = ?').bind(value.id),
    db.prepare('INSERT INTO registration_days (registration_id,event_id,event_day_id,selected_at) VALUES (?,?,?,?)').bind(value.id,value.event_id,days[0][1],timestamp+2),
    db.prepare("UPDATE registrations SET status = 'registered', cancelled_at = NULL, updated_at = ? WHERE id = ?").bind(timestamp+2,value.id),
  ]);
  assert.deepEqual(await db.prepare('SELECT id,registered_at,status,cancelled_at FROM registrations WHERE id = ?').bind(value.id).first(),
    { id:value.id,registered_at:timestamp,status:'registered',cancelled_at:null });
  assert.equal(await db.prepare('SELECT event_day_id FROM registration_days WHERE registration_id = ?').bind(value.id).first('event_day_id'),days[0][1]);
});

test('active attendance counts exclude retained cancelled selections and restore the same registration', async () => {
  // Isolate the whole-event count from registrations created by other tests.
  const eventId = randomUUID();
  const selectedDays = [randomUUID(), randomUUID()];
  await insert('events', { id: eventId, slug: `fictional-attendance-${eventId}`, title: 'Fictional attendance LAN',
    description: 'Local counting fixture', created_at: timestamp, updated_at: timestamp });
  for (const [index, id] of selectedDays.entries()) {
    await insert('event_days', { id, event_id: eventId, attendance_date: `2026-10-${20 + index}`,
      starts_at: 1792519200 + index * 86400, ends_at: 1792576800 + index * 86400,
      created_at: timestamp, updated_at: timestamp });
  }
  const value = await createRegistration({ event_id: eventId });
  for (const event_day_id of selectedDays) await insert('registration_days', selection(value, { event_day_id }));

  async function counts() {
    const wholeEvent = await db.prepare(`
      SELECT count(DISTINCT r.id) AS attendee_count
      FROM registrations AS r JOIN registration_days AS rd
        ON rd.registration_id = r.id AND rd.event_id = r.event_id
      WHERE r.event_id = ? AND r.status = 'registered'
    `).bind(eventId).first('attendee_count');
    const perDay = (await db.prepare(`
      SELECT rd.event_day_id, count(DISTINCT r.id) AS attendee_count
      FROM registrations AS r JOIN registration_days AS rd
        ON rd.registration_id = r.id AND rd.event_id = r.event_id
      WHERE r.event_id = ? AND r.status = 'registered'
      GROUP BY rd.event_day_id ORDER BY rd.event_day_id
    `).bind(eventId).all()).results;
    return { wholeEvent, perDay };
  }

  const activeCounts = { wholeEvent: 1, perDay: [...selectedDays].sort().map((event_day_id) => ({ event_day_id, attendee_count: 1 })) };
  assert.deepEqual(await counts(), activeCounts);
  await db.prepare("UPDATE registrations SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?")
    .bind(timestamp + 1, timestamp + 1, value.id).run();
  assert.equal(await db.prepare('SELECT count(*) AS total FROM registration_days WHERE registration_id = ?').bind(value.id).first('total'), 2);
  assert.deepEqual(await counts(), { wholeEvent: 0, perDay: [] });

  await db.prepare("UPDATE registrations SET status = 'registered', cancelled_at = NULL, updated_at = ? WHERE id = ?")
    .bind(timestamp + 2, value.id).run();
  assert.deepEqual(await counts(), activeCounts);
  assert.deepEqual(await db.prepare('SELECT id, registered_at FROM registrations WHERE user_id = ? AND event_id = ?')
    .bind(value.user_id, eventId).first(), { id: value.id, registered_at: value.registered_at });
  assert.equal(await db.prepare('PRAGMA foreign_keys').first('foreign_keys'), 1);
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  assert.equal(await db.prepare('PRAGMA quick_check').first('quick_check'), 'ok');
});

test('failed atomic day replacement rolls back and preserves existing selections', async () => {
  const value=await createRegistration();
  await insert('registration_days',selection(value));
  await assert.rejects(db.batch([
    db.prepare('DELETE FROM registration_days WHERE registration_id = ?').bind(value.id),
    db.prepare('INSERT INTO registration_days (registration_id,event_id,event_day_id,selected_at) VALUES (?,?,?,?)').bind(value.id,value.event_id,days[1][0],timestamp),
  ]), /FOREIGN KEY constraint failed/);
  assert.equal(await db.prepare('SELECT event_day_id FROM registration_days WHERE registration_id = ?').bind(value.id).first('event_day_id'),days[0][0]);
});

test('all eleven prior schemas and fictional records remain intact', async () => {
  assert.deepEqual(await previousSchema(),originalSchema);
  for (const [table,{ keys,rows }] of originalRecords) for (const row of rows) {
    assert.deepEqual(await db.prepare(`SELECT * FROM ${table} WHERE ${keys.map((key) => `${key} = ?`).join(' AND ')}`).bind(...keys.map((key) => row[key])).first(),row);
  }
});

test('foreign-key enforcement remains active with no violations and quick_check ok', async () => {
  assert.equal(await db.prepare('PRAGMA foreign_keys').first('foreign_keys'),1);
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  assert.equal(await db.prepare('PRAGMA quick_check').first('quick_check'),'ok');
});
