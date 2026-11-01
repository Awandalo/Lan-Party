import assert from 'node:assert/strict';
import { randomUUID, pbkdf2Sync, createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { before, test } from 'node:test';
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');
const pepper = '11'.repeat(32), rateSecret = '22'.repeat(32); // Fictional test-only configuration.
const url = 'http://127.0.0.1:8787/api/auth/register';
const original = { nickname: 'Player One', firstName: 'Fictional', lastName: 'Participant', email: 'Player@example.test', password: 'fictional registration password' };
let script, migrations;
before(async () => {
  script = (await build({ entryPoints: [fileURLToPath(new URL('../index.ts', import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' })).outputFiles[0].text;
  migrations = [];
  for (const name of (await readdir(new URL('../../migrations/', import.meta.url))).filter(x => /^\d{4}_.*\.sql$/.test(x)).sort()) {
    let rest = (await readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8')).replace(/--[^\n]*/g, '').trim();
    const sql = [];
    while (rest) {
      const end = rest.startsWith('CREATE TRIGGER') ? rest.indexOf('\nEND;') + 5 : rest.indexOf(';') + 1;
      if (end <= 0 || end === 4) throw Error('Incomplete migration');
      sql.push(rest.slice(0, end)); rest = rest.slice(end).trim();
    }
    migrations.push(sql);
  }
});
async function local(run, overrides = {}, omitLimits = false) {
  const instance = new Miniflare(convertV4MiniflareOptions({ modules: true, script, cf: false,
    compatibilityDate: '2026-10-11', d1Databases: { DB: randomUUID() },
    bindings: { REGISTRATION_MODE: 'local-only', AUTH_PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
      PASSWORD_PEPPER: pepper, AUTH_RATE_LIMIT_SECRET: rateSecret, ...overrides } }));
  try {
    const db = await instance.getD1Database('DB');
    for (const statements of omitLimits ? migrations.filter((_, index) => index !== 8) : migrations) await db.batch(statements.map(s => db.prepare(s)));
    let ordinal = 0;
    const submit = (input = original, options = {}) => {
      const { headers = {}, ...rest } = options;
      return instance.dispatchFetch(url, { method: 'POST', body: JSON.stringify(input),
        ...rest, headers: { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json',
          'X-LAN-Request': '1', 'CF-Connecting-IP': `203.0.113.${++ordinal}`, ...headers } });
    };
    await run({ db, instance, submit });
  } finally { await instance.dispose(); }
}
async function count(db, table) { return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first('n'); }

test('registration creates a private unverified account, unique nickname and independently verified peppered credential', () => local(async ({ db, submit }) => {
  const response = await submit();
  assert.equal(response.status, 202);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['message']);
  for (const value of Object.values(original)) assert.equal(JSON.stringify(body).includes(value), false);
  const user = await db.prepare('SELECT * FROM users').first();
  assert.match(user.id, /^[a-f0-9-]{36}$/);
  assert.equal(user.first_name, original.firstName); assert.equal(user.last_name, original.lastName);
  assert.equal(user.email, original.email); assert.equal(user.email_normalized, 'player@example.test');
  assert.equal(user.email_verified_at, null); assert.equal(user.status, 'active'); assert.equal(user.auth_version, 0);
  assert.equal(await db.prepare('SELECT CAST(member_number AS TEXT) AS value FROM member_numbers WHERE user_id=?').bind(user.id).first('value'), '11');
  const nickname = await db.prepare('SELECT * FROM user_nicknames').first();
  assert.equal(nickname.nickname, original.nickname); assert.equal(nickname.nickname_key, 'player one');
  assert.equal(nickname.nickname_changed_at, null);
  const credential = await db.prepare('SELECT * FROM user_password_credentials').first();
  const [version, iterations, salt, verifier] = credential.password_hash.split('$');
  assert.equal(version, 'lp-pbkdf2-hmac-sha256-v2'); assert.equal(iterations, '20000');
  const derived = pbkdf2Sync(original.password, Buffer.from(salt, 'hex'), 20000, 32, 'sha256');
  assert.equal(createHmac('sha256', Buffer.from(pepper, 'hex')).update(derived).digest('hex'), verifier);
  assert.notEqual(derived.toString('hex'), verifier);
  assert.equal(JSON.stringify(credential).includes(original.password), false);
  assert.equal(JSON.stringify(credential).includes(pepper), false);
  assert.equal(await count(db, 'auth_sessions'), 0);
  const action = await db.prepare('SELECT * FROM auth_action_tokens').first();
  assert.equal(action.purpose, 'email-verification'); assert.equal(action.expires_at - action.created_at, 86400);
  assert.equal(action.consumed_at, null); // Transport absent in this legacy fixture: fails safely, remains unverified.
  assert.notEqual(action.revoked_at, null);
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
}));

test('registration rejects invalid, reserved and unexpected fields without account writes', () => local(async ({ db, submit }) => {
  for (const input of [{ ...original, memberNumber: '1' }, { ...original, member_number: 1 }]) {
    assert.equal((await submit(input)).status, 400);
  }
  for (const input of [{ ...original, nickname: ' Admin ' }, { ...original, nickname: 'System' },
    { ...original, nickname: 'Two  Spaces' }, { ...original, nickname: 'Jo' },
    { ...original, firstName: '' }, { ...original, lastName: ' Leading' },
    { ...original, email: 'invalid' }, { ...original, password: 'short' },
    { ...original, roles: ['admin'] }, { ...original, emailVerifiedAt: 1 }, null, []]) {
    assert.equal((await submit(input)).status, 400);
  }
  assert.equal(await count(db, 'users'), 0);
}));

test('duplicate normalized email and case-insensitive nickname are indistinguishable and leave no partial accounts', () => local(async ({ db, submit }) => {
  const first = await submit(), expected = await first.text();
  const credential = await db.prepare('SELECT password_hash FROM user_password_credentials').first('password_hash');
  for (const input of [{ ...original, email: 'PLAYER@example.test', nickname: 'Other Player' },
    { ...original, email: 'other@example.test', nickname: 'pLaYeR oNe' }]) {
    const response = await submit(input); assert.equal(response.status, 202); assert.equal(await response.text(), expected);
  }
  for (const table of ['users', 'user_nicknames', 'user_password_credentials']) assert.equal(await count(db, table), 1);
  assert.equal(await db.prepare('SELECT password_hash FROM user_password_credentials').first('password_hash'), credential);
}));

test('concurrent duplicate registrations create exactly one complete account', () => local(async ({ db, submit }) => {
  const responses = await Promise.all([submit(), submit()]);
  assert.deepEqual(responses.map(r => r.status), [202, 202]);
  for (const table of ['users', 'user_nicknames', 'user_password_credentials']) assert.equal(await count(db, table), 1);
}));

test('credential insert failure atomically rolls back profile and nickname', () => local(async ({ db, submit }) => {
  await db.exec("CREATE TRIGGER test_registration_failure BEFORE INSERT ON user_password_credentials BEGIN SELECT RAISE(ABORT,'Fictional storage failure'); END;");
  const response = await submit(); assert.equal(response.status, 503);
  assert.equal((await response.text()).includes('storage'), false);
  for (const table of ['users', 'user_nicknames', 'user_password_credentials']) assert.equal(await count(db, table), 0);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM member_numbers WHERE registered=1').first('n'), 0);
}));

test('strict origin, method, content and body boundaries reject cross-site or oversized submissions', () => local(async ({ db, submit, instance }) => {
  assert.equal((await instance.dispatchFetch(url)).status, 405);
  for (const headers of [{ Origin: 'https://attacker.example.test' }, { Origin: 'null' }, { 'X-LAN-Request': '' },
    { 'Content-Type': 'text/plain' }, { 'Content-Encoding': 'gzip' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    const response = await submit(original, { headers }); assert.equal(response.status, 403);
    assert.equal(response.headers.has('access-control-allow-origin'), false);
  }
  assert.equal((await submit(original, { body: 'x'.repeat(4097) })).status, 400);
  assert.equal((await submit(original, { body: '{' })).status, 400);
  assert.equal(await count(db, 'users'), 0);
}));

test('remote hosts cannot enable registration even with local configuration', () => local(async ({ instance }) => {
  const response = await instance.dispatchFetch('https://lan-party-dev.servok.workers.dev/api/auth/register', { method: 'POST', body: JSON.stringify(original) });
  assert.equal(response.status, 404);
}));
test('registration is disabled by default', () => local(async ({ submit }) => assert.equal((await submit()).status, 404), { REGISTRATION_MODE: '' }));
test('invalid or shared secrets fail closed', async () => {
  for (const overrides of [{ PASSWORD_PEPPER: '' }, { PASSWORD_PEPPER: 'invalid' }, { AUTH_RATE_LIMIT_SECRET: pepper }]) {
    await local(async ({ db, submit }) => { assert.equal((await submit()).status, 503); assert.equal(await count(db, 'users'), 0); }, overrides);
  }
});
test('missing limiter storage fails closed before account creation', () => local(async ({ submit, db }) => {
  assert.equal((await submit()).status, 503); assert.equal(await count(db, 'users'), 0);
}, {}, true));

test('per-IP rate limit persists in D1 and concurrent requests cannot bypass it', () => local(async ({ db, submit }) => {
  const responses = await Promise.all(Array.from({ length: 8 }, () => submit({ ...original, password: 'short' },
    { headers: { 'CF-Connecting-IP': '203.0.113.50' } })));
  assert.equal(responses.filter(r => r.status === 400).length, 5);
  assert.equal(responses.filter(r => r.status === 429).length, 3);
  const counters = JSON.stringify((await db.prepare('SELECT * FROM registration_rate_limits').all()).results);
  assert.equal(counters.includes('203.0.113.50'), false); assert.equal(counters.includes(original.email), false);
  assert.equal(await count(db, 'users'), 0);
}));
test('normalized-account limiter applies across different IPs', () => local(async ({ db, submit }) => {
  for (let i = 0; i < 3; i++) assert.equal((await submit({ ...original, email: i % 2 ? 'PLAYER@example.test' : original.email })).status, 202);
  const denied = await submit(); assert.equal(denied.status, 429); assert.equal(denied.headers.get('retry-after'), '3600');
  assert.equal(await count(db, 'users'), 1);
}));
test('global admission cap bounds downstream work and limiter-key cardinality', () => local(async ({ db, submit }) => {
  for (let i = 0; i < 30; i++) assert.equal((await submit({ ...original, password: 'short' })).status, 400);
  assert.equal((await submit()).status, 429);
  assert.equal(await count(db, 'registration_rate_limits'), 31);
  assert.equal(await count(db, 'users'), 0);
}));
test('expired limiter rows are deleted in bounded batches', () => local(async ({ db, submit }) => {
  await db.batch(Array.from({ length: 105 }, (_, i) => db.prepare('INSERT INTO registration_rate_limits VALUES (?,1,0)').bind(i.toString(16).padStart(64, '0'))));
  assert.equal((await submit({ ...original, password: 'short' })).status, 400);
  assert.equal(await db.prepare('SELECT COUNT(*) FROM registration_rate_limits WHERE expires_at=0').first('COUNT(*)'), 5);
}));

test('0009 preserves prior schemas and enforces strict bounded digest-only counters', () => local(async ({ db }) => {
  const table = (await db.prepare('PRAGMA table_list').all()).results.find(r => r.name === 'registration_rate_limits');
  assert.equal(table.strict, 1);
  for (const [key, hits, expiry] of [['raw-address@example.test', 1, 1], ['a'.repeat(64), 0, 1],
    ['b'.repeat(64), 31, 1], ['c'.repeat(64), 1.5, 1], ['d'.repeat(64), 1, -1]]) {
    await assert.rejects(db.prepare('INSERT INTO registration_rate_limits VALUES (?,?,?)').bind(key, hits, expiry).run());
  }
  assert.equal(await count(db, 'roles'), 2); assert.equal(await count(db, 'permissions'), 14);
  assert.equal(await db.prepare("SELECT count(*) n FROM permissions WHERE code='roles.protect_admin'").first('n'),1);
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  assert.equal(await db.prepare('PRAGMA quick_check').first('quick_check'), 'ok');
}));
