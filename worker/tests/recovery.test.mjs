import assert from 'node:assert/strict';
import { createHash, createHmac, pbkdf2Sync, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { before, test } from 'node:test';
const require = createRequire(import.meta.url), wr = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wr('miniflare'), { build } = wr('esbuild');
const origin = 'http://127.0.0.1:5173', base = 'http://127.0.0.1:8787/api/auth/';
const pepper = '11'.repeat(32), mailboxSecret = '33'.repeat(32); // Fictional fixtures only.
const profile = { nickname: 'Recovery Player', firstName: 'Fictional', lastName: 'Participant',
  email: 'recovery@example.test', password: 'fictional original password' };
const newPassword = 'fictional replacement password';
let script, migrations, service, providers, links;
async function moduleFrom(path, define = {}) {
  const code = (await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022', define })).outputFiles[0].text;
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
before(async () => {
  script = (await build({ entryPoints: [fileURLToPath(new URL('../index.ts', import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' })).outputFiles[0].text;
  [service, providers, links] = await Promise.all([moduleFrom('../auth/verification-service.ts'), moduleFrom('../auth/email.ts'),
    moduleFrom('../../src/lib/verification-link.ts', { 'import.meta.env.DEV': 'true' })]);
  migrations = [];
  for (const name of (await readdir(new URL('../../migrations/', import.meta.url))).filter(x => /^\d{4}_.*\.sql$/.test(x)).sort()) {
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
async function local(run, overrides = {}) {
  const instance = new Miniflare(convertV4MiniflareOptions({ modules: true, script, cf: false,
    compatibilityDate: '2026-10-11', d1Databases: { DB: randomUUID() },
    bindings: { REGISTRATION_MODE: 'local-only', AUTH_SESSION_MODE: 'local-only', AUTH_PUBLIC_ORIGIN: origin,
      AUTH_EMAIL_TRANSPORT: 'local', AUTH_LOCAL_MAIL_SECRET: mailboxSecret,
      PASSWORD_PEPPER: pepper, AUTH_RATE_LIMIT_SECRET: '22'.repeat(32), ...overrides } }));
  try {
    const db = await instance.getD1Database('DB');
    for (const statements of migrations) await db.batch(statements.map(s => db.prepare(s)));
    let ordinal = 0;
    const request = (action, input, headers = {}, options = {}) => instance.dispatchFetch(base + action, {
      method: input === undefined ? 'GET' : 'POST', ...(input === undefined ? {} : { body: JSON.stringify(input) }), ...options,
      headers: { Origin: origin, 'X-LAN-Request': '1', 'Content-Type': 'application/json',
        'CF-Connecting-IP': `203.0.113.${++ordinal}`, ...headers } });
    const register = async (input = profile) => assert.equal((await request('register', input)).status, 202);
    const mail = async (purpose = 'password-reset', email = profile.email) => {
      const response = await request('local-mail', { email, purpose }, { Authorization: `Bearer ${mailboxSecret}` });
      assert.equal(response.status, 200); return (await response.json()).mail;
    };
    const proof = message => {
      assert.ok(message); const url = new URL(message.url), params = new URLSearchParams(url.hash.slice(1));
      assert.equal(url.origin, origin); assert.equal(url.search, '');
      return { userId: params.get('user'), token: params.get('token') };
    };
    const forgot = async () => { const response = await request('forgot-password', { email: profile.email }); assert.equal(response.status, 202); return proof(await mail()); };
    const login = async (password = profile.password) => {
      if ((await snapshot()).emailVerifiedAt === null) assert.equal((await request('verify-email', proof(await mail('email-verification')))).status, 200);
      return request('login', { email: profile.email, password });
    };
    const snapshot = () => db.prepare(`SELECT id AS userId,status,auth_version AS authVersion,email_verified_at AS emailVerifiedAt
      FROM users WHERE email_normalized=?`).bind(profile.email).first();
    await run({ db, instance, request, register, mail, proof, forgot, login, snapshot });
  } finally { await instance.dispose(); }
}

test('forgot-password issues a digest-only purpose-bound 30-minute token without revoking current sessions', () => local(async ({ db, request, register, mail, proof, login }) => {
  await register(); const session = await login(), cookie = session.headers.get('set-cookie').split(';')[0];
  const response = await request('forgot-password', { email: profile.email }); assert.equal(response.status, 202);
  const body = await response.json(); assert.deepEqual(Object.keys(body), ['message']);
  const message = await mail(), input = proof(message); assert.equal(new URL(message.url).pathname, '/reset-password');
  const stored = await db.prepare("SELECT * FROM auth_action_tokens WHERE purpose='password-reset'").first();
  assert.equal(stored.token_digest, createHash('sha256').update(`lan-party:password-reset:v1:${input.token}`).digest('hex'));
  assert.equal(stored.expires_at - stored.created_at, 1800); assert.equal(message.expiresAt, stored.expires_at);
  assert.equal(stored.email_normalized, null); assert.equal(stored.consumed_at, null); assert.equal(stored.revoked_at, null);
  for (const value of [input.token, profile.email, profile.password]) assert.equal(JSON.stringify(body).includes(value), false);
  assert.equal(JSON.stringify(stored).includes(input.token), false);
  assert.equal((await request('reset-password')).status, 405);
  assert.equal((await request('session', undefined, { Cookie: cookie })).status, 200);
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM auth_action_tokens WHERE purpose='email-verification' AND consumed_at IS NOT NULL").first('n'), 1); // Reset request preserves verification state.
}));

test('reset accepts 128 Unicode characters, stores an independently verified peppered hash and revokes all old sessions', () => local(async ({ db, request, register, forgot, login }) => {
  await register();
  const cookies = [];
  for (let i = 0; i < 2; i++) cookies.push((await login()).headers.get('set-cookie').split(';')[0]);
  const input = await forgot(), password = '𐐀'.repeat(128);
  await db.prepare("INSERT INTO user_roles(user_id,role_id,assigned_at) SELECT ?,id,unixepoch() FROM roles WHERE code='admin'").bind(input.userId).run();
  const permissions = JSON.stringify((await db.prepare('SELECT * FROM user_roles').all()).results);
  const reset = await request('reset-password', { ...input, password }); assert.equal(reset.status, 200);
  assert.match(reset.headers.get('set-cookie'), /Max-Age=0; Secure; HttpOnly; SameSite=Lax; Path=\/$/);
  const body = await reset.json(); assert.deepEqual(Object.keys(body), ['message']);
  for (const value of [input.token, password, pepper, profile.email]) assert.equal(JSON.stringify(body).includes(value), false);
  const record = await db.prepare('SELECT password_hash FROM user_password_credentials').first('password_hash');
  const [version, iterations, salt, verifier] = record.split('$');
  assert.equal(version, 'lp-pbkdf2-hmac-sha256-v2'); assert.equal(iterations, '20000');
  assert.equal(createHmac('sha256', Buffer.from(pepper, 'hex')).update(pbkdf2Sync(password, Buffer.from(salt, 'hex'), 20000, 32, 'sha256')).digest('hex'), verifier);
  assert.equal(record.includes(password), false); assert.equal(record.includes(pepper), false);
  assert.equal(await db.prepare('SELECT auth_version FROM users').first('auth_version'), 1);
  assert.notEqual(await db.prepare('SELECT email_verified_at FROM users').first('email_verified_at'), null);
  assert.equal(JSON.stringify((await db.prepare('SELECT * FROM user_roles').all()).results), permissions);
  for (const Cookie of cookies) assert.equal((await request('session', undefined, { Cookie })).status, 401);
  assert.equal((await login()).status, 401); assert.equal((await login(password)).status, 200);
  assert.equal((await request('reset-password', { ...input, password: newPassword })).status, 400);
}));

test('invalid, verification-purpose and foreign-account proofs cannot change credentials', () => local(async ({ db, request, register, forgot, mail, proof }) => {
  await register(); const input = await forgot(), verification = proof(await mail('email-verification'));
  await register({ ...profile, nickname: 'Other Recovery', email: 'other@example.test' });
  const other = await db.prepare("SELECT id FROM users WHERE email_normalized='other@example.test'").first('id');
  for (const bad of [{ ...input, token: 'ff'.repeat(32) }, { ...input, userId: other }, verification]) {
    assert.equal((await request('reset-password', { ...bad, password: newPassword })).status, 400);
  }
  assert.equal(await db.prepare('SELECT SUM(auth_version) AS n FROM users').first('n'), 0);
  assert.equal((await request('reset-password', { ...input, password: newPassword })).status, 200);
}));

test('expired reset tokens are rejected and reissue invalidates earlier links', async () => {
  await local(async ({ db, request, register, forgot }) => {
    await register(); const input = await forgot(), now = Math.floor(Date.now() / 1000);
    const row = await db.prepare("SELECT * FROM auth_action_tokens WHERE purpose='password-reset'").first();
    await db.prepare('DELETE FROM auth_action_tokens WHERE id=?').bind(row.id).run();
    await db.prepare(`INSERT INTO auth_action_tokens(id,user_id,purpose,token_digest,auth_version,created_at,expires_at)
      VALUES (?,?,'password-reset',?,?,?,?)`).bind(row.id, row.user_id, row.token_digest, row.auth_version, now - 1801, now - 1).run();
    assert.equal((await request('reset-password', { ...input, password: newPassword })).status, 400);
    assert.equal(await db.prepare('SELECT auth_version FROM users').first('auth_version'), 0);
  });
  await local(async ({ request, register, forgot }) => {
    await register(); const old = await forgot(), current = await forgot();
    assert.notEqual(old.token, current.token);
    assert.equal((await request('reset-password', { ...old, password: newPassword })).status, 400);
    assert.equal((await request('reset-password', { ...current, password: newPassword })).status, 200);
  });
});

test('concurrent resets have one winner and leave only that password usable', () => local(async ({ db, request, register, forgot, login }) => {
  await register(); await login(); // Verify before resetting; recovery never verifies an address.
  const input = await forgot(), candidates = [newPassword, 'different fictional replacement'];
  const results = await Promise.all(candidates.map(password => request('reset-password', { ...input, password })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
  const winner = results.findIndex(r => r.status === 200);
  assert.equal((await login(candidates[winner])).status, 200);
  assert.equal((await login(candidates[1 - winner])).status, 401);
  assert.equal(await db.prepare('SELECT auth_version FROM users').first('auth_version'), 1);
}));

test('password bounds reject short/129-character input without consumption and permit the 12-character minimum', () => local(async ({ db, request, register, forgot }) => {
  await register(); const input = await forgot();
  for (const password of ['a'.repeat(11), 'a'.repeat(129)]) assert.equal((await request('reset-password', { ...input, password })).status, 400);
  assert.equal(await db.prepare("SELECT consumed_at FROM auth_action_tokens WHERE purpose='password-reset'").first('consumed_at'), null);
  assert.equal((await request('reset-password', { ...input, password: 'a'.repeat(12) })).status, 200);
}));

test('forgot responses are identical for missing, disabled, verified, unverified, credential-less and undeliverable accounts', () => local(async ({ db, request, register }) => {
  await register(); const first = await request('forgot-password', { email: profile.email }), expected = await first.text(); assert.equal(first.status, 202);
  const check = async email => { const response = await request('forgot-password', { email }); assert.equal(response.status, 202); assert.equal(await response.text(), expected); };
  await check('missing@example.test');
  await db.prepare('UPDATE users SET email_verified_at=unixepoch(),updated_at=unixepoch()').run(); await check(profile.email);
  await db.prepare("UPDATE users SET status='disabled',updated_at=unixepoch()").run(); await check(profile.email);
  await register({ ...profile, nickname: 'No Credential', email: 'provider@example.test' });
  await db.prepare("DELETE FROM user_password_credentials WHERE user_id=(SELECT id FROM users WHERE email_normalized='provider@example.test')").run();
  await check('provider@example.test');
  await register({ ...profile, nickname: 'Delivery Failure', email: 'fictional@example.invalid' }); await check('fictional@example.invalid');
  assert.equal(await db.prepare(`SELECT COUNT(*) AS n FROM auth_action_tokens t JOIN users u ON u.id=t.user_id
    WHERE u.email_normalized IN ('provider@example.test','fictional@example.invalid') AND t.purpose='password-reset' AND t.revoked_at IS NULL`).first('n'), 0);
}));

test('persistent forgot/reset admission bounds email/IP/global abuse and accepts maximum-length email keys', async () => {
  await local(async ({ request }) => {
    for (let i = 0; i < 3; i++) assert.equal((await request('forgot-password', { email: i % 2 ? 'MISSING@example.test' : 'missing@example.test' })).status, 202);
    assert.equal((await request('forgot-password', { email: 'missing@example.test' })).status, 429);
    const email = 'a'.repeat(64) + '@' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(56) + '.test';
    assert.equal(email.length, 254); assert.equal((await request('forgot-password', { email })).status, 202);
  });
  for (const action of ['forgot-password', 'reset-password']) await local(async ({ request }) => {
    const input = i => action === 'forgot-password' ? { email: `missing${i}@example.test` } : { userId: randomUUID(), token: 'aa'.repeat(32), password: newPassword };
    const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => request(action, input(i), { 'CF-Connecting-IP': '203.0.113.50' })));
    assert.equal(responses.filter(r => r.status === 429).length, 3);
  });
  await local(async ({ request, db }) => {
    for (let i = 0; i < 30; i++) assert.equal((await request('forgot-password', { email: `missing${i}@example.test` })).status, 202);
    assert.equal((await request('forgot-password', { email: 'last@example.test' })).status, 429);
    const saved = JSON.stringify((await db.prepare('SELECT * FROM registration_rate_limits').all()).results);
    assert.equal(saved.includes('example.test'), false); assert.equal(saved.includes('203.0.113'), false);
  });
});

test('credential write failure rolls back consumption and preserves old sessions/password until an explicit retry succeeds', () => local(async ({ db, request, register, forgot, login }) => {
  await register(); const cookie = (await login()).headers.get('set-cookie').split(';')[0], input = await forgot();
  const hash = await db.prepare('SELECT password_hash FROM user_password_credentials').first('password_hash');
  await db.exec("CREATE TRIGGER test_reset_failure BEFORE UPDATE ON user_password_credentials BEGIN SELECT RAISE(ABORT,'Fictional private failure'); END;");
  const failed = await request('reset-password', { ...input, password: newPassword }); assert.equal(failed.status, 503);
  assert.equal(failed.headers.has('set-cookie'), false); assert.equal((await failed.text()).includes('private'), false);
  assert.equal(await db.prepare("SELECT consumed_at FROM auth_action_tokens WHERE purpose='password-reset'").first('consumed_at'), null);
  assert.equal(await db.prepare('SELECT password_hash FROM user_password_credentials').first('password_hash'), hash);
  assert.equal((await request('session', undefined, { Cookie: cookie })).status, 200);
  await db.exec('DROP TRIGGER test_reset_failure;');
  assert.equal((await request('reset-password', { ...input, password: newPassword })).status, 200);
  assert.equal((await request('session', undefined, { Cookie: cookie })).status, 401);
}));

test('email or credential changes and account disabling make previously issued reset proofs stale', async () => {
  for (const change of ["UPDATE users SET email='changed@example.test',email_normalized='changed@example.test',updated_at=unixepoch()",
    'UPDATE user_password_credentials SET password_changed_at=password_changed_at+1,updated_at=updated_at+1',
    "UPDATE users SET status='disabled',updated_at=unixepoch()"] ) await local(async ({ db, request, register, forgot }) => {
    await register(); const input = await forgot(); await db.prepare(change).run();
    assert.equal((await request('reset-password', { ...input, password: newPassword })).status, 400);
  });
});

test('recovery remains loopback-only/default-disabled and rejects cross-site, oversized and malformed requests', async () => {
  await local(async ({ request, instance, db }) => {
    assert.equal((await request('forgot-password')).status, 405);
    for (const headers of [{ Origin: 'null' }, { 'X-LAN-Request': '' }, { 'Content-Type': 'text/plain' }, { 'Content-Encoding': 'gzip' }]) {
      const response = await request('forgot-password', { email: profile.email }, headers); assert.equal(response.status, 403);
      assert.equal(response.headers.has('access-control-allow-origin'), false);
    }
    for (const value of [null, [], { email: 'bad' }, { email: profile.email, role: 'admin' }]) assert.equal((await request('forgot-password', value)).status, 400);
    assert.equal((await request('forgot-password', {}, {}, { body: 'x'.repeat(4097) })).status, 400);
    for (const action of ['forgot-password', 'reset-password']) for (const host of ['lan-party-dev.servok.workers.dev','lan-party.servok.workers.dev']) {
      assert.equal((await instance.dispatchFetch(`https://${host}/api/auth/${action}`, { method: 'POST' })).status, 404);
    }
    await db.exec('DROP TABLE registration_rate_limits;');
    assert.equal((await request('forgot-password', { email: profile.email })).status, 503);
  });
  for (const [overrides, status] of [[{ AUTH_SESSION_MODE: '' }, 404], [{ AUTH_EMAIL_TRANSPORT: 'resend' }, 404],
    [{ PASSWORD_PEPPER: '' }, 503], [{ AUTH_LOCAL_MAIL_SECRET: '22'.repeat(32) }, 503]]) {
    await local(async ({ request }) => assert.equal((await request('forgot-password', { email: profile.email })).status, status), overrides);
  }
});

test('failed reset delivery revokes only its attempt and explicit reissue recovers through the same transport contract', () => local(async ({ db, register, snapshot }) => {
  await register(); const account = await snapshot(), now = Math.floor(Date.now() / 1000);
  let attempts = 0;
  assert.equal(await service.deliverPasswordReset(db, account, profile.email, origin, { async send() { attempts++; throw Error('private provider payload'); } }, now), false);
  assert.equal(attempts, 1);
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM auth_action_tokens WHERE purpose='password-reset' AND revoked_at IS NULL").first('n'), 0);
  let sent;
  assert.equal(await service.deliverPasswordReset(db, account, profile.email, origin, { async send(message) { sent = message; } }, now), true);
  assert.equal(sent.purpose, 'password-reset'); assert.equal(sent.expiresAt, now + 1800);
  assert.equal(new URL(sent.url).pathname, '/reset-password');
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM auth_action_tokens WHERE purpose='email-verification' AND revoked_at IS NULL").first('n'), 1);
}));

test('prepared Resend adapter renders reset-specific content using fake HTTP only', async () => {
  let attempts = 0;
  const adapter = new providers.ResendEmailTransport('fictional-key', 'sender@example.test', async (_url, init) => {
    attempts++; const mail = JSON.parse(init.body);
    assert.equal(mail.subject, 'Reset your LAN Party password'); assert.ok(mail.text.includes('30 minutes'));
    assert.equal(mail.text.includes('24 hours'), false); assert.equal(mail.text.includes('fictional-key'), false);
    return new Response('{}');
  });
  await adapter.send({ to: profile.email, url: 'https://example.test/reset-password#synthetic-proof', expiresAt: 1800,
    purpose: 'password-reset', idempotencyKey: 'fictional-reset-key' });
  assert.equal(attempts, 1);
});

test('reset link bootstrap strips the proof before rendering and keeps verification/reset contexts separate', () => {
  const previous = globalThis.window, userId = randomUUID(), token = 'aa'.repeat(32), paths = [];
  globalThis.window = { location: { pathname: '/reset-password', hash: `#user=${userId}&token=${token}` },
    history: { replaceState(_state, _title, path) { paths.push(path); } } };
  try {
    links.captureVerificationLink(); assert.deepEqual(links.getResetLink(), { userId, token });
    assert.equal(links.getVerificationLink(), null); assert.deepEqual(paths, ['/reset-password']);
    links.clearResetLink(); assert.equal(links.getResetLink(), null);
    globalThis.window.location.hash += '&token=' + token; links.captureVerificationLink(); assert.equal(links.getResetLink(), null);
  } finally { links.clearResetLink(); if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
});
