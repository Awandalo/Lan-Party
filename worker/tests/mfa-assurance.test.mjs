import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {before,test} from 'node:test';
const require=createRequire(import.meta.url),wr=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=wr('miniflare'),{build}=wr('esbuild');
const origin='http://127.0.0.1:5173',keys={MFA_ENCRYPTION_KEYS:JSON.stringify({fixture:'44'.repeat(32)}),MFA_ACTIVE_KEY_ID:'fixture'};
let script,migrations;
before(async()=>{
 script=(await build({stdin:{resolveDir:fileURLToPath(new URL('../../',import.meta.url)),contents:`
 import app from './worker/index';import {hashPassword} from './worker/auth/passwords';
 import {encryptTotpSecret,recoveryVerifier,mfaDigest} from './worker/auth/mfa-crypto';
 import {mfaMutationGuard,stepUp} from './worker/auth/mfa-assurance';import {LoginLimiter} from './worker/auth/login-limits';
 import {generate} from '@otplib/totp';import {crypto as otpCrypto} from '@otplib/plugin-crypto-web';import {base32} from '@otplib/plugin-base32-scure';
 let fixtureTime;const realNow=Date.now.bind(Date);Date.now=()=>fixtureTime??realNow();
 globalThis.fetch=async(url,init)=>{
  if(String(url)==='https://challenges.cloudflare.com/turnstile/v0/siteverify')return Response.json({success:JSON.parse(init.body).response==='fixture-challenge',hostname:'127.0.0.1',action:'login'});
  throw Error('External requests forbidden');
 };
 let expireWrite=false;
 function raceDatabase(db){
  const tracked=new WeakMap();
  const isWrite=sql=>/UPDATE user_password_credentials SET/s.test(sql);
  async function expire(statements){if(!expireWrite||!statements.some(s=>isWrite(tracked.get(s))))return;const change=expireWrite;expireWrite=false;
   if(change==='generation'){await db.prepare('UPDATE auth_recent_authentication SET auth_version=auth_version+1').run();return;}
   if(change==='wait-primary'){
    const at=await db.prepare('SELECT authenticated_at FROM auth_recent_authentication').first('authenticated_at');
    const deadline=Date.now()+5000;
    while(await db.prepare('SELECT unixepoch() AS clock').first('clock')<at+120){
     if(Date.now()>deadline)throw Error('Fixture database clock did not advance');
     await new Promise(resolve=>setTimeout(resolve,100));
    }
    return;
   }
   const old=await db.prepare('SELECT * FROM auth_session_mfa').first();
   await db.batch([db.prepare('DELETE FROM auth_session_mfa'),db.prepare('INSERT INTO auth_session_mfa(session_digest,user_id,auth_version,factor_id,method,verified_at,primary_method,primary_authenticated_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(old.session_digest,old.user_id,old.auth_version,old.factor_id,old.method,Math.floor(Date.now()/1000)-121,old.primary_method,old.primary_authenticated_at)]);
  }
  function wrap(s,sql){const w={bind(...values){return wrap(s.bind(...values),sql);},async first(...args){await expire([w]);return s.first(...args);},all(...args){return s.all(...args);},run(...args){return s.run(...args);},raw(...args){return s.raw(...args);},statement:s};tracked.set(w,sql);return w;}
  return {prepare:sql=>wrap(db.prepare(sql),sql),async batch(statements){await expire(statements);return db.batch(statements.map(s=>s.statement));}};
 }
 export default{async fetch(request,env){if(new URL(request.url).pathname!='/fixture')return app.fetch(request,{...env,DB:raceDatabase(env.DB)});
  const {action,args}=await request.json();
  if(action==='clock'){fixtureTime=args[0]===null?undefined:args[0]*1000;return Response.json(true);}
  if(action==='hash')return Response.json(await hashPassword(args[0],env.PASSWORD_PEPPER));
  if(action==='expireNextWrite'){expireWrite=args[0]??true;return Response.json(true);}
  if(action==='signals'){fixtureTime=realNow();const limiter=await LoginLimiter.create(env.DB,env.AUTH_RATE_LIMIT_SECRET,'loopback');for(let i=0;i<60;i++)await limiter.observe();return Response.json(true);}
  if(action==='secret')return Response.json(await encryptTotpSecret(args[0],env,{environment:'local',userId:args[1],id:args[2],purpose:'active'}));
  if(action==='verifier')return Response.json(await recoveryVerifier(...args));
  if(action==='otp')return Response.json(await generate({secret:base32.decode(args[0]),crypto:otpCrypto,epoch:Math.floor(Date.now()/1000)}));
  if(action==='guard'){
   const [account,digest,time]=args,g=await mfaMutationGuard(env.DB,account,digest);
   // Control SQLite's clock in this predicate-only fixture, not just Node/Worker
   // Date.now. The production guard and all its security conditions stay intact.
   if(time!==undefined&&!Number.isSafeInteger(time))throw Error('Invalid fixture clock');
   const sql=time===undefined?g.sql:g.sql.replaceAll('unixepoch()',String(time));
   return Response.json(!!await env.DB.prepare('SELECT 1 WHERE '+sql).bind(...g.values).first());
  }
  if(action==='race'){
   const [account,digest,change]=args,g=await mfaMutationGuard(env.DB,account,digest);
   if(change==='generation')await env.DB.prepare('UPDATE users SET auth_version=auth_version+1 WHERE id=?').bind(account.userId).run();
   if(change==='revoke')await env.DB.prepare('UPDATE auth_sessions SET revoked_at=unixepoch() WHERE token_digest=?').bind(digest).run();
   if(change==='missing')await env.DB.prepare('DELETE FROM auth_session_mfa WHERE session_digest=?').bind(digest).run();
   return Response.json((await env.DB.prepare('UPDATE users SET updated_at=updated_at WHERE id=? AND '+g.sql+' RETURNING id').bind(account.userId,...g.values).first())!==null);
  }
  if(action==='expiredLease'){
   const [account,digest,code]=args,limiter=await LoginLimiter.create(env.DB,env.AUTH_RATE_LIMIT_SECRET,'loopback');
   const held=await limiter.reserveMfa(account.userId,await mfaDigest('step-up',digest));
   try{await env.DB.prepare('UPDATE registration_rate_limits SET expires_at=0').run();return Response.json(await stepUp(env.DB,account,digest,code,'recovery',env,Math.floor(Date.now()/1000),held));}finally{await held.finish(false);}
  }
  throw Error('Unknown fictional operation');
 }};`},bundle:true,write:false,format:'esm',platform:'browser'})).outputFiles[0].text;
 migrations=[];
 for(const name of(await readdir(new URL('../../migrations/',import.meta.url))).filter(n=>/^\d{4}_.*\.sql$/.test(n)).sort()){
  let rest=(await readFile(new URL('../../migrations/'+name,import.meta.url),'utf8')).replace(/--[^\n]*/g,'').trim(),parts=[];
  while(rest){const end=rest.startsWith('CREATE TRIGGER')?rest.indexOf('\nEND;')+5:rest.indexOf(';')+1;if(end<=0||end===4)throw Error('Incomplete SQL');parts.push(rest.slice(0,end));rest=rest.slice(end).trim();}migrations.push(parts);
 }
});
const password='fictional strong password',secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',recovery='AAAAA-AAAAA-AAAAA-AAAAA-AAAAAA';
const digest=token=>createHash('sha256').update('lan-party:session:v1:'+token).digest('hex');
const cookies=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
async function local(run,{mfa=true,credential=true,age=0,legacy=false}={}){
 const instance=new Miniflare(convertV4MiniflareOptions({modules:true,script,cf:false,compatibilityDate:'2026-10-11',d1Databases:{DB:randomUUID()},bindings:{
  AUTH_SESSION_MODE:'local-only',REGISTRATION_MODE:'local-only',AUTH_EMAIL_TRANSPORT:'local',AUTH_LOCAL_MAIL_SECRET:'33'.repeat(32),
  AUTH_PUBLIC_ORIGIN:origin,PASSWORD_PEPPER:'11'.repeat(32),AUTH_RATE_LIMIT_SECRET:'22'.repeat(32),
  AUTH_TURNSTILE_SITE_KEY:'fixture-site-key',TURNSTILE_SECRET_KEY:'fictional-turnstile-secret',...keys}}));
 try{
  const db=await instance.getD1Database('DB');for(const part of migrations.slice(0,legacy?12:undefined))await db.batch(part.map(s=>db.prepare(s)));
  const call=async(action,...args)=>{const r=await instance.dispatchFetch(origin+'/fixture',{method:'POST',body:JSON.stringify({action,args})});assert.equal(r.status,200,action);return r.json();};
  const id=randomUUID(),factor=randomUUID(),set=randomUUID(),time=Math.floor(Date.now()/1000),token='ab'.repeat(32),source=digest(token),primary='password';
  await db.prepare(`INSERT INTO users(id,first_name,last_name,email,email_normalized,email_verified_at,created_at,updated_at) VALUES (?,'Fictional','Tester','r2@example.test','r2@example.test',?,?,?)`).bind(id,time-600,time-600,time-600).run();
  await db.prepare('INSERT INTO user_nicknames(user_id,nickname,created_at,updated_at) VALUES (?,\'R2 Fixture\',?,?)').bind(id,time-600,time-600).run();
  if(credential)await db.prepare('INSERT INTO user_password_credentials(user_id,password_hash,password_changed_at,created_at,updated_at) VALUES (?,?,?,?,?)').bind(id,await call('hash',password),time-600,time-600,time-600).run();
  await db.prepare('INSERT INTO auth_sessions(id,user_id,token_digest,auth_version,created_at,expires_at) VALUES (?,?,?,0,?,?)').bind(randomUUID(),id,source,time,time+604800).run();
  await db.prepare('INSERT INTO auth_recent_authentication(session_digest,user_id,auth_version,method,authenticated_at,expires_at) VALUES (?,?,0,?,?,?)').bind(source,id,primary,time,time+300).run();
  if(mfa){
   const enc=await call('secret',secret,id,factor);
   await db.prepare('INSERT INTO auth_totp_factors(user_id,factor_id,secret_ciphertext,secret_nonce,key_id,last_step,recovery_set_id,enabled_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(id,factor,enc.ciphertext,enc.nonce,enc.keyId,Math.floor(time/30)-2,set,time-600).run();
   await db.prepare(`INSERT INTO auth_session_mfa(session_digest,user_id,auth_version,factor_id,method,verified_at,primary_method,primary_authenticated_at) VALUES (?,?,0,?,'totp',?,?,?)`).bind(source,id,factor,time-age,primary,time).run();
   await db.prepare('INSERT INTO auth_mfa_recovery_codes(user_id,set_id,verifier,created_at) VALUES (?,?,?,?)').bind(id,set,await call('verifier',id,set,recovery),time-600).run();
  }
  const request=(path,input,headers={})=>instance.dispatchFetch(origin+'/api/auth/'+path,{method:input===undefined?'GET':'POST',...(input===undefined?{}:{body:JSON.stringify(input)}),headers:{Origin:origin,'X-LAN-Request':'1','Content-Type':'application/json',...headers}});
  const Cookie='__Host-lan_session='+token,session=await(await request('session',undefined,{Cookie})).json(),headers={Cookie,'X-CSRF-Token':session.csrfToken};
  const account={userId:id,authVersion:0,status:'active',emailVerifiedAt:time-600};
  await run({db,request,call,headers,account,source,time,instance});
 }finally{
  try{await instance.dispatchFetch(origin+'/fixture',{method:'POST',body:JSON.stringify({action:'clock',args:[null]})});}
  finally{await instance.dispose();}
 }
}

test('MFA guard uses strict two-minute boundary and accepts only current proof',async()=>{
 for(const age of [0,119,120,121])await local(async({call,account,source,time})=>{
  assert.equal(await call('guard',account,source,time),age<120,'proof age '+age);
  assert.equal(await call('guard',account,'cd'.repeat(32),time),false);
  assert.equal(await call('guard',{...account,authVersion:1},source,time),false);
  if(age===119)assert.equal(await call('guard',account,source,time+1),false,'expiry at exactly 120 seconds');
  if(age===0)assert.equal(await call('guard',account,source,time-1),false,'future proof rejected');
 },{age});
});
test('stale MFA blocks every credential mutation before primary checks; browsing does not prompt',()=>local(async({request,headers,db})=>{
 for(const [path,input] of [['security/change-password',{password,newPassword:password+' new'}]]){
  const r=await request(path,input,headers);assert.equal(r.status,428,path);assert.equal((await r.json()).code,'mfa_required');
 }
 assert.equal((await request('security/methods',undefined,headers)).status,200);
 assert.equal(await db.prepare('SELECT auth_version FROM users').first('auth_version'),0);
},{age:121}));
test('recent MFA permits password change with existing sign-out policies',async()=>{
 for(const action of ['change-password'])await local(async({request,headers,db})=>{
  const r=await request('security/'+action,{password,newPassword:password+' changed'},headers);
  assert.equal(r.status,200,JSON.stringify(await r.clone().json()));assert.equal((await r.json()).next,'/login');
  assert.equal((await request('session',undefined,headers)).status,401);
  assert.equal(await db.prepare('SELECT auth_version FROM users').first('auth_version'),1);
 });
});
test('no-factor accounts and pre-MFA schema retain password behavior',async()=>{
 for(const legacy of [false,true])await local(async({request,headers})=>{
  assert.equal((await request('security/change-password',{password,newPassword:password+' new'},headers)).status,200);
 },{mfa:false,legacy});
});
test('prepared MFA write guard rejects concurrent revocation, missing proof and generation changes',async()=>{
 for(const change of ['revoke','missing','generation'])await local(async({call,account,source})=>assert.equal(await call('race',account,source,change),false));
});
test('step-up rotates session, preserves primary age, allows subsequent mutation and rejects replay',()=>local(async({request,headers,db,source,time,account})=>{
 await db.prepare('UPDATE auth_recent_authentication SET authenticated_at=?,expires_at=?').bind(time-200,time+100).run();
 const r=await request('mfa/step-up',{method:'recovery',code:recovery},headers);assert.equal(r.status,200,JSON.stringify(await r.clone().json()));
 const Cookie=cookies(r);assert.equal((await request('session',undefined,headers)).status,401);
 const session=await request('session',undefined,{Cookie});assert.equal(session.status,200);const next={Cookie,'X-CSRF-Token':(await session.json()).csrfToken};
 assert.equal(await db.prepare('SELECT authenticated_at FROM auth_recent_authentication WHERE session_digest<>?').bind(source).first('authenticated_at'),time-200);
 const target=digest(Cookie.split(';')[0].split('=')[1]);
 assert.deepEqual(await db.prepare('SELECT session_digest,user_id,auth_version,method,authenticated_at,expires_at FROM auth_recent_authentication WHERE session_digest=?').bind(target).first(),
  {session_digest:target,user_id:account.userId,auth_version:0,method:'password',authenticated_at:time-200,expires_at:time+100});
 const bound=await db.prepare('SELECT s.token_digest,m.session_digest,m.user_id,m.auth_version,m.factor_id FROM auth_sessions s JOIN auth_session_mfa m ON m.session_digest=s.token_digest WHERE s.token_digest=?').bind(target).first();
 assert.equal(bound.token_digest,bound.session_digest);assert.equal(bound.user_id,account.userId);assert.equal(bound.auth_version,0);
 assert.equal(bound.factor_id,await db.prepare('SELECT factor_id FROM auth_totp_factors').first('factor_id'));
 assert.equal((await request('mfa/step-up',{method:'recovery',code:recovery},next)).status,401);
 assert.equal((await request('security/change-password',{password,newPassword:password+' new'},next)).status,200);
},{age:121}));
test('TOTP and recovery step-up have one concurrent winner, revoke source and never reuse a code',async()=>{
 for(const method of ['totp','recovery'])await local(async({request,call,headers,db})=>{
 const code=method==='totp'?await call('otp',secret):recovery,responses=await Promise.all([request('mfa/step-up',{method,code},headers),request('mfa/step-up',{method,code},headers)]);
 assert.equal(responses.filter(r=>r.status===200).length,1);
 const Cookie=cookies(responses.find(r=>r.status===200)),session=await(await request('session',undefined,{Cookie})).json();
 assert.equal((await request('mfa/step-up',{method,code},{Cookie,'X-CSRF-Token':session.csrfToken})).status,401);
 assert.equal(await db.prepare('SELECT count(*) FROM auth_sessions WHERE revoked_at IS NULL').first('count(*)'),1);
 },{age:121});
});
test('step-up preserves CSRF/origin, rejects invalid code and an expired lease without spending recovery proof',()=>local(async({request,headers,call,account,source,db})=>{
 assert.equal((await request('mfa/step-up',{method:'recovery',code:recovery},{...headers,'X-CSRF-Token':'invalid'})).status,403);
 assert.equal((await request('mfa/step-up',{method:'recovery',code:recovery},{...headers,Origin:'https://example.invalid'})).status,403);
 assert.equal((await request('mfa/step-up',{method:'totp',code:'invalid'},headers)).status,401);
 assert.equal(await call('expiredLease',account,source,recovery),null);
 assert.equal(await db.prepare('SELECT consumed_at FROM auth_mfa_recovery_codes').first('consumed_at'),null);
 assert.equal((await request('session',undefined,headers)).status,200);
},{age:121}));
test('each session insert failure rolls back step-up recovery consumption and source revocation',async()=>{
 for(const table of ['auth_sessions','auth_session_mfa','auth_recent_authentication'])for(const failure of ["ABORT,'fictional failure'",'IGNORE'])await local(async({request,headers,db,source})=>{
 await db.exec(`CREATE TRIGGER fixture_session_failure BEFORE INSERT ON ${table} BEGIN SELECT RAISE(${failure}); END;`);
 assert.equal((await request('mfa/step-up',{method:'recovery',code:recovery},headers)).status,401);
 assert.equal(await db.prepare('SELECT consumed_at FROM auth_mfa_recovery_codes').first('consumed_at'),null);
 assert.equal((await request('session',undefined,headers)).status,200);
 assert.equal(await db.prepare('SELECT count(*) FROM auth_sessions').first('count(*)'),1);
 assert.equal(await db.prepare('SELECT count(*) FROM auth_session_mfa').first('count(*)'),1);
 assert.equal(await db.prepare('SELECT count(*) FROM auth_recent_authentication').first('count(*)'),1);
 assert.equal(await db.prepare('SELECT session_digest FROM auth_recent_authentication').first('session_digest'),source);
 },{age:121});
});
test('all credential write guards reject assurance expiring after the precheck',async()=>{
 for(const action of ['change-password'])await local(async({request,headers,call,db})=>{
  const before=await db.prepare('SELECT auth_version FROM users').first('auth_version');
  await call('expireNextWrite');
  const r=await request('security/'+action,{password,newPassword:password+' new'},headers);
  assert.equal(r.status,428,action);assert.equal((await r.json()).code,'mfa_required');assert.equal(await db.prepare('SELECT auth_version FROM users').first('auth_version'),before);
  assert.equal(await db.prepare('SELECT count(*) FROM user_password_credentials').first('count(*)'),1);
 },{});
});
test('lost step-up response requires normal primary plus MFA login; recovery code stays spent and no mutation is retried',()=>local(async({request,headers,call,db})=>{
 const result=await request('mfa/step-up',{method:'recovery',code:recovery},headers);assert.equal(result.status,200);
 // Deliberately discard the replacement cookie as if the whole response were lost.
 const retry=await request('mfa/step-up',{method:'recovery',code:recovery},headers);assert.equal(retry.status,401);assert.equal((await retry.json()).code,'session_required');
 assert.equal((await request('session',undefined,headers)).status,401);
 assert.notEqual(await db.prepare('SELECT consumed_at FROM auth_mfa_recovery_codes').first('consumed_at'),null);
 assert.equal(await db.prepare('SELECT auth_version FROM users').first('auth_version'),0);
 const login=await request('login',{email:'r2@example.test',password});assert.equal((await login.json()).next,'/mfa');
 const Cookie=cookies(login),challenge=await(await request('mfa/challenge',undefined,{Cookie})).json();
 const verified=await request('mfa/complete',{method:'totp',code:await call('otp',secret)},{Cookie,'X-CSRF-Token':challenge.csrfToken});assert.equal(verified.status,200);
 assert.equal((await request('session',undefined,{Cookie:cookies(verified)})).status,200);
 assert.equal(await db.prepare('SELECT count(*) FROM user_password_credentials').first('count(*)'),1);
},{age:121}));
test('step-up retains conditional server-verified single-use Turnstile before proof consumption',()=>local(async({request,headers,call,db})=>{
 await call('signals');
 assert.equal((await request('mfa/step-up',{method:'recovery',code:recovery},headers)).status,403);
 assert.equal(await db.prepare('SELECT consumed_at FROM auth_mfa_recovery_codes').first('consumed_at'),null);
 const r=await request('mfa/step-up',{method:'recovery',code:recovery,turnstileToken:'fixture-challenge'},headers);assert.equal(r.status,200);
 const Cookie=cookies(r),session=await(await request('session',undefined,{Cookie})).json();
 assert.equal((await request('mfa/step-up',{method:'recovery',code:recovery,turnstileToken:'fixture-challenge'},{Cookie,'X-CSRF-Token':session.csrfToken})).status,403);
},{age:121}));

test('regeneration-bound proof cannot authorize an unrelated sensitive account action',()=>local(async({db,request,headers,call})=>{
 const before=(await db.prepare('SELECT * FROM auth_session_mfa').all()).results;
 const start=await request('mfa/manage/start',{purpose:'regenerate'},headers);assert.equal(start.status,200);const op=await start.json();
 assert.equal((await request('mfa/manage/verify',{token:op.token,regeneration:true,method:'totp',code:await call('otp',secret)},headers)).status,200);
 assert.deepEqual((await db.prepare('SELECT * FROM auth_session_mfa').all()).results,before,'purpose-bound verification must not refresh ordinary session assurance');
 const unrelated=await request('security/change-password',{password,newPassword:password+' new'},headers);assert.equal(unrelated.status,428);assert.equal((await unrelated.json()).code,'mfa_required');
 assert.equal(await db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name='user_auth_providers'").first('n'),0);
 assert.equal((await request('mfa/manage/check',{token:op.token,regeneration:true},headers)).status,200);
 assert.equal(await db.prepare('SELECT phase FROM auth_mfa_regeneration_operations').first('phase'),'prepared');
},{age:121}));

test('Account Security replacement cancels staged regeneration without changing the active factor or reusing its proof',()=>local(async({request,headers,call,db})=>{
 const old=await db.prepare('SELECT factor_id,recovery_set_id FROM auth_totp_factors').first();
 const started=await request('mfa/manage/start',{purpose:'regenerate'},headers);assert.equal(started.status,200);const op=await started.json();
 assert.equal((await request('mfa/manage/verify',{token:op.token,method:'totp',code:await call('otp',secret)},headers)).status,200);
 assert.equal((await request('mfa/manage/reveal',{token:op.token},headers)).status,200);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes').first('n'),11);
 const handoff=await request('mfa/recovery/from-session',{confirmed:true},headers);assert.equal(handoff.status,200);
 assert.equal(await db.prepare('SELECT phase FROM auth_mfa_regeneration_operations').first('phase'),'cancelled');
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes').first('n'),1);
 assert.deepEqual(await db.prepare('SELECT factor_id,recovery_set_id FROM auth_totp_factors').first(),old);
 assert.equal((await request('session',undefined,headers)).status,401);
 assert.equal((await request('security/change-password',{password,newPassword:password+' new'},headers)).status,401);
 const Cookie=cookies(handoff),status=await request('mfa/recovery/status',undefined,{Cookie});assert.equal(status.status,200);assert.equal((await status.json()).phase,'pending');
}));

test('retired OAuth endpoints return 404 without changing accounts, credentials, factors or provider history',()=>local(async({request,headers,db})=>{
 const tables=['users','user_password_credentials','auth_totp_factors','auth_mfa_recovery_codes','auth_sessions'];
 const snapshot=async()=>Promise.all(tables.map(async table=>(await db.prepare('SELECT * FROM '+table).all()).results));
 const before=await snapshot();
 for(const action of ['start','callback','complete','profile','methods','unlink','add-password','request-password','reauth-password','reauth-status']){
  for(const input of [undefined,{}])assert.equal((await request('google/'+action,input,headers)).status,404,action);
 }
 assert.deepEqual(await snapshot(),before);
 assert.deepEqual(await(await request('security/methods',undefined,headers)).json(),{password:true});
}));

test('password confirmation retains CSRF, origin, failure allowance and password validation without a provider client',()=>local(async({request,headers,db})=>{
 const before=await db.prepare('SELECT password_hash FROM user_password_credentials').first('password_hash');
 assert.equal((await request('security/reauth-password',{password},{...headers,'X-CSRF-Token':'invalid'})).status,403);
 assert.equal((await request('security/reauth-password',{password},{...headers,Origin:'https://other.example.test'})).status,403);
 assert.equal((await request('security/change-password',{password,newPassword:'short'},headers)).status,400);
 for(let i=0;i<4;i++)assert.equal((await request('security/reauth-password',{password:'fictional wrong'},headers)).status,401);
 assert.equal((await request('security/reauth-password',{password},headers)).status,200,'correct fifth attempt succeeds');
 assert.equal(await db.prepare('SELECT password_hash FROM user_password_credentials').first('password_hash'),before);
 assert.equal(await db.prepare('SELECT method FROM auth_recent_authentication').first('method'),'password');
}));
