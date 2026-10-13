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
const previousTables = ['locations', 'events', 'event_days', 'name_prefixes', 'users',
  'user_auth_providers', 'user_password_credentials'];
const timestamp = 1790000000;

async function insert(table, values) {
  // Fixed fixture identifiers only; input values always use bound parameters.
  const columns = Object.keys(values);
  return db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    .bind(...Object.values(values)).run();
}

async function applyMigration(name) {
  const sql = await readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8');
  // Plain DDL, with no semicolons inside string literals.
  const statements = sql.replace(/--[^\n]*/g, '').split(';').map((value) => value.trim()).filter(Boolean);
  await db.batch(statements.map((statement) => db.prepare(statement)));
}

function role(overrides = {}) {
  return { id: randomUUID(), code: `fictional_${randomUUID().replaceAll('-', '')}`, name: 'Fictional role',
    created_at: timestamp, updated_at: timestamp, ...overrides };
}

function permission(overrides = {}) {
  return { id: randomUUID(), code: `fictional.action_${randomUUID().replaceAll('-', '')}`,
    description: 'Fictional test action', created_at: timestamp, ...overrides };
}

async function createRole(overrides = {}) {
  const value = role(overrides);
  await insert('roles', value);
  return value.id;
}

async function createPermission() {
  const value = permission();
  await insert('permissions', value);
  return value.id;
}

async function schema() {
  return (await db.prepare("SELECT type, name, sql FROM sqlite_schema WHERE tbl_name IN ('locations','events','event_days','name_prefixes','users','user_auth_providers','user_password_credentials') ORDER BY type, name").all()).results;
}

before(async () => {
  simulator = new Miniflare(convertV4MiniflareOptions({ modules: true,
    script: 'export default { fetch() { return new Response("Local RBAC schema test"); } };',
    d1Databases: { DB: randomUUID() }, cf: false }));
  db = await simulator.getD1Database('DB');
  assert.equal(await db.prepare('PRAGMA foreign_keys').first('foreign_keys'), 1);
  for (const name of ['0001_create_event_structure.sql', '0002_create_accounts.sql', '0003_create_auth_credentials.sql']) {
    await applyMigration(name);
  }
  const venueId = randomUUID();
  const eventId = randomUUID();
  const prefixId = randomUUID();
  const userId = randomUUID();
  await insert('locations', { id: venueId, name: 'Fictional hall', address_line: 'Example Street 1',
    postal_code: '0000 AA', city: 'Example Town', country_code: 'NL', created_at: timestamp, updated_at: timestamp });
  await insert('events', { id: eventId, location_id: venueId, slug: 'fictional-rbac-lan', title: 'Example LAN',
    description: 'Fictional fixture', publication_status: 'published', created_at: timestamp, updated_at: timestamp });
  await insert('event_days', { id: randomUUID(), event_id: eventId, attendance_date: '2026-10-16',
    starts_at: 1792173600, ends_at: 1792231200, created_at: timestamp, updated_at: timestamp });
  await insert('name_prefixes', { id: prefixId, label: 'Fictional prefix', created_at: timestamp, updated_at: timestamp });
  // Two fictional profiles allow assignment metadata tests without adding users later.
  for (const id of [userId, randomUUID()]) {
    await insert('users', { id, first_name: 'Fictional', last_name: 'Player', name_prefix_id: prefixId,
      email: `${id}@example.test`, email_normalized: `${id}@example.test`, created_at: timestamp, updated_at: timestamp });
  }
  await insert('user_auth_providers', { id: randomUUID(), user_id: userId, provider: 'google',
    identity_namespace: 'https://accounts.google.com', provider_subject: 'fictional-subject', linked_at: timestamp });
  await insert('user_password_credentials', { user_id: userId, password_hash: 'dummy-unusable-test-hash',
    password_changed_at: timestamp, created_at: timestamp, updated_at: timestamp });
  originalSchema = await schema();
  for (const table of previousTables) {
    const order = table === 'user_password_credentials' ? 'user_id' : 'id';
    originalRecords.set(table, (await db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all()).results);
  }
  await applyMigration('0004_create_authorization.sql');
});

after(async () => { await simulator?.dispose(); });

async function userIds() {
  return (await db.prepare('SELECT id FROM users ORDER BY id').all()).results.map((value) => value.id);
}

test('all four migrations apply and authorization tables are STRICT with expected fields and keys', async () => {
  const expected = {
    roles: { id: 'TEXT', code: 'TEXT', name: 'TEXT', description: 'TEXT', is_active: 'INTEGER', created_at: 'INTEGER', updated_at: 'INTEGER' },
    permissions: { id: 'TEXT', code: 'TEXT', description: 'TEXT', created_at: 'INTEGER' },
    user_roles: { user_id: 'TEXT', role_id: 'TEXT', assigned_at: 'INTEGER', assigned_by_user_id: 'TEXT' },
    role_permissions: { role_id: 'TEXT', permission_id: 'TEXT', granted_at: 'INTEGER' },
  };
  const keys = { roles: ['id'], permissions: ['id'], user_roles: ['user_id', 'role_id'], role_permissions: ['role_id', 'permission_id'] };
  for (const [table, fields] of Object.entries(expected)) {
    assert.equal(await db.prepare('SELECT strict FROM pragma_table_list WHERE name = ?').bind(table).first('strict'), 1);
    const columns = (await db.prepare(`PRAGMA table_info(${table})`).all()).results;
    assert.deepEqual(Object.fromEntries(columns.map((column) => [column.name, column.type])), fields);
    assert.deepEqual(columns.filter((column) => column.pk).sort((a, b) => a.pk - b.pk).map((column) => column.name), keys[table]);
    assert.deepEqual(columns.filter((column) => !column.notnull).map((column) => column.name),
      table === 'roles' ? ['description'] : table === 'user_roles' ? ['assigned_by_user_id'] : []);
  }
});

test('migration seeds no roles, permissions, assignments or administrator profiles', async () => {
  for (const table of ['roles', 'permissions', 'user_roles', 'role_permissions']) {
    assert.equal(await db.prepare(`SELECT count(*) AS total FROM ${table}`).first('total'), 0);
  }
  assert.equal(await db.prepare('SELECT count(*) AS total FROM users').first('total'), originalRecords.get('users').length);
});

test('valid roles and permissions accept defaults, descriptions and inactive roles', async () => {
  const value = role();
  await insert('roles', value);
  assert.deepEqual(await db.prepare('SELECT is_active, description FROM roles WHERE id = ?').bind(value.id).first(), { is_active: 1, description: null });
  await insert('roles', role({ code: 'news_editor', description: 'Fictional editorial role', is_active: 0 }));
  await insert('permissions', permission({ code: 'events.manage_registrations' }));
});

test('duplicate role and permission codes and primary keys are rejected on insert/update', async () => {
  for (const [table, fixture] of [['roles', role], ['permissions', permission]]) {
    const existing = fixture();
    const other = fixture();
    await insert(table, existing);
    await insert(table, other);
    await assert.rejects(insert(table, fixture({ code: existing.code })), /UNIQUE constraint failed/);
    await assert.rejects(insert(table, fixture({ id: existing.id })), /UNIQUE constraint failed/);
    await assert.rejects(db.prepare(`UPDATE ${table} SET code = ? WHERE id = ?`).bind(existing.code, other.id).run(), /UNIQUE constraint failed/);
  }
});

test('machine codes use lowercase identifiers and resource.action without wildcards', async () => {
  for (const code of ['Admin', '1admin', 'admin role', '*', 'news.editor']) {
    await assert.rejects(insert('roles', role({ code })), /CHECK constraint failed/);
  }
  for (const code of ['events', '.create', 'events.', 'events.*', '*.*', 'Events.create', 'events.create.more', 'events.create-action', 'events.1create']) {
    await assert.rejects(insert('permissions', permission({ code })), /CHECK constraint failed/);
  }
});

for (const code of ['events..create', 'events.create_', 'events.create.', 'events._create']) {
  test(`malformed permission code ${code} is rejected`, async () => {
    await assert.rejects(insert('permissions', permission({ code })), /CHECK constraint failed/);
  });
}

test('trailing underscores in role and permission codes are rejected on insert and update', async () => {
  for (const [table, fixture, invalidCode] of [
    ['roles', role, 'admin_'],
    ['permissions', permission, 'events.create_'],
  ]) {
    await assert.rejects(insert(table, fixture({ code: invalidCode })), /CHECK constraint failed/);
    const value = fixture();
    await insert(table, value);
    await assert.rejects(db.prepare(`UPDATE ${table} SET code = ? WHERE id = ?`).bind(invalidCode, value.id).run(), /CHECK constraint failed/);
    assert.equal(await db.prepare(`SELECT code FROM ${table} WHERE id = ?`).bind(value.id).first('code'), value.code);
  }
});

test('valid admin and news_editor role codes are accepted', async () => {
  await insert('roles', role({ code: 'admin' }));
  // news_editor already exists as a valid fixture in an earlier test.
  for (const code of ['admin', 'news_editor']) {
    assert.equal(await db.prepare('SELECT count(*) AS total FROM roles WHERE code = ?').bind(code).first('total'), 1);
  }
});

test('valid events.create and events.manage_registrations permission codes are accepted', async () => {
  // manage_registrations already exists as a valid fixture in an earlier test.
  await insert('permissions', permission({ code: 'events.create' }));
  for (const code of ['events.create', 'events.manage_registrations']) {
    assert.equal(await db.prepare('SELECT count(*) AS total FROM permissions WHERE code = ?').bind(code).first('total'), 1);
  }
});

test('invalid integer boolean values are rejected on insert/update', async () => {
  const id = await createRole();
  for (const is_active of [-1, 2, 0.5, 'invalid']) {
    await assert.rejects(insert('roles', role({ is_active })), /CHECK constraint failed|cannot store/);
    await assert.rejects(db.prepare('UPDATE roles SET is_active = ? WHERE id = ?').bind(is_active, id).run(), /CHECK constraint failed|cannot store/);
  }
});

test('all required fields reject null, omission and blank identifiers', async () => {
  const [userId] = await userIds();
  const roleId = await createRole();
  const permissionId = await createPermission();
  const fixtures = { roles: role(), permissions: permission(),
    user_roles: { user_id: userId, role_id: roleId, assigned_at: timestamp },
    role_permissions: { role_id: roleId, permission_id: permissionId, granted_at: timestamp } };
  for (const [table, values] of Object.entries(fixtures)) {
    for (const column of (await db.prepare(`PRAGMA table_info(${table})`).all()).results.filter((column) => column.notnull)) {
      await assert.rejects(insert(table, { ...values, [column.name]: null }), /NOT NULL constraint failed/);
      if (column.dflt_value === null) {
        const omitted = { ...values };
        delete omitted[column.name];
        await assert.rejects(insert(table, omitted), /NOT NULL constraint failed/);
      }
      if (column.type === 'TEXT') {
        for (const blank of ['', '   ', '\t\r\n']) {
          await assert.rejects(insert(table, { ...values, [column.name]: blank }), /CHECK constraint failed/);
        }
      }
    }
  }
});

test('timestamps require nonnegative integers and role updates cannot precede creation', async () => {
  const [userId] = await userIds();
  const roleId = await createRole();
  const permissionId = await createPermission();
  for (const [table, values, fields] of [
    ['roles', role(), ['created_at', 'updated_at']],
    ['permissions', permission(), ['created_at']],
    ['user_roles', { user_id: userId, role_id: roleId, assigned_at: timestamp }, ['assigned_at']],
    ['role_permissions', { role_id: roleId, permission_id: permissionId, granted_at: timestamp }, ['granted_at']],
  ]) {
    for (const field of fields) {
      for (const invalid of [-1, 1.5, 'invalid']) {
        await assert.rejects(insert(table, { ...values, [field]: invalid }), /CHECK constraint failed|cannot store/);
      }
    }
  }
  await assert.rejects(insert('roles', role({ updated_at: timestamp - 1 })), /CHECK constraint failed/);
  await assert.rejects(db.prepare('UPDATE roles SET updated_at = ? WHERE id = ?').bind(timestamp - 1, roleId).run(), /CHECK constraint failed/);
});

test('one user holds multiple roles and assignment metadata including nullable assigner is retained', async () => {
  const [userId, assignerId] = await userIds();
  const first = await createRole();
  const second = await createRole();
  await insert('user_roles', { user_id: userId, role_id: first, assigned_at: timestamp, assigned_by_user_id: assignerId });
  await insert('user_roles', { user_id: userId, role_id: second, assigned_at: timestamp + 1 });
  assert.deepEqual(await db.prepare('SELECT assigned_at, assigned_by_user_id FROM user_roles WHERE user_id = ? AND role_id = ?').bind(userId, first).first(),
    { assigned_at: timestamp, assigned_by_user_id: assignerId });
  assert.deepEqual(await db.prepare('SELECT assigned_at, assigned_by_user_id FROM user_roles WHERE user_id = ? AND role_id = ?').bind(userId, second).first(),
    { assigned_at: timestamp + 1, assigned_by_user_id: null });
});

test('duplicate assignments and grants are rejected including updates', async () => {
  const [userId] = await userIds();
  const first = await createRole();
  const second = await createRole();
  await insert('user_roles', { user_id: userId, role_id: first, assigned_at: timestamp });
  await insert('user_roles', { user_id: userId, role_id: second, assigned_at: timestamp });
  await assert.rejects(insert('user_roles', { user_id: userId, role_id: first, assigned_at: timestamp + 1 }), /UNIQUE constraint failed/);
  await assert.rejects(db.prepare('UPDATE user_roles SET role_id = ? WHERE user_id = ? AND role_id = ?').bind(first, userId, second).run(), /UNIQUE constraint failed/);
  const permissionId = await createPermission();
  const otherPermissionId = await createPermission();
  await insert('role_permissions', { role_id: first, permission_id: permissionId, granted_at: timestamp });
  await insert('role_permissions', { role_id: first, permission_id: otherPermissionId, granted_at: timestamp });
  await assert.rejects(insert('role_permissions', { role_id: first, permission_id: permissionId, granted_at: timestamp }), /UNIQUE constraint failed/);
  await assert.rejects(db.prepare('UPDATE role_permissions SET permission_id = ? WHERE role_id = ? AND permission_id = ?').bind(permissionId, first, otherPermissionId).run(), /UNIQUE constraint failed/);
});

test('every foreign key rejects nonexistent references on insert and update', async () => {
  const [userId, assignerId] = await userIds();
  const roleId = await createRole();
  const permissionId = await createPermission();
  for (const [table, values, fields, where, whereValues] of [
    ['user_roles', { user_id: userId, role_id: roleId, assigned_at: timestamp, assigned_by_user_id: assignerId },
      ['user_id', 'role_id', 'assigned_by_user_id'], 'user_id = ? AND role_id = ?', [userId, roleId]],
    ['role_permissions', { role_id: roleId, permission_id: permissionId, granted_at: timestamp },
      ['role_id', 'permission_id'], 'role_id = ? AND permission_id = ?', [roleId, permissionId]],
  ]) {
    for (const field of fields) await assert.rejects(insert(table, { ...values, [field]: randomUUID() }), /FOREIGN KEY constraint failed/);
    await insert(table, values);
    for (const field of fields) {
      await assert.rejects(db.prepare(`UPDATE ${table} SET ${field} = ? WHERE ${where}`).bind(randomUUID(), ...whereValues).run(), /FOREIGN KEY constraint failed/);
    }
  }
});

test('assigned roles and granted permissions restrict parent deletion and ID changes', async () => {
  const [userId] = await userIds();
  const roleId = await createRole();
  const permissionId = await createPermission();
  await insert('user_roles', { user_id: userId, role_id: roleId, assigned_at: timestamp });
  await insert('role_permissions', { role_id: roleId, permission_id: permissionId, granted_at: timestamp });
  for (const [table, id] of [['roles', roleId], ['permissions', permissionId]]) {
    await assert.rejects(db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run(), /FOREIGN KEY constraint failed/);
    await assert.rejects(db.prepare(`UPDATE ${table} SET id = ? WHERE id = ?`).bind(randomUUID(), id).run(), /FOREIGN KEY constraint failed/);
  }
  // Check each user FK independently, then remove only these disposable fixtures.
  for (const column of ['user_id', 'assigned_by_user_id']) {
    const isolatedUser = randomUUID();
    const isolatedRole = await createRole();
    try {
      await insert('users', { id: isolatedUser, first_name: 'Isolated', last_name: 'Fictional', email: `${isolatedUser}@example.test`,
        email_normalized: `${isolatedUser}@example.test`, created_at: timestamp, updated_at: timestamp });
      await insert('user_roles', { user_id: column === 'user_id' ? isolatedUser : userId, role_id: isolatedRole,
        assigned_at: timestamp, assigned_by_user_id: column === 'assigned_by_user_id' ? isolatedUser : null });
      await assert.rejects(db.prepare('DELETE FROM users WHERE id = ?').bind(isolatedUser).run(), /FOREIGN KEY constraint failed/);
      await assert.rejects(db.prepare('UPDATE users SET id = ? WHERE id = ?').bind(randomUUID(), isolatedUser).run(), /FOREIGN KEY constraint failed/);
    } finally {
      await db.prepare('DELETE FROM user_roles WHERE role_id = ?').bind(isolatedRole).run();
      await db.prepare('DELETE FROM users WHERE id = ?').bind(isolatedUser).run();
    }
  }
});

test('inactive roles can retain assignments and grants without deleting history', async () => {
  const [userId] = await userIds();
  const roleId = await createRole();
  const permissionId = await createPermission();
  await insert('user_roles', { user_id: userId, role_id: roleId, assigned_at: timestamp });
  await insert('role_permissions', { role_id: roleId, permission_id: permissionId, granted_at: timestamp });
  await db.prepare('UPDATE roles SET is_active = 0, updated_at = ? WHERE id = ?').bind(timestamp + 1, roleId).run();
  assert.equal(await db.prepare('SELECT count(*) AS total FROM user_roles WHERE role_id = ?').bind(roleId).first('total'), 1);
  assert.equal(await db.prepare('SELECT count(*) AS total FROM role_permissions WHERE role_id = ?').bind(roleId).first('total'), 1);
});

test('explicit FK indexes and restrictive references exist without duplicate lookup indexes', async () => {
  for (const [index, column] of Object.entries({ user_roles_role_id_idx: 'role_id',
    user_roles_assigned_by_user_id_idx: 'assigned_by_user_id', role_permissions_permission_id_idx: 'permission_id' })) {
    assert.deepEqual((await db.prepare(`PRAGMA index_info(${index})`).all()).results.map((value) => value.name), [column]);
  }
  for (const [table, expected] of Object.entries({
    user_roles: { user_id: 'users', role_id: 'roles', assigned_by_user_id: 'users' },
    role_permissions: { role_id: 'roles', permission_id: 'permissions' },
  })) {
    const keys = (await db.prepare(`PRAGMA foreign_key_list(${table})`).all()).results;
    assert.deepEqual(Object.fromEntries(keys.map((key) => [key.from, key.table])), expected);
    for (const key of keys) {
      assert.equal(key.to, 'id');
      assert.equal(key.on_delete, 'RESTRICT');
      assert.equal(key.on_update, 'RESTRICT');
    }
  }
});

test('existing event, account and authentication schema and records remain unchanged', async () => {
  assert.deepEqual(await schema(), originalSchema);
  for (const [table, expected] of originalRecords) {
    const order = table === 'user_password_credentials' ? 'user_id' : 'id';
    assert.deepEqual((await db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all()).results, expected);
  }
});

test('foreign-key enforcement is active and integrity checks remain healthy', async () => {
  assert.equal(await db.prepare('PRAGMA foreign_keys').first('foreign_keys'), 1);
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  assert.equal(await db.prepare('PRAGMA quick_check').first('quick_check'), 'ok');
});
