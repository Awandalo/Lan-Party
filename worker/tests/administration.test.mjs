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
 if(admin)await sql("INSERT INTO user_roles(user_id,role_id,assigned_at) SELECT ?,id,0 FROM roles WHERE code='admin'",id).run();
 await sql('INSERT INTO auth_sessions(id,user_id,token_digest,auth_version,created_at,expires_at) VALUES (?,?,?,0,?,?)',randomUUID(),id,session.digest,time-1,time+604800).run();return{id,...session};
 };
 const request=(path,u,input,headers={})=>simulator.dispatchFetch(origin+'/api/'+path,{method:input===undefined?'GET':'POST',headers:{'X-LAN-Request':'1',...(u?{Cookie:'__Host-lan_session='+u.token}:{}),...headers}});
 await run({db,sql,user,value,request});
 assert.equal(await sql('PRAGMA quick_check').first('quick_check'),'ok');assert.deepEqual((await sql('PRAGMA foreign_key_check').all()).results,[]);
 }finally{await simulator.dispose();}
}
test('capabilities require a verified full session and explicit live grants',()=>local(async({request,user,sql})=>{
 assert.equal((await request('manage/capabilities')).status,401);
 const u=await user();assert.equal((await request('manage/capabilities',u)).status,403);
 await sql("INSERT INTO user_roles(user_id,role_id,assigned_at) SELECT ?,id,0 FROM roles WHERE code='admin'",u.id).run();
 const response=await request('manage/capabilities',u);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.deepEqual(await response.json(),{sections:['users','roles','events']});
 await sql("UPDATE roles SET is_active=0 WHERE code='admin'").run();assert.equal((await request('manage/capabilities',u)).status,403);
 await sql("UPDATE roles SET is_active=1 WHERE code='admin'").run();
 await sql('DELETE FROM user_roles WHERE user_id=?',u.id).run();assert.equal((await request('manage/capabilities',u)).status,403);
}));
test('individual grants reveal only their section, never role-name privileges or private data',()=>local(async({request,user,sql})=>{
 const u=await user({admin:true});await sql('DELETE FROM role_permissions').run();await sql("UPDATE roles SET code='event_staff' WHERE code='admin'").run();
 for(const [permission,section] of [['users.view','users'],['users.manage','users'],['roles.manage','roles'],['events.create','events'],['events.update','events'],['events.publish','events'],['events.cancel','events'],['events.manage_registrations','events']]){
 await sql("INSERT INTO role_permissions(role_id,permission_id,granted_at) SELECT r.id,p.id,0 FROM roles r,permissions p WHERE r.code='event_staff' AND p.code=?",permission).run();
 assert.deepEqual(await(await request('manage/capabilities',u)).json(),{sections:[section]});await sql('DELETE FROM role_permissions').run();
 }
 await sql("INSERT INTO role_permissions(role_id,permission_id,granted_at) SELECT r.id,p.id,0 FROM roles r,permissions p WHERE r.code='event_staff' AND p.code='news.create'").run();assert.equal((await request('manage/capabilities',u)).status,403);
}));
test('request boundaries and revoked, stale, unverified, disabled sessions deny access',()=>local(async({request,user,sql,value})=>{
 const u=await user({admin:true});
 assert.equal((await request('manage/capabilities',u,{})).status,405);
 for(const headers of [{'X-LAN-Request':''},{Origin:'https://example.test'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await request('manage/capabilities',u,undefined,headers)).status,403);
 assert.equal((await request('manage/capabilities?query=1',u)).status,403);
 await sql('UPDATE users SET email_verified_at=NULL WHERE id=?',u.id).run();assert.equal((await request('manage/capabilities',u)).status,401);
 await sql('UPDATE users SET email_verified_at=1,status="disabled" WHERE id=?',u.id).run();assert.equal((await request('manage/capabilities',u)).status,401);
 await sql("UPDATE users SET status='active',auth_version=auth_version+1 WHERE id=?",u.id).run();assert.equal((await request('manage/capabilities',u)).status,401);
 const v=await user({admin:true});await sql('UPDATE auth_sessions SET revoked_at=created_at WHERE user_id=?',v.id).run();assert.equal((await request('manage/capabilities',v)).status,401);
 const w=await user({admin:true}),expired=await value('session');await sql('INSERT INTO auth_sessions(id,user_id,token_digest,auth_version,created_at,expires_at) VALUES (?,?,?,0,0,1)',randomUUID(),w.id,expired.digest).run();assert.equal((await request('manage/capabilities',{...w,token:expired.token})).status,401);
}));

test('future assignments/grants and missing authorization tables fail closed',()=>local(async({user,request,sql})=>{
 const u=await user({admin:true});await sql('UPDATE user_roles SET assigned_at=unixepoch()+3600').run();assert.equal((await request('manage/capabilities',u)).status,403);
 await sql('UPDATE user_roles SET assigned_at=0').run();await sql('UPDATE role_permissions SET granted_at=unixepoch()+3600').run();assert.equal((await request('manage/capabilities',u)).status,403);
 await sql('ALTER TABLE role_permissions RENAME TO unavailable_permissions').run();assert.equal((await request('manage/capabilities',u)).status,503);
}));

test('session correlation rejects another session snapshot without returning grants',()=>local(async({user,request})=>{const a=await user({admin:true}),b=await user({admin:true});assert.equal((await request('manage/capabilities',a,undefined,{'X-LAN-Session-Proof':a.csrf})).status,200);assert.equal((await request('manage/capabilities',b,undefined,{'X-LAN-Session-Proof':a.csrf})).status,409);}));
