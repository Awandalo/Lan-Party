import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {before,test} from 'node:test';
const require=createRequire(import.meta.url),wr=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=wr('miniflare'),{build}=wr('esbuild');
const origin='http://127.0.0.1:5173',keys={MFA_ENCRYPTION_KEYS:JSON.stringify({fixture:'44'.repeat(32)}),MFA_ACTIVE_KEY_ID:'fixture'};
const profile={nickname:'Recovery Fixture',firstName:'Fictional',lastName:'Participant',email:'recovery@example.test',password:'fictional recovery password'};
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'fixture',alg:'RS256',use:'sig'};
let script,migrations;
before(async()=>{
 script=(await build({stdin:{resolveDir:fileURLToPath(new URL('../../',import.meta.url)),contents:`
 import app from './worker/index';import * as recovery from './worker/auth/mfa-recovery';
 import * as cryptoMfa from './worker/auth/mfa-crypto';import {localMailbox} from './worker/auth/email';
 import {pendingLogin,completePrimary} from './worker/auth/mfa-login';import {LoginLimiter} from './worker/auth/login-limits';
 import {generate} from '@otplib/totp';import {crypto as otpCrypto} from '@otplib/plugin-crypto-web';import {base32} from '@otplib/plugin-base32-scure';
 let failNotices=false;const send=localMailbox.send.bind(localMailbox);
 localMailbox.send=async mail=>{if(failNotices&&mail.purpose==='mfa-replaced')throw Error('Fictional notice failure');return send(mail);};
 globalThis.fetch=async(input,init)=>{
  if(String(input)==='https://oauth2.googleapis.com/token')return Response.json({access_token:'fictional',token_type:'Bearer',expires_in:300,id_token:new URLSearchParams(init.body).get('code')});
  if(String(input)==='https://www.googleapis.com/oauth2/v3/certs')return Response.json({keys:[${JSON.stringify(jwk)}]});
  if(String(input)==='https://challenges.cloudflare.com/turnstile/v0/siteverify')return Response.json({success:JSON.parse(init.body).response==='fictional-proof',hostname:'127.0.0.1',action:'login'});
  throw Error('External network blocked');
 };
 export default {async fetch(request,env){
  if(new URL(request.url).pathname!=='/fixture')return app.fetch(request,env);
  const {action,args=[]}=await request.json();try{
   if(action==='mail')return Response.json(localMailbox.take('recovery@example.test',Math.floor(Date.now()/1000),args[0]??'email-verification'));
   if(action==='failNotice'){failNotices=true;return Response.json(true);}
   if(action==='signals'){const limiter=await LoginLimiter.create(env.DB,env.AUTH_RATE_LIMIT_SECRET,args[0]);for(let i=0;i<60;i++)await limiter.observe();return Response.json(true);}
   if(action==='otp')return Response.json(await generate({secret:base32.decode(args[0]),crypto:otpCrypto,epoch:args[1]}));
   if(action==='primary')return Response.json(await completePrimary(env.DB,...args));
   if(action==='pending')return Response.json(await pendingLogin(env.DB,...args));
   if(['startRecovery','commitRecovery','revealRecovery'].includes(action)){
    const [c,code,configuration=env,expiredLease=false]=args;
    const op=await recovery.recoveryOperation(env.DB,c),pending=op?null:await pendingLogin(env.DB,c.token,c.browser,c.now);
    const limiter=await LoginLimiter.create(env.DB,env.AUTH_RATE_LIMIT_SECRET,'fixture',()=>c.now);
    const held=await limiter.reserveMfa(op?.user_id??pending.user_id,op?.source_digest??pending.token_digest);
    try{
     if(expiredLease)await env.DB.prepare('UPDATE registration_rate_limits SET expires_at=0').run();
     const result=action==='startRecovery'?await recovery.startRecovery(env.DB,c,pending,code,configuration,'local',held):await recovery[action](env.DB,c,code,configuration,'local',held);
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
async function local(run,{upgrade=false,googleOnly=false}={}){
 const instance=new Miniflare(convertV4MiniflareOptions({modules:true,script,cf:false,compatibilityDate:'2026-10-11',d1Databases:{DB:randomUUID()},bindings:{
  REGISTRATION_MODE:'local-only',AUTH_SESSION_MODE:'local-only',AUTH_EMAIL_TRANSPORT:'local',AUTH_PUBLIC_ORIGIN:origin,
  PASSWORD_PEPPER:'11'.repeat(32),AUTH_RATE_LIMIT_SECRET:'22'.repeat(32),AUTH_LOCAL_MAIL_SECRET:'33'.repeat(32),...keys,
  GOOGLE_AUTH_MODE:'local-only',GOOGLE_CLIENT_ID:'fictional.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'fictional-google-secret',
  AUTH_TURNSTILE_SITE_KEY:'fictional-site',TURNSTILE_SECRET_KEY:'fictional-turnstile-secret-only'}}));
 try{
  const db=await instance.getD1Database('DB');for(const parts of migrations.slice(0,upgrade?13:14))await db.batch(parts.map(s=>db.prepare(s)));
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
  if(googleOnly){
   const id=await db.prepare('SELECT id FROM users').first('id');
   await db.prepare("INSERT INTO user_auth_providers(id,user_id,provider,identity_namespace,provider_subject,linked_at) VALUES(?,?,'google','https://accounts.google.com','fixture-google',?)").bind(randomUUID(),id,Math.floor(Date.now()/1000)).run();
   await db.prepare('DELETE FROM user_password_credentials WHERE user_id=?').bind(id).run();
  }
  now=Math.floor(Date.now()/1000);
  const user=await db.prepare('SELECT * FROM users').first(),factor=await db.prepare('SELECT * FROM auth_totp_factors').first();
  const pending=await call('primary',{userId:user.id,authVersion:user.auth_version,status:'active',emailVerifiedAt:now},googleOnly?'google':'password',now);
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
  await run({db,request,raw,call,c,h,codes:codes.codes,oldSetup:setup,user,factor,start,begin,commit,instance});
 }finally{await instance.dispose();}
}

test('last code starts restricted recovery, atomically replaces factor and preserves account/ledger',()=>local(async f=>{
 const {db,c,call,user,factor}=f;
 const keep=await call('recoveryVerifier',user.id,factor.recovery_set_id,f.codes[0]);
 await db.prepare('UPDATE auth_mfa_recovery_codes SET consumed_at=created_at WHERE verifier<>?').bind(keep).run();
 const ledger=await db.prepare('SELECT * FROM member_numbers').all();const password=await db.prepare('SELECT * FROM user_password_credentials').first();
 const replacement=await f.commit(),op=await call('recoveryOperation',c);
 assert.equal(op.phase,'committed');assert.equal(op.expires_at-op.created_at,300);assert.equal(op.display_expires_at-op.committed_at,300);
 assert.equal(op.secret_ciphertext,null);assert.ok(op.display_ciphertext);assert.ok(!op.display_ciphertext.includes(f.codes[0]));
 assert.equal(await db.prepare('SELECT auth_version FROM users').first('auth_version'),user.auth_version+1);
 assert.notEqual(await db.prepare('SELECT factor_id FROM auth_totp_factors').first('factor_id'),factor.factor_id);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE consumed_at IS NULL').first('n'),10);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE set_id=?').bind(factor.recovery_set_id).first('n'),0);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_sessions WHERE revoked_at IS NULL').first('n'),0);
 assert.deepEqual((await db.prepare('SELECT * FROM member_numbers').all()).results,ledger.results);
 assert.deepEqual(await db.prepare('SELECT * FROM user_password_credentials').first(),password);
 assert.notEqual(replacement.secret,f.oldSetup.secret);
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
 assert.equal((await f.request('google/methods',undefined,f.h)).status,503);
 assert.equal(await f.call('pending',f.c.token,f.c.browser,f.c.now),null);
}));

test('display requires fresh new TOTP, repeats same codes, ACK erases and replay is denied',()=>local(async f=>{
 const setup=await f.commit();
 assert.equal(await f.call('revealRecovery',f.c,await f.call('otp',setup.secret,f.c.now)),null);
 const later={...f.c,now:f.c.now+30},next=await f.call('otp',setup.secret,later.now);
 const display=await f.call('revealRecovery',later,next);assert.equal(display.codes.length,10);
 assert.equal(await f.call('revealRecovery',later,next),null);
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
 assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).codes,undefined);
 assert.ok(await f.call('mail','mfa-replaced'));assert.equal(await f.call('mail','mfa-replaced'),null);
 assert.equal((await f.request('session',undefined,f.h)).status,401);
}));

test('password primary refresh is checked and generic; expired window cannot be revived',()=>local(async f=>{
 await f.begin();assert.equal((await f.request('mfa/recovery/primary',{password:'wrong fictional password'},f.h)).status,401);
 assert.equal((await f.request('mfa/recovery/primary',{password:profile.password},f.h)).status,200);
 await f.call('cleanupRecovery',f.c.now+300);
 assert.equal((await f.request('mfa/recovery/primary',{password:profile.password},f.h)).status,401);
}));

function jwt(nonce,subject='fixture-google',time=Math.floor(Date.now()/1000)){
 const content=[{alg:'RS256',kid:'fixture'},{iss:'https://accounts.google.com',aud:'fictional.apps.googleusercontent.com',sub:subject,email:profile.email,email_verified:true,hd:'example.test',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300,auth_time:time,nonce}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
 return content+'.'+sign('RSA-SHA256',Buffer.from(content),privateKey).toString('base64url');
}
test('Google restricted refresh validates signed identity and never issues an ordinary session',()=>local(async f=>{
 await f.db.prepare("INSERT INTO user_auth_providers(id,user_id,provider,identity_namespace,provider_subject,linked_at) VALUES(?,?,'google','https://accounts.google.com','fixture-google',?)").bind(randomUUID(),f.user.id,f.c.now).run();
 await f.begin();
 const start=async()=>{const r=await f.request('google/start',{purpose:'reauth',returnAction:'recovery'},f.h);assert.equal(r.status,200);return {r,url:new URL((await r.json()).url)};};
 const flow=await start();assert.equal(flow.url.searchParams.get('max_age'),'0');
 const headers={Cookie:f.h.Cookie+'; '+jar(flow.r)};
 const callback=(flow,token)=>f.instance.dispatchFetch(origin+'/api/auth/google/callback?'+new URLSearchParams({state:flow.url.searchParams.get('state'),code:token}),{headers,redirect:'manual'});
 const done=await callback(flow,jwt(flow.url.searchParams.get('nonce')));assert.equal(done.status,303);assert.equal(done.headers.get('location'),'/mfa?recovery=1');assert.equal(done.headers.get('set-cookie'),null);
 assert.equal((await f.call('recoveryOperation',f.c)).primary_method,'google');
 assert.equal((await callback(flow,jwt(flow.url.searchParams.get('nonce')))).headers.get('location'),'/login?google=unavailable');
 const wrong=await start();headers.Cookie=f.h.Cookie+'; '+jar(wrong.r);
 assert.equal((await callback(wrong,jwt(wrong.url.searchParams.get('nonce'),'different-subject'))).headers.get('location'),'/login?google=unavailable');
 for(const time of [Math.floor(Date.now()/1000)-121,null]){
  const stale=await start();headers.Cookie=f.h.Cookie+'; '+jar(stale.r);
  assert.equal((await callback(stale,jwt(stale.url.searchParams.get('nonce'),'fixture-google',time))).headers.get('location'),'/login?google=unavailable');
 }
 assert.equal((await f.request('session',undefined,f.h)).status,401);
}));

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
 const setup=await f.commit(),login=await f.request('login',{email:profile.email,password:profile.password});
 assert.equal(login.status,200);assert.equal((await login.json()).next,'/mfa');
 const Cookie=jar(login),csrf=(await(await f.request('mfa/challenge',undefined,{Cookie})).json()).csrfToken;
 const headers={Cookie,'X-CSRF-Token':csrf};
 assert.equal((await f.request('mfa/complete',{method:'recovery',code:f.codes[1]},headers)).status,401);
 assert.equal((await f.request('mfa/complete',{method:'totp',code:await f.call('otp',f.oldSetup.secret,Math.floor(Date.now()/1000))},headers)).status,401);
 // The existing ±1-step clock window accepts this independently generated next
 // fixture code while keeping the database replay trigger intact.
 const complete=await f.request('mfa/complete',{method:'totp',code:await f.call('otp',setup.secret,Math.floor(Date.now()/1000)+30)},headers);assert.equal(complete.status,200);
 assert.equal((await f.request('session',undefined,{Cookie:jar(complete)})).status,200);
}));

test('notification failure never reverses a committed replacement or exposes secrets',()=>local(async f=>{
 const setup=await f.begin();await f.call('failNotice');
 const response=await f.request('mfa/recovery/commit',{code:await f.call('otp',setup.secret,Math.floor(Date.now()/1000))},f.h);
 assert.equal(response.status,200);const body=await response.text();assert.ok(!body.includes(setup.secret));
 assert.equal((await f.call('recoveryOperation',f.c)).phase,'committed');assert.equal(await f.call('mail','mfa-replaced'),null);
}));

test('Google-only recovery keeps its sole provider and can refresh primary proof after switching',()=>local(async f=>{
 const setup=await f.commit();
 assert.equal(await f.db.prepare('SELECT count(*) n FROM user_password_credentials').first('n'),0);
 assert.equal(await f.db.prepare('SELECT count(*) n FROM user_auth_providers').first('n'),1);
 const stale={...f.c,now:f.c.now+121};
 assert.equal((await f.raw('revealRecovery',stale,await f.call('otp',setup.secret,stale.now))).status,409);
 const flowResponse=await f.request('google/start',{purpose:'reauth',returnAction:'recovery'},f.h);assert.equal(flowResponse.status,200);
 const url=new URL((await flowResponse.json()).url),Cookie=f.h.Cookie+'; '+jar(flowResponse);
 const callback=await f.instance.dispatchFetch(origin+'/api/auth/google/callback?'+new URLSearchParams({state:url.searchParams.get('state'),code:jwt(url.searchParams.get('nonce'))}),{redirect:'manual',headers:{Cookie}});
 assert.equal(callback.headers.get('location'),'/mfa?recovery=1');assert.equal(callback.headers.get('set-cookie'),null);
 assert.equal((await f.request('mfa/recovery/primary',{password:profile.password},f.h)).status,401);
 assert.equal((await f.request('session',undefined,f.h)).status,401);
},{googleOnly:true}));

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
