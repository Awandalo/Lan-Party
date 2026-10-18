import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { before, test } from 'node:test';
const require = createRequire(import.meta.url), wr = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wr('miniflare'), { build } = wr('esbuild');
let policy, migrations;
// Reviewed history, not a count derived from whatever files happen to be present.
// New migrations require an explicit update so missing/extra/renamed files fail.
const expectedHistory = [
  '0001_create_event_structure.sql', '0002_create_accounts.sql',
  '0003_create_auth_credentials.sql', '0004_create_authorization.sql',
  '0005_create_registrations.sql', '0006_seed_reference_data.sql',
  '0007_create_news_articles.sql', '0008_create_authentication_state.sql',
  '0009_create_registration_rate_limits.sql', '0010_create_authentication_email_budget.sql',
  '0011_create_member_numbers.sql',
  '0012_create_oidc_transactions.sql',
];
function assertMigrationHistory(names) {
  assert.deepEqual(names, expectedHistory, 'Discovered SQL migrations must match the reviewed history');
}
const day = Date.UTC(2026, 9, 17) / 1000;
const env = { AUTH_ENVIRONMENT: 'dev', AUTH_EMAIL_TRANSPORT: 'resend',
  AUTH_PUBLIC_ORIGIN: 'https://dev.lan-party.club', RESEND_API_KEY: 'fictional-provider-key',
  AUTH_DEV_RECIPIENT_ALLOWLIST: '["recipient@example.test"]',
  AUTH_EMAIL_PROVIDER_DAILY_LIMIT: '100', AUTH_EMAIL_PROVIDER_MONTHLY_LIMIT: '3000' };
const message = { to: 'recipient@example.test', url: 'https://dev.lan-party.club/verify-email#fictional-proof',
  expiresAt: day + 86400, idempotencyKey: 'fictional-verification', purpose: 'email-verification' };
before(async () => {
  const code = (await build({ entryPoints: [fileURLToPath(new URL('../auth/dev-email.ts', import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022' })).outputFiles[0].text;
  policy = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  const names = (await readdir(new URL('../../migrations/', import.meta.url)))
    .filter(name => name.toLowerCase().endsWith('.sql')).sort();
  assertMigrationHistory(names);
  migrations = [];
  for (const name of names) {
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
async function local(run) {
  const instance = new Miniflare(convertV4MiniflareOptions({ modules: true, cf: false,
    script: 'export default { fetch(){ return new Response("local fixture"); } }',
    compatibilityDate: '2026-10-11', d1Databases: { DB: randomUUID() } }));
  try {
    const db = await instance.getD1Database('DB');
    for (const statements of migrations) await db.batch(statements.map(s => db.prepare(s)));
    await run(db);
  } finally { await instance.dispose(); }
}
const reserve = (db, now = day + 60, daily = 100, monthly = 3000) => policy.reserveDevEmailAttempt(db, now, daily, monthly);
const count = db => db.prepare('SELECT COALESCE(SUM(attempts),0) AS n FROM auth_email_daily_budget').first('n');

test('password setup and notifications use guarded Security URLs and the same shared budget',()=>local(async db=>{
 const sent=[];const transport=new policy.DevResendEmailTransport(db,env,async(input,init)=>{sent.push(JSON.parse(init.body));return new Response('{}');},()=>day);
 for(const purpose of ['password-setup','password-added','password-changed'])await transport.send({...message,purpose,url:'https://dev.lan-party.club/account/security'+(purpose==='password-setup'?'#setup=fictional':''),idempotencyKey:'fictional-'+purpose});
 assert.equal(sent.length,3);assert.equal(await count(db),3);
 for(const item of sent)assert.deepEqual(item.to,['recipient@example.test']);
}));

test('migration discovery rejects missing, unexpected and renamed SQL files', () => {
  assertMigrationHistory([...expectedHistory]);
  assert.throws(() => assertMigrationHistory(expectedHistory.slice(0, -1)));
  assert.throws(() => assertMigrationHistory([...expectedHistory, '0012_unreviewed.sql']));
  assert.throws(() => assertMigrationHistory([...expectedHistory.slice(0, -1), 'unexpected.sql']));
});

test('reviewed migrations apply locally with STRICT, empty, non-PII budget tables', () => local(async db => {
  assert.equal(await count(db), 0);
  assert.equal(await db.prepare('SELECT count(*) AS n FROM auth_email_budget_extensions').first('n'), 0);
  for (const name of ['auth_email_daily_budget', 'auth_email_budget_extensions']) {
    assert.equal((await db.prepare('PRAGMA table_list').all()).results.find(x => x.name === name).strict, 1);
  }
  await assert.rejects(db.prepare('INSERT INTO auth_email_daily_budget VALUES (?,71)').bind(day).run());
  await assert.rejects(db.prepare('INSERT INTO auth_email_daily_budget VALUES (?,1)').bind(day + 1).run());
  await assert.rejects(db.prepare('INSERT INTO auth_email_budget_extensions VALUES (?,11,?,?)').bind(day, 'fictional approval', day).run());
  await assert.rejects(db.prepare('INSERT INTO auth_email_budget_extensions VALUES (?,5,?,?)').bind(day, ' ', day).run());
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
}));

test('concurrent reservations across independent callers admit exactly sixty and restart cannot reset it', () => local(async db => {
  const results = await Promise.allSettled(Array.from({ length: 75 }, () => reserve(db)));
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 60);
  assert.equal(results.filter(x => x.status === 'rejected' && x.reason instanceof policy.DevEmailBudgetExceeded).length, 15);
  assert.equal(await count(db), 60);
  await assert.rejects(reserve(db), policy.DevEmailBudgetExceeded);
  let calls = 0;
  const restartedTransport = new policy.DevResendEmailTransport(db, env, async () => { calls++; return new Response('{}'); }, () => day + 60);
  await assert.rejects(restartedTransport.send(message), policy.DevEmailBudgetExceeded);
  assert.equal(calls, 0);
  assert.equal(await count(db), 60);
}));

test('verification/resend/reset share one allowance, including failed and uncertain provider attempts', () => local(async db => {
  let calls = 0;
  const transport = new policy.DevResendEmailTransport(db, env, async () => {
    calls++; if (calls === 2) throw Error('fictional private provider payload');
    return new Response('{}', { status: calls === 3 ? 503 : 200 });
  }, () => day + 60);
  await transport.send(message);
  await assert.rejects(transport.send({ ...message, idempotencyKey: 'fictional-resend' }), /Email delivery unavailable/);
  await assert.rejects(transport.send({ ...message, purpose: 'password-reset', url: 'https://dev.lan-party.club/reset-password#fictional-proof' }), /Email delivery unavailable/);
  assert.equal(calls, 3); assert.equal(await count(db), 3);
  await db.prepare('UPDATE auth_email_daily_budget SET attempts=60 WHERE utc_day=?').bind(day).run();
  await assert.rejects(transport.send(message), policy.DevEmailBudgetExceeded);
  assert.equal(calls, 3); assert.equal(await count(db), 60);
}));

test('missing/empty/malformed/wildcard/nonmatching allowlists deny before reservations or HTTP', () => local(async db => {
  let calls = 0;
  for (const list of [undefined, '', '[]', 'not-json', '["*"]', '["someone@example.test"]']) {
    const config = { ...env, AUTH_DEV_RECIPIENT_ALLOWLIST: list };
    assert.throws(() => policy.assertDevEmailRecipient(config, message.to), policy.DevEmailPolicyError);
    const transport = new policy.DevResendEmailTransport(db, config, async () => { calls++; return new Response('{}'); }, () => day);
    await assert.rejects(transport.send(message), policy.DevEmailPolicyError);
  }
  policy.assertDevEmailRecipient(env, 'RECIPIENT@example.test');
  assert.equal(calls, 0); assert.equal(await count(db), 0);
}));

test('separate recorded day-specific 5-10 extensions expire with their UTC day and never override provider limits', () => local(async db => {
  await db.prepare('INSERT INTO auth_email_daily_budget VALUES (?,60)').bind(day).run();
  await assert.rejects(reserve(db), policy.DevEmailBudgetExceeded);
  await db.prepare('INSERT INTO auth_email_budget_extensions VALUES (?,5,?,?)').bind(day, 'fictional test approval only', day).run();
  for (let i = 0; i < 5; i++) await reserve(db);
  await assert.rejects(reserve(db), policy.DevEmailBudgetExceeded);
  const next = day + 86400;
  await db.prepare('INSERT INTO auth_email_daily_budget VALUES (?,60)').bind(next).run();
  await assert.rejects(reserve(db, next), policy.DevEmailBudgetExceeded);
  await db.prepare('INSERT INTO auth_email_budget_extensions VALUES (?,10,?,?)').bind(next, 'another fictional approval', next).run();
  for (let i = 0; i < 4; i++) await reserve(db, next, 64);
  await assert.rejects(reserve(db, next, 64), policy.DevEmailBudgetExceeded);
  for (let i = 0; i < 6; i++) await reserve(db, next);
  await assert.rejects(reserve(db, next), policy.DevEmailBudgetExceeded);
  await assert.rejects(db.prepare('INSERT INTO auth_email_budget_extensions VALUES (?,5,?,?)').bind(next, 'duplicate approval', next).run());
}));

test('UTC day resets only at midnight and monthly provider allocation remains shared across days', () => local(async db => {
  await reserve(db, day + 86399, 1, 2);
  await assert.rejects(reserve(db, day + 86399, 1, 2), policy.DevEmailBudgetExceeded);
  await reserve(db, day + 86400, 1, 2);
  await assert.rejects(reserve(db, day + 172800, 100, 2), policy.DevEmailBudgetExceeded);
  const nextMonth = Date.UTC(2026, 10, 1) / 1000;
  await reserve(db, nextMonth, 1, 2);
  assert.equal(await count(db), 3);
}));

test('unsafe environment, callback or unverified provider allocation cannot send', () => local(async db => {
  for (const overrides of [{ AUTH_ENVIRONMENT: 'prod' }, { AUTH_PUBLIC_ORIGIN: 'https://lan-party.club' },
    { AUTH_EMAIL_TRANSPORT: 'local' }, { RESEND_API_KEY: undefined },
    { AUTH_EMAIL_PROVIDER_DAILY_LIMIT: undefined }, { AUTH_EMAIL_PROVIDER_DAILY_LIMIT: '0' },
    { AUTH_EMAIL_PROVIDER_DAILY_LIMIT: '101' }, { AUTH_EMAIL_PROVIDER_MONTHLY_LIMIT: '3001' }]) {
    assert.throws(() => new policy.DevResendEmailTransport(db, { ...env, ...overrides }), policy.DevEmailPolicyError);
  }
  let calls = 0;
  const transport = new policy.DevResendEmailTransport(db, env, async () => { calls++; return new Response('{}'); }, () => day);
  for (const url of ['https://lan-party.club/verify-email', 'https://dev.lan-party.club/reset-password', 'https://dev.lan-party.club/verify-email?token=fictional']) {
    await assert.rejects(transport.send({ ...message, url }), policy.DevEmailPolicyError);
  }
  assert.equal(calls, 0); assert.equal(await count(db), 0);
}));

test('database failure prevents provider calls and has no in-memory quota fallback', async () => {
  let calls = 0;
  const unavailable = { prepare() { throw Error('fictional database unavailable'); } };
  const transport = new policy.DevResendEmailTransport(unavailable, env, async () => { calls++; return new Response('{}'); }, () => day);
  await assert.rejects(transport.send(message), /database unavailable/);
  assert.equal(calls, 0);
});
