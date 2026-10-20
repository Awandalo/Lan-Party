import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {before,test} from 'node:test';
const require=createRequire(import.meta.url),wr=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=wr('miniflare'),{build}=wr('esbuild');
const origin='http://127.0.0.1:5173',keyConfig={MFA_ENCRYPTION_KEYS:JSON.stringify({fixture:'44'.repeat(32)}),MFA_ACTIVE_KEY_ID:'fixture'};
const profile={nickname:'MFA Fixture',firstName:'Fictional',lastName:'Participant',email:'mfa@example.test',password:'fictional initial password'};
let script,migrations;
before(async()=>{
 script=(await build({stdin:{resolveDir:fileURLToPath(new URL('../../',import.meta.url)),contents:`
  import app from './worker/index';import * as foundation from './worker/auth/mfa-crypto';
  import * as enrollment from './worker/auth/mfa-enrollment';import {localMailbox} from './worker/auth/email';
  import {issueSession,D1SessionStore,resolveSession} from './worker/auth/sessions';
  import {completePrimary,pendingLogin,completeMfa} from './worker/auth/mfa-login';
  import {LoginLimiter} from './worker/auth/login-limits';
  import {generate} from '@otplib/totp';import {crypto as otpCrypto} from '@otplib/plugin-crypto-web';import {base32} from '@otplib/plugin-base32-scure';
  globalThis.fetch=async(url,init)=>{
    if(String(url)==='https://challenges.cloudflare.com/turnstile/v0/siteverify')return Response.json({success:JSON.parse(init.body).response==='synthetic-mfa-proof',hostname:'127.0.0.1',action:'login'});
    throw Error('No external requests allowed in MFA fixture');
  };
  export default {async fetch(request,env){
   if(new URL(request.url).pathname!=='/fixture')return app.fetch(request,env);
   const {action,args=[]}=await request.json();try{
    if(action==='take')return Response.json(localMailbox.take('mfa@example.test',Math.floor(Date.now()/1000),'email-verification'));
    if(action==='resetmail')return Response.json(localMailbox.take('mfa@example.test',Math.floor(Date.now()/1000),'password-reset'));
    if(action==='challengeAt')return Response.json(!!await pendingLogin(env.DB,...args));
    if(action==='signals'){const limiter=await LoginLimiter.create(env.DB,env.AUTH_RATE_LIMIT_SECRET,args[0]);for(let i=0;i<60;i++)await limiter.observe();return Response.json(true);}
    if(action==='missingKeys'){
      const row=await pendingLogin(env.DB,args[0],args[1],args[3]);
      const limiter=await LoginLimiter.create(env.DB,env.AUTH_RATE_LIMIT_SECRET,'loopback'),held=await limiter.reserveMfa(row.user_id,row.token_digest);
      try{return Response.json(await completeMfa(env.DB,row,args[2],'recovery',{},'local',args[3],held));}finally{await held.finish(false);}
    }
    if(action==='generate')return Response.json(await generate({...args[0],secret:base32.decode(args[0].secret),crypto:otpCrypto}));
    if(action==='activate'){
     const statements=await enrollment.prepareEnrollmentActivation(env.DB,...args);
     const results=await env.DB.batch(statements);return Response.json(results.map(r=>r.results.length));
    }
    if(action==='activateRace'){
     const statements=await enrollment.prepareEnrollmentActivation(env.DB,...args);
     await env.DB.prepare('UPDATE users SET auth_version=auth_version+1 WHERE id=?').bind(args[0].userId).run();
     return Response.json((await env.DB.batch(statements)).map(r=>r.results.length));
    }
    if(action==='redeem')return Response.json(await(await enrollment.prepareRecoveryRedemption(env.DB,...args)).first());
    if(action==='redeemRollback')return Response.json(await env.DB.batch([await enrollment.prepareRecoveryRedemption(env.DB,...args),env.DB.prepare('INSERT INTO auth_totp_factors SELECT * FROM auth_totp_factors')]));
    if(action==='replay')return Response.json(await enrollment.prepareTotpReplayUpdate(env.DB,...args).first());
    if(action==='issue')return Response.json(await issueSession(new D1SessionStore(env.DB),...args));
    if(action==='resolve')return Response.json(await resolveSession(env.DB,...args));
    if(action==='primary')return Response.json(await completePrimary(env.DB,...args));
    if(action==='expiredLease'){
      const row=await pendingLogin(env.DB,args[0],args[1],args[3]);
      const limiter=await LoginLimiter.create(env.DB,env.AUTH_RATE_LIMIT_SECRET,'loopback');
      const held=await limiter.reserveMfa(row.user_id,row.token_digest);
      await env.DB.prepare('UPDATE registration_rate_limits SET expires_at=0').run();
      return Response.json(await completeMfa(env.DB,row,args[2],'recovery',env,'local',args[3],held));
    }
    if(foundation[action])return Response.json(await foundation[action](...args));
    if(enrollment[action])return Response.json(await enrollment[action](...(action==='requireEnrollmentActivation'?args:[env.DB,...args])));
    throw Error();
   }catch{return Response.json({error:'Fictional operation rejected'},{status:409});}
  }};`},bundle:true,write:false,format:'esm',platform:'browser'})).outputFiles[0].text;
 migrations=[];
 for(const name of(await readdir(new URL('../../migrations/',import.meta.url))).filter(n=>/^\d{4}_.*\.sql$/.test(n)).sort()){
  let rest=(await readFile(new URL('../../migrations/'+name,import.meta.url),'utf8')).replace(/--[^\n]*/g,'').trim(),parts=[];
  while(rest){const end=rest.startsWith('CREATE TRIGGER')?rest.indexOf('\nEND;')+5:rest.indexOf(';')+1;if(end<=0||end===4)throw Error('Incomplete migration');parts.push(rest.slice(0,end));rest=rest.slice(end).trim();}migrations.push(parts);
 }
});

const cookieJar=response=>response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
async function enrollHttp({request,seed,call}){
 const original=await seed(),Cookie=original.cookie;
 const csrf=(await(await request('session',undefined,{Cookie})).json()).csrfToken;
 const headers={Cookie,'X-CSRF-Token':csrf};
 const start=await request('mfa/enroll/start',{},headers);assert.equal(start.status,200);
 const setup=await start.json(),code=await call('generate',{secret:setup.secret,epoch:Math.floor(Date.now()/1000)});
 const staged=await request('mfa/enroll/verify',{token:setup.token,code},headers);assert.equal(staged.status,200);
 const codes=await staged.json();
 const activate=()=>request('mfa/enroll/activate',{token:setup.token,acknowledgment:codes.acknowledgment},headers);
 return {...original,setup,codes,activate,headers};
}
async function challengeHttp(request){
 const login=await request('login',{email:profile.email,password:profile.password});assert.equal(login.status,200);
 assert.equal((await login.json()).next,'/mfa');const Cookie=cookieJar(login);
 const response=await request('mfa/challenge',undefined,{Cookie});assert.equal(response.status,200);
 const challenge=await response.json();return {Cookie,'X-CSRF-Token':challenge.csrfToken};
}

test('local acknowledgment activates atomically and replaces the session and CSRF; duplicate/lost responses are safe',()=>local(async fixture=>{
 const {request,db}=fixture,{activate,headers,codes}=await enrollHttp(fixture);
 const results=await Promise.all([activate(),activate()]);assert.equal(results.filter(r=>r.status===200).length,1);
 const Cookie=cookieJar(results.find(r=>r.status===200));
 assert.equal((await request('session',undefined,headers)).status,401);
 const current=await request('session',undefined,{Cookie});assert.equal(current.status,200);
 assert.notEqual((await current.json()).csrfToken,headers['X-CSRF-Token']);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_session_mfa').first('n'),1);
 const pending=await challengeHttp(request);
 assert.equal((await request('mfa/complete',{method:'recovery',code:codes.codes[0]},pending)).status,200);
 assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
}));

test('pending cookies grant no protected access; browser, origin and CSRF are bound; cancellation and expiry require primary login',()=>local(async fixture=>{
 const {request,db}=fixture,{activate}=await enrollHttp(fixture);assert.equal((await activate()).status,200);
 let headers=await challengeHttp(request);
 assert.equal((await request('session',undefined,headers)).status,401);
 assert.equal((await request('google/methods',undefined,headers)).status,404); // Google disabled in this fixture.
 assert.equal((await request('logout',{},headers)).status,401);
 assert.equal((await request('mfa/complete',{method:'totp',code:'000000'},{Cookie:headers.Cookie})).status,403);
 assert.equal((await request('mfa/complete',{method:'totp',code:'000000'},{...headers,Origin:'https://evil.example.test'})).status,403);
 assert.equal((await request('mfa/challenge',undefined,{Cookie:headers.Cookie.replace(/lan_mfa_local_browser=[a-f0-9]+/,'lan_mfa_local_browser='+'00'.repeat(32))})).status,401);
 assert.equal((await request('mfa/cancel',{},headers)).status,200);
 assert.equal((await request('mfa/challenge',undefined,headers)).status,401);
 headers=await challengeHttp(request);
 await db.prepare("UPDATE auth_mfa_transactions SET phase='cancelled' WHERE purpose='login' AND phase='pending'").run();
 assert.equal((await request('mfa/challenge',undefined,headers)).status,401);
}));

test('TOTP login advances replay cutoff, concurrent completion has one winner, and same-step replay fails',()=>local(async fixture=>{
 const {request,db,call}=fixture,{activate,setup}=await enrollHttp(fixture);assert.equal((await activate()).status,200);
 // Enrollment already consumed this step. Move fixture cutoff back solely to test a fresh login code.
 const factor=await db.prepare('SELECT * FROM auth_totp_factors').first();
 await db.exec('DROP TRIGGER auth_mfa_step_monotonic;');await db.prepare('UPDATE auth_totp_factors SET last_step=?').bind(factor.last_step-1).run();
 const headers=await challengeHttp(request),code=await call('generate',{secret:setup.secret,epoch:Math.floor(Date.now()/1000)});
 const results=await Promise.all([request('mfa/complete',{method:'totp',code},headers),request('mfa/complete',{method:'totp',code},headers)]);
 assert.equal(results.filter(r=>r.status===200).length,1);
 const next=await challengeHttp(request);assert.equal((await request('mfa/complete',{method:'totp',code},next)).status,401);
 assert.equal(await db.prepare('SELECT last_step FROM auth_totp_factors').first('last_step'),Math.floor(Date.now()/30000));
}));

test('recovery redemption and session issuance roll back together, are single-use across challenges, and survive generation revocation',()=>local(async fixture=>{
 const {request,db}=fixture,{activate,codes}=await enrollHttp(fixture);await activate();
 const headers=await challengeHttp(request);
 await db.exec("CREATE TRIGGER fixture_session_failure BEFORE INSERT ON auth_session_mfa BEGIN SELECT RAISE(ABORT,'fictional'); END;");
 assert.equal((await request('mfa/complete',{method:'recovery',code:codes.codes[0]},headers)).status,503);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE consumed_at IS NOT NULL').first('n'),0);
 assert.equal(await db.prepare("SELECT count(*) n FROM auth_mfa_transactions WHERE purpose='login' AND phase='pending'").first('n'),1);
 await db.exec('DROP TRIGGER fixture_session_failure;');
 assert.equal((await request('mfa/complete',{method:'recovery',code:codes.codes[0]},headers)).status,200);
 const next=await challengeHttp(request);assert.equal((await request('mfa/complete',{method:'recovery',code:codes.codes[0]},next)).status,401);
 await db.prepare('UPDATE users SET auth_version=auth_version+1').run();
 assert.equal((await request('mfa/complete',{method:'recovery',code:codes.codes[1]},next)).status,401);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_totp_factors').first('n'),1);
}));

test('five confirmed failures restrict challenge and user/IP across restarts without counting successful or pending checks',()=>local(async fixture=>{
 const {request}=fixture,{activate,codes}=await enrollHttp(fixture);await activate();
 const fixed={'CF-Connecting-IP':'203.0.113.77'},headers={...await challengeHttp(request),...fixed};
 for(let i=0;i<4;i++)assert.equal((await request('mfa/complete',{method:'recovery',code:'A'.repeat(26)},headers)).status,401);
 assert.equal((await request('mfa/complete',{method:'recovery',code:codes.codes[0]},headers)).status,200);
 const next={...await challengeHttp(request),...fixed};
 assert.equal((await request('mfa/complete',{method:'recovery',code:'A'.repeat(26)},next)).status,401);
 const blocked=await request('mfa/complete',{method:'recovery',code:codes.codes[1]},next);
 assert.equal(blocked.status,429);assert.ok(Number(blocked.headers.get('Retry-After'))>0);
 assert.equal((await request('mfa/complete',{method:'recovery',code:codes.codes[1]},await challengeHttp(request))).status,200);
}));

test('account ten-failure ceiling spans IPs and challenge restarts; generation change cannot bypass it',()=>local(async fixture=>{
 const {request}=fixture,{activate,codes}=await enrollHttp(fixture);await activate();
 for(let i=0;i<10;i++){
  const headers=await challengeHttp(request);assert.equal((await request('mfa/complete',{method:'recovery',code:'A'.repeat(26)},headers)).status,401);
 }
 const response=await request('mfa/complete',{method:'recovery',code:codes.codes[0]},await challengeHttp(request));assert.equal(response.status,429);
}));

test('expired lease cannot consume recovery proof or create a session; a later lease recovers safely',()=>local(async fixture=>{
 const {request,call,db}=fixture,{activate,codes}=await enrollHttp(fixture);await activate();
 const headers=await challengeHttp(request),parts=Object.fromEntries(headers.Cookie.split('; ').map(c=>c.split('=')));
 assert.equal(await call('expiredLease',parts.lan_mfa_local_pending,parts.lan_mfa_local_browser,codes.codes[0],Math.floor(Date.now()/1000)),null);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE consumed_at IS NOT NULL').first('n'),0);
 assert.equal((await request('mfa/complete',{method:'recovery',code:codes.codes[0]},headers)).status,200);
}));

test('shared primary completion cannot turn Google authentication into an MFA bypass; hosted enrollment remains unavailable',()=>local(async fixture=>{
 const {request,call,db,instance}=fixture,{activate,c}=await enrollHttp(fixture);await activate();
 const result=await call('primary',{userId:c.userId,authVersion:1,status:'active',emailVerifiedAt:c.now},'google',Math.floor(Date.now()/1000));
 assert.equal(result.kind,'pending');assert.equal(await call('resolve',result.token,Math.floor(Date.now()/1000)),null);
 assert.equal(await db.prepare("SELECT primary_method FROM auth_mfa_transactions WHERE purpose='login'").first('primary_method'),'google');
 assert.equal((await instance.dispatchFetch('https://dev.lan-party.club/api/auth/mfa/enroll/start',{method:'POST'})).status,404);
 assert.equal((await request('login',{email:profile.email,password:'fictional incorrect password'})).status,401);
 assert.equal((await request('login',{email:'unknown@example.test',password:profile.password})).status,401);
}));

test('shared abuse signals require server-verified single-use Turnstile without spending a recovery code first',()=>local(async fixture=>{
 const {request,call,db}=fixture,{activate,codes}=await enrollHttp(fixture);await activate();
 const headers={...await challengeHttp(request),'CF-Connecting-IP':'203.0.113.88'};
 await call('signals','203.0.113.88');
 const input={method:'recovery',code:codes.codes[0]};
 assert.equal((await request('mfa/complete',input,headers)).status,403);
 assert.equal((await request('mfa/complete',{...input,turnstileToken:'incorrect-fixture-proof'},headers)).status,403);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE consumed_at IS NOT NULL').first('n'),0);
 assert.equal((await request('mfa/complete',{...input,turnstileToken:'synthetic-mfa-proof'},headers)).status,200);
}));

test('pending expiry, missing encryption keys and stale generations fail closed without consuming proof',()=>local(async fixture=>{
 const {request,raw,call,db}=fixture,{activate,codes}=await enrollHttp(fixture);await activate();
 const headers=await challengeHttp(request),parts=Object.fromEntries(headers.Cookie.split('; ').map(c=>c.split('='))),now=Math.floor(Date.now()/1000);
 assert.equal(await call('challengeAt',parts.lan_mfa_local_pending,parts.lan_mfa_local_browser,now+301),false);
 assert.equal((await raw('missingKeys',parts.lan_mfa_local_pending,parts.lan_mfa_local_browser,codes.codes[0],now)).status,409);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE consumed_at IS NOT NULL').first('n'),0);
 // A newly completed primary login cancels only this browser's preceding challenge.
 const newLogin=await request('login',{email:profile.email,password:profile.password},{Cookie:headers.Cookie});assert.equal(newLogin.status,200);
 assert.equal((await request('mfa/challenge',undefined,headers)).status,401);
}));

test('normal password recovery revokes sessions and pending challenges but never removes the MFA factor or recovery set',()=>local(async fixture=>{
 const {request,call,db}=fixture,{activate,codes}=await enrollHttp(fixture);const active=await activate();
 const pending=await challengeHttp(request);
 assert.equal((await request('forgot-password',{email:profile.email})).status,202);
 const mail=await call('resetmail'),url=new URL(mail.url),fragment=new URLSearchParams(url.hash.slice(1));
 const reset=await request('reset-password',{userId:fragment.get('user'),token:fragment.get('token'),password:'fictional replacement password'});assert.equal(reset.status,200);
 assert.equal((await request('session',undefined,{Cookie:cookieJar(active)})).status,401);
 assert.equal((await request('mfa/challenge',undefined,pending)).status,401);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_totp_factors').first('n'),1);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE consumed_at IS NULL').first('n'),10);
 const login=await request('login',{email:profile.email,password:'fictional replacement password'});assert.equal((await login.clone().json()).next,'/mfa');
 const Cookie=cookieJar(login),state=await(await request('mfa/challenge',undefined,{Cookie})).json();
 assert.equal((await request('mfa/complete',{method:'recovery',code:codes.codes[0]},{Cookie,'X-CSRF-Token':state.csrfToken})).status,200);
}));
async function local(run,{legacy=false}={}){
 const instance=new Miniflare(convertV4MiniflareOptions({modules:true,script,cf:false,compatibilityDate:'2026-10-11',d1Databases:{DB:randomUUID()},
  bindings:{REGISTRATION_MODE:'local-only',AUTH_SESSION_MODE:'local-only',AUTH_EMAIL_TRANSPORT:'local',AUTH_PUBLIC_ORIGIN:origin,
   AUTH_LOCAL_MAIL_SECRET:'33'.repeat(32),PASSWORD_PEPPER:'11'.repeat(32),AUTH_RATE_LIMIT_SECRET:'22'.repeat(32),...keyConfig,
   AUTH_TURNSTILE_SITE_KEY:'synthetic-site-key',TURNSTILE_SECRET_KEY:'synthetic-only-turnstile-secret'}}));
 try{
  const db=await instance.getD1Database('DB');const apply=n=>db.batch(migrations[n-1].map(s=>db.prepare(s)));
  for(let n=1;n<=12;n++)await apply(n);if(!legacy)await apply(13);
  let ordinal=0;
  const request=(path,input,headers={})=>instance.dispatchFetch(origin+'/api/auth/'+path,{method:input===undefined?'GET':'POST',...(input===undefined?{}:{body:JSON.stringify(input)}),headers:{Origin:origin,'X-LAN-Request':'1','Content-Type':'application/json','CF-Connecting-IP':`203.0.113.${++ordinal}`,...headers}});
  const raw=(action,...args)=>instance.dispatchFetch(origin+'/fixture',{method:'POST',body:JSON.stringify({action,args})});
  const call=async(action,...args)=>{const r=await raw(action,...args);assert.equal(r.status,200,action+' rejected');return r.json();};
  const seed=async()=>{
   assert.equal((await request('register',profile)).status,202);
   const link=new URL((await call('take')).url),proof=new URLSearchParams(link.hash.slice(1));
   assert.equal((await request('verify-email',{userId:proof.get('user'),token:proof.get('token')})).status,200);
   const login=await request('login',{email:profile.email,password:profile.password});assert.equal(login.status,200);
   const cookie=login.headers.get('set-cookie').split(';')[0],token=cookie.split('=')[1],sessionDigest=createHash('sha256').update('lan-party:session:v1:'+token).digest('hex');
   const user=await db.prepare('SELECT id,auth_version FROM users').first(),now=Math.floor(Date.now()/1000);
   await db.prepare(`INSERT INTO auth_recent_authentication(session_digest,user_id,auth_version,method,authenticated_at,expires_at)
    VALUES (?,?,?,'password',?,?) ON CONFLICT(session_digest) DO NOTHING`).bind(sessionDigest,user.id,user.auth_version,now,now+300).run();
   return {c:{userId:user.id,authVersion:user.auth_version,sessionDigest,browserDigest:'aa'.repeat(32),now},cookie,token};
  };
  const begin=c=>call('beginEnrollment',c,keyConfig,'local','MFA Fixture #0011');
  const stage=async c=>{const setup=await begin(c);const code=await call('generate',{secret:setup.secret,epoch:c.now});
   const codes=await call('verifyEnrollment',c,setup.token,code,keyConfig,'local','22'.repeat(32));return {setup,codes};};
  await run({db,apply,instance,raw,call,request,seed,begin,stage});
 }finally{await instance.dispose();}
}

test('MFA crypto uses RFC SHA1 vectors and enforces six digits, clock window and replay cutoff in workerd',()=>local(async({call})=>{
 const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
 for(const [time,eight] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']]){
  assert.equal(await call('verifyTotp',secret,eight.slice(-6),time),Math.floor(time/30));
 }
 const epoch=1234567890,code='005924',step=Math.floor(epoch/30);
 assert.equal(await call('verifyTotp',secret,code,epoch+30),step);
 assert.equal(await call('verifyTotp',secret,code,epoch-30),step);
 for(const time of [epoch-60,epoch+60])assert.equal(await call('verifyTotp',secret,code,time),null);
 assert.equal(await call('verifyTotp',secret,code,epoch,step),null);
 assert.equal(await call('verifyTotp',secret,'89005924',epoch),null);
}));

test('AES-GCM rejects tampering, wrong context and missing/wrong keys; key IDs support rotation',()=>local(async({call,raw})=>{
 const context={userId:randomUUID(),id:randomUUID(),environment:'local',purpose:'pending'},secret=await call('generateTotpSecret');
 const sealed=await call('encryptTotpSecret',secret,keyConfig,context),second=await call('encryptTotpSecret',secret,keyConfig,context);
 assert.notEqual(sealed.nonce,second.nonce);assert.equal(sealed.ciphertext.length,72);assert.equal(sealed.nonce.length,24);
 assert.equal(await call('decryptTotpSecret',sealed,keyConfig,context),secret);
 const ring={MFA_ENCRYPTION_KEYS:JSON.stringify({fixture:'44'.repeat(32),next:'55'.repeat(32)}),MFA_ACTIVE_KEY_ID:'next'};
 assert.equal(await call('decryptTotpSecret',sealed,ring,context),secret);
 assert.equal((await call('encryptTotpSecret',secret,ring,context)).keyId,'next');
 for(const changed of [{...context,userId:randomUUID()},{...context,id:randomUUID()},{...context,purpose:'active'},{...context,environment:'dev'}])assert.equal((await raw('decryptTotpSecret',sealed,keyConfig,changed)).status,409);
 for(const invalid of [{},{...keyConfig,MFA_ACTIVE_KEY_ID:'missing'},{MFA_ENCRYPTION_KEYS:JSON.stringify({fixture:'66'.repeat(32)}),MFA_ACTIVE_KEY_ID:'fixture'}])assert.equal((await raw('decryptTotpSecret',sealed,invalid,context)).status,409);
 assert.equal((await raw('decryptTotpSecret',{...sealed,ciphertext:(sealed.ciphertext[0]==='0'?'1':'0')+sealed.ciphertext.slice(1)},keyConfig,context)).status,409);
}));

test('recovery codes use ten independent 128-bit values and account/set-bound non-reversible verifiers',()=>local(async({call})=>{
 const user=randomUUID(),set=randomUUID(),result=await call('generateRecoveryCodes',user,set);
 assert.equal(result.codes.length,10);assert.equal(new Set(result.codes).size,10);
 assert.equal(new Set(result.verifiers).size,10);
 for(let n=0;n<10;n++){
  assert.equal(result.codes[n].replaceAll('-','').length,26);
  assert.match(result.verifiers[n],/^[a-f0-9]{64}$/);
  assert.equal(await call('recoveryVerifier',user,set,result.codes[n].toLowerCase()),result.verifiers[n]);
  assert.notEqual(await call('recoveryVerifier',user,randomUUID(),result.codes[n]),result.verifiers[n]);
  assert.notEqual(await call('recoveryVerifier',randomUUID(),set,result.codes[n]),result.verifiers[n]);
 }
 assert.equal(await call('recoveryVerifier',user,set,'invalid'),null);
}));

test('0013 preserves populated existing accounts, credentials, sessions, roles and member history',()=>local(async({db,seed,apply,request})=>{
 const {cookie}=await seed(),tables=['users','user_password_credentials','user_auth_providers','auth_sessions','auth_recent_authentication','member_numbers','user_roles','registration_rate_limits'];
 const userId=await db.prepare('SELECT id FROM users').first('id');
 await db.prepare("INSERT INTO user_roles(user_id,role_id,assigned_at) SELECT ?,id,unixepoch() FROM roles WHERE code='admin'").bind(userId).run();
 await db.prepare("INSERT INTO user_auth_providers(id,user_id,provider,identity_namespace,provider_subject,linked_at) VALUES (?,?,'google','https://accounts.google.com','fictional-mfa-subject',unixepoch())").bind(randomUUID(),userId).run();
 const snapshot=()=>Promise.all(tables.map(t=>db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all().then(r=>r.results)));
 const before=await snapshot();await apply(13);assert.deepEqual(await snapshot(),before);
 for(const table of ['auth_totp_factors','auth_mfa_transactions','auth_mfa_recovery_codes','auth_session_mfa']){
  assert.equal(await db.prepare('SELECT count(*) n FROM '+table).first('n'),0);
  assert.equal((await db.prepare('PRAGMA table_list').all()).results.find(r=>r.name===table).strict,1);
 }
 assert.equal((await request('session',undefined,{Cookie:cookie})).status,200);
 assert.equal((await request('login',{email:profile.email,password:profile.password})).status,200);
 assert.equal(await db.prepare('PRAGMA foreign_keys').first('foreign_keys'),1);
 assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 assert.equal(await db.prepare('PRAGMA quick_check').first('quick_check'),'ok');
},{legacy:true}));

test('enrollment encrypts pending secrets and stages codes once without activating; lost display is safe',()=>local(async({db,seed,begin,call,raw})=>{
 const {c}=await seed(),setup=await begin(c),row=await db.prepare('SELECT * FROM auth_mfa_transactions').first();
 assert.equal(row.phase,'pending');assert.equal(row.expires_at-row.created_at,600);
 for(const value of [setup.secret,setup.token,setup.uri])assert.equal(JSON.stringify(row).includes(value),false);
 assert.equal(new URL(setup.uri).protocol,'otpauth:');assert.ok(!setup.uri.includes(profile.email));
 const code=await call('generate',{secret:setup.secret,epoch:c.now});
 const recovery=await call('verifyEnrollment',c,setup.token,code,keyConfig,'local','22'.repeat(32));
 assert.equal(recovery.codes.length,10);
 assert.equal(await call('redeem',c.userId,c.authVersion,row.factor_id,recovery.codes[0],c.now),null);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_totp_factors').first('n'),0);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes').first('n'),10);
 const stored=JSON.stringify((await db.prepare('SELECT * FROM auth_mfa_recovery_codes').all()).results);
 for(const code of recovery.codes)assert.equal(stored.includes(code),false);
 assert.equal((await raw('verifyEnrollment',c,setup.token,code,keyConfig,'local','22'.repeat(32))).status,409);
 assert.equal(await call('requireEnrollmentActivation'),true);
 // Without the one-time acknowledgment (lost response), even the prepared batch cannot activate.
 assert.deepEqual(await call('activate',c,setup.token,'00'.repeat(32),keyConfig,'local'),[0,0,0]);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_totp_factors').first('n'),0);
 assert.equal(await call('cancelEnrollment',c,setup.token),true);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes').first('n'),0);
 const cancelled=await db.prepare('SELECT * FROM auth_mfa_transactions').first();
 assert.equal(cancelled.phase,'cancelled');assert.equal(cancelled.secret_ciphertext,null);assert.equal(cancelled.ack_digest,null);
 await begin(c);
}));

test('enrollment binds session/browser/account/generation and requires recent primary proof',()=>local(async({db,seed,begin,raw,call})=>{
 const {c}=await seed();
 for(const wrong of [{...c,userId:randomUUID()},{...c,sessionDigest:'bb'.repeat(32)},{...c,authVersion:1},{...c,now:c.now+120}])assert.equal((await raw('beginEnrollment',wrong,keyConfig,'local','MFA Fixture')).status,409);
 const setup=await begin(c),code=await call('generate',{secret:setup.secret,epoch:c.now});
 for(const wrong of [{...c,userId:randomUUID()},{...c,sessionDigest:'bb'.repeat(32)},{...c,browserDigest:'bb'.repeat(32)},{...c,authVersion:1},{...c,now:c.now+601}]){
  assert.equal((await raw('verifyEnrollment',wrong,setup.token,code,keyConfig,'local','22'.repeat(32))).status,409);
 }
 await db.prepare('UPDATE users SET auth_version=auth_version+1').run();
 assert.equal((await raw('verifyEnrollment',c,setup.token,code,keyConfig,'local','22'.repeat(32))).status,409);
 const row=await db.prepare('SELECT phase,secret_ciphertext FROM auth_mfa_transactions').first();assert.equal(row.phase,'cancelled');assert.equal(row.secret_ciphertext,null);
}));

test('expired enrollment can restart without activating and without retaining temporary secret material',()=>local(async({db,seed,begin,call})=>{
 const {c}=await seed(),old=await begin(c),later={...c,now:c.now+601};
 await db.prepare('UPDATE auth_recent_authentication SET authenticated_at=?,expires_at=?').bind(later.now,later.now+300).run();
 await begin(later);
 assert.equal(await db.prepare("SELECT count(*) n FROM auth_mfa_transactions WHERE phase='pending'").first('n'),1);
 const row=await db.prepare("SELECT secret_ciphertext,phase FROM auth_mfa_transactions WHERE phase='cancelled'").first();
 assert.equal(row.secret_ciphertext,null);assert.equal(await db.prepare('SELECT count(*) n FROM auth_totp_factors').first('n'),0);
 assert.equal(await call('cancelEnrollment',later,old.token),false);
}));

test('concurrent enrollment proof cannot replay or duplicate recovery sets; failed staging rolls back',()=>local(async({db,seed,begin,call,raw})=>{
 const {c}=await seed(),setup=await begin(c),code=await call('generate',{secret:setup.secret,epoch:c.now});
 await db.exec("CREATE TRIGGER fixture_code_failure BEFORE INSERT ON auth_mfa_recovery_codes BEGIN SELECT RAISE(ABORT,'fictional'); END;");
 assert.equal((await raw('verifyEnrollment',c,setup.token,code,keyConfig,'local','22'.repeat(32))).status,409);
 assert.equal(await db.prepare('SELECT phase FROM auth_mfa_transactions').first('phase'),'pending');
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes').first('n'),0);
 await db.exec('DROP TRIGGER fixture_code_failure;');
 const results=await Promise.all([raw('verifyEnrollment',c,setup.token,code,keyConfig,'local','22'.repeat(32)),raw('verifyEnrollment',c,setup.token,code,keyConfig,'local','22'.repeat(32))]);
 assert.equal(results.filter(r=>r.status===200).length,1);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes').first('n'),10);
}));

test('prepared activation is atomic, rejects duplicates, revokes old sessions and login requires MFA',()=>local(async({db,seed,stage,call,raw,request})=>{
 const {c,cookie}=await seed(),{setup,codes}=await stage(c);
 await db.exec("CREATE TRIGGER fixture_activation_failure BEFORE INSERT ON auth_totp_factors BEGIN SELECT RAISE(ABORT,'fictional'); END;");
 assert.equal((await raw('activate',c,setup.token,codes.acknowledgment,keyConfig,'local')).status,409);
 assert.equal(await db.prepare('SELECT phase FROM auth_mfa_transactions').first('phase'),'verified');
 assert.equal((await request('session',undefined,{Cookie:cookie})).status,200);
 await db.exec('DROP TRIGGER fixture_activation_failure;');
 const result=await call('activate',c,setup.token,codes.acknowledgment,keyConfig,'local');assert.deepEqual(result,[1,0,1]);
 assert.equal((await raw('activate',c,setup.token,codes.acknowledgment,keyConfig,'local')).status,409);
 assert.equal((await request('session',undefined,{Cookie:cookie})).status,401);
 assert.equal(await db.prepare('SELECT auth_version FROM users').first('auth_version'),1);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_totp_factors').first('n'),1);
 const login=await request('login',{email:profile.email,password:profile.password});assert.equal(login.status,200);assert.equal((await login.json()).next,'/mfa');
 for(const route of ['start','verify','activate','cancel'])assert.equal((await request('mfa/enroll/'+route,{})).status,401);
 assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
}));

test('active recovery codes are single-use under concurrency and stale generations cannot redeem',()=>local(async({db,seed,stage,call,raw})=>{
 const {c}=await seed(),{setup,codes}=await stage(c);await call('activate',c,setup.token,codes.acknowledgment,keyConfig,'local');
 const factor=await db.prepare('SELECT * FROM auth_totp_factors').first();
 const args=[c.userId,1,factor.factor_id,codes.codes[0],c.now];
 assert.equal((await raw('redeemRollback',...args)).status,409);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE consumed_at IS NOT NULL').first('n'),0);
 const results=await Promise.all([call('redeem',...args),call('redeem',...args)]);
 assert.equal(results.filter(Boolean).length,1);assert.equal(await call('redeem',...args),null);
 assert.equal(await call('redeem',c.userId,0,factor.factor_id,codes.codes[1],c.now),null);
 assert.equal(await call('redeem',c.userId,1,randomUUID(),codes.codes[1],c.now),null);
 assert.equal((await db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE consumed_at IS NOT NULL').first('n')),1);
 const rows=await db.prepare('SELECT verifier FROM auth_mfa_recovery_codes WHERE consumed_at IS NOT NULL').all();
 assert.equal((await raw('recoveryVerifier',c.userId,factor.recovery_set_id,codes.codes[0])).status,200);assert.equal(rows.results.length,1);
}));

test('enrollment confirmed-failure throttling allows a correct fifth attempt and never spends login allowances',async()=>{
 for(const failures of [4,5])await local(async({db,seed,begin,call,raw,request})=>{
  const {c}=await seed(),setup=await begin(c),valid=await call('generate',{secret:setup.secret,epoch:c.now});
  const window=new Set(await Promise.all([-30,0,30].map(offset=>call('generate',{secret:setup.secret,epoch:c.now+offset}))));
  const wrong=['000000','111111','222222','333333'].find(code=>!window.has(code));
  for(let i=0;i<failures;i++)assert.equal((await raw('verifyEnrollment',c,setup.token,wrong,keyConfig,'local','22'.repeat(32))).status,409);
  const result=await raw('verifyEnrollment',c,setup.token,valid,keyConfig,'local','22'.repeat(32));
  assert.equal(result.status,failures===4?200:409);
  assert.equal(await db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes').first('n'),failures===4?10:0);
  assert.equal((await request('login',{email:profile.email,password:profile.password})).status,200);
 });
});

test('TOTP replay state advances atomically and cannot move backward',()=>local(async({db,seed,stage,call})=>{
 const {c}=await seed(),{setup,codes}=await stage(c);await call('activate',c,setup.token,codes.acknowledgment,keyConfig,'local');
 const f=await db.prepare('SELECT * FROM auth_totp_factors').first();
 const results=await Promise.all([call('replay',c.userId,1,f.factor_id,f.last_step,f.last_step+1,c.now),call('replay',c.userId,1,f.factor_id,f.last_step,f.last_step+1,c.now)]);
 assert.equal(results.filter(Boolean).length,1);assert.equal(await call('replay',c.userId,1,f.factor_id,f.last_step,f.last_step+1,c.now),null);
 await assert.rejects(()=>db.prepare('UPDATE auth_totp_factors SET last_step=?').bind(f.last_step).run());
}));

test('session resolution rejects unassured MFA sessions even when inserted outside the issuer',()=>local(async({db,seed,stage,call})=>{
 const {c,token}=await seed(),{setup,codes}=await stage(c);await call('activate',c,setup.token,codes.acknowledgment,keyConfig,'local');
 assert.equal(await call('resolve',token,c.now),null);
 const rawToken='cc'.repeat(32),digest=createHash('sha256').update('lan-party:session:v1:'+rawToken).digest('hex');
 await db.prepare('INSERT INTO auth_sessions(id,user_id,token_digest,auth_version,created_at,expires_at) VALUES (?,?,?,1,?,?)').bind(randomUUID(),c.userId,digest,c.now,c.now+604800).run();
 assert.equal(await call('resolve',rawToken,c.now),null);
 const factor=await db.prepare('SELECT factor_id FROM auth_totp_factors').first('factor_id');
 await db.prepare(`INSERT INTO auth_session_mfa(session_digest,user_id,auth_version,factor_id,method,verified_at,primary_method,primary_authenticated_at)
  VALUES (?,?,1,?,'totp',?,'password',?)`).bind(digest,c.userId,factor,c.now,c.now).run();
 assert.equal((await call('resolve',rawToken,c.now)).userId,c.userId);
 await db.prepare('UPDATE users SET auth_version=auth_version+1').run();
 assert.equal(await call('resolve',rawToken,c.now),null);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_session_mfa').first('n'),0);
}));

test('partial MFA schema fails closed while missing schema supports old non-MFA accounts',()=>local(async({db,seed,request})=>{
 const {cookie}=await seed();await db.exec('CREATE TABLE auth_totp_factors (user_id TEXT);');
 assert.equal((await request('session',undefined,{Cookie:cookie})).status,503);
},{legacy:true}));

test('concurrent activation has one winner and a changed generation prevents a prepared activation',async()=>{
 await local(async({db,seed,stage,raw})=>{
  const {c}=await seed(),{setup,codes}=await stage(c);
  const responses=await Promise.all([raw('activate',c,setup.token,codes.acknowledgment,keyConfig,'local'),raw('activate',c,setup.token,codes.acknowledgment,keyConfig,'local')]);
  const bodies=await Promise.all(responses.map(r=>r.json()));
  assert.equal(bodies.filter(body=>Array.isArray(body)&&body[0]===1).length,1);
  assert.equal(await db.prepare('SELECT count(*) n FROM auth_totp_factors').first('n'),1);
  assert.equal(await db.prepare('SELECT auth_version FROM users').first('auth_version'),1);
 });
 await local(async({db,seed,stage,call})=>{
  const {c}=await seed(),{setup,codes}=await stage(c);
  assert.deepEqual(await call('activateRace',c,setup.token,codes.acknowledgment,keyConfig,'local'),[0,0,0]);
  assert.equal(await db.prepare('SELECT count(*) n FROM auth_totp_factors').first('n'),0);
 });
});

test('hosted enrollment cannot be enabled by frontend build variables',async()=>{
 const result=await build({entryPoints:['src/lib/mfa-mode.ts'],bundle:true,write:false,format:'esm',platform:'node',define:{'import.meta.env.DEV':'false','import.meta.env.VITE_MFA_MODE':'"hosted-dev"'}});
 const module=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
 assert.equal(module.MFA_ENROLLMENT_AVAILABLE,false);
});
