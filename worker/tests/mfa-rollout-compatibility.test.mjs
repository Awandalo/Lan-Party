import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url),wr=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=wr('miniflare'),{build}=wr('esbuild');
const origin='http://127.0.0.1:5173';

test('password-only Worker supports retained schema and additive 0013-0015 without retired provider dependencies',async()=>{
 const root=fileURLToPath(new URL('../../',import.meta.url));
 const script=(await build({stdin:{resolveDir:root,contents:`import app from './worker/index';import {localMailbox} from './worker/auth/email';
 globalThis.fetch=async()=>{throw Error('External traffic forbidden in compatibility fixture');};
 export default {async fetch(r,e){if(new URL(r.url).pathname==='/fixture')return Response.json(localMailbox.take('rollout@example.test',Math.floor(Date.now()/1000),'email-verification'));return app.fetch(r,e);}};`},bundle:true,write:false,format:'esm',platform:'browser'} )).outputFiles[0].text;
 const instance=new Miniflare(convertV4MiniflareOptions({modules:true,script,cf:false,compatibilityDate:'2026-10-11',d1Databases:{DB:randomUUID()},bindings:{REGISTRATION_MODE:'local-only',AUTH_SESSION_MODE:'local-only',AUTH_EMAIL_TRANSPORT:'local',AUTH_PUBLIC_ORIGIN:origin,PASSWORD_PEPPER:'11'.repeat(32),AUTH_RATE_LIMIT_SECRET:'22'.repeat(32),AUTH_LOCAL_MAIL_SECRET:'33'.repeat(32)}}));
 try{
  const db=await instance.getD1Database('DB'),migrations=[];
  for(const name of(await readdir(new URL('../../migrations/',import.meta.url))).filter(n=>/^\d{4}_.*\.sql$/.test(n)).sort()){
   let rest=(await readFile(new URL('../../migrations/'+name,import.meta.url),'utf8')).replace(/--[^\n]*/g,'').trim(),parts=[];
   while(rest){const end=rest.startsWith('CREATE TRIGGER')?rest.indexOf('\nEND;')+5:rest.indexOf(';')+1;if(end<=0||end===4)throw Error('Incomplete fixture SQL');parts.push(rest.slice(0,end));rest=rest.slice(end).trim();}migrations.push(parts);
  }
  assert.equal(migrations.length,15);for(const parts of migrations.slice(0,12))await db.batch(parts.map(s=>db.prepare(s)));
  const request=(action,input,headers={})=>instance.dispatchFetch(origin+'/api/auth/'+action,{method:input===undefined?'GET':'POST',headers:{Origin:origin,'X-LAN-Request':'1','Content-Type':'application/json',...headers},...(input===undefined?{}:{body:JSON.stringify(input)})});
  const profile={email:'rollout@example.test',nickname:'Rollout Fixture',firstName:'Fictional',lastName:'Tester',password:'fictional rollout password'};
  assert.equal((await request('register',profile)).status,202);
  const link=new URL((await(await instance.dispatchFetch(origin+'/fixture')).json()).url),proof=new URLSearchParams(link.hash.slice(1));
  assert.equal((await request('verify-email',{userId:proof.get('user'),token:proof.get('token')})).status,200);
  const snapshots={};for(const table of ['users','user_password_credentials','user_nicknames','user_auth_providers','member_numbers','sqlite_sequence','auth_email_daily_budget','auth_email_budget_extensions','registration_rate_limits']){
   // Names are fixed trusted fixture identifiers, never user input.
   snapshots[table]=(await db.prepare('SELECT * FROM '+table).all()).results;
  }
  for(const parts of migrations.slice(12))await db.batch(parts.map(s=>db.prepare(s)));
  for(const [table,expected] of Object.entries(snapshots))assert.deepEqual((await db.prepare('SELECT * FROM '+table).all()).results,expected,table);
  assert.equal(await db.prepare('SELECT count(*) n FROM auth_totp_factors').first('n'),0);
  const login=await request('login',{email:profile.email,password:profile.password});assert.equal(login.status,200);
  const Cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');assert.equal((await request('session',undefined,{Cookie})).status,200);
  const status=await request('mfa/status',undefined,{Cookie});assert.equal(status.status,200);assert.equal((await status.json()).enabled,false);
  assert.equal((await request('google/start',{purpose:'signin'})).status,404);
  assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);assert.equal(await db.prepare('PRAGMA quick_check').first('quick_check'),'ok');
 }finally{await instance.dispose();}
});
