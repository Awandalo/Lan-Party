import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { before, test } from 'node:test';
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');
// Fictional deterministic fixtures only; no runtime or production credentials.
const profile = { nickname: 'Local Player', firstName: 'Fictional', lastName: 'Tester',
  email: 'fictional@example.test', password: 'fictional login password' };
const credentials = { email: profile.email, password: profile.password };
const origin = 'http://127.0.0.1:5173', base = 'http://127.0.0.1:8787/api/auth/';
let script, migrations;
before(async () => {
  script = (await build({ entryPoints: [fileURLToPath(new URL('../index.ts', import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' })).outputFiles[0].text;
  migrations = [];
  for (const name of (await readdir(new URL('../../migrations/', import.meta.url))).filter(x => /^000[1-9]_.*\.sql$/.test(x)).sort()) {
    let rest = (await readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8')).replace(/--[^\n]*/g, '').trim();
    const statements = [];
    while (rest) {
      const end = rest.startsWith('CREATE TRIGGER') ? rest.indexOf('\nEND;') + 5 : rest.indexOf(';') + 1;
      if (end <= 0 || end === 4) throw Error('Incomplete migration');
      statements.push(rest.slice(0, end)); rest = rest.slice(end).trim();
    }
    migrations.push(statements);
  }
});
async function local(run, overrides = {}, omitLimits = false) {
  const instance = new Miniflare(convertV4MiniflareOptions({ modules: true, script, cf: false,
    compatibilityDate: '2026-10-11', d1Databases: { DB: randomUUID() },
    bindings: { REGISTRATION_MODE: 'local-only', AUTH_SESSION_MODE: 'local-only', AUTH_PUBLIC_ORIGIN: origin,
      PASSWORD_PEPPER: '11'.repeat(32), AUTH_RATE_LIMIT_SECRET: '22'.repeat(32), ...overrides } }));
  try {
    const db = await instance.getD1Database('DB');
    for (const statements of omitLimits ? migrations.slice(0, -1) : migrations) await db.batch(statements.map(s => db.prepare(s)));
    let ip = 0;
    const request = (action, input, headers = {}, options = {}) => instance.dispatchFetch(base + action, {
      method: input === undefined ? 'GET' : 'POST', ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      ...options, headers: { Origin: origin, 'X-LAN-Request': '1', 'Content-Type': 'application/json',
        'CF-Connecting-IP': `203.0.113.${++ip}`, ...headers } });
    // Session tests start with a verified fictional account; verification has dedicated HTTP tests.
    const register = async () => { assert.equal((await request('register', profile)).status, 202);
      await db.prepare('UPDATE users SET email_verified_at=unixepoch(),updated_at=unixepoch()').run(); };
    const login = async () => {
      const response = await request('login', credentials); assert.equal(response.status, 200);
      return response.headers.get('set-cookie').split(';')[0];
    };
    await run({ db, instance, request, register, login });
  } finally { await instance.dispose(); }
}

test('registration → login → private account → CSRF logout revokes the digest and expires the secure cookie', () => local(async ({ db, request, register, login }) => {
  await register();
  const cookie = await login(), token = cookie.split('=')[1];
  assert.match(cookie, /^__Host-lan_session=[0-9a-f]{64}$/);
  const stored = await db.prepare('SELECT * FROM auth_sessions').first();
  assert.equal(stored.token_digest, createHash('sha256').update(`lan-party:session:v1:${token}`).digest('hex'));
  assert.equal(stored.expires_at - stored.created_at, 604800);
  assert.equal(JSON.stringify(stored).includes(token), false);
  const response = await request('session', undefined, { Cookie: cookie });
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['account', 'csrfToken', 'emailVerified']);
  assert.equal(body.emailVerified, true);
  assert.deepEqual(Object.keys(body.account).sort(), ['nickname', 'userId']);
  assert.equal(body.account.nickname, profile.nickname);
  for (const value of [profile.firstName, profile.lastName, profile.email, profile.password, token]) assert.equal(JSON.stringify(body).includes(value), false);
  assert.notEqual(await db.prepare('SELECT email_verified_at FROM users').first('email_verified_at'), null);
  const logout = await request('logout', {}, { Cookie: cookie, 'X-CSRF-Token': body.csrfToken });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0; Secure; HttpOnly; SameSite=Lax; Path=\/$/);
  assert.notEqual(await db.prepare('SELECT revoked_at FROM auth_sessions').first('revoked_at'), null);
  assert.equal((await request('session', undefined, { Cookie: cookie })).status, 401);
  assert.equal((await request('logout', {}, { Cookie: cookie, 'X-CSRF-Token': body.csrfToken })).status, 401);
}));

test('login sets only the seven-day host-only secure HttpOnly cookie, not a token body', () => local(async ({ request, register }) => {
  await register();
  const response = await request('login', { ...credentials, email: credentials.email.toUpperCase() });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /^__Host-lan_session=[0-9a-f]{64}; Max-Age=604800; Secure; HttpOnly; SameSite=Lax; Path=\/$/);
  assert.deepEqual(await response.json(), { message: 'Logged in.' });
}));

test('incorrect, nonexistent and disabled accounts get identical generic authentication failures and no sessions', () => local(async ({ db, request, register }) => {
  await register();
  let expected;
  for (const input of [{ ...credentials, password: 'incorrect fictional password' }, { ...credentials, email: 'missing@example.test' }]) {
    const response = await request('login', input); assert.equal(response.status, 401);
    const body = await response.text(); expected ??= body; assert.equal(body, expected);
    assert.equal(response.headers.has('set-cookie'), false);
  }
  await db.prepare("UPDATE users SET status='disabled',updated_at=unixepoch()").run();
  const response = await request('login', credentials); assert.equal(response.status, 401); assert.equal(await response.text(), expected);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').first('n'), 0);
}));

test('unauthenticated account access rejects missing, malformed, duplicated and tampered cookies', () => local(async ({ request, register, login }) => {
  await register(); const valid = await login();
  for (const cookie of ['', '__Host-lan_session=bad', '__Host-lan_session=' + 'ff'.repeat(32),
    `${valid}; ${valid}`, `${valid}x`, valid.slice(0, -1)]) {
    const response = await request('session', undefined, { Cookie: cookie });
    assert.equal(response.status, 401); assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
    assert.deepEqual(await response.json(), { error: 'Please log in.' });
  }
}));

test('logout rejects missing, tampered, foreign-session and cross-site CSRF proofs without revoking', () => local(async ({ db, request, register, login }) => {
  await register(); const cookie = await login();
  const { csrfToken } = await (await request('session', undefined, { Cookie: cookie })).json();
  const otherCookie = await login();
  const other = await (await request('session', undefined, { Cookie: otherCookie })).json();
  for (const headers of [{}, { 'X-CSRF-Token': 'ff'.repeat(32) }, { 'X-CSRF-Token': other.csrfToken },
    { 'X-CSRF-Token': csrfToken, Origin: 'https://attacker.example.test' },
    { 'X-CSRF-Token': csrfToken, 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await request('logout', {}, { Cookie: cookie, ...headers })).status, 403);
  }
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM auth_sessions WHERE revoked_at IS NOT NULL').first('n'), 0);
  assert.equal((await request('session', undefined, { Cookie: cookie })).status, 200);
}));

test('relogin rotates an existing cookie and credential changes invalidate every issued session', () => local(async ({ db, request, register, login }) => {
  await register(); const cookie = await login();
  const rotated = await request('login', credentials, { Cookie: cookie }); assert.equal(rotated.status, 200);
  assert.notEqual(rotated.headers.get('set-cookie').split(';')[0], cookie);
  assert.equal((await request('session', undefined, { Cookie: cookie })).status, 401);
  const second = rotated.headers.get('set-cookie').split(';')[0];
  await db.prepare('UPDATE user_password_credentials SET password_changed_at=password_changed_at+1,updated_at=updated_at+1').run();
  assert.equal((await request('session', undefined, { Cookie: second })).status, 401);
}));

test('expired sessions and sessions belonging to disabled accounts cannot read the account', () => local(async ({ db, request, register, login }) => {
  await register(); const cookie = await login();
  const row = await db.prepare('SELECT * FROM auth_sessions').first();
  await db.prepare('DELETE FROM auth_sessions WHERE id=?').bind(row.id).run();
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(`INSERT INTO auth_sessions (id,user_id,token_digest,auth_version,created_at,expires_at)
    VALUES (?,?,?,?,?,?)`).bind(row.id, row.user_id, row.token_digest, row.auth_version, now - 604801, now - 1).run();
  assert.equal((await request('session', undefined, { Cookie: cookie })).status, 401);
  const active = await login();
  await db.prepare("UPDATE users SET status='disabled',updated_at=unixepoch()").run();
  assert.equal((await request('session', undefined, { Cookie: active })).status, 401);
}));

test('login rejects cross-origin, unsupported methods, unsafe content, query strings and invalid fields', () => local(async ({ db, request, instance }) => {
  assert.equal((await request('login')).status, 405);
  assert.equal((await request('session', {})).status, 405);
  assert.equal((await request('logout')).status, 405);
  for (const headers of [{ Origin: 'null' }, { 'X-LAN-Request': '' }, { 'Content-Type': 'text/plain' }, { 'Content-Encoding': 'gzip' }]) {
    const response = await request('login', credentials, headers); assert.equal(response.status, 403);
    assert.equal(response.headers.has('access-control-allow-origin'), false);
  }
  for (const input of [null, [], { ...credentials, role: 'admin' }, { ...credentials, email: 'bad' }, { ...credentials, password: 'short' }]) {
    assert.equal((await request('login', input)).status, 400);
  }
  assert.equal((await request('login', credentials, {}, { body: 'x'.repeat(4097) })).status, 400);
  assert.equal((await instance.dispatchFetch(base + 'session?token=bad', { headers: { 'X-LAN-Request': '1' } })).status, 403);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').first('n'), 0);
}));

test('repeated login failures have persistent per-account limits independent of registration buckets', () => local(async ({ db, request, register }) => {
  await register();
  for (let i = 0; i < 5; i++) assert.equal((await request('login', { ...credentials, password: 'incorrect fictional password' })).status, 401);
  const response = await request('login', credentials); assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '3600');
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').first('n'), 0);
  const rows = JSON.stringify((await db.prepare('SELECT * FROM registration_rate_limits').all()).results);
  assert.equal(rows.includes(profile.email), false); assert.equal(rows.includes('203.0.113'), false);
}));

test('concurrent per-IP login admission is bounded before password verification', () => local(async ({ request }) => {
  const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => request('login',
    { email: `missing${i}@example.test`, password: profile.password }, { 'CF-Connecting-IP': '203.0.113.50' })));
  assert.equal(responses.filter(r => r.status === 401).length, 5);
  assert.equal(responses.filter(r => r.status === 429).length, 3);
}));

test('login global limit bounds malformed requests and all auth endpoints stay disabled on hosted URLs', () => local(async ({ request, instance }) => {
  for (let i = 0; i < 30; i++) assert.equal((await request('login', null)).status, 400);
  assert.equal((await request('login', credentials)).status, 429);
  for (const action of ['login', 'session', 'logout']) {
    assert.equal((await instance.dispatchFetch(`https://lan-party-dev.servok.workers.dev/api/auth/${action}`)).status, 404);
  }
}));

test('authentication is disabled by default and malformed/shared configuration fails closed', async () => {
  await local(async ({ request }) => assert.equal((await request('login', credentials)).status, 404), { AUTH_SESSION_MODE: '' });
  for (const overrides of [{ PASSWORD_PEPPER: '' }, { AUTH_RATE_LIMIT_SECRET: 'bad' },
    { AUTH_RATE_LIMIT_SECRET: '11'.repeat(32) }, { AUTH_PUBLIC_ORIGIN: 'http://attacker.example.test' }]) {
    await local(async ({ request }) => assert.equal((await request('login', credentials)).status, 503), overrides);
  }
});

test('missing rate-limit storage and session insert failures fail closed with sanitized errors', async () => {
  await local(async ({ request }) => assert.equal((await request('login', credentials)).status, 503), {}, true);
  await local(async ({ db, request, register }) => {
    await register();
    await db.exec("CREATE TRIGGER test_session_failure BEFORE INSERT ON auth_sessions BEGIN SELECT RAISE(ABORT,'Fictional private failure'); END;");
    const response = await request('login', credentials); assert.equal(response.status, 503);
    assert.equal(response.headers.has('set-cookie'), false); assert.equal((await response.text()).includes('private'), false);
  });
});

test('failed logout storage does not expire the cookie or falsely report revocation', () => local(async ({ db, request, register, login }) => {
  await register(); const cookie = await login();
  const { csrfToken } = await (await request('session', undefined, { Cookie: cookie })).json();
  await db.exec("CREATE TRIGGER test_revoke_failure BEFORE UPDATE ON auth_sessions BEGIN SELECT RAISE(ABORT,'Fictional private failure'); END;");
  const response = await request('logout', {}, { Cookie: cookie, 'X-CSRF-Token': csrfToken });
  assert.equal(response.status, 503); assert.equal(response.headers.has('set-cookie'), false);
  assert.equal((await response.text()).includes('private'), false);
  assert.equal(await db.prepare('SELECT revoked_at FROM auth_sessions').first('revoked_at'), null);
}));

 test('unverified credentials cannot create a session', () => local(async ({ db, request, register }) => {
 await register(); await db.prepare('UPDATE users SET email_verified_at=NULL').run();
 const response=await request('login', credentials); assert.equal(response.status,401); assert.equal(response.headers.get('set-cookie'),null);
 assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').first('n'),0);
}));
