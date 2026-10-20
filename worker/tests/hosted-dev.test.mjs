import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { before, test } from 'node:test';
const require = createRequire(import.meta.url), wr = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wr('miniflare'), { build } = wr('esbuild');
const origin = 'https://dev.lan-party.club';
const profile = { nickname: 'Hosted Fictional', firstName: 'Fictional', lastName: 'Tester',
  email: 'hosted@example.test', password: 'fictional original password' };
let script, migrations, helpers;
before(async () => {
  // Test-only entrypoint intercepts ALL outgoing fetches. No external email or
  // Cloudflare connection exists; fixture-mail access is never in application code.
  script = (await build({ stdin: { resolveDir: fileURLToPath(new URL('../../', import.meta.url)), contents: `
    import app from './worker/index';
    const mails=[];
    globalThis.fetch=async (url,init)=>{
      if(url!=='https://api.resend.com/emails')throw Error('Unexpected external request in offline fixture');
      mails.push(JSON.parse(init.body));
      return new Response('{}',{status:200});
    };
    export default { async fetch(request,env){
      if(new URL(request.url).pathname==='/_fixture/mails')return Response.json(mails);
      return app.fetch(request,env);
    }};` }, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' })).outputFiles[0].text;
  const helperBundle = await build({ entryPoints: [fileURLToPath(new URL('../auth/environment.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });
  helpers = await import('data:text/javascript;base64,' + Buffer.from(helperBundle.outputFiles[0].text).toString('base64'));
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
    bindings: { AUTH_ENVIRONMENT: 'dev', REGISTRATION_MODE: 'hosted-dev', AUTH_SESSION_MODE: 'hosted-dev',
      AUTH_PUBLIC_ORIGIN: origin, AUTH_EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 'fictional-test-key',
      PASSWORD_PEPPER: '11'.repeat(32), AUTH_RATE_LIMIT_SECRET: '22'.repeat(32),
      AUTH_TURNSTILE_SITE_KEY: 'synthetic-site-key', TURNSTILE_SECRET_KEY: 'synthetic-only-turnstile-secret',
      AUTH_DEV_RECIPIENT_ALLOWLIST: '["hosted@example.test"]',
      AUTH_EMAIL_PROVIDER_DAILY_LIMIT: '100', AUTH_EMAIL_PROVIDER_MONTHLY_LIMIT: '3000', ...overrides } }));
  try {
    const db = await instance.getD1Database('DB');
    for (const statements of migrations) await db.batch(statements.map(s => db.prepare(s)));
    let ordinal = 0;
    const request = (action, input, headers = {}, host = origin) => instance.dispatchFetch(host + '/api/auth/' + action, {
      method: input === undefined ? 'GET' : 'POST', ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      headers: { Origin: origin, 'Content-Type': 'application/json', 'X-LAN-Request': '1',
        'CF-Connecting-IP': `203.0.113.${++ordinal}`, ...headers } });
    const mails = async () => (await instance.dispatchFetch(origin + '/_fixture/mails')).json();
    const proof = mail => {
      const url = new URL(mail.text.match(/https:\/\/[^\s]+/)[0]); assert.equal(url.origin, origin);
      const parts = new URLSearchParams(url.hash.slice(1)); return { userId: parts.get('user'), token: parts.get('token') };
    };
    await run({ db, request, mails, proof });
  } finally { await instance.dispose(); }
}

test('offline hosted DEV register → verify → login/logout → reset uses guarded Resend and revokes old sessions', () => local(async ({ db, request, mails, proof }) => {
  const registration = await request('register', profile); assert.equal(registration.status, 202);
  const body = await registration.text(); for (const value of Object.values(profile)) assert.equal(body.includes(value), false);
  assert.equal(await db.prepare('SELECT email_verified_at FROM users').first('email_verified_at'), null);
  const login = password => request('login', { email: profile.email, password });
  const denied = await login(profile.password); assert.equal(denied.status, 403); assert.equal(denied.headers.get('set-cookie'), null);
  const verification = (await mails())[0]; assert.equal(verification.from, 'noreply@auth.lan-party.club');
  assert.equal((await request('verify-email', proof(verification))).status, 200);
  assert.equal((await request('verify-email', proof(verification))).status, 400);
  const signedIn = await login(profile.password); assert.equal(signedIn.status, 200);
  const cookie = signedIn.headers.get('set-cookie').split(';')[0];
  assert.match(signedIn.headers.getSetCookie()[0], /Secure; HttpOnly; SameSite=Lax; Path=\/$/);
  const session = await (await request('session', undefined, { Cookie: cookie })).json();
  assert.deepEqual(Object.keys(session.account).sort(), ['memberNumber', 'nickname', 'userId']); assert.equal(session.emailVerified, true);
  assert.equal((await request('logout', {}, { Cookie: cookie })).status, 403);
  assert.equal((await request('logout', {}, { Cookie: cookie, 'X-CSRF-Token': session.csrfToken })).status, 200);
  const oldCookie = (await login(profile.password)).headers.get('set-cookie').split(';')[0];
  assert.equal((await request('forgot-password', { email: profile.email })).status, 202);
  const reset = proof((await mails())[1]), password = 'fictional replacement password';
  assert.equal((await request('reset-password', { ...reset, password })).status, 200);
  assert.equal((await request('session', undefined, { Cookie: oldCookie })).status, 401);
  assert.equal((await login(profile.password)).status, 401); assert.equal((await login(password)).status, 200);
  assert.equal((await request('reset-password', { ...reset, password })).status, 400);
  assert.deepEqual((await mails()).map(mail=>mail.subject),['Verify your LAN Party account','Reset your LAN Party password','Your LAN Party password was changed']);
  assert.equal(await db.prepare('SELECT SUM(attempts) AS n FROM auth_email_daily_budget').first('n'), 3);
  assert.equal((await request('local-mail', { email: profile.email })).status, 404);
}));

test('empty or missing allowlist denies hosted registration before account/credential creation or sending', async () => {
  for (const allowlist of ['', '[]', '["another@example.test"]']) await local(async ({ db, request, mails }) => {
    assert.equal((await request('register', profile)).status, 202);
    assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM users').first('n'), 0);
    assert.deepEqual(await mails(), []);
    assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM auth_email_daily_budget').first('n'), 0);
  }, { AUTH_DEV_RECIPIENT_ALLOWLIST: allowlist });
});

test('hosted mode cannot authorize PROD, workers.dev aliases or requests without its DEV marker', async () => {
  await local(async ({ request }) => {
    for (const host of ['https://lan-party.club', 'https://lan-party.servok.workers.dev', 'https://lan-party-dev.servok.workers.dev']) {
      for (const [action, input] of [['register', profile], ['login', {}], ['verify-email', {}], ['forgot-password', {}]]) {
        assert.equal((await request(action, input, {}, host)).status, 404);
      }
    }
    assert.equal((await request('register', profile, { Origin: 'https://lan-party.club' })).status, 403);
  });
  await local(async ({ request }) => assert.equal((await request('register', profile)).status, 404), { AUTH_ENVIRONMENT: '' });
  await local(async ({ request }) => assert.equal((await request('register', profile)).status, 404), { REGISTRATION_MODE: '' });
});

test('resend and recovery cannot bypass the shared exhausted allowance', () => local(async ({ db, request, mails }) => {
  assert.equal((await request('register', profile)).status, 202);
  await db.prepare('UPDATE auth_email_daily_budget SET attempts=60').run();
  assert.equal((await request('resend-verification', { email: profile.email })).status, 202);
  assert.equal((await request('forgot-password', { email: profile.email })).status, 202);
  assert.equal((await mails()).length, 1);
  assert.equal(await db.prepare('SELECT SUM(attempts) AS n FROM auth_email_daily_budget').first('n'), 60);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM auth_action_tokens WHERE revoked_at IS NULL').first('n'), 0);
}));

test('password recovery never verifies an address or lets an unverified account log in', () => local(async ({ db, request, mails, proof }) => {
  await request('register', profile);
  await request('forgot-password', { email: profile.email });
  const reset = proof((await mails())[1]), password = 'fictional replacement password';
  assert.equal((await request('reset-password', { ...reset, password })).status, 200);
  assert.equal(await db.prepare('SELECT email_verified_at FROM users').first('email_verified_at'), null);
  assert.equal((await request('login', { email: profile.email, password })).status, 403);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').first('n'), 0);
  assert.equal((await request('resend-verification', { email: profile.email })).status, 202);
  const latestVerification=(await mails()).filter(mail=>mail.subject==='Verify your LAN Party account').at(-1);
  assert.equal((await request('verify-email', proof(latestVerification))).status, 200);
  assert.equal((await request('login', { email: profile.email, password })).status, 200);
}));

test('a completed reset cannot bypass the shared budget for its security notification',()=>local(async({db,request,mails,proof})=>{
 await request('register',profile);await request('verify-email',proof((await mails())[0]));
 await request('forgot-password',{email:profile.email});const reset=proof((await mails())[1]);
 await db.prepare('UPDATE auth_email_daily_budget SET attempts=60').run();
 const password='fictional recovered password';
 assert.equal((await request('reset-password',{...reset,password})).status,200);
 assert.equal((await mails()).length,2);
 assert.equal(await db.prepare('SELECT SUM(attempts) n FROM auth_email_daily_budget').first('n'),60);
 assert.equal((await request('login',{email:profile.email,password})).status,200);
}));

test('hosted missing trusted IP fails closed and an unverified legacy session is rejected', () => local(async ({ db, request, mails, proof }) => {
  // Miniflare injects its own platform IP; test the missing-header guard directly.
  assert.throws(() => helpers.authClientIP(new Request(origin), { AUTH_ENVIRONMENT: 'dev' }), /Trusted client address unavailable/);
  assert.equal(helpers.authClientIP(new Request('http://127.0.0.1'), {}), 'loopback');
  await request('register', profile); await request('verify-email', proof((await mails())[0]));
  const cookie = (await request('login', { email: profile.email, password: profile.password })).headers.get('set-cookie').split(';')[0];
  await db.prepare('UPDATE users SET email_verified_at=NULL').run();
  assert.equal((await request('session', undefined, { Cookie: cookie })).status, 401);
}));

test('hosted login fails closed until both Turnstile bindings are configured',async()=>{
 for(const overrides of [{AUTH_TURNSTILE_SITE_KEY:''},{TURNSTILE_SECRET_KEY:''}])await local(async({request})=>{
  assert.equal((await request('login',{email:profile.email,password:profile.password})).status,503);
 },overrides);
});
