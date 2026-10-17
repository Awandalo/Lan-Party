import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { before, test } from 'node:test';
const require = createRequire(import.meta.url), wr = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wr('miniflare'), { build } = wr('esbuild');
const now = 1792240000, pepper = '11'.repeat(32), token = 'ab'.repeat(32);
let migrations, provision, digestToken, formatMemberNumber, isMemberNumber;
async function moduleFrom(path) {
  const code = (await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true,
    write: false, format: 'esm', platform: 'node', target: 'es2022' })).outputFiles[0].text;
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
before(async () => {
  ({ createOrganizationAccount: provision } = await moduleFrom('../auth/organization-members.ts'));
  ({ digestToken } = await moduleFrom('../auth/tokens.ts'));
  ({ formatMemberNumber, isMemberNumber } = await moduleFrom('../../src/lib/member-number.ts'));
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
async function local(run, legacy = false) {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("test")}}',
    cf: false, compatibilityDate: '2026-10-11', d1Databases: { DB: randomUUID() } }));
  try {
    const db = await mf.getD1Database('DB');
    for (const sql of migrations.slice(0, -1)) await db.batch(sql.map(s => db.prepare(s)));
    const apply = () => db.batch(migrations.at(-1).map(s => db.prepare(s)));
    if (!legacy) await apply();
    await run({ db, apply });
  } finally { await mf.dispose(); }
}
async function user(db, { id = randomUUID(), time = now, email = `${id}@example.test` } = {}) {
  await db.prepare(`INSERT INTO users (id,first_name,last_name,email,email_normalized,created_at,updated_at)
    VALUES (?,'Fictional','Participant',?,?,?,?)`).bind(id, email, email, time, time).run();
  return id;
}
const number = (db, id) => db.prepare('SELECT CAST(member_number AS TEXT) AS value FROM member_numbers WHERE user_id=?').bind(id).first('value');
const profile = label => ({ nickname: `Original ${label}`, firstName: 'Fictional', lastName: 'Organizer',
  email: `${label}@example.test`, password: 'fictional organization password' });
async function admin(db) {
  const id = await user(db);
  await db.prepare('UPDATE users SET email_verified_at=? WHERE id=?').bind(now, id).run();
  await db.prepare(`INSERT INTO user_roles (user_id,role_id,assigned_at) SELECT ?,id,? FROM roles WHERE code='admin'`).bind(id, now).run();
  await db.prepare(`INSERT INTO auth_sessions (id,user_id,token_digest,auth_version,created_at,expires_at) VALUES (?,?,?,0,?,?)`)
    .bind(randomUUID(), id, await digestToken(token, 'session'), now, now + 604800).run();
  return id;
}

test('0011 starts regular allocation at 11, preserves reserved slots and serializes concurrent account creation', () => local(async ({ db }) => {
  const first = await user(db); assert.equal(await number(db, first), '11');
  const ids = await Promise.all(Array.from({ length: 20 }, () => user(db)));
  const allocated = await Promise.all(ids.map(id => number(db, id)));
  assert.deepEqual(allocated.map(Number).sort((a,b) => a-b), Array.from({ length: 20 }, (_, i) => i + 12));
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM member_numbers WHERE member_number<=10 AND user_id IS NULL').first('n'), 10);
  assert.equal(await db.prepare('PRAGMA quick_check').first('quick_check'), 'ok');
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
}));

test('0011 deterministically backfills by created_at then UUID without assigning reserved numbers', () => local(async ({ db, apply }) => {
  const later = await user(db, { time: now + 1 });
  const second = await user(db, { id: '22222222-2222-4222-8222-222222222222' });
  const first = await user(db, { id: '11111111-1111-4111-8111-111111111111' });
  await apply();
  assert.equal(await number(db, first), '11'); assert.equal(await number(db, second), '12'); assert.equal(await number(db, later), '13');
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM roles').first('n'), 2);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM role_permissions').first('n'), 13);
}, true));

test('numbers survive nickname/role changes, cannot be edited/deleted and are never reused after deletion', () => local(async ({ db }) => {
  const id = await user(db);
  await db.prepare('INSERT INTO user_nicknames (user_id,nickname,created_at,updated_at) VALUES (?,?,?,?)').bind(id, 'First Nickname', now, now).run();
  await db.prepare('UPDATE user_nicknames SET nickname=? WHERE user_id=?').bind('Later Nickname', id).run();
  await db.prepare(`INSERT INTO user_roles (user_id,role_id,assigned_at) SELECT ?,id,? FROM roles WHERE code='user'`).bind(id, now).run();
  assert.equal(await number(db, id), '11');
  await assert.rejects(db.prepare('UPDATE member_numbers SET member_number=99 WHERE user_id=?').bind(id).run());
  await assert.rejects(db.prepare('UPDATE member_numbers SET user_id=? WHERE user_id=?').bind(randomUUID(), id).run());
  await assert.rejects(db.prepare('DELETE FROM member_numbers WHERE user_id=?').bind(id).run());
  await assert.rejects(db.prepare('INSERT OR REPLACE INTO member_numbers (member_number,user_id,registered,issued_at) VALUES (11,?,1,?)').bind(id, now).run());
  await assert.rejects(db.prepare('INSERT OR REPLACE INTO member_numbers (user_id,registered,issued_at) VALUES (?,1,?)').bind(id, now).run());
  await db.batch([db.prepare('DELETE FROM user_roles WHERE user_id=?').bind(id), db.prepare('DELETE FROM user_nicknames WHERE user_id=?').bind(id), db.prepare('DELETE FROM users WHERE id=?').bind(id)]);
  assert.equal(await number(db, id), '11'); assert.equal(await number(db, await user(db)), '12');
  await assert.rejects(user(db, { id }));
}));

test('reserved provisioning needs an active verified admin session AND explicit users.manage grant; grants no roles', () => local(async ({ db }) => {
  const ordinary = await user(db);
  await assert.rejects(db.prepare('UPDATE member_numbers SET user_id=?,reserved_by_user_id=? WHERE member_number=1').bind(randomUUID(), ordinary).run());
  await assert.rejects(provision(db, token, 1, profile('denied'), pepper, now));
  const actor = await admin(db);
  const id = await provision(db, token, 1, profile('one'), pepper, now);
  assert.ok(id); assert.equal(await number(db, id), '1');
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM user_roles WHERE user_id=?').bind(id).first('n'), 0);
  assert.equal(await db.prepare('SELECT email_verified_at FROM users WHERE id=?').bind(id).first('email_verified_at'), null);
  await assert.rejects(db.prepare('UPDATE member_numbers SET member_number=2 WHERE user_id=?').bind(id).run());
  await assert.rejects(provision(db, token, 11, profile('outside'), pepper, now));
  await db.prepare(`DELETE FROM role_permissions WHERE permission_id=(SELECT id FROM permissions WHERE code='users.manage')`).run();
  await assert.rejects(provision(db, token, 2, profile('no_permission'), pepper, now));
  assert.equal(await number(db, actor), '12');
}));

test('concurrent reserved claims have one winner, failed creation rolls back claim, and deleted reserved numbers stay consumed', () => local(async ({ db }) => {
  await admin(db);
  const claims = await Promise.all([provision(db, token, 2, profile('twoA'), pepper, now), provision(db, token, 2, profile('twoB'), pepper, now)]);
  assert.equal(claims.filter(Boolean).length, 1); const id = claims.find(Boolean);
  await assert.rejects(provision(db, token, 3, { ...profile('collision'), nickname: (await db.prepare('SELECT nickname FROM user_nicknames WHERE user_id=?').bind(id).first('nickname')) }, pepper, now));
  assert.equal(await db.prepare('SELECT user_id FROM member_numbers WHERE member_number=3').first('user_id'), null);
  await db.batch([db.prepare('DELETE FROM user_password_credentials WHERE user_id=?').bind(id), db.prepare('DELETE FROM user_nicknames WHERE user_id=?').bind(id), db.prepare('DELETE FROM users WHERE id=?').bind(id)]);
  assert.equal(await provision(db, token, 2, profile('replacement'), pepper, now), null);
  assert.equal(await number(db, id), '2');
}));

test('64-bit INTEGER allocation and public formatting expand without JavaScript precision loss; exhaustion fails closed', () => local(async ({ db }) => {
  await user(db);
  await db.prepare("UPDATE sqlite_sequence SET seq=CAST('9223372036854775806' AS INTEGER) WHERE name='member_numbers'").run();
  const last = await user(db); assert.equal(await number(db, last), '9223372036854775807');
  assert.equal(formatMemberNumber(await number(db, last)), '#9223372036854775807');
  await assert.rejects(user(db));
  for (const [value, display] of [['1','#0001'], ['11','#0011'], ['9999','#9999'], ['10000','#10000']]) assert.equal(formatMemberNumber(value), display);
  for (const value of [11, '0','01','-1','1.5','9223372036854775808']) assert.equal(isMemberNumber(value), false);
}));
