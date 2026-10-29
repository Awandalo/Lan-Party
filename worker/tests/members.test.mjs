import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {before,test} from 'node:test';
const require=createRequire(import.meta.url),wr=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=wr('miniflare'),{build}=wr('esbuild');
const origin='http://127.0.0.1:5173';
let script,migrations;
before(async()=>{
 script=(await build({stdin:{resolveDir:fileURLToPath(new URL('../../',import.meta.url)),contents:`
 import app from './worker/index';import {sessionCsrfToken} from './worker/auth/csrf';import {generateToken,digestToken} from './worker/auth/tokens';
 export default{async fetch(request,env){if(new URL(request.url).pathname!='/fixture')return app.fetch(request,env);
 const token=generateToken();const digest=await digestToken(token,'session');return Response.json({token,digest,csrf:await sessionCsrfToken(digest,env.AUTH_RATE_LIMIT_SECRET)});}};`},bundle:true,write:false,format:'esm',platform:'browser'})).outputFiles[0].text;
 migrations=[];
 for(const name of(await readdir(new URL('../../migrations/',import.meta.url))).filter(n=>/^\d{4}_.*\.sql$/.test(n)).sort()){
 let rest=(await readFile(new URL('../../migrations/'+name,import.meta.url),'utf8')).replace(/--[^\n]*/g,'').trim(),parts=[];
 while(rest){const end=rest.startsWith('CREATE TRIGGER')?rest.indexOf('\nEND;')+5:rest.indexOf(';')+1;if(end<=0||end===4)throw Error('Incomplete SQL '+name);parts.push(rest.slice(0,end));rest=rest.slice(end).trim();}migrations.push(parts);
 }
});
async function local(run){
 const simulator=new Miniflare(convertV4MiniflareOptions({modules:true,script,compatibilityDate:'2026-10-11',cf:false,d1Databases:{DB:randomUUID()},bindings:{AUTH_RATE_LIMIT_SECRET:'33'.repeat(32),AUTH_SESSION_MODE:'local-only',AUTH_EMAIL_TRANSPORT:'local',AUTH_PUBLIC_ORIGIN:origin}}));
 try{
 const db=await simulator.getD1Database('DB'),sql=(q,...args)=>db.prepare(q).bind(...args);
 for(const parts of migrations)await db.batch(parts.map(p=>db.prepare(p)));
 const value=async()=> (await simulator.dispatchFetch(origin+'/fixture')).json();
 const user=async({admin=false}={})=>{
 const id=randomUUID(),time=await sql('SELECT unixepoch() n').first('n'),session=await value();
 await sql("INSERT INTO users(id,first_name,last_name,email,email_normalized,email_verified_at,created_at,updated_at) VALUES (?,'Fictional','Person',?,?,?,?,?)",id,id+'@example.test',id+'@example.test',time-10,time-10,time-10).run();
  if(admin){
 await sql("INSERT OR IGNORE INTO roles(id,code,name,is_active,created_at,updated_at) VALUES ('30000000-0000-4000-8000-000000000001','fixture_admin','Fictional delegated staff',1,0,0)").run();
 await sql("INSERT OR IGNORE INTO role_permissions(role_id,permission_id,granted_at) SELECT '30000000-0000-4000-8000-000000000001',permission_id,0 FROM role_permissions WHERE role_id='1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7'").run();
 await sql("INSERT INTO user_roles(user_id,role_id,assigned_at) VALUES (?,'30000000-0000-4000-8000-000000000001',0)",id).run();
 }
 await sql('INSERT INTO auth_sessions(id,user_id,token_digest,auth_version,created_at,expires_at) VALUES (?,?,?,0,?,?)',randomUUID(),id,session.digest,time-1,time+604800).run();return{id,...session};
 };
 const request=(path,u,input,headers={})=>simulator.dispatchFetch(origin+'/api/'+path,{method:input===undefined?'GET':'POST',headers:{'X-LAN-Request':'1',...(u?{Cookie:'__Host-lan_session='+u.token}:{}),...headers}});
 await run({db,sql,user,value,request});
 assert.equal(await sql('PRAGMA quick_check').first('quick_check'),'ok');assert.deepEqual((await sql('PRAGMA foreign_key_check').all()).results,[]);
 }finally{await simulator.dispose();}
}
async function target(f,{nickname='Fictional '+randomUUID().slice(0,8),number=null,state='active',verified=true}={}){
 if(number)await f.sql("UPDATE sqlite_sequence SET seq=CAST(? AS INTEGER)-1 WHERE name='member_numbers'",number).run();
 const u=await f.user();
 if(nickname!==null)await f.sql('INSERT INTO user_nicknames(user_id,nickname,created_at,updated_at) VALUES (?,?,0,0)',u.id,nickname).run();

 if(!verified)await f.sql('UPDATE users SET email_verified_at=NULL WHERE id=?',u.id).run();
 if(state!=='active'){
  await f.sql("UPDATE users SET status='disabled' WHERE id=?",u.id).run();
  if(['deactivated','deleting'].includes(state))await f.sql('INSERT INTO account_lifecycle VALUES (?,?,0)',u.id,state).run();
 }
 return {...u,number:await f.sql('SELECT CAST(member_number AS TEXT) n FROM member_numbers WHERE user_id=?',u.id).first('n')};
}
const get=(f,path,u,headers={})=>f.request('manage/users'+path,u,undefined,{'X-LAN-Session-Proof':u?.csrf??'00'.repeat(32),...headers});
async function body(f,path,u){const r=await get(f,path,u);assert.equal(r.status,200,await r.clone().text());assert.equal(r.headers.get('cache-control'),'no-store');return r.json();}
async function grant(f,u,code){await f.sql('DELETE FROM role_permissions').run();await f.sql("INSERT INTO role_permissions(role_id,permission_id,granted_at) SELECT r.id,p.id,0 FROM roles r,permissions p WHERE r.code='fixture_admin' AND p.code=?",code).run();}

test('directory and detail require users.view, not shell access, role labels or other management grants',()=>local(async f=>{
 const t=await target(f),ordinary=await f.user(),admin=await f.user({admin:true});
 for(const path of ['', '/'+t.id]){
  assert.equal((await get(f,path)).status,401);assert.equal((await get(f,path,ordinary)).status,403);
  for(const code of ['users.manage','roles.manage','events.create']){await grant(f,admin,code);assert.equal((await get(f,path,admin)).status,403);}
  await grant(f,admin,'users.view');assert.equal((await get(f,path,admin)).status,200);
 }
 await f.sql("UPDATE roles SET code='read_staff' WHERE code='fixture_admin'").run();assert.equal((await get(f,'',admin)).status,200);
 await f.sql("UPDATE roles SET is_active=0 WHERE code='read_staff'").run();assert.equal((await get(f,'',admin)).status,403);
 await f.sql("UPDATE roles SET is_active=1 WHERE code='read_staff'").run();await f.sql('UPDATE user_roles SET assigned_at=unixepoch()+3600 WHERE user_id=?',admin.id).run();assert.equal((await get(f,'',admin)).status,403);
}));
test('list has only approved columns; detail projects only approved private fields and queries do not mutate data',()=>local(async f=>{
 const admin=await f.user({admin:true}),t=await target(f,{verified:false});
 const before=await f.sql('SELECT * FROM users WHERE id=?',t.id).first();
 const page=await body(f,'',admin);assert.equal(page.members.length,2);assert.deepEqual(Object.keys(page.members[0]).sort(),['memberNumber','nickname','roles','status','userId']);assert.equal(page.members.find(r=>r.userId===t.id).memberNumber,t.number);
 const detail=(await body(f,'/'+t.id,admin)).member;assert.deepEqual(Object.keys(detail).sort(),['createdAt','email','firstName','lastName','memberNumber','nickname','prefix','roles','status','userId','verified']);assert.equal(detail.verified,false);assert.equal(detail.firstName,'Fictional');assert.equal(detail.prefix,null);
 assert.deepEqual(await f.sql('SELECT * FROM users WHERE id=?',t.id).first(),before);
}));
test('lifecycle filters distinguish disabled/deactivated/deleting; scrubbed names stay unavailable; reserved and tombstone rows never become accounts',()=>local(async f=>{
 const admin=await f.user({admin:true});await target(f);const d=await target(f,{state:'deactivated'}),legacy=await target(f,{state:'disabled'}),deleting=await target(f,{state:'deleting'}),missing=await target(f,{nickname:null});
 await f.sql("UPDATE users SET first_name='Deactivated',last_name='User' WHERE id=?",d.id).run();
 const tombstone=await target(f);await f.sql('DELETE FROM user_nicknames WHERE user_id=?',tombstone.id).run();await f.sql('DELETE FROM auth_sessions WHERE user_id=?',tombstone.id).run();await f.sql('DELETE FROM users WHERE id=?',tombstone.id).run();
 const retired=await target(f,{state:'deleting'});await f.sql('UPDATE member_numbers SET retired=1,user_id=NULL,reserved_by_user_id=NULL WHERE user_id=?',retired.id).run();await f.sql('DELETE FROM account_lifecycle WHERE user_id=?',retired.id).run();await f.sql('DELETE FROM user_nicknames WHERE user_id=?',retired.id).run();await f.sql('DELETE FROM auth_sessions WHERE user_id=?',retired.id).run();await f.sql('DELETE FROM users WHERE id=?',retired.id).run();
 assert.equal((await body(f,'',admin)).members.length,3);
 assert.deepEqual((await body(f,'?status=deactivated',admin)).members.map(r=>r.userId),[d.id]);
 assert.deepEqual((await body(f,'?status=disabled',admin)).members.map(r=>[r.userId,r.status]),[[legacy.id,'disabled'],[deleting.id,'deleting']]);
 const row=(await body(f,'/'+d.id,admin)).member;assert.equal(row.firstName,null);assert.equal(row.lastName,null);assert.equal(row.prefix,null);assert.equal((await body(f,'/'+missing.id,admin)).member.nickname,null);
 assert.equal((await get(f,'/'+randomUUID(),admin)).status,404);
}));
test('combined substring and numeric search treats wildcards literally and retains 64-bit precision',()=>local(async f=>{
 const admin=await f.user({admin:true});const a=await target(f,{nickname:'Prefix_Name'});await target(f,{nickname:'PrefixXName'});const big=await target(f,{nickname:'HugeMember',number:'9007199254740993'});
 assert.deepEqual((await body(f,'?search=PREFIX_',admin)).members.map(r=>r.userId),[a.id]);
 assert.deepEqual((await body(f,'?search=FIX_NA',admin)).members.map(r=>r.userId),[a.id]);
 const mixed=await target(f,{nickname:'Player'+a.number+'End'});
 assert.deepEqual((await body(f,'?search='+a.number,admin)).members.map(r=>r.userId),[a.id,mixed.id]);
 const both=await target(f,{nickname:'Member9007199254740995',number:'9007199254740995'});
 assert.deepEqual((await body(f,'?search='+both.number,admin)).members.map(r=>r.userId),[both.id]);
 for(const q of ['%','\\',"x' OR 1=1 --",'é','😀'])assert.equal((await body(f,'?search='+encodeURIComponent(q),admin)).members.length,0);
 assert.equal((await body(f,'?search=%230000'+a.number,admin)).members[0].userId,a.id);
 assert.equal((await body(f,'?search=9007199254740993',admin)).members[0].memberNumber,big.number);
 assert.deepEqual((await body(f,'?search=0',admin)).members.map(r=>r.userId),[both.id]);
 for(const q of ['9223372036854775808','999999999999999999999999'])assert.equal((await body(f,'?search='+q,admin)).members.length,0);
 for(const query of ['kind=email','limit=51','limit=0','limit=20&limit=10','search=1234567890123456789012345','search=%00','unknown=1','cursor=bad'])assert.equal((await get(f,'?'+query,admin)).status,400,query);
}));
test('stable bounded cursor pages bind query criteria, exclude duplicates from multiple roles and survive insert between pages',()=>local(async f=>{
 const admin=await f.user({admin:true}),rows=[];for(let i=0;i<23;i++)rows.push(await target(f,{nickname:'Page '+String(i).padStart(2,'0')}));
 await f.sql("INSERT INTO roles(id,code,name,is_active,created_at,updated_at) VALUES ('40000000-0000-4000-8000-000000000001','fixture_role','Fictional ordinary role',1,0,0)").run();
 await f.sql("INSERT INTO user_roles(user_id,role_id,assigned_at) SELECT ?,id,0 FROM roles WHERE code IN ('admin','fixture_role')",rows[0].id).run();
 assert.equal((await body(f,'?limit=50',admin)).members.length,24);
 const first=await body(f,'',admin);assert.equal(first.members.length,20);assert.ok(first.nextCursor);assert.equal(first.members.find(r=>r.userId===rows[0].id).roles.length,2);
 await f.sql("UPDATE roles SET is_active=0 WHERE code='fixture_role'").run();assert.equal((await body(f,'/'+rows[0].id,admin)).member.roles.find(r=>r.code==='fixture_role').active,false);
 await target(f,{nickname:'Page inserted'});const next=await body(f,'?cursor='+encodeURIComponent(first.nextCursor),admin);assert.equal(next.members.length,5);assert.equal(next.nextCursor,null);assert.equal(new Set([...first.members,...next.members].map(r=>r.userId)).size,25);
 assert.equal((await get(f,'?status=disabled&cursor='+encodeURIComponent(first.nextCursor),admin)).status,400);
 assert.equal((await get(f,'?limit=10&cursor='+encodeURIComponent(first.nextCursor),admin)).status,400);
 assert.equal((await get(f,'?search=Page&cursor='+encodeURIComponent(first.nextCursor),admin)).status,400);
 const matching=await body(f,'?search=age&limit=10',admin);assert.equal(matching.members.length,10);
 const matchingNext=await body(f,'?search=age&limit=10&cursor='+encodeURIComponent(matching.nextCursor),admin);
 assert.equal(new Set([...matching.members,...matchingNext.members].map(r=>r.userId)).size,20);
 assert.deepEqual((await body(f,'',admin)).members.map(r=>r.userId),first.members.map(r=>r.userId));
 const removed=first.members.at(-1).userId;await f.sql('DELETE FROM user_nicknames WHERE user_id=?',removed).run();await f.sql('DELETE FROM auth_sessions WHERE user_id=?',removed).run();await f.sql('DELETE FROM users WHERE id=?',removed).run();assert.deepEqual((await body(f,'?cursor='+encodeURIComponent(first.nextCursor),admin)).members.map(r=>r.userId),next.members.map(r=>r.userId));
}));
test('revocation, disabled sessions, context mismatch, request boundaries and database failures clear access',()=>local(async f=>{
 const admin=await f.user({admin:true}),other=await f.user({admin:true}),t=await target(f);
 assert.equal((await f.request('manage/users',admin)).status,403);assert.equal((await get(f,'/not-a-uuid',admin)).status,400);
 assert.equal((await get(f,'',admin,{'X-LAN-Session-Proof':other.csrf})).status,409);
 assert.equal((await get(f,'',admin,{'X-LAN-Request':''})).status,403);assert.equal((await get(f,'',admin,{Origin:'https://example.test'})).status,403);
 assert.equal((await f.request('manage/users',admin,{})).status,405);
 await f.sql('DELETE FROM user_roles WHERE user_id=?',admin.id).run();assert.equal((await get(f,'/'+t.id,admin)).status,403);
 await f.sql('UPDATE auth_sessions SET revoked_at=created_at WHERE user_id=?',other.id).run();assert.equal((await get(f,'',other)).status,401);
 const disabled=await f.user({admin:true});await f.sql("UPDATE users SET status='disabled' WHERE id=?",disabled.id).run();assert.equal((await get(f,'',disabled)).status,401);
 const active=await f.user({admin:true});await f.sql('ALTER TABLE user_nicknames RENAME TO unavailable_nicknames').run();assert.equal((await get(f,'',active)).status,503);
}));
