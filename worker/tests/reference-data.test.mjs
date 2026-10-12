import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const timestamp = 1791763200;
const roleIds = { user: '193e06d9-4dfa-4ef9-80f2-9d457b6b7b5f', admin: '1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7' };
const permissionIds = {
  "events.create": "42bbb9f0-a71a-4ca7-8418-0190d4d4535d",
  "events.update": "d2abe66d-46e2-4575-bdd9-f9f608c417d2",
  "events.publish": "a021f6a6-1af8-460c-a844-bf05aca5f442",
  "events.cancel": "2b6a633c-303c-41ea-994f-6e73e809494b",
  "events.manage_registrations": "c6d3249a-0008-4dd4-a434-15734dd8cfd8",
  "locations.manage": "ad64c7cd-9571-4fed-86f9-8bb0620d684d",
  "users.view": "5217db7d-a756-4aa3-9fbf-2c5bf03ba335",
  "users.manage": "111a0134-3e31-4461-9ea6-9209abb49fc6",
  "roles.manage": "f5cb7069-c601-4866-9b94-753e8bbbde96",
  "news.create": "be24fe84-8d34-41c2-b84c-4d240ade3bdf",
  "news.update": "0f39f141-74bb-4c23-b659-d4ec9f74cb8f",
  "news.publish": "ab2dbcf9-b310-49ee-b6ab-10b7557b5b13",
  "news.archive": "f8eaf9c2-134b-4832-a17f-569de37d6f0e"
};
const schemaMigrations = ['0001_create_event_structure.sql', '0002_create_accounts.sql',
  '0003_create_auth_credentials.sql', '0004_create_authorization.sql', '0005_create_registrations.sql'];
let simulator;
let db;
let originalSchema;

async function applyMigration(database, name) {
  const sql = await readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8');
  // These files contain no semicolons inside string literals.
  const statements = sql.replace(/--[^\n]*/g, '').split(';').map((value) => value.trim()).filter(Boolean);
  await database.batch(statements.map((statement) => database.prepare(statement)));
}

async function createLocalDatabase() {
  const instance = new Miniflare(convertV4MiniflareOptions({ modules: true,
    script: 'export default { fetch() { return new Response("Local reference data test"); } };',
    d1Databases: { DB: randomUUID() }, cf: false }));
  try {
    const database = await instance.getD1Database('DB');
    assert.equal(await database.prepare('PRAGMA foreign_keys').first('foreign_keys'), 1);
    for (const migration of schemaMigrations) await applyMigration(database, migration);
    return { instance, database };
  } catch (error) {
    await instance.dispose();
    throw error;
  }
}

async function schema(database) {
  return (await database.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name").all()).results;
}

async function referenceSnapshot(database) {
  const result = {};
  for (const [table, order] of [['roles','code'],['permissions','code'],['role_permissions','permission_id']]) {
    result[table] = (await database.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all()).results;
  }
  return result;
}

before(async () => {
  const local = await createLocalDatabase();
  simulator = local.instance;
  db = local.database;
  originalSchema = await schema(db);
  await applyMigration(db, '0006_seed_reference_data.sql');
});

after(async () => { await simulator?.dispose(); });

test('six migrations apply with exactly the two active initial roles', async () => {
  assert.deepEqual((await db.prepare('SELECT id, code, name, description, is_active FROM roles ORDER BY code').all()).results, [
    { id:roleIds.admin, code:'admin', name:'Administrator', description:'Website administration.', is_active:1 },
    { id:roleIds.user, code:'user', name:'User', description:'Standard LAN Party participant.', is_active:1 },
  ]);
});

test('exactly thirteen distinct permissions have the required codes and fixed IDs', async () => {
  const actual = (await db.prepare('SELECT id, code, description FROM permissions ORDER BY code').all()).results;
  assert.equal(actual.length,13);
  assert.deepEqual(actual.map((row) => row.code),Object.keys(permissionIds).sort());
  for (const row of actual) {
    assert.equal(row.id,permissionIds[row.code]);
    assert.ok(row.description.trim().length>0);
  }
});

test('admin receives all thirteen explicit grants while user receives none', async () => {
  const actual = (await db.prepare('SELECT role_id, permission_id FROM role_permissions ORDER BY permission_id').all()).results;
  assert.equal(actual.length,13);
  assert.deepEqual(actual.map((row) => row.permission_id),Object.values(permissionIds).sort());
  assert.ok(actual.every((row) => row.role_id===roleIds.admin));
  assert.equal(await db.prepare('SELECT count(*) AS total FROM role_permissions WHERE role_id = ?').bind(roleIds.user).first('total'),0);
});

test('no participant accounts, assignments or future roles are seeded', async () => {
  for (const table of ['users','user_roles','user_auth_providers','user_password_credentials',
    'registrations','registration_days','name_prefixes']) {
    assert.equal(await db.prepare(`SELECT count(*) AS total FROM ${table}`).first('total'),0);
  }
  assert.equal(await db.prepare("SELECT count(*) AS total FROM roles WHERE code IN ('news_editor','moderator')").first('total'),0);
});

test('all entity UUIDs are valid version four literals and globally unique', async () => {
  const ids = [...(await db.prepare('SELECT id FROM roles').all()).results,
    ...(await db.prepare('SELECT id FROM permissions').all()).results].map((row) => row.id);
  assert.equal(new Set(ids).size,15);
  for (const id of ids) assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('seed timestamps are deterministic nonnegative integer UTC seconds', async () => {
  assert.equal(new Date(timestamp*1000).toISOString(),'2026-10-12T00:00:00.000Z');
  for (const [table, fields] of [['roles',['created_at','updated_at']],['permissions',['created_at']],['role_permissions',['granted_at']]]) {
    for (const row of (await db.prepare(`SELECT ${fields.join(',')} FROM ${table}`).all()).results) {
      for (const field of fields) {
        assert.equal(row[field],timestamp);
        assert.ok(Number.isInteger(row[field]) && row[field]>=0);
      }
    }
  }
});

test('seeding changes no schema and event/registration structures remain intact', async () => {
  assert.deepEqual(await schema(db),originalSchema);
  for (const table of ['locations','events','event_days','registrations','registration_days']) {
    assert.equal(await db.prepare('SELECT strict FROM pragma_table_list WHERE name = ?').bind(table).first('strict'),1);
    assert.equal(await db.prepare(`SELECT count(*) AS total FROM ${table}`).first('total'),0);
  }
});

test('reapplying the raw seed fails clearly without overwriting or duplicating reference data', async () => {
  const original = await referenceSnapshot(db);
  await assert.rejects(applyMigration(db,'0006_seed_reference_data.sql'),/UNIQUE constraint failed/);
  assert.deepEqual(await referenceSnapshot(db),original);
});

test('unexpected customized role or permission conflicts roll back without partial seed data', async () => {
  for (const conflict of ['role','permission']) {
    const { instance, database } = await createLocalDatabase();
    try {
      const id=randomUUID();
      if (conflict==='role') {
        await database.prepare('INSERT INTO roles (id,code,name,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?)')
          .bind(id,'user','Customized fictional role',0,timestamp,timestamp).run();
      } else {
        await database.prepare('INSERT INTO permissions (id,code,description,created_at) VALUES (?,?,?,?)')
          .bind(id,'events.create','Customized fictional permission',timestamp).run();
      }
      const original=await referenceSnapshot(database);
      await assert.rejects(applyMigration(database,'0006_seed_reference_data.sql'),/UNIQUE constraint failed/);
      assert.deepEqual(await referenceSnapshot(database),original);
      assert.deepEqual((await database.prepare('PRAGMA foreign_key_check').all()).results,[]);
    } finally { await instance.dispose(); }
  }
});

test('fictional local users resolve permissions through active roles with default deny', async () => {
  // Disposable local fixtures only; the migration never assigns any actual account.
  const fixtures = { admin:randomUUID(), user:randomUUID(), unassigned:randomUUID(), disabled:randomUUID() };
  try {
    for (const [kind,id] of Object.entries(fixtures)) {
      await db.prepare('INSERT INTO users (id,first_name,last_name,email,email_normalized,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
        .bind(id,'Fictional','Test participant',`${id}@example.test`,`${id}@example.test`,
          kind==='disabled'?'disabled':'active',timestamp,timestamp).run();
    }
    for (const [kind,role] of [['admin','admin'],['user','user'],['disabled','admin']]) {
      await db.prepare('INSERT INTO user_roles (user_id,role_id,assigned_at) VALUES (?,?,?)')
        .bind(fixtures[kind],roleIds[role],timestamp).run();
    }
    async function resolve(userId) {
      return (await db.prepare(`
        SELECT DISTINCT p.code FROM users AS u
        JOIN user_roles AS ur ON ur.user_id = u.id
        JOIN roles AS r ON r.id = ur.role_id
        JOIN role_permissions AS rp ON rp.role_id = r.id
        JOIN permissions AS p ON p.id = rp.permission_id
        WHERE u.id = ? AND u.status = 'active' AND r.is_active = 1 ORDER BY p.code
      `).bind(userId).all()).results.map((row) => row.code);
    }
    assert.deepEqual(await resolve(fixtures.admin),Object.keys(permissionIds).sort());
    for (const kind of ['user','unassigned','disabled']) assert.deepEqual(await resolve(fixtures[kind]),[]);
    assert.deepEqual(await resolve(randomUUID()),[]);
    await db.prepare('UPDATE roles SET is_active = 0 WHERE id = ?').bind(roleIds.admin).run();
    assert.deepEqual(await resolve(fixtures.admin),[]);
  } finally {
    await db.prepare('UPDATE roles SET is_active = 1 WHERE id = ?').bind(roleIds.admin).run();
    for (const id of Object.values(fixtures)) {
      await db.prepare('DELETE FROM user_roles WHERE user_id = ?').bind(id).run();
      await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    }
  }
  assert.equal(await db.prepare('SELECT count(*) AS total FROM users').first('total'),0);
  assert.equal(await db.prepare('SELECT count(*) AS total FROM user_roles').first('total'),0);
});

test('foreign keys and database integrity remain healthy after seeding and fictional resolution tests', async () => {
  assert.equal(await db.prepare('PRAGMA foreign_keys').first('foreign_keys'),1);
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  assert.equal(await db.prepare('PRAGMA quick_check').first('quick_check'),'ok');
});
