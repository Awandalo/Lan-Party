import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {before,test} from 'node:test';
const require=createRequire(import.meta.url),wr=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=wr('miniflare'),{build}=wr('esbuild');
const origin='http://127.0.0.1:5173',keys={MFA_ENCRYPTION_KEYS:JSON.stringify({fixture:'44'.repeat(32)}),MFA_ACTIVE_KEY_ID:'fixture'};
const profile={nickname:'Recovery Fixture',firstName:'Fictional',lastName:'Participant',email:'recovery@example.test',password:'fictional recovery password'};
let script,migrations;
before(async()=>{
 script=(await build({stdin:{resolveDir:fileURLToPath(new URL('../../',import.meta.url)),contents:`
 import {startSessionRecovery} from './worker/auth/mfa-recovery-session';
 import app from './worker/index';import * as recovery from './worker/auth/mfa-recovery';
 import * as cryptoMfa from './worker/auth/mfa-crypto';import {localMailbox} from './worker/auth/email';
 import {pendingLogin,completePrimary} from './worker/auth/mfa-login';import {LoginLimiter} from './worker/auth/login-limits';
 import {primaryResponse} from './worker/auth/mfa-http';
 import {generate} from '@otplib/totp';import {crypto as otpCrypto} from '@otplib/plugin-crypto-web';import {base32} from '@otplib/plugin-base32-scure';
 let failNotices=false,fixtureTime;const realNow=Date.now.bind(Date);Date.now=()=>fixtureTime??realNow();const send=localMailbox.send.bind(localMailbox);
 localMailbox.send=async mail=>{if(failNotices&&mail.purpose==='mfa-replaced')throw Error('Fictional notice failure');return send(mail);};
 globalThis.fetch=async(input,init)=>{
  if(String(input)==='https://challenges.cloudflare.com/turnstile/v0/siteverify')return Response.json({success:JSON.parse(init.body).response==='fictional-proof',hostname:'127.0.0.1',action:'login'});
  throw Error('External network blocked');
 };
 export default {async fetch(request,env){
  if(new URL(request.url).pathname!=='/fixture')return app.fetch(request,env);
  const {action,args=[]}=await request.json();try{
   if(action==='handoffRace'){
    const [context,user,version,session,change]=args;
    const db={prepare:sql=>env.DB.prepare(sql),async batch(statements){
     if(change==='revoke')await env.DB.prepare('UPDATE auth_sessions SET revoked_at=unixepoch() WHERE token_digest=?').bind(session).run();
     if(change==='generation')await env.DB.prepare('UPDATE users SET auth_version=auth_version+1,updated_at=unixepoch() WHERE id=?').bind(user).run();
     if(change==='set')await env.DB.prepare('UPDATE auth_totp_factors SET recovery_set_id=? WHERE user_id=?').bind(crypto.randomUUID(),user).run();
     return env.DB.batch(statements);
    }};
    await startSessionRecovery(db,context,user,version,session,env,'local');return Response.json(true);
   }
   if(action==='clock'){fixtureTime=args[0]===null?undefined:args[0]*1000;return Response.json(true);}
   if(action==='primaryCookies')return primaryResponse(request,args[0]);
   if(action==='mail')return Response.json(localMailbox.take('recovery@example.test',Math.floor(Date.now()/1000),args[0]??'email-verification'));
   if(action==='failNotice'){failNotices=true;return Response.json(true);}
   if(action==='signals'){fixtureTime=realNow();const limiter=await LoginLimiter.create(env.DB,env.AUTH_RATE_LIMIT_SECRET,args[0]);for(let i=0;i<60;i++)await limiter.observe();return Response.json(true);}
   if(action==='otp')return Response.json(await generate({secret:base32.decode(args[0]),crypto:otpCrypto,epoch:args[1]}));
   if(action==='primary')return Response.json(await completePrimary(env.DB,...args));
   if(action==='pending')return Response.json(await pendingLogin(env.DB,...args));
   if(['startRecovery','commitRecovery','revealRecovery','revealAfterAck'].includes(action)){
    const [c,code,configuration=env,expiredLease=false]=args;
    const op=await recovery.recoveryOperation(env.DB,c),pending=op?null:await pendingLogin(env.DB,c.token,c.browser,c.now);
    const limiter=await LoginLimiter.create(env.DB,env.AUTH_RATE_LIMIT_SECRET,'fixture',()=>c.now);
    const held=await limiter.reserveMfa(op?.user_id??pending.user_id,op?.source_digest??pending.token_digest);
    try{
     if(expiredLease)await env.DB.prepare('UPDATE registration_rate_limits SET expires_at=0').run();
     const guarded=action==='revealAfterAck'?{prepare(sql){const statement=env.DB.prepare(sql);if(!sql.startsWith('SELECT 1 AS allowed'))return statement;
      return {bind(...values){return {async first(){await recovery.closeRecovery(env.DB,c,true);return statement.bind(...values).first();}};}};}}:env.DB;
     const result=action==='startRecovery'?await recovery.startRecovery(env.DB,c,pending,code,configuration,'local',held):
      action==='revealRecovery'||action==='revealAfterAck'?await recovery.revealRecovery(guarded,c,configuration,'local',held):await recovery[action](env.DB,c,code,configuration,'local',held);
     await held.finish(!result);return Response.json(result);
    }finally{await held.finish(false);}
   }
   if(recovery[action])return Response.json(await recovery[action](env.DB,...args)??null);
   if(cryptoMfa[action])return Response.json(await cryptoMfa[action](...args));
   throw Error('Unknown fixture action');
  }catch{return Response.json({error:'Fictional operation rejected'},{status:409});}
 }};`},bundle:true,write:false,format:'esm',platform:'browser'})).outputFiles[0].text;
 migrations=[];
 for(const name of(await readdir(new URL('../../migrations/',import.meta.url))).filter(n=>/^\d{4}_.*\.sql$/.test(n)).sort()){
  let rest=(await readFile(new URL('../../migrations/'+name,import.meta.url),'utf8')).replace(/--[^\n]*/g,'').trim(),parts=[];
  while(rest){const end=rest.startsWith('CREATE TRIGGER')?rest.indexOf('\nEND;')+5:rest.indexOf(';')+1;if(end<=0||end===4)throw Error('Incomplete SQL');parts.push(rest.slice(0,end));rest=rest.slice(end).trim();}migrations.push(parts);
 }
});
const jar=r=>r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
async function local(run,{upgrade=false}={}){
 const instance=new Miniflare(convertV4MiniflareOptions({modules:true,script,cf:false,compatibilityDate:'2026-10-11',d1Databases:{DB:randomUUID()},bindings:{
  REGISTRATION_MODE:'local-only',AUTH_SESSION_MODE:'local-only',AUTH_EMAIL_TRANSPORT:'local',AUTH_PUBLIC_ORIGIN:origin,
  PASSWORD_PEPPER:'11'.repeat(32),AUTH_RATE_LIMIT_SECRET:'22'.repeat(32),AUTH_LOCAL_MAIL_SECRET:'33'.repeat(32),...keys,

  AUTH_TURNSTILE_SITE_KEY:'fictional-site',TURNSTILE_SECRET_KEY:'fictional-turnstile-secret-only'}}));
 try{
  const db=await instance.getD1Database('DB');for(const parts of migrations.slice(0,upgrade?13:migrations.length))await db.batch(parts.map(s=>db.prepare(s)));
  const raw=(action,...args)=>instance.dispatchFetch(origin+'/fixture',{method:'POST',body:JSON.stringify({action,args})});
  const call=async(action,...args)=>{const r=await raw(action,...args);assert.equal(r.status,200,action);return r.json();};
  let ordinal=0;
  const request=(path,input,headers={})=>instance.dispatchFetch(origin+'/api/auth/'+path,{method:input===undefined?'GET':'POST',...(input===undefined?{}:{body:JSON.stringify(input)}),headers:{Origin:origin,'X-LAN-Request':'1','Content-Type':'application/json','CF-Connecting-IP':`203.0.113.${++ordinal}`,...headers}});
  assert.equal((await request('register',profile)).status,202);
  const link=new URL((await call('mail')).url),proof=new URLSearchParams(link.hash.slice(1));
  assert.equal((await request('verify-email',{userId:proof.get('user'),token:proof.get('token')})).status,200);
  const login=await request('login',{email:profile.email,password:profile.password}),headers={Cookie:jar(login)};
  headers['X-CSRF-Token']=(await(await request('session',undefined,headers)).json()).csrfToken;
  const setup=await(await request('mfa/enroll/start',{},headers)).json();let now=Math.floor(Date.now()/1000);
  const codes=await(await request('mfa/enroll/verify',{token:setup.token,code:await call('otp',setup.secret,now)},headers)).json();
  assert.equal((await request('mfa/enroll/activate',{token:setup.token,acknowledgment:codes.acknowledgment},headers)).status,200);
  if(upgrade)await db.batch(migrations[13].map(s=>db.prepare(s)));

  now=Math.floor(Date.now()/1000);
  const user=await db.prepare('SELECT * FROM users').first(),factor=await db.prepare('SELECT * FROM auth_totp_factors').first();
  const pending=await call('primary',{userId:user.id,authVersion:user.auth_version,status:'active',emailVerifiedAt:now},'password',now);
  const c={token:pending.token,browser:pending.browser,now};
  const Cookie=`lan_mfa_local_pending=${c.token}; lan_mfa_local_browser=${c.browser}`;
  const status=await(await request('mfa/recovery/status',undefined,{Cookie})).json();
  const h={Cookie,'X-CSRF-Token':status.csrfToken};
  const start=async()=>{const response=await request('mfa/recovery/start',{code:codes.codes[0],confirmed:true},h);
   if(response.ok&&response.headers.get('set-cookie'))h.Cookie=jar(response);
   const created=await db.prepare('SELECT created_at FROM auth_mfa_recovery_operations').first('created_at');
   if(created!==null)c.now=Math.max(c.now,created);return response;};
  const begin=async()=>{assert.equal((await start()).status,200);return call('recoverySetup',c,keys,'local');};
  const commit=async()=>{const replacement=await begin();const code=await call('otp',replacement.secret,c.now);assert.ok(await call('commitRecovery',c,code));return replacement;};
  await run({db,request,raw,call,c,h,codes:codes.codes,oldSetup:setup,user,factor,start,begin,commit,instance,pending});
 }finally{
  try{await instance.dispatchFetch(origin+'/fixture',{method:'POST',body:JSON.stringify({action:'clock',args:[null]})});}
  finally{await instance.dispose();}
 }
}

test('last code starts restricted recovery, atomically replaces factor and preserves account/ledger',()=>local(async f=>{
 const {db,c,call,user,factor}=f;
 await db.prepare('UPDATE user_nicknames SET nickname=?').bind('Fictional Replacement').run();
 const keep=await call('recoveryVerifier',user.id,factor.recovery_set_id,f.codes[0]);
 await db.prepare('UPDATE auth_mfa_recovery_codes SET consumed_at=created_at WHERE verifier<>?').bind(keep).run();
 const ledger=await db.prepare('SELECT * FROM member_numbers ORDER BY member_number').all();const password=await db.prepare('SELECT * FROM user_password_credentials').first();
 const replacement=await f.commit(),op=await call('recoveryOperation',c);
 assert.equal(op.phase,'committed');assert.equal(op.expires_at-op.created_at,300);assert.equal(op.display_expires_at-op.committed_at,300);
 assert.equal(op.secret_ciphertext,null);assert.ok(op.display_ciphertext);assert.ok(!op.display_ciphertext.includes(f.codes[0]));
 assert.equal(await db.prepare('SELECT auth_version FROM users').first('auth_version'),user.auth_version+1);
 assert.notEqual(await db.prepare('SELECT factor_id FROM auth_totp_factors').first('factor_id'),factor.factor_id);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE consumed_at IS NULL').first('n'),10);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE set_id=?').bind(factor.recovery_set_id).first('n'),0);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_sessions WHERE revoked_at IS NULL').first('n'),0);
 assert.deepEqual((await db.prepare('SELECT * FROM member_numbers ORDER BY member_number').all()).results,ledger.results);
 assert.deepEqual(await db.prepare('SELECT * FROM user_password_credentials').first(),password);
 assert.notEqual(replacement.secret,f.oldSetup.secret);
 assert.equal(decodeURIComponent(new URL(replacement.uri).pathname.slice(1)),'LAN Party:Fictional Replacement');
 assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
 assert.equal(await db.prepare('PRAGMA quick_check').first('quick_check'),'ok');
}));

test('interrupted start resumes without spending another code; no ordinary session or unrelated mutations',()=>local(async f=>{
 await f.begin();const op=await f.call('recoveryOperation',f.c);
 assert.equal((await f.start()).status,200);
 assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE consumed_at IS NOT NULL').first('n'),1);
 assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_mfa_recovery_operations').first('n'),1);
 assert.equal(op.phase,'pending');
 assert.equal((await f.request('session',undefined,f.h)).status,401);
 assert.equal((await f.request('mfa/manage/start',{purpose:'disable'},f.h)).status,401);
 assert.equal((await f.request('security/methods',undefined,f.h)).status,401);
 assert.equal(await f.call('pending',f.c.token,f.c.browser,f.c.now),null);
}));

test('display uses the committed restricted context, repeats the same codes without another TOTP, and ACK erases access',()=>local(async f=>{
 const setup=await f.commit();
 assert.equal((await f.call('revealRecovery',f.c)).codes.length,10);
 const later={...f.c,now:f.c.now+30},next=await f.call('otp',setup.secret,later.now);
 const display=await f.call('revealRecovery',later,next);assert.equal(display.codes.length,10);
 assert.deepEqual((await f.call('revealRecovery',later)).codes,display.codes);
 const later2={...f.c,now:f.c.now+60};
 assert.deepEqual((await f.call('revealRecovery',later2,await f.call('otp',setup.secret,later2.now))).codes,display.codes);
 await f.call('closeRecovery',later2,true);await f.call('closeRecovery',later2,true);
 const row=await f.db.prepare('SELECT * FROM auth_mfa_recovery_operations').first();assert.equal(row.phase,'acknowledged');assert.equal(row.display_ciphertext,null);
 assert.equal((await f.raw('revealRecovery',later2,next)).status,409);
 assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE consumed_at IS NULL').first('n'),10);
}));

test('expired primary needs refresh without extending recovery or display deadlines',()=>local(async f=>{
 const setup=await f.begin(),later={...f.c,now:f.c.now+121},code=await f.call('otp',setup.secret,later.now);
 assert.equal((await f.raw('commitRecovery',later,code)).status,409);
 await f.call('grantRecoveryPrimary',later,'password',later.now,f.user.auth_version);
 assert.ok(await f.call('commitRecovery',later,code));
 const row=await f.call('recoveryOperation',later);assert.equal(row.expires_at,f.c.now+300);assert.equal(row.display_expires_at,later.now+300);
 assert.equal(await f.call('recoveryOperation',{...later,now:row.display_expires_at}),null);
}));

test('expired/cross-browser context cannot commit or display; generation change cancels secrets',()=>local(async f=>{
 await f.begin();assert.equal(await f.call('recoveryOperation',{...f.c,browser:'aa'.repeat(32)}),null);
 assert.equal(await f.call('recoveryOperation',{...f.c,now:f.c.now+300}),null);
 await f.db.prepare('UPDATE users SET auth_version=auth_version+1').run();
 const row=await f.db.prepare('SELECT * FROM auth_mfa_recovery_operations').first();assert.equal(row.phase,'cancelled');assert.equal(row.secret_ciphertext,null);
 assert.equal(await f.call('recoveryOperation',f.c),null);
}));

test('zero-row lease guard causes actual rollback; redemption and factor remain intact',()=>local(async f=>{
 const setup=await f.begin(),before=await f.db.prepare('SELECT * FROM auth_totp_factors').first();
 const code=await f.call('otp',setup.secret,f.c.now);
 assert.equal((await f.raw('commitRecovery',f.c,code,keys,true)).status,409);
 assert.deepEqual(await f.db.prepare('SELECT * FROM auth_totp_factors').first(),before);
 assert.equal((await f.call('recoveryOperation',f.c)).phase,'pending');
 assert.equal(await f.db.prepare('SELECT auth_version FROM users').first('auth_version'),f.user.auth_version);
}));

test('injected mid-switch SQL error rolls back factor, generation, verifiers and display',()=>local(async f=>{
 const setup=await f.begin(),before=await f.db.prepare('SELECT * FROM auth_totp_factors').first();
 await f.db.exec("CREATE TRIGGER fictional_abort BEFORE UPDATE OF auth_version ON users BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
 assert.equal((await f.raw('commitRecovery',f.c,await f.call('otp',setup.secret,f.c.now))).status,409);
 assert.deepEqual(await f.db.prepare('SELECT * FROM auth_totp_factors').first(),before);
 assert.equal((await f.call('recoveryOperation',f.c)).phase,'pending');
 assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes').first('n'),10);
}));

test('concurrent commits have exactly one winner and no duplicated code generation',()=>local(async f=>{
 const setup=await f.begin(),code=await f.call('otp',setup.secret,f.c.now);
 const r=await Promise.all([f.raw('commitRecovery',f.c,code),f.raw('commitRecovery',f.c,code)]);
 assert.equal(r.filter(x=>x.status===200).length,1);
 assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes').first('n'),10);
 assert.equal(await f.db.prepare('SELECT auth_version FROM users').first('auth_version'),f.user.auth_version+1);
}));

test('cancellation and expiry erase staging without restoring spent proofs or undoing committed factor',()=>local(async f=>{
 await f.begin();await f.call('closeRecovery',f.c,false);
 assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE consumed_at IS NOT NULL').first('n'),1);
 assert.equal(await f.db.prepare('SELECT factor_id FROM auth_totp_factors').first('factor_id'),f.factor.factor_id);
 assert.equal(await f.db.prepare('SELECT secret_ciphertext FROM auth_mfa_recovery_operations').first('secret_ciphertext'),null);
}));

test('tampered display, wrong keys and wrong authenticated binding fail closed',()=>local(async f=>{
 const setup=await f.commit(),later={...f.c,now:f.c.now+30},code=await f.call('otp',setup.secret,f.c.now+30);
 assert.equal((await f.raw('revealRecovery',later,code,{})).status,409);
 await f.db.prepare("UPDATE auth_mfa_recovery_operations SET display_ciphertext='00'||substr(display_ciphertext,3)").run();
 assert.equal((await f.raw('revealRecovery',later,code)).status,409);
 const generated=await f.call('generateRecoveryCodes',f.user.id,randomUUID()),seal=await f.call('sealRecoveryDisplay',generated.codes,keys,'bound');
 assert.equal((await f.raw('openRecoveryDisplay',seal,keys,'different')).status,409);
 assert.equal((await f.call('openRecoveryDisplay',seal,keys,'bound')).length,10);
}));

test('HTTP requires CSRF/confirmation, exposes no setup on status and sends notice only after commit',()=>local(async f=>{
 assert.equal((await f.request('mfa/recovery/start',{code:f.codes[0],confirmed:true},{Cookie:f.h.Cookie})).status,403);
 assert.equal((await f.request('mfa/recovery/start',{code:f.codes[0]},f.h)).status,400);
 assert.equal(await f.call('mail','mfa-replaced'),null);
 const started=await f.start();assert.equal(started.status,200);assert.match(started.headers.get('set-cookie'),/HttpOnly/);
 const status=await(await f.request('mfa/recovery/status',undefined,f.h)).json();assert.equal(status.secret,undefined);assert.equal(status.codes,undefined);
 const setup=await f.call('recoverySetup',f.c,keys,'local'),code=await f.call('otp',setup.secret,f.c.now);
 const response=await f.request('mfa/recovery/commit',{code},f.h);assert.equal(response.status,200);
 assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).codes.length,10);
 assert.ok(await f.call('mail','mfa-replaced'));assert.equal(await f.call('mail','mfa-replaced'),null);
 assert.equal((await f.request('session',undefined,f.h)).status,401);
}));

test('password primary refresh is checked and generic; expired window cannot be revived',()=>local(async f=>{
 await f.begin();assert.equal((await f.request('mfa/recovery/primary',{password:'wrong fictional password'},f.h)).status,401);
 assert.equal((await f.request('mfa/recovery/primary',{password:profile.password},f.h)).status,200);
 await f.call('cleanupRecovery',f.c.now+300);
 assert.equal((await f.request('mfa/recovery/primary',{password:profile.password},f.h)).status,401);
}));

test('status never bootstraps expired, cancelled, foreign or superseded browser recovery',()=>local(async f=>{
 const initial=await f.request('mfa/recovery/status',undefined,f.h);
 assert.equal(initial.status,200);assert.equal(initial.headers.getSetCookie().length,0);
 await f.start();
 const denied=async Cookie=>{const response=await f.request('mfa/recovery/status',undefined,{Cookie});assert.equal(response.status,401);assert.equal(response.headers.getSetCookie().length,0);};
 await denied(`lan_mfa_local_pending=${f.c.token}; lan_mfa_local_browser=${'ab'.repeat(32)}`);
 const old=await f.call('primary',{userId:f.user.id,status:'active',authVersion:f.user.auth_version,emailVerifiedAt:f.c.now},'password',f.c.now);
 await f.call('closeRecovery',f.c,false);await denied(f.h.Cookie);
 await f.call('clock',f.c.now+301);
 await denied(`lan_mfa_local_pending=${old.token}; lan_mfa_local_browser=${old.browser}`);
},{}));

// Browser cookie rules relevant to this loopback fixture: host-only Path=/,
// Max-Age expiry, Strict excluded cross-site, Lax only on safe top-level navigation.
// This models cookie selection; Miniflare dispatchFetch does not implement a browser jar.
function recoveryBrowser(){
 const stored=new Map();
 return {
  receive(response,now){for(const header of response.headers.getSetCookie()){
   const [pair,...attributes]=header.split(';').map(s=>s.trim()),at=pair.indexOf('=');
   const attrs=Object.fromEntries(attributes.map(s=>{const i=s.indexOf('=');return [s.slice(0,i<0?undefined:i).toLowerCase(),i<0?'':s.slice(i+1)];}));
   const age=Number(attrs['max-age']);assert.ok(Number.isSafeInteger(age));
   assert.equal(attrs.path,'/');
   stored.set(pair.slice(0,at),{pair,expires:now+age,sameSite:attrs.samesite});
  }},
  cookies(now,{crossSite=false,topLevel=false,method='GET'}={}){
   return [...stored.values()].filter(c=>c.expires>now&&(!crossSite||c.sameSite==='Lax'&&topLevel&&method==='GET')).map(c=>c.pair).join('; ');
  },
 };
}

test('without either browser context after original cookie expiry status fails closed',()=>local(async f=>{
 const browser=recoveryBrowser();browser.receive(await f.raw('primaryCookies',f.pending),f.c.now);
 await f.call('clock',f.c.now+60);
 assert.equal((await f.request('mfa/recovery/start',{code:f.codes[0],confirmed:true},f.h)).status,200);
 await f.call('clock',f.c.now+301);
 const response=await f.request('mfa/recovery/status',undefined,{Cookie:browser.cookies(f.c.now+301)});
 // Missing binding is the existing sanitized unavailable response, not a proof bypass.
 assert.equal(response.status,503);assert.equal(response.headers.getSetCookie().length,0);
 assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE consumed_at IS NOT NULL').first('n'),1);
},{}));

test('status cookie refresh shrinks with fixed pending/display deadlines and rejects expiry',async()=>{
 await local(async f=>{
  await f.start();const op=await f.call('recoveryOperation',f.c);
  await f.call('clock',op.expires_at-1);
  const last=await f.request('mfa/recovery/status',undefined,f.h);assert.equal(last.status,200);
  for(const header of last.headers.getSetCookie())assert.match(header,/Max-Age=301(?:;|$)/);
  await f.call('clock',op.expires_at);
  const expired=await f.request('mfa/recovery/status',undefined,f.h);
  assert.equal(expired.status,401);assert.equal(expired.headers.getSetCookie().length,0);
  assert.equal((await f.db.prepare('SELECT expires_at FROM auth_mfa_recovery_operations').first()).expires_at,op.expires_at);
 });
 await local(async f=>{
  await f.commit();const op=await f.call('recoveryOperation',f.c);
  await f.call('clock',op.committed_at+125);
  const status=await f.request('mfa/recovery/status',undefined,f.h);assert.equal(status.status,200);
  for(const header of status.headers.getSetCookie())assert.match(header,/Max-Age=175(?:;|$)/);
  const after=await f.call('recoveryOperation',{...f.c,now:op.committed_at+125});
  assert.equal(after.expires_at,op.expires_at);assert.equal(after.display_expires_at,op.display_expires_at);
  assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE consumed_at IS NULL').first('n'),10);
  await f.call('clock',op.display_expires_at);
  const expired=await f.request('mfa/recovery/status',undefined,f.h);
  assert.equal(expired.status,401);assert.equal(expired.headers.getSetCookie().length,0);
 });
});
test('0014 upgrades populated 0013, preserves history and constrains envelopes and immutable binding',()=>local(async f=>{
 assert.equal(await f.db.prepare('SELECT count(*) n FROM users').first('n'),1);
 assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_totp_factors').first('n'),1);
 assert.equal((await f.db.prepare('PRAGMA table_list').all()).results.find(x=>x.name==='auth_mfa_recovery_operations').strict,1);
 await f.begin();
 for(const sql of ["UPDATE auth_mfa_recovery_operations SET browser_digest='aa'",'UPDATE auth_mfa_recovery_operations SET expires_at=expires_at+1',
  'UPDATE auth_mfa_recovery_operations SET secret_nonce=NULL',"UPDATE auth_mfa_recovery_operations SET phase='acknowledged'"])
  await assert.rejects(()=>f.db.prepare(sql).run());
 assert.deepEqual((await f.db.prepare('PRAGMA foreign_key_check').all()).results,[]);
},{upgrade:true}));

test('five wrong recovery attempts persistently throttle without spending a valid code or exposing details',()=>local(async f=>{
 for(let i=0;i<5;i++)assert.equal((await f.request('mfa/recovery/start',{code:'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA',confirmed:true},f.h)).status,401);
 const limited=await f.start();assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);
 assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE consumed_at IS NOT NULL').first('n'),0);
 assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_mfa_recovery_operations').first('n'),0);
}));

test('invalid CSRF, foreign origins, hosted aliases and malformed input cannot begin recovery',()=>local(async f=>{
 assert.equal((await f.request('mfa/recovery/start',{confirmed:true,code:f.codes[0]},{...f.h,Origin:'https://attacker.example'})).status,403);
 assert.equal((await f.request('mfa/recovery/start',{confirmed:true,code:f.codes[0],userId:f.user.id},f.h)).status,400);
 for(const host of ['https://dev.lan-party.club','https://lan-party-dev.servok.workers.dev','https://lan-party.club']){
  const response=await f.instance.dispatchFetch(host+'/api/auth/mfa/recovery/status',{headers:{'X-LAN-Request':'1'}});assert.equal(response.status,404);
 }
 const response=await f.request('mfa/recovery/status',undefined,f.h);assert.equal(response.status,200);
 assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_mfa_recovery_operations').first('n'),0);
}));

test('competing restricted operations cannot spend two codes or replace a pending operation',()=>local(async f=>{
 const now=Math.floor(Date.now()/1000),second=await f.call('primary',{userId:f.user.id,status:'active',authVersion:f.user.auth_version,emailVerifiedAt:now},'password',now);
 const other={token:second.token,browser:second.browser,now};
 const responses=await Promise.all([f.raw('startRecovery',f.c,f.codes[0]),f.raw('startRecovery',other,f.codes[1])]);
 assert.equal(responses.filter(x=>x.status===200).length,1);
 assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_mfa_recovery_operations').first('n'),1);
 assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE consumed_at IS NOT NULL').first('n'),1);
}));

test('lost switch response is discoverable; post-commit cancel and expiry never restore the old factor',()=>local(async f=>{
 const setup=await f.commit(),op=await f.call('recoveryOperation',f.c);
 assert.equal((await f.request('mfa/recovery/status',undefined,f.h)).status,200);
 assert.equal((await f.raw('commitRecovery',f.c,await f.call('otp',setup.secret,f.c.now))).status,409);
 await f.call('cleanupRecovery',op.display_expires_at);
 const row=await f.db.prepare('SELECT * FROM auth_mfa_recovery_operations').first();assert.equal(row.phase,'cancelled');assert.equal(row.display_ciphertext,null);
 assert.equal(await f.db.prepare('SELECT factor_id FROM auth_totp_factors').first('factor_id'),op.new_factor_id);
 assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE consumed_at IS NULL').first('n'),10);
}));

test('new normal login needs the replacement authenticator, and old codes cannot create sessions',()=>local(async f=>{
 const setup=await f.commit();await f.call('clock',f.c.now);const login=await f.request('login',{email:profile.email,password:profile.password});
 assert.equal(login.status,200);assert.equal((await login.json()).next,'/mfa');
 const Cookie=jar(login),csrf=(await(await f.request('mfa/challenge',undefined,{Cookie})).json()).csrfToken;
 const headers={Cookie,'X-CSRF-Token':csrf};
 assert.equal((await f.request('mfa/complete',{method:'totp',code:await f.call('otp',setup.secret,f.c.now)},headers)).status,401,'the commit TOTP stays spent for normal login');
 assert.equal((await f.request('mfa/complete',{method:'recovery',code:f.codes[1]},headers)).status,401);
 assert.equal((await f.request('mfa/complete',{method:'totp',code:await f.call('otp',f.oldSetup.secret,f.c.now)},headers)).status,401);
 // The existing ±1-step clock window accepts this independently generated next
 // fixture code while keeping the database replay trigger intact.
 const complete=await f.request('mfa/complete',{method:'totp',code:await f.call('otp',setup.secret,f.c.now+30)},headers);assert.equal(complete.status,200);
 assert.equal((await f.request('session',undefined,{Cookie:jar(complete)})).status,200);
}));

test('notification failure never reverses a committed replacement or exposes secrets',()=>local(async f=>{
 const setup=await f.begin();await f.call('failNotice');
 const response=await f.request('mfa/recovery/commit',{code:await f.call('otp',setup.secret,Math.floor(Date.now()/1000))},f.h);
 assert.equal(response.status,200);const body=await response.text();assert.ok(!body.includes(setup.secret));
 assert.equal((await f.call('recoveryOperation',f.c)).phase,'committed');assert.equal(await f.call('mail','mfa-replaced'),null);
}));

test('expired redemption lease rolls back the last code and creates no restricted authorization',()=>local(async f=>{
 assert.equal((await f.raw('startRecovery',f.c,f.codes[0],keys,true)).status,409);
 assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE consumed_at IS NOT NULL').first('n'),0);
 assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_mfa_recovery_operations').first('n'),0);
}));

test('conditional Turnstile is server-validated before recovery redemption',()=>local(async f=>{
 await f.call('signals','loopback');
 const attempt=token=>f.request('mfa/recovery/start',{code:f.codes[0],confirmed:true,...(token?{turnstileToken:token}:{})},f.h);
 const denied=await attempt();assert.equal(denied.status,403);assert.equal((await denied.json()).code,'challenge_required');
 assert.equal((await attempt('invalid-fixture')).status,403);
 assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE consumed_at IS NOT NULL').first('n'),0);
 assert.equal((await attempt('fictional-proof')).status,200);
}));

test('concurrent acknowledgments are safe and a later generation cancels committed display',async()=>{
 await local(async f=>{
  await f.commit();const responses=await Promise.all([f.raw('closeRecovery',f.c,true),f.raw('closeRecovery',f.c,true)]);
  assert.ok(responses.every(r=>r.status===200));assert.equal((await f.call('recoveryOperation',f.c)).phase,'acknowledged');
  assert.equal(await f.db.prepare('SELECT display_ciphertext FROM auth_mfa_recovery_operations').first('display_ciphertext'),null);
 });
 await local(async f=>{
  await f.commit();await f.db.prepare('UPDATE users SET auth_version=auth_version+1').run();
  assert.equal(await f.call('recoveryOperation',f.c),null);
  assert.equal(await f.db.prepare('SELECT display_ciphertext FROM auth_mfa_recovery_operations').first('display_ciphertext'),null);
 });
});

async function recoveryLogin(f,remaining=0){
 for(let i=remaining+1;i<f.codes.length;i++){
  const verifier=await f.call('recoveryVerifier',f.user.id,f.factor.recovery_set_id,f.codes[i]);
  await f.db.prepare('UPDATE auth_mfa_recovery_codes SET consumed_at=created_at WHERE verifier=?').bind(verifier).run();
 }
 const challenge=await(await f.request('mfa/challenge',undefined,f.h)).json();
 const logged=await f.request('mfa/complete',{method:'recovery',code:f.codes[0]},{Cookie:f.h.Cookie,'X-CSRF-Token':challenge.csrfToken});
 assert.equal(logged.status,200);
 const Cookie=jar(logged),session=await(await f.request('session',undefined,{Cookie})).json();
 return {Cookie,'X-CSRF-Token':session.csrfToken,remaining:session.recoveryCodesRemaining};
}
test('Account Security recovery counts are post-consumption, owner-only, and never block final-code login',async()=>{
 for(const remaining of [3,2,1,0])await local(async f=>{
  const h=await recoveryLogin(f,remaining);assert.equal(h.remaining,remaining);
  assert.equal((await f.request('session')).status,401);
  const pending=await f.call('primary',{userId:f.user.id,authVersion:f.user.auth_version,status:'active',emailVerifiedAt:f.c.now},'password',f.c.now);
  const Cookie=jar(await f.raw('primaryCookies',{kind:'pending',...pending}));
  const challenge=await(await f.request('mfa/challenge',undefined,{Cookie})).json();
  assert.equal((await f.request('mfa/complete',{method:'recovery',code:f.codes[0]},{Cookie,'X-CSRF-Token':challenge.csrfToken})).status,401);
 });
});
test('Account Security last-code handoff is single-use, restricted, and completes replacement after exhaustion',()=>local(async f=>{
 const h=await recoveryLogin(f);assert.equal(h.remaining,0);
 const rows=await f.db.prepare('SELECT count(*) AS n FROM auth_mfa_recovery_codes WHERE consumed_at IS NULL').first('n');assert.equal(rows,0);
 const races=await Promise.all([f.request('mfa/recovery/from-session',{confirmed:true},h),f.request('mfa/recovery/from-session',{confirmed:true},h)]);
 assert.equal(races.filter(r=>r.status===200).length,1);
 const response=races.find(r=>r.status===200),Cookie=jar(response);
 assert.equal((await f.request('session',undefined,{Cookie})).status,401);
 assert.equal((await f.request('session',undefined,h)).status,401);
 const status=await(await f.request('mfa/recovery/status',undefined,{Cookie})).json();assert.equal(status.phase,'pending');
 const headers={Cookie,'X-CSRF-Token':status.csrfToken};
 const setup=await(await f.request('mfa/recovery/setup',{},headers)).json();assert.equal(typeof setup.secret,'string');
 const code=await f.call('otp',setup.secret,Math.floor(Date.now()/1000));
 const committed=await f.request('mfa/recovery/commit',{code},headers);assert.equal(committed.status,200);
 assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE consumed_at IS NULL').first('n'),10);
 assert.equal((await f.request('mfa/recovery/from-session',{confirmed:true},h)).status,401);
 assert.notEqual(await f.db.prepare('SELECT factor_id FROM auth_totp_factors').first('factor_id'),f.factor.factor_id);
}));
test('Account Security handoff preserves CSRF, fresh proof, rollback, and one-use cancellation boundaries',async()=>{
 for(const defect of ['csrf','primary','stale-mfa','rollback'])await local(async f=>{
  const h=await recoveryLogin(f);let expected=428;
  if(defect==='csrf'){h['X-CSRF-Token']='invalid';expected=403;}
  if(defect==='primary')await f.db.prepare('UPDATE auth_recent_authentication SET authenticated_at=authenticated_at-121,expires_at=expires_at-121').run();
  if(defect==='stale-mfa'){
   const m=await f.db.prepare("SELECT * FROM auth_session_mfa WHERE method='recovery' AND session_digest IN (SELECT token_digest FROM auth_sessions WHERE revoked_at IS NULL)").first();
   await f.db.batch([f.db.prepare('DELETE FROM auth_session_mfa WHERE session_digest=?').bind(m.session_digest),f.db.prepare('INSERT INTO auth_session_mfa(session_digest,user_id,auth_version,factor_id,method,verified_at,primary_method,primary_authenticated_at) VALUES(?,?,?,?,?,?,?,?)').bind(m.session_digest,m.user_id,m.auth_version,m.factor_id,m.method,m.verified_at-121,m.primary_method,m.primary_authenticated_at)]);
  }
  if(defect==='rollback'){expected=503;await f.db.exec("CREATE TRIGGER fixture_handoff_abort BEFORE UPDATE OF revoked_at ON auth_sessions BEGIN SELECT RAISE(ABORT,'fictional failure'); END;");}
  assert.equal((await f.request('mfa/recovery/from-session',{confirmed:true},h)).status,expected,defect);
  assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_mfa_recovery_operations').first('n'),0);
  assert.equal((await f.request('session',undefined,h)).status,200);
 });
 await local(async f=>{
  const h=await recoveryLogin(f),r=await f.request('mfa/recovery/from-session',{confirmed:true},h);assert.equal(r.status,200);
  const Cookie=jar(r),status=await(await f.request('mfa/recovery/status',undefined,{Cookie})).json();
  assert.equal((await f.request('mfa/recovery/cancel',{confirmed:true},{Cookie,'X-CSRF-Token':status.csrfToken})).status,200);
  assert.equal((await f.request('mfa/recovery/setup',{}, {Cookie,'X-CSRF-Token':status.csrfToken})).status,401);
  assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE consumed_at IS NULL').first('n'),0);
 });
});

test('Account Security handoff fences revocation, generation and set changes inside its atomic write',async()=>{
 for(const change of ['revoke','generation','set'])await local(async f=>{
  await recoveryLogin(f);
  const session=await f.db.prepare("SELECT session_digest FROM auth_session_mfa WHERE method='recovery'").first('session_digest');
  const context={token:'ac'.repeat(32),browser:'bd'.repeat(32),now:Math.floor(Date.now()/1000)};
  const r=await f.raw('handoffRace',context,f.user.id,f.user.auth_version,session,change);assert.equal(r.status,409,change);
  assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_mfa_recovery_operations').first('n'),0);
  assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE consumed_at IS NULL').first('n'),0);
 });
});


test('lost start response resumes through status and password confirmation across original cookie expiry',()=>local(async f=>{
 const browser=recoveryBrowser(),original=f.c.now;
 browser.receive(await f.raw('primaryCookies',f.pending),original);
 assert.match(browser.cookies(original),/lan_mfa_local_pending=/);
 assert.equal(browser.cookies(original,{crossSite:true,topLevel:true}),'');
 await f.call('clock',original+60);
 assert.equal((await f.request('mfa/recovery/start',{code:f.codes[0],confirmed:true},f.h)).status,200);
 const initial=await f.db.prepare('SELECT * FROM auth_mfa_recovery_operations').first();
 assert.equal(initial.expires_at,original+360);
 await f.call('clock',original+299);
 const resumed=await f.request('mfa/recovery/status',undefined,{Cookie:browser.cookies(original+299)});
 assert.equal(resumed.status,200);assert.equal(resumed.headers.get('cache-control'),'no-store');
 assert.equal(resumed.headers.getSetCookie().length,2);browser.receive(resumed,original+299);
 const state=await resumed.json();assert.equal(state.password,true);assert.equal('google' in state,false);
 assert.equal(browser.cookies(original+299,{crossSite:true,topLevel:false}),'');
 assert.equal(browser.cookies(original+299,{crossSite:true,topLevel:true,method:'POST'}),'');
 await f.call('clock',original+301);const Cookie=browser.cookies(original+301);
 assert.doesNotMatch(Cookie,/lan_mfa_local_pending=|lan_mfa_local_browser=/);
 const headers={Cookie,'X-CSRF-Token':state.csrfToken};
 assert.equal((await f.request('mfa/recovery/primary',{password:profile.password},headers)).status,200);
 const after=await f.db.prepare('SELECT * FROM auth_mfa_recovery_operations').first();
 assert.equal(after.operation_digest,initial.operation_digest);assert.equal(after.expires_at,initial.expires_at);
 assert.equal(after.created_at,initial.created_at);assert.equal(after.primary_authenticated_at,original+301);
 assert.equal(await f.db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE consumed_at IS NOT NULL').first('n'),1);
 assert.equal((await f.request('session',undefined,{Cookie})).status,401);
 assert.equal((await f.request('mfa/manage/start',{purpose:'disable'},headers)).status,401);
}));


test('HTTP single-TOTP replacement returns ten codes immediately and bound redisplay needs no second TOTP',()=>local(async f=>{
 const setup=await f.begin(),now=f.c.now;await f.call('clock',now);
 const spent=await f.call('otp',setup.secret,now);
 const commit=await f.request('mfa/recovery/commit',{code:spent},f.h);assert.equal(commit.status,200);
 const committed=await commit.json();assert.equal(committed.codes.length,10);assert.equal(new Set(committed.codes).size,10);
 const status=await(await f.request('mfa/recovery/status',undefined,f.h)).json();
 assert.equal(status.phase,'committed');assert.equal(status.primaryRequired,false);assert.equal(status.expiresAt,committed.displayExpiresAt);
 const immediate=await f.request('mfa/recovery/reveal',{},f.h);assert.equal(immediate.status,200);assert.deepEqual((await immediate.json()).codes,committed.codes);
 await f.call('clock',now+30);const next=await f.call('otp',setup.secret,now+30);
 const reveal=await f.request('mfa/recovery/reveal',{code:next},f.h);assert.equal(reveal.status,200);assert.equal(reveal.headers.get('cache-control'),'no-store');
 const shown=await reveal.json();assert.equal(shown.codes.length,10);assert.equal(shown.expiresAt,status.expiresAt);
 assert.deepEqual(shown.codes,committed.codes);assert.equal((await f.request('mfa/recovery/reveal',{},f.h)).status,200);
 await f.call('clock',now+60);const repeated=await f.request('mfa/recovery/reveal',{code:await f.call('otp',setup.secret,now+60)},f.h);
 assert.equal(repeated.status,200);assert.deepEqual((await repeated.json()).codes,shown.codes);
 assert.equal((await f.request('session',undefined,f.h)).status,401);
 assert.equal((await f.request('mfa/recovery/ack',{confirmed:true},f.h)).status,200);
 const row=await f.db.prepare('SELECT phase,display_ciphertext FROM auth_mfa_recovery_operations').first();assert.equal(row.phase,'acknowledged');assert.equal(row.display_ciphertext,null);
}));

test('HTTP recovery freshness hint follows server proof without authorizing or extending stale recovery',()=>local(async f=>{
 const setup=await f.begin(),now=f.c.now;await f.call('clock',now);
 const initial=await(await f.request('mfa/recovery/status',undefined,f.h)).json();assert.equal(initial.primaryRequired,false);
 await f.call('clock',now+120);const stale=await(await f.request('mfa/recovery/status',undefined,f.h)).json();assert.equal(stale.primaryRequired,true);assert.equal(stale.expiresAt,initial.expiresAt);
 const rejected=await f.request('mfa/recovery/commit',{code:await f.call('otp',setup.secret,now+120)},f.h);assert.equal(rejected.status,428);assert.equal((await rejected.json()).code,'reauth_required');
 assert.equal((await f.request('mfa/recovery/primary',{password:'wrong fictional password'},f.h)).status,401);
 assert.equal((await f.request('mfa/recovery/primary',{password:profile.password},f.h)).status,200);
 const fresh=await(await f.request('mfa/recovery/status',undefined,f.h)).json();assert.equal(fresh.primaryRequired,false);assert.equal(fresh.expiresAt,initial.expiresAt);
 await f.call('clock',initial.expiresAt);const expired=await f.request('mfa/recovery/status',undefined,f.h);assert.equal(expired.status,401);assert.equal((await expired.json()).code,'recovery_unavailable');
 assert.equal((await f.request('mfa/recovery/primary',{password:profile.password},f.h)).status,401);
}));


test('committed redisplay rejects ACK races, stale proof, foreign binding and expired leases without consuming another TOTP',()=>local(async f=>{
 const setup=await f.commit(),before=await f.db.prepare('SELECT last_step FROM auth_totp_factors').first('last_step');
 const shown=await f.call('revealRecovery',f.c);assert.equal(shown.codes.length,10);
 assert.equal(await f.db.prepare('SELECT last_step FROM auth_totp_factors').first('last_step'),before);
 assert.equal((await f.raw('revealRecovery',{...f.c,browser:'ff'.repeat(32)})).status,409);
 assert.equal((await f.raw('revealRecovery',{...f.c,now:f.c.now+120})).status,409);
 assert.equal((await f.raw('revealRecovery',f.c,null,keys,true)).status,409);
 assert.equal((await f.raw('revealAfterAck',f.c)).status,409);
 const row=await f.db.prepare('SELECT phase,display_ciphertext FROM auth_mfa_recovery_operations').first();assert.equal(row.phase,'acknowledged');assert.equal(row.display_ciphertext,null);
 assert.equal((await f.raw('revealRecovery',f.c)).status,409);assert.equal(setup.secret.length,32);
}));
