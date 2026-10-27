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
let script, prodScript, migrations;
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
      // dispatchFetch preserves the URL but replaces Host with its loopback
      // transport address. Restore only this fixture-owned header, not Origin,
      // forwarded claims or URL. Production app code never sees this adapter.
      const headers=new Headers(request.headers),host=headers.get('X-Fixture-Host');
      headers.delete('X-Fixture-Host');
      if(host!==null){
        if(!/^127[.]0[.]0[.]1:[0-9]+$/.test(headers.get('Host')??''))throw Error('Unexpected fixture transport');
        headers.set('Host',host);
      }
      return app.fetch(new Request(request,{headers}),env);
    }};` }, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' })).outputFiles[0].text;
  prodScript = (await build({ stdin: { contents: script }, define: { __LAN_MFA_TARGET__: JSON.stringify('lan-party:9fbe3402-c26b-45fd-be67-71775e5e6a3e') }, bundle: true, write: false, format: 'esm', platform: 'browser' })).outputFiles[0].text;
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
async function local(run, overrides = {}, production = true, omitBootstrap = false) {
  const origin = production ? 'https://www.lan-party.club' : 'https://dev.lan-party.club';
  const instance = new Miniflare(convertV4MiniflareOptions({ modules: true, script: production ? prodScript : script, cf: false,
    compatibilityDate: '2026-10-11', d1Databases: { DB: randomUUID() },
    bindings: { AUTH_ENVIRONMENT: 'dev', REGISTRATION_MODE: 'hosted-dev', AUTH_SESSION_MODE: 'hosted-dev',
      AUTH_PUBLIC_ORIGIN: origin, AUTH_EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 'fictional-test-key',
      PASSWORD_PEPPER: '11'.repeat(32), AUTH_RATE_LIMIT_SECRET: '22'.repeat(32),
      AUTH_TURNSTILE_SITE_KEY: 'synthetic-site-key', TURNSTILE_SECRET_KEY: 'synthetic-only-turnstile-secret',
      AUTH_DEV_RECIPIENT_ALLOWLIST: '["hosted@example.test"]',
      AUTH_EMAIL_PROVIDER_DAILY_LIMIT: '100', AUTH_EMAIL_PROVIDER_MONTHLY_LIMIT: '3000',
      ...(production ? { AUTH_ENVIRONMENT: 'prod', REGISTRATION_MODE: 'hosted-prod', AUTH_SESSION_MODE: 'hosted-prod', AUTH_PROD_EMAIL_DAILY_LIMIT: '60', AUTH_PROD_EMAIL_MONTHLY_LIMIT: '1000' } : {}), ...overrides } }));
  try {
    const db = await instance.getD1Database('DB');
    for (const statements of (omitBootstrap ? migrations.slice(0,-1) : migrations)) await db.batch(statements.map(s => db.prepare(s)));
    let ordinal = 0;
    const request = (action, input, headers = {}, host = origin) => instance.dispatchFetch(host + '/api/auth/' + action, {
      method: input === undefined ? 'GET' : 'POST', ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      headers: { 'X-Fixture-Host': new URL(host).host, Origin: origin, 'Content-Type': 'application/json', 'X-LAN-Request': '1',
        'CF-Connecting-IP': `203.0.113.${++ordinal}`, ...headers } });
    const mails = async () => (await instance.dispatchFetch(origin + '/_fixture/mails')).json();
    const proof = mail => {
      const url = new URL(mail.text.match(/https:\/\/[^\s]+/)[0]); assert.equal(url.origin, origin);
      const parts = new URLSearchParams(url.hash.slice(1)); return { userId: parts.get('user'), token: parts.get('token') };
    };
    await run({ db, request, mails, proof });
  } finally { await instance.dispose(); }
}


const setup={PROD_OWNER_BOOTSTRAP_MODE:'enabled',PROD_OWNER_BOOTSTRAP_EMAIL:profile.email,PROD_OWNER_BOOTSTRAP_TOKEN:'77'.repeat(32)};
const proofHeader={'X-LAN-Owner-Bootstrap':'77'.repeat(32)};
const count=(db,table)=>db.prepare('SELECT count(*) n FROM '+table).first('n');
async function signup(f){assert.equal((await f.request('register',profile,proofHeader)).status,202);const row=await f.db.prepare('SELECT id,email_verified_at FROM users').first();assert.ok(row);return row;}
async function verify(f){const p=f.proof((await f.mails())[0]);assert.equal((await f.request('verify-email',p)).status,200);return p;}

test('first owner receives #0001 without privileges; only genuine one-use email verification atomically grants the seeded admin permissions',()=>local(async f=>{
 const u=await signup(f);assert.equal(u.email_verified_at,null);assert.equal(await count(f.db,'user_roles'),0);
 assert.equal(await f.db.prepare('SELECT member_number FROM member_numbers WHERE user_id=?').bind(u.id).first('member_number'),1);
 const hash=await f.db.prepare('SELECT password_hash FROM user_password_credentials').first('password_hash');assert.ok(hash&&!hash.includes(profile.password));
 assert.equal((await f.request('login',{email:profile.email,password:profile.password})).status,403);
 const p=f.proof((await f.mails())[0]);assert.equal((await f.request('verify-email',{...p,token:'88'.repeat(32)})).status,400);assert.equal(await count(f.db,'user_roles'),0);
 await verify(f);assert.equal(await count(f.db,'user_roles'),1);
 assert.equal(await f.db.prepare("SELECT count(*) n FROM user_roles ur JOIN roles r ON r.id=ur.role_id JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id WHERE r.code='admin' AND p.code='users.manage'").first('n'),1);
 const audit=await f.db.prepare('SELECT * FROM owner_bootstrap').first();assert.ok(audit.completed_at);assert.equal(audit.email_normalized,null);
 assert.equal((await f.request('verify-email',p)).status,400);assert.equal((await f.request('login',{email:profile.email,password:profile.password})).status,200);
 assert.equal((await f.request('register',{...profile,nickname:'Another Setup'},proofHeader)).status,202);assert.equal(await count(f.db,'users'),1);
 assert.equal(await f.db.prepare('PRAGMA quick_check').first('quick_check'),'ok');assert.deepEqual((await f.db.prepare('PRAGMA foreign_key_check').all()).results,[]);
},setup));

test('knowing the owner email is insufficient: missing/wrong capability, wrong email and cross-origin requests cannot claim a slot',()=>local(async f=>{
 for(const h of [{},{'X-LAN-Owner-Bootstrap':'66'.repeat(32)},{'X-LAN-Owner-Bootstrap':'bad'}])assert.equal((await f.request('register',profile,h)).status,202);
 assert.equal((await f.request('register',{...profile,email:'outsider@example.test'},proofHeader)).status,202);
 assert.equal((await f.request('register',profile,{...proofHeader,Origin:'https://evil.test'})).status,403);
 assert.equal(await count(f.db,'users'),0);assert.equal(await count(f.db,'owner_bootstrap'),0);assert.equal((await f.mails()).length,0);
},setup));

test('missing/invalid private config and malformed mode fail closed without falling back to ordinary allocation',async()=>{
 for(const bad of [{PROD_OWNER_BOOTSTRAP_TOKEN:''},{PROD_OWNER_BOOTSTRAP_EMAIL:''},{PROD_OWNER_BOOTSTRAP_MODE:'typo'}])await local(async f=>{
 assert.equal((await f.request('register',profile,proofHeader)).status,503);assert.equal(await count(f.db,'users'),0);
 },{...setup,...bad});
});

test('concurrent valid signup attempts serialize to one account, one receipt and one reserved number',()=>local(async f=>{
 const responses=await Promise.all([f.request('register',profile,proofHeader),f.request('register',{...profile,nickname:'Concurrent Owner'},proofHeader)]);
 assert.ok(responses.every(r=>r.status===202));assert.equal(await count(f.db,'users'),1);assert.equal(await count(f.db,'owner_bootstrap'),1);
 assert.equal(await f.db.prepare('SELECT count(*) n FROM member_numbers WHERE registered=1').first('n'),1);
},setup));

test('existing accounts block bootstrap and the existing ledger guard still rejects arbitrary reserved claims',()=>local(async f=>{
 const id=randomUUID();await f.db.prepare("INSERT INTO users(id,first_name,last_name,email,email_normalized,created_at,updated_at) VALUES (?,'Fictional','Existing','existing@example.test','existing@example.test',1,1)").bind(id).run();
 assert.equal((await f.request('register',profile,proofHeader)).status,202);assert.equal(await count(f.db,'users'),1);assert.equal(await count(f.db,'owner_bootstrap'),0);
 await assert.rejects(f.db.prepare('UPDATE member_numbers SET user_id=?,reserved_by_user_id=? WHERE member_number=1').bind(randomUUID(),id).run());
},setup));

test('verification and privilege completion roll back together if the seeded admin grant is unavailable',()=>local(async f=>{
 const u=await signup(f),p=f.proof((await f.mails())[0]);await f.db.prepare("UPDATE roles SET is_active=0 WHERE code='admin'").run();
 assert.equal((await f.request('verify-email',p)).status,503);assert.equal(await f.db.prepare('SELECT email_verified_at FROM users WHERE id=?').bind(u.id).first('email_verified_at'),null);
 assert.equal(await f.db.prepare("SELECT consumed_at FROM auth_action_tokens WHERE purpose='email-verification'").first('consumed_at'),null);
 assert.equal(await count(f.db,'user_roles'),0);assert.equal(await f.db.prepare('SELECT completed_at FROM owner_bootstrap').first('completed_at'),null);
},setup));

test('receipt cannot be deleted, replaced or reopened; normal deletion erases identity while preserving the consumed marker',()=>local(async f=>{
 const u=await signup(f);await verify(f);
 await assert.rejects(f.db.prepare('DELETE FROM owner_bootstrap').run());
 await assert.rejects(f.db.prepare('UPDATE owner_bootstrap SET completed_at=NULL').run());
 await assert.rejects(f.db.prepare("INSERT OR REPLACE INTO owner_bootstrap(singleton,user_id,email_normalized,created_at) VALUES(1,?,'fake@example.test',1)").bind(randomUUID()).run());
 // Synthetic DB fixture exercises exactly the deletion flow's initial transition.
 await f.db.prepare("INSERT INTO account_lifecycle(user_id,state,deactivated_at) VALUES (?,'deleting',unixepoch())").bind(u.id).run();
 await f.db.prepare("UPDATE users SET status='disabled' WHERE id=?").bind(u.id).run();
 const r=await f.db.prepare('SELECT * FROM owner_bootstrap').first();assert.equal(r.user_id,null);assert.equal(r.email_normalized,null);assert.ok(r.completed_at);
 await assert.rejects(f.db.prepare('DELETE FROM owner_bootstrap').run());
},setup));

test('DEV ignores PROD bootstrap bindings and regular PROD registration remains #0011 when bootstrap is disabled',async()=>{
 await local(async f=>{assert.equal((await f.request('register',profile)).status,202);assert.equal(await f.db.prepare('SELECT member_number FROM member_numbers WHERE registered=1').first('member_number'),11);assert.equal(await count(f.db,'owner_bootstrap'),0);},{...setup,PROD_OWNER_BOOTSTRAP_MODE:'disabled'});
 await local(async f=>{assert.equal((await f.request('register',profile)).status,202);assert.equal(await f.db.prepare('SELECT member_number FROM member_numbers WHERE registered=1').first('member_number'),11);assert.equal(await count(f.db,'owner_bootstrap'),0);},setup,false);
});


test('missing bootstrap migration fails closed, and unchanged disabled modes do not need it',async()=>{
 await local(async f=>{assert.equal((await f.request('register',profile,proofHeader)).status,503);assert.equal(await count(f.db,'users'),0);},setup,true,true);
 await local(async f=>{assert.equal((await f.request('register',profile,proofHeader)).status,404);assert.equal(await count(f.db,'users'),0);},{...setup,REGISTRATION_MODE:'disabled',AUTH_SESSION_MODE:'disabled'},true,true);
});

test('a failed credential/profile transaction rolls back both the one-time receipt and reserved claim',()=>local(async f=>{
 await f.db.prepare("CREATE TRIGGER fixture_failure BEFORE INSERT ON user_nicknames BEGIN SELECT RAISE(ABORT,'synthetic fault'); END;").run();
 assert.equal((await f.request('register',profile,proofHeader)).status,503);assert.equal(await count(f.db,'users'),0);assert.equal(await count(f.db,'owner_bootstrap'),0);
 assert.equal(await f.db.prepare('SELECT count(*) n FROM member_numbers WHERE member_number=1 AND user_id IS NULL AND registered=0').first('n'),1);
},setup));

test('revoked verification does not grant owner privileges or consume the completion receipt',()=>local(async f=>{
 await signup(f);const p=f.proof((await f.mails())[0]);
 await f.db.prepare("UPDATE auth_action_tokens SET revoked_at=created_at WHERE purpose='email-verification'").run();
 assert.equal((await f.request('verify-email',p)).status,400);assert.equal(await count(f.db,'user_roles'),0);assert.equal(await f.db.prepare('SELECT completed_at FROM owner_bootstrap').first('completed_at'),null);
},setup));


test('verified owner retains last-admin protection; approved normal deletion scrubs the receipt and cannot reopen setup on an empty database',()=>local(async f=>{
 await signup(f);await verify(f);
 const login=await f.request('login',{email:profile.email,password:profile.password});assert.equal(login.status,200);
 const Cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 const session=await(await f.request('session',undefined,{Cookie})).json(),headers={Cookie,'X-CSRF-Token':session.csrfToken};
 assert.equal((await f.request('lifecycle/delete/prepare',{confirm:'PREPARE_DELETE'},headers)).status,409);
 const other=randomUUID();await f.db.prepare("INSERT INTO users(id,first_name,last_name,email,email_normalized,email_verified_at,created_at,updated_at) VALUES (?,'Fictional','Admin','second@example.test','second@example.test',unixepoch(),unixepoch(),unixepoch())").bind(other).run();
 await f.db.prepare("INSERT INTO user_roles(user_id,role_id,assigned_at) SELECT ?,id,unixepoch() FROM roles WHERE code='admin'").bind(other).run();
 assert.equal((await f.request('lifecycle/delete/prepare',{confirm:'PREPARE_DELETE'},headers)).status,200);
 assert.equal((await f.request('lifecycle/delete',{confirm:'DELETE',acknowledged:true},headers)).status,200);
 const audit=await f.db.prepare('SELECT * FROM owner_bootstrap').first();assert.equal(audit.user_id,null);assert.equal(audit.email_normalized,null);assert.ok(audit.completed_at);
 // Remove the second synthetic fixture account, not a hosted account.
 await f.db.prepare('DELETE FROM user_roles WHERE user_id=?').bind(other).run();await f.db.prepare('DELETE FROM users WHERE id=?').bind(other).run();
 assert.equal(await count(f.db,'users'),0);
 assert.equal((await f.request('register',profile,proofHeader)).status,202);assert.equal(await count(f.db,'users'),0);
 assert.equal(await f.db.prepare('SELECT retired FROM member_numbers WHERE member_number=1').first('retired'),1);
 assert.deepEqual((await f.db.prepare('PRAGMA foreign_key_check').all()).results,[]);
},{...setup,MFA_ENCRYPTION_KEYS:JSON.stringify({fixture:'33'.repeat(32)}),MFA_ACTIVE_KEY_ID:'fixture'}));


test('fixture restores only transport Host; application still rejects hostile Host, Origin and forwarded claims',()=>local(async f=>{
 assert.equal((await f.request('lifecycle/status',undefined)).status,401);
 for(const headers of [{'X-Fixture-Host':'evil.test'},{Origin:'https://evil.test'},{Forwarded:'host=www.lan-party.club'},{'X-Forwarded-Host':'www.lan-party.club'}]){
  assert.equal((await f.request('lifecycle/status',undefined,headers)).status,404);
 }
 assert.equal(await count(f.db,'users'),0);
},{...setup,MFA_ENCRYPTION_KEYS:JSON.stringify({fixture:'33'.repeat(32)}),MFA_ACTIVE_KEY_ID:'fixture'}));
