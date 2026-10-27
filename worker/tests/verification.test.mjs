import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { before, test } from 'node:test';
const require = createRequire(import.meta.url), wr = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wr('miniflare'), { build } = wr('esbuild');
const origin = 'http://127.0.0.1:5173', base = 'http://127.0.0.1:8787/api/auth/';
const mailboxSecret = '33'.repeat(32); // Fictional fixtures only, never live secrets.
const profile = { nickname: 'Email Player', firstName: 'Fictional', lastName: 'Participant',
  email: 'verify@example.test', password: 'fictional verification password' };
let script, migrations, providers, service, actions;
async function moduleFrom(path, define = {}) {
  const code = (await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022', define })).outputFiles[0].text;
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
before(async () => {
  script = (await build({ entryPoints: [fileURLToPath(new URL('../index.ts', import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' })).outputFiles[0].text;
  [providers, service, actions] = await Promise.all([moduleFrom('../auth/email.ts'),
    moduleFrom('../auth/verification-service.ts'), moduleFrom('../auth/action-state.ts')]);
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
      PASSWORD_PEPPER: '11'.repeat(32), AUTH_RATE_LIMIT_SECRET: '22'.repeat(32), ...overrides } }));
  try {
    const db = await instance.getD1Database('DB');
    for (const statements of migrations) await db.batch(statements.map(s => db.prepare(s)));
    let ordinal = 0;
    const request = (action, input, headers = {}, options = {}) => instance.dispatchFetch(base + action, {
      method: input === undefined ? 'GET' : 'POST', ...(input === undefined ? {} : { body: JSON.stringify(input) }), ...options,
      headers: { Origin: origin, 'X-LAN-Request': '1', 'Content-Type': 'application/json',
        'CF-Connecting-IP': `203.0.113.${++ordinal}`, ...headers } });
    const register = async (input = profile) => {
      const response = await request('register', input); assert.equal(response.status, 202); return response;
    };
    const mail = async (email = profile.email) => {
      const response = await request('local-mail', { email }, { Authorization: `Bearer ${mailboxSecret}` });
      assert.equal(response.status, 200); return (await response.json()).mail;
    };
    const proof = message => {
      assert.ok(message);
      const url = new URL(message.url), params = new URLSearchParams(url.hash.slice(1));
      assert.equal(url.origin, origin); assert.equal(url.pathname, '/verify-email'); assert.equal(url.search, '');
      return { userId: params.get('user'), token: params.get('token') };
    };
    const snapshot = () => db.prepare(`SELECT id AS userId,status,auth_version AS authVersion,email_verified_at AS emailVerifiedAt
      FROM users WHERE email_normalized=?`).bind(profile.email).first();
    await run({ db, instance, request, register, mail, proof, snapshot });
  } finally { await instance.dispose(); }
}
const digest = token => createHash('sha256').update(`lan-party:email-verification:v1:${token}`).digest('hex');

test('registration issues only a digest-bound 24h verification and explicit confirmation changes only its account', () => local(async ({ db, request, register, mail, proof }) => {
  const registration = await register(), body = await registration.json();
  assert.deepEqual(Object.keys(body), ['message']);
  const message = await mail(), input = proof(message);
  assert.equal(JSON.stringify(body).includes(input.token), false);
  const stored = await db.prepare('SELECT * FROM auth_action_tokens').first();
  assert.equal(stored.token_digest, digest(input.token));
  assert.equal(stored.purpose, 'email-verification'); assert.equal(stored.expires_at - stored.created_at, 86400);
  assert.equal(message.expiresAt, stored.expires_at); assert.equal(stored.revoked_at, null); assert.equal(stored.consumed_at, null);
  assert.equal(JSON.stringify(stored).includes(input.token), false);
  assert.equal(await db.prepare('SELECT email_verified_at FROM users').first('email_verified_at'), null);
  assert.equal((await request('verify-email')).status, 405);
  assert.equal(await db.prepare('SELECT consumed_at FROM auth_action_tokens').first('consumed_at'), null);
  const confirmed = await request('verify-email', input); assert.equal(confirmed.status, 200);
  assert.equal(confirmed.headers.get('cache-control'), 'no-store');
  assert.notEqual(await db.prepare('SELECT email_verified_at FROM users').first('email_verified_at'), null);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM user_roles').first('n'), 0);
  assert.equal((await request('verify-email', input)).status, 400);
  assert.equal((await mail()), null); // Retrieval is one-shot; no ordinary token API.
}));

test('incorrect, foreign-account and wrong-purpose tokens cannot verify or consume the correct link', () => local(async ({ db, request, register, mail, proof, snapshot }) => {
  await register(); const input = proof(await mail());
  await register({ ...profile, nickname: 'Other Player', email: 'other@example.test' });
  const other = await db.prepare('SELECT id FROM users WHERE email_normalized=?').bind('other@example.test').first('id');
  for (const invalid of [{ ...input, token: 'ff'.repeat(32) }, { ...input, userId: other }, { ...input, token: 'bad' }]) {
    assert.equal((await request('verify-email', invalid)).status, 400);
  }
  const reset = await new actions.D1ActionTokenStore(db).issue(await snapshot(), 'password-reset', Math.floor(Date.now() / 1000));
  assert.equal((await request('verify-email', { userId: input.userId, token: reset.token })).status, 400);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM users WHERE email_verified_at IS NOT NULL').first('n'), 0);
  assert.equal((await request('verify-email', input)).status, 200);
  assert.equal(await db.prepare('SELECT email_verified_at FROM users WHERE id=?').bind(other).first('email_verified_at'), null);
}));

test('expired verification links fail at the HTTP boundary', () => local(async ({ db, request, register, mail, proof }) => {
  await register(); const input = proof(await mail()), now = Math.floor(Date.now() / 1000);
  const row = await db.prepare('SELECT * FROM auth_action_tokens').first();
  await db.prepare('DELETE FROM auth_action_tokens WHERE id=?').bind(row.id).run();
  await db.prepare(`INSERT INTO auth_action_tokens(id,user_id,purpose,token_digest,auth_version,email_normalized,created_at,expires_at)
    VALUES (?,?,'email-verification',?,?,?,?,?)`).bind(row.id, row.user_id, row.token_digest, row.auth_version,
      row.email_normalized, now - 86401, now - 1).run();
  assert.equal((await request('verify-email', input)).status, 400);
  assert.equal(await db.prepare('SELECT email_verified_at FROM users').first('email_verified_at'), null);
}));

test('concurrent confirmations have exactly one winner', () => local(async ({ db, request, register, mail, proof }) => {
  await register(); const input = proof(await mail());
  const responses = await Promise.all([request('verify-email', input), request('verify-email', input)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 400]);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM auth_action_tokens WHERE consumed_at IS NOT NULL').first('n'), 1);
}));

test('resend supersedes old links and duplicate signup does not rotate existing account tokens', () => local(async ({ db, request, register, mail, proof }) => {
  const first = await register(), input = proof(await mail());
  assert.equal(await (await register()).text(), await first.text());
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM auth_action_tokens').first('n'), 1);
  assert.equal((await request('resend-verification', { email: profile.email.toUpperCase() })).status, 202);
  const replacement = proof(await mail()); assert.notEqual(replacement.token, input.token);
  assert.equal((await request('verify-email', input)).status, 400);
  assert.equal((await request('verify-email', replacement)).status, 200);
}));

test('concurrent resends leave one usable token and local mailbox skips reordered superseded deliveries', () => local(async ({ db, request, register, mail, proof }) => {
  await register();
  const responses = await Promise.all([request('resend-verification', { email: profile.email }), request('resend-verification', { email: profile.email })]);
  assert.deepEqual(responses.map(r => r.status), [202, 202]);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM auth_action_tokens WHERE revoked_at IS NULL AND consumed_at IS NULL').first('n'), 1);
  const current = proof(await mail());
  assert.equal((await request('verify-email', current)).status, 200);
  assert.equal(await mail(), null);
}));

test('generic resend responses cover missing, unverified, verified, disabled and failed delivery accounts', () => local(async ({ db, request, register }) => {
  await register();
  const response = await request('resend-verification', { email: profile.email }), expected = await response.text();
  assert.equal(response.status, 202);
  const missing = await request('resend-verification', { email: 'missing@example.test' });
  assert.equal(missing.status, 202); assert.equal(await missing.text(), expected);
  await db.prepare('UPDATE users SET email_verified_at=unixepoch(),updated_at=unixepoch()').run();
  assert.equal(await (await request('resend-verification', { email: profile.email })).text(), expected);
  await db.prepare("UPDATE users SET status='disabled',updated_at=unixepoch()").run();
  assert.equal(await (await request('resend-verification', { email: profile.email })).text(), expected);
  // A non-.test recipient is deliberately rejected by the local transport.
  await register({ ...profile, email: 'fictional@example.invalid', nickname: 'Undeliverable' });
  const failed = await request('resend-verification', { email: 'fictional@example.invalid' });
  assert.equal(failed.status, 202); assert.equal(await failed.text(), expected);
  assert.equal(await db.prepare(`SELECT COUNT(*) AS n FROM auth_action_tokens t JOIN users u ON u.id=t.user_id
    WHERE u.email_normalized='fictional@example.invalid' AND t.revoked_at IS NULL`).first('n'), 0);
}));

test('unverified accounts must verify before login; anonymous resend recovers access without private data', () => local(async ({ request, register, mail, proof }) => {
  await register();
  const denied = await request('login', { email: profile.email, password: profile.password }); assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, 'verification_required');
  assert.equal(denied.headers.get('set-cookie'), null);
  assert.equal((await request('resend-verification', { email: profile.email })).status, 202);
  assert.equal((await request('verify-email', proof(await mail()))).status, 200);
  const login = await request('login', { email: profile.email, password: profile.password }); assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const after = await (await request('session', undefined, { Cookie: cookie })).json(); assert.equal(after.emailVerified, true);
  assert.deepEqual(Object.keys(after.account).sort(), ['memberNumber', 'nickname', 'userId']);
  for (const value of [profile.email, profile.firstName, profile.lastName, profile.password]) assert.equal(JSON.stringify(after).includes(value), false);
}));

test('resend preserves the approved maximum email length despite counter-domain prefixes', () => local(async ({ request, register, mail, proof }) => {
  const email = 'a'.repeat(64) + '@' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(56) + '.test';
  assert.equal(email.length, 254);
  await register({ ...profile, email });
  assert.equal((await request('resend-verification', { email })).status, 202);
  assert.equal((await request('verify-email', proof(await mail(email)))).status, 200);
}));

test('persistent email/account, IP and global verification rate limits prevent uncontrolled issuance', async () => {
  await local(async ({ db, request, register }) => {
    await register();
    for (let i = 0; i < 3; i++) assert.equal((await request('resend-verification', { email: i % 2 ? profile.email.toUpperCase() : profile.email })).status, 202);
    assert.equal((await request('resend-verification', { email: profile.email })).status, 429);
    assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM auth_action_tokens').first('n'), 4);
  });
  await local(async ({ request }) => {
    const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => request('resend-verification',
      { email: `missing${i}@example.test` }, { 'CF-Connecting-IP': '203.0.113.50' })));
    assert.equal(responses.filter(r => r.status === 202).length, 5); assert.equal(responses.filter(r => r.status === 429).length, 3);
  });
  await local(async ({ request }) => {
    for (let i = 0; i < 30; i++) assert.equal((await request('resend-verification', { email: `missing${i}@example.test` })).status, 202);
    assert.equal((await request('resend-verification', { email: 'last@example.test' })).status, 429);
  });
});

test('mailbox is secret-protected, fictional-only, no-store, and unavailable on every hosted environment', async () => {
  await local(async ({ request, register, instance }) => {
    await register();
    for (const token of ['', 'wrong', 'ff'.repeat(32)]) assert.equal((await request('local-mail', { email: profile.email }, { Authorization: `Bearer ${token}` })).status, 401);
    assert.equal((await request('local-mail', { email: 'person@example.invalid' }, { Authorization: `Bearer ${mailboxSecret}` })).status, 400);
    assert.equal((await request('local-mail', { email: profile.email }, { Authorization: `Bearer ${mailboxSecret}`, Origin: 'https://attacker.example.test' })).status, 403);
    for (const name of ['verify-email', 'resend-verification', 'local-mail']) {
      for (const host of ['lan-party-dev.servok.workers.dev', 'lan-party.servok.workers.dev']) {
        assert.equal((await instance.dispatchFetch(`https://${host}/api/auth/${name}`, { method: 'POST' })).status, 404);
      }
    }
    const response = await request('local-mail', { email: profile.email }, { Authorization: `Bearer ${mailboxSecret}` });
    assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.has('access-control-allow-origin'), false);
  });
  for (const overrides of [{ AUTH_EMAIL_TRANSPORT: '' }, { AUTH_EMAIL_TRANSPORT: 'resend' }, { AUTH_SESSION_MODE: '' }]) {
    await local(async ({ request }) => assert.equal((await request('local-mail', { email: profile.email })).status, 404), overrides);
  }
  await local(async ({ request }) => assert.equal((await request('local-mail', { email: profile.email })).status, 503), { AUTH_LOCAL_MAIL_SECRET: '22'.repeat(32) });
});

test('verification rejects unsafe requests and storage errors roll back single-use consumption', () => local(async ({ db, request, register, mail, proof }) => {
  await register(); const input = proof(await mail());
  for (const headers of [{ Origin: 'null' }, { 'X-LAN-Request': '' }, { 'Content-Type': 'text/plain' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await request('verify-email', input, headers)).status, 403);
  }
  assert.equal((await request('verify-email', input, {}, { body: 'x'.repeat(4097) })).status, 400);
  await db.exec("CREATE TRIGGER test_verify_failure BEFORE UPDATE OF email_verified_at ON users BEGIN SELECT RAISE(ABORT,'Fictional private failure'); END;");
  const response = await request('verify-email', input); assert.equal(response.status, 503); assert.equal((await response.text()).includes('private'), false);
  assert.equal(await db.prepare('SELECT consumed_at FROM auth_action_tokens').first('consumed_at'), null);
  await db.exec('DROP TRIGGER test_verify_failure;');
  assert.equal((await request('verify-email', input)).status, 200);
}));

test('delivery failure revokes its attempt and explicit resend recovers; failed replacement storage preserves the old token', () => local(async ({ db, register, snapshot }) => {
  await register(); const account = await snapshot(), now = Math.floor(Date.now() / 1000);
  let calls = 0;
  assert.equal(await service.deliverVerification(db, account, profile.email, origin, { async send() { calls++; throw Error('private provider payload'); } }, now), false);
  assert.equal(calls, 1);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM auth_action_tokens WHERE revoked_at IS NULL').first('n'), 0);
  let sent;
  assert.equal(await service.deliverVerification(db, account, profile.email, origin, { async send(mail) { sent = mail; } }, now), true);
  const token = new URLSearchParams(new URL(sent.url).hash.slice(1)).get('token');
  await db.exec("CREATE TRIGGER test_issue_failure BEFORE INSERT ON auth_action_tokens BEGIN SELECT RAISE(ABORT,'Fictional storage failure'); END;");
  assert.equal(await service.deliverVerification(db, account, profile.email, origin, { async send() { throw Error('must not send'); } }, now), false);
  await db.exec('DROP TRIGGER test_issue_failure;');
  assert.equal(await new actions.D1ActionTokenStore(db).completeEmailVerification(token, account.userId, now), true);
}));

test('Resend adapter uses only the documented API through a fake transport and sanitizes failures without retry', async () => {
  const mail = { to: 'fictional@example.test', url: 'https://dev.lan-party.club/verify-email#fictional-proof', expiresAt: 2000000000, idempotencyKey: 'fictional-unique-id' };
  let calls = 0;
  const adapter = new providers.ResendEmailTransport('fictional-api-key', 'sender@example.test', async (url, init) => {
    calls++; assert.equal(url, 'https://api.resend.com/emails'); assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'manual'); assert.equal(init.headers.Authorization, 'Bearer fictional-api-key');
    assert.equal(init.headers['Idempotency-Key'], mail.idempotencyKey);
    const body = JSON.parse(init.body); assert.deepEqual(body.to, [mail.to]); assert.equal(body.from, 'sender@example.test');
    assert.ok(body.text.includes(mail.url)); assert.equal(body.text.includes('fictional-api-key'), false);
    return new Response('{}', { status: 200 });
  });
  await adapter.send(mail); assert.equal(calls, 1);
  for (const failure of [async () => new Response('private provider payload', { status: 429 }), async () => { throw Error('private network credentials'); }]) {
    let attempts = 0;
    const broken = new providers.ResendEmailTransport('fictional-api-key', 'sender@example.test', async () => { attempts++; return failure(); });
    await assert.rejects(broken.send(mail), { message: 'Email delivery unavailable' }); assert.equal(attempts, 1);
  }
});

test('local email transport bounds storage, expires mail and rejects real recipients', async () => {
  const transport = new providers.LocalEmailTransport(), now = Math.floor(Date.now() / 1000);
  const mail = { to: 'fictional@example.test', url: `${origin}/verify-email#fictional-proof`, expiresAt: now + 86400, idempotencyKey: 'fixture' };
  await assert.rejects(transport.send({ ...mail, to: 'fictional@example.invalid' }));
  for (let i = 0; i < 50; i++) await transport.send({ ...mail, idempotencyKey: `fixture-${i}` });
  await assert.rejects(transport.send({ ...mail, idempotencyKey: 'overflow' }));
  assert.ok(transport.take(mail.to, now));
  await transport.send({ ...mail, idempotencyKey: 'recovered-capacity' });
  assert.equal(transport.take(mail.to, now + 86400), null);
});

test('verification bootstrap removes the URL proof before rendering, rejects malformed fragments and clears memory', async () => {
  const link = await moduleFrom('../../src/lib/verification-link.ts', { 'import.meta.env.DEV': 'true' });
  const userId = '12345678-1234-1234-1234-123456789abc', token = 'aa'.repeat(32);
  const replacementPaths = [];
  const previousWindow = globalThis.window;
  globalThis.window = { location: { pathname: '/verify-email', hash: `#user=${userId}&token=${token}` },
    history: { replaceState(_state, _title, path) { replacementPaths.push(path); } } };
  try {
    link.captureVerificationLink(); assert.deepEqual(link.getVerificationLink(), { userId, token });
    assert.deepEqual(replacementPaths, ['/verify-email']);
    link.clearVerificationLink(); assert.equal(link.getVerificationLink(), null);
    for (const hash of ['', `#user=${userId}&token=bad`, `#user=${userId}&token=${token}&token=${token}`,
      `#user=${userId}%0A&token=${token}`, `#token=${token}`]) {
      globalThis.window.location.hash = hash;
      link.captureVerificationLink(); assert.equal(link.getVerificationLink(), null);
    }
    assert.ok(replacementPaths.every(path => path === '/verify-email'));
  } finally {
    link.clearVerificationLink();
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
});
