import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {before,test} from 'node:test';
const require=createRequire(import.meta.url),wr=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=wr('miniflare'),{build}=wr('esbuild');
const {experimental_readRawConfig}=require('wrangler');
const origin='https://dev.lan-party.club',target='lan-party-dev:a3c4cea6-ceb7-43b8-b9b7-b374726b35b4';
const keys={MFA_ENCRYPTION_KEYS:JSON.stringify({fixture:'44'.repeat(32)}),MFA_ACTIVE_KEY_ID:'fixture'};
const config={AUTH_ENVIRONMENT:'dev',AUTH_SESSION_MODE:'hosted-dev',AUTH_PUBLIC_ORIGIN:origin,AUTH_EMAIL_TRANSPORT:'resend',...keys};
const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',password='fictional R3 password',recovery='AAAAA-AAAAA-AAAAA-AAAAA-AAAAAA';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),jwk={...publicKey.export({format:'jwk'}),kid:'fixture',use:'sig',alg:'RS256'};
let scripts={},gates={},migrations,ui;
before(async()=>{
 const code=`import app from './worker/index';import * as crypto from './worker/auth/mfa-crypto';import {hashPassword} from './worker/auth/passwords';
 import {generate} from '@otplib/totp';import {crypto as otpCrypto} from '@otplib/plugin-crypto-web';import {base32} from '@otplib/plugin-base32-scure';
 let sends=0,fixtureTime;const realNow=Date.now.bind(Date);Date.now=()=>fixtureTime??realNow();globalThis.fetch=async(url,init)=>{
  if(String(url)==='https://api.resend.com/emails'){sends++;return Response.json({id:'fictional'});}
  if(String(url)==='https://www.googleapis.com/oauth2/v3/certs')return Response.json({keys:[${JSON.stringify(jwk)}]});
  if(String(url)==='https://oauth2.googleapis.com/token')return Response.json({access_token:'fictional',token_type:'Bearer',expires_in:300,id_token:new URLSearchParams(init.body).get('code')});
  throw Error('External requests forbidden in R3 fixture');
 };
 export default{async fetch(request,env){
  // Miniflare replaces Host with its internal listener even for synthetic HTTPS
  // dispatchFetch URLs. Restore ONLY this fixture's explicitly supplied Host;
  // production code never trusts this header or performs this normalization.
  if(request.headers.has('X-Fixture-Host')){const headers=new Headers(request.headers);headers.set('Host',headers.get('X-Fixture-Host'));headers.delete('X-Fixture-Host');request=new Request(request,{headers});}
  // Node/Miniflare also supplies Sec-Fetch-Mode=cors. Restore the explicit
  // fictional navigation mode only inside this isolated test transport.
  if(request.headers.has('X-Fixture-Mode')){const headers=new Headers(request.headers);headers.set('Sec-Fetch-Mode',headers.get('X-Fixture-Mode'));headers.delete('X-Fixture-Mode');request=new Request(request,{headers});}
  if(new URL(request.url).pathname!='/fixture')return app.fetch(request,env);
  const {action,args=[]}=await request.json();
  if(action==='hash')return Response.json(await hashPassword('${password}',env.PASSWORD_PEPPER));
  if(action==='clock'){fixtureTime=args[0]*1000;return Response.json(true);}
  if(action==='otp')return Response.json(await generate({secret:base32.decode(args[0]??'${secret}'),crypto:otpCrypto,epoch:args[1]??Math.floor(Date.now()/1000)}));
  if(action==='decrypt'){try{return Response.json(await crypto.decryptTotpSecret(...args));}catch{return Response.json(null);}}
  if(action==='seal')return Response.json(await crypto.encryptTotpSecret('${secret}',env,{environment:'dev',userId:args[0],id:args[1],purpose:'active'}));
  if(action==='verifier')return Response.json(await crypto.recoveryVerifier(...args));
  if(action==='sends')return Response.json(sends);
  throw Error('Unexpected fixture action');
 }};`;
 for(const [name,identity] of [['dev',target],['default',undefined],['wrong','another-worker']]){
  const define=identity===undefined?{}:{__LAN_MFA_TARGET__:JSON.stringify(identity)};
  scripts[name]=(await build({stdin:{resolveDir:fileURLToPath(new URL('../../',import.meta.url)),contents:code},define,bundle:true,write:false,format:'esm',platform:'browser'})).outputFiles[0].text;
  const gate=(await build({entryPoints:['worker/auth/mfa-environment.ts'],define,bundle:true,write:false,format:'esm',platform:'node'})).outputFiles[0].text;
  gates[name]=await import('data:text/javascript;base64,'+Buffer.from(gate).toString('base64'));
 }
 const mode=(await build({entryPoints:['src/lib/mfa-mode.ts'],bundle:true,write:false,format:'esm',platform:'node'})).outputFiles[0].text;
 ui=await import('data:text/javascript;base64,'+Buffer.from(mode).toString('base64'));
 migrations=[];
 for(const name of(await readdir(new URL('../../migrations/',import.meta.url))).filter(n=>/^\d{4}_.*\.sql$/.test(n)).sort()){
  let rest=(await readFile(new URL('../../migrations/'+name,import.meta.url),'utf8')).replace(/--[^\n]*/g,'').trim(),parts=[];
  while(rest){const end=rest.startsWith('CREATE TRIGGER')?rest.indexOf('\nEND;')+5:rest.indexOf(';')+1;if(end<=0||end===4)throw Error('Incomplete SQL');parts.push(rest.slice(0,end));rest=rest.slice(end).trim();}migrations.push(parts);
 }
});
test('Wrangler DEV build identity matches its exact Worker and D1; default configuration cannot opt in',async()=>{
 const {rawConfig:c}=await experimental_readRawConfig({config:fileURLToPath(new URL('../../wrangler.jsonc',import.meta.url))});assert.equal(c.name,'lan-party');assert.equal(c.define?.__LAN_MFA_TARGET__,undefined);
 assert.equal(c.env.dev.name,'lan-party-dev');assert.equal(c.env.dev.d1_databases[0].database_name,'lan-party-dev');assert.equal(c.env.dev.d1_databases[0].database_id,'a3c4cea6-ceb7-43b8-b9b7-b374726b35b4');
 assert.equal(JSON.parse(c.env.dev.define.__LAN_MFA_TARGET__),c.env.dev.name+':'+c.env.dev.d1_databases[0].database_id);
 const workflow=await readFile(new URL('../../.github/workflows/deploy-dev.yml',import.meta.url),'utf8');assert.match(workflow,/wrangler deploy --env dev/);assert.doesNotMatch(workflow,/--name\s/);
});
test('server eligibility needs a trusted DEV bundle plus every independent canonical configuration check',()=>{
 const gate=(url=origin,overrides={},headers={})=>gates.dev.mfaManagementEnvironment(new Request(url+'/api/auth/mfa/status',{headers}),{...config,...overrides});
 assert.equal(gate(),'dev');assert.equal(gate(origin,{}, {'Host':'dev.lan-party.club','X-Forwarded-Proto':'https'}),'dev');
 for(const url of ['https://lan-party.club','https://preview.example.test','https://lan-party-dev.servok.workers.dev','http://dev.lan-party.club','http://127.0.0.1:5173','https://dev.lan-party.club:8443'])assert.equal(gate(url),null,url);
 for(const overrides of [{AUTH_ENVIRONMENT:undefined},{AUTH_ENVIRONMENT:'prod'},{AUTH_PUBLIC_ORIGIN:'https://lan-party.club'},{AUTH_SESSION_MODE:'local-only'},
  {AUTH_EMAIL_TRANSPORT:'local'},{MFA_ENCRYPTION_KEYS:undefined},{MFA_ACTIVE_KEY_ID:'missing'},{MFA_ENCRYPTION_KEYS:'invalid'}])assert.equal(gate(origin,overrides),null);
 for(const headers of [{Host:'lan-party.club'},{Origin:'https://lan-party.club'},{'X-Forwarded-Host':'dev.lan-party.club'},
  {Forwarded:'host=dev.lan-party.club;proto=https'},{'X-Forwarded-Proto':'http'},{'Sec-Fetch-Site':'cross-site'}])assert.equal(gate(origin,{},headers),null);
 for(const name of ['default','wrong'])assert.equal(gates[name].mfaManagementEnvironment(new Request(origin),config),null,name);
 for(const host of ['localhost','127.0.0.1','[::1]'])assert.equal(gate('http://'+host+':5173',{AUTH_SESSION_MODE:'local-only',AUTH_EMAIL_TRANSPORT:'local'}),'local');
});
test('frontend eligibility requires local development or the canonical hosted DEV build; no arbitrary MFA toggle',()=>{
 assert.equal(ui.mfaUiEligible(true,undefined,'http://localhost:5173'),true);
 assert.equal(ui.mfaUiEligible(false,'hosted-dev',origin),true);
 for(const host of ['https://lan-party.club','https://preview.example.test','https://lan-party-dev.servok.workers.dev','http://dev.lan-party.club','http://localhost:5173'])assert.equal(ui.mfaUiEligible(false,'hosted-dev',host),false,host);
 assert.equal(ui.mfaUiEligible(false,undefined,origin),false);assert.equal(ui.mfaUiEligible(false,'off',origin),false);
 assert.equal(ui.mfaUiEligible(true,undefined,'https://preview.example.test'),false);
});
test('compiled frontend availability is closed on PROD/previews and agrees with the approved build/origin matrix',async()=>{
 const previous=globalThis.window;
 try{
  for(const [development,flag,host,expected] of [[true,'','http://127.0.0.1:5173',true],[false,'hosted-dev',origin,true],
   [false,'',origin,false],[false,'hosted-dev','https://lan-party.club',false],[false,'hosted-dev','https://preview.example.test',false],
   [false,'hosted-dev','https://lan-party-dev.servok.workers.dev',false],[false,'hosted-dev','http://localhost:5173',false]]){
   const code=(await build({entryPoints:['src/lib/mfa-mode.ts'],bundle:true,write:false,format:'esm',platform:'node',define:{'import.meta.env.DEV':String(development),'import.meta.env.VITE_AUTH_MODE':JSON.stringify(flag)}})).outputFiles[0].text;
   globalThis.window={location:new URL(host)};
   const module=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')+'#'+encodeURIComponent(host));
   assert.equal(module.MFA_ENROLLMENT_AVAILABLE,expected,host);
  }
 }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
test('frontend backend-status parsing fails closed on absent/malformed confirmation and propagates denial',async()=>{
 const code=(await build({entryPoints:['src/lib/mfa-status.ts'],bundle:true,write:false,format:'esm',platform:'node'})).outputFiles[0].text;
 const status=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')),previous=globalThis.fetch;
 try{
  for(const body of [{enabled:false},{enabled:false,enrollmentAvailable:'true'},{}]){
   globalThis.fetch=async()=>Response.json(body);await assert.rejects(status.readMfaStatus(new AbortController().signal));
  }
  globalThis.fetch=async()=>Response.json({enabled:true,enrollmentAvailable:false});assert.deepEqual(await status.readMfaStatus(new AbortController().signal),{enabled:true,enrollmentAvailable:false});
  globalThis.fetch=async()=>{throw Error('Fictional outage');};await assert.rejects(status.readMfaStatus(new AbortController().signal));
 }finally{globalThis.fetch=previous;}
});
const cookieJar=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
async function local(run,{bundle='dev',overrides={},enabled=false}={}){
 const instance=new Miniflare(convertV4MiniflareOptions({modules:true,script:scripts[bundle],cf:false,compatibilityDate:'2026-10-11',d1Databases:{DB:randomUUID()},bindings:{...config,
  GOOGLE_AUTH_MODE:'hosted-dev',REGISTRATION_MODE:'hosted-dev',GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'fictional',PASSWORD_PEPPER:'11'.repeat(32),AUTH_RATE_LIMIT_SECRET:'22'.repeat(32),
  AUTH_TURNSTILE_SITE_KEY:'fixture-site-key',TURNSTILE_SECRET_KEY:'fictional-turnstile-secret',
  AUTH_DEV_RECIPIENT_ALLOWLIST:'["r3@example.test"]',RESEND_API_KEY:'fictional',AUTH_EMAIL_PROVIDER_DAILY_LIMIT:'100',AUTH_EMAIL_PROVIDER_MONTHLY_LIMIT:'3000',...overrides}}));
 try{
  const db=await instance.getD1Database('DB');for(const part of migrations)await db.batch(part.map(s=>db.prepare(s)));
  const call=async(action,...args)=>{const r=await instance.dispatchFetch(origin+'/fixture',{method:'POST',body:JSON.stringify({action,args})});assert.equal(r.status,200);return r.json();};
  const id=randomUUID(),time=Math.floor(Date.now()/1000);
  await db.prepare(`INSERT INTO users(id,first_name,last_name,email,email_normalized,email_verified_at,created_at,updated_at) VALUES (?,'Fictional','Tester','r3@example.test','r3@example.test',?,?,?)`).bind(id,time-600,time-600,time-600).run();
  await db.prepare("INSERT INTO user_nicknames(user_id,nickname,created_at,updated_at) VALUES (?,'R3 Fixture',?,?)").bind(id,time-600,time-600).run();
  await db.prepare('INSERT INTO user_password_credentials(user_id,password_hash,password_changed_at,created_at,updated_at) VALUES (?,?,?,?,?)').bind(id,await call('hash'),time-600,time-600,time-600).run();
  await db.prepare("INSERT INTO user_auth_providers(id,user_id,provider,identity_namespace,provider_subject,linked_at) VALUES (?,?,'google','https://accounts.google.com','fixture-subject',?)").bind(randomUUID(),id,time-600).run();
  if(enabled){const factor=randomUUID(),set=randomUUID(),sealed=await call('seal',id,factor);
   await db.prepare('INSERT INTO auth_totp_factors(user_id,factor_id,secret_ciphertext,secret_nonce,key_id,last_step,recovery_set_id,enabled_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,factor,sealed.ciphertext,sealed.nonce,sealed.keyId,Math.floor(time/30)-2,set,time-600).run();
   await db.prepare('INSERT INTO auth_mfa_recovery_codes(user_id,set_id,verifier,created_at) VALUES (?,?,?,?)').bind(id,set,await call('verifier',id,set,recovery),time-600).run();
  }
  let ordinal=0;
  const request=(path,input,headers={},host=origin)=>instance.dispatchFetch(host+'/api/auth/'+path,{method:input===undefined?'GET':'POST',...(input===undefined?{}:{body:JSON.stringify(input)}),headers:{'X-Fixture-Host':headers.Host??new URL(host).host,Origin:host,'X-LAN-Request':'1','Content-Type':'application/json','CF-Connecting-IP':`203.0.113.${++ordinal}`,...headers}});
  async function session(r){assert.equal(r.status===200||r.status===303,true,JSON.stringify(await r.clone().text()));const Cookie=cookieJar(r),response=await request('session',undefined,{Cookie});assert.equal(response.status,200,JSON.stringify(await response.clone().json()));return {Cookie,'X-CSRF-Token':(await response.json()).csrfToken};}
  async function google(){const started=await request('google/start',{purpose:'signin'});assert.equal(started.status,200);const url=new URL((await started.json()).url),now=Math.floor(Date.now()/1000);
   const encoded=[{alg:'RS256',kid:'fixture'},{iss:'https://accounts.google.com',aud:'fixture.apps.googleusercontent.com',sub:'fixture-subject',email:'r3@example.test',email_verified:true,nonce:url.searchParams.get('nonce'),iat:now,exp:now+300}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
   const code=encoded+'.'+sign('RSA-SHA256',Buffer.from(encoded),privateKey).toString('base64url');
   return instance.dispatchFetch(origin+'/api/auth/google/callback?'+new URLSearchParams({state:url.searchParams.get('state'),code}),{headers:{Cookie:cookieJar(started)},redirect:'manual'});
  }
  async function finish(r,code,method='recovery'){const Cookie=cookieJar(r),challenge=await request('mfa/challenge',undefined,{Cookie});assert.equal(challenge.status,200);
   return request('mfa/complete',{code,method},{Cookie,'X-CSRF-Token':(await challenge.json()).csrfToken});}
  async function refreshGoogle(headers,{subject='fixture-subject',extra={}}={}){
   const started=await request('google/start',{purpose:'reauth',returnAction:'recovery'},headers);assert.equal(started.status,200);
   const url=new URL((await started.json()).url),now=Math.floor(Date.now()/1000);
   const encoded=[{alg:'RS256',kid:'fixture'},{iss:'https://accounts.google.com',aud:'fixture.apps.googleusercontent.com',sub:subject,email:'r3@example.test',email_verified:true,nonce:url.searchParams.get('nonce'),iat:now,auth_time:now,exp:now+300}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
   const code=encoded+'.'+sign('RSA-SHA256',Buffer.from(encoded),privateKey).toString('base64url');
   const callback=()=>instance.dispatchFetch(origin+'/api/auth/google/callback?'+new URLSearchParams({state:url.searchParams.get('state'),code}),{headers:{'X-Fixture-Host':new URL(origin).host,'X-Fixture-Mode':extra['Sec-Fetch-Mode']??'navigate',Cookie:headers.Cookie+'; '+cookieJar(started),'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document',...extra},redirect:'manual'});
   return {response:await callback(),callback};
  }
  await run({db,call,request,session,google,finish,refreshGoogle,id});
 }finally{await instance.dispose();}
}
test('canonical DEV simulation enrolls, logs in with password/Google MFA, steps up and manages DEV-bound ciphertext',()=>local(async({request,session,call,finish,google,db})=>{
 let headers=await session(await request('login',{email:'r3@example.test',password}));
 assert.deepEqual(await(await request('mfa/status',undefined,headers)).json(),{enabled:false,enrollmentAvailable:true});
 const start=await request('mfa/enroll/start',{},headers);assert.equal(start.status,200);const setup=await start.json();
 const proof=await request('mfa/enroll/verify',{token:setup.token,code:await call('otp',setup.secret)},headers);assert.equal(proof.status,200);const codes=await proof.json();
 const activated=await request('mfa/enroll/activate',{token:setup.token,acknowledgment:codes.acknowledgment},headers);assert.equal(activated.status,200);headers=await session(activated);
 const login=await request('login',{email:'r3@example.test',password});assert.equal((await login.clone().json()).next,'/mfa');
 assert.notEqual((await request('session',undefined,{Cookie:cookieJar(login)})).status,200);
 headers=await session(await finish(login,codes.codes[0]));
 const g=await google();assert.equal(g.headers.get('location'),'/mfa');assert.notEqual((await request('google/methods',undefined,{Cookie:cookieJar(g)})).status,200);
 headers=await session(await finish(g,codes.codes[1]));
 assert.equal((await request('mfa/step-up',{method:'recovery',code:codes.codes[2]},{...headers,'X-CSRF-Token':'invalid'})).status,403);
 headers=await session(await request('mfa/step-up',{method:'recovery',code:codes.codes[2]},headers));
 const manage=await request('mfa/manage/start',{purpose:'disable'},headers);assert.equal(manage.status,200);const tx=await manage.json();
 const checked=await request('mfa/manage/verify',{token:tx.token,method:'recovery',code:codes.codes[3]},headers);assert.equal(checked.status,200);const ack=await checked.json();
 const disabled=await request('mfa/manage/finish',{token:tx.token,acknowledgment:ack.acknowledgment,confirmed:true},headers);assert.equal(disabled.status,200);
 headers=await session(disabled);assert.deepEqual(await(await request('mfa/status',undefined,headers)).json(),{enabled:false,enrollmentAvailable:true});
 assert.equal(await db.prepare('SELECT count(*) FROM users').first('count(*)'),1);assert.equal(await call('sends'),2);
}));
test('default and mismatched bundles deny every management route but preserve password and Google MFA login',async()=>{
 for(const bundle of ['default','wrong'])await local(async({request,session,google,finish,call})=>{
  const passwordLogin=await request('login',{email:'r3@example.test',password});assert.equal((await passwordLogin.clone().json()).next,'/mfa');
  const headers=await session(await finish(passwordLogin,await call('otp'),'totp'));
  assert.deepEqual(await(await request('mfa/status',undefined,headers)).json(),{enabled:true,enrollmentAvailable:false});
  for(const path of ['enroll/start','enroll/verify','enroll/cancel','enroll/activate','manage/start','manage/verify','manage/finish','manage/cancel','step-up'])assert.equal((await request('mfa/'+path,{},headers)).status,404,path);
  const g=await google();assert.equal(g.headers.get('location'),'/mfa');assert.notEqual((await request('session',undefined,{Cookie:cookieJar(g)})).status,200);
  await session(await finish(g,recovery));assert.equal(await call('sends'),0);
 },{bundle,enabled:true});
});
test('canonical DEV APIs fail closed for proxy claims, aliases, wrong origin and incompatible configuration',async()=>{
 await local(async({request,session})=>{
  const headers=await session(await request('login',{email:'r3@example.test',password}));
  for(const extra of [{Host:'lan-party.club'},{Forwarded:'host=dev.lan-party.club'},{'X-Forwarded-Host':'dev.lan-party.club'},{Origin:'https://evil.example.test'}])assert.equal((await request('mfa/enroll/start',{}, {...headers,...extra})).status,404);
  for(const host of ['https://lan-party-dev.servok.workers.dev','https://preview.example.test','https://lan-party.club','http://127.0.0.1:5173'])assert.equal((await request('mfa/enroll/start',{},headers,host)).status,404);
 });
 for(const overrides of [{AUTH_ENVIRONMENT:'prod'},{AUTH_ENVIRONMENT:''},{AUTH_EMAIL_TRANSPORT:'local'},{MFA_ACTIVE_KEY_ID:'missing'}])await local(async({request})=>{
  assert.equal((await request('mfa/enroll/start',{})).status,404);
 },{overrides});
});

async function restricted(f,login){
 const Cookie=cookieJar(login),challenge=await f.request('mfa/challenge',undefined,{Cookie});assert.equal(challenge.status,200);
 assert.equal((await challenge.json()).recoveryAvailable,true);
 const status=await f.request('mfa/recovery/status',undefined,{Cookie});assert.equal(status.status,200);
 return {Cookie,'X-CSRF-Token':(await status.json()).csrfToken};
}
test('hosted last-code replacement uses DEV encryption, bounded redisplay and fresh normal MFA login',()=>local(async f=>{
 const {db,request,call,id}=f,time=Math.floor(Date.now()/1000),before=await db.prepare('SELECT * FROM auth_totp_factors').first();
 const ledger=await db.prepare('SELECT * FROM member_numbers ORDER BY member_number').all(),credentials=await db.prepare('SELECT * FROM user_password_credentials').first();
 let h=await restricted(f,await request('login',{email:'r3@example.test',password}));
 assert.equal((await request('mfa/recovery/start',{code:recovery,confirmed:true},{...h,'X-CSRF-Token':'a'.repeat(64)})).status,403);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_mfa_recovery_operations').first('n'),0);
 const start=await request('mfa/recovery/start',{code:recovery,confirmed:true},h);assert.equal(start.status,200);
 const cookies=start.headers.getSetCookie();assert.equal(cookies.length,2);for(const value of cookies){assert.match(value,/^__Host-lan_mfa_recovery/);assert.match(value,/HttpOnly; SameSite=Lax; Max-Age=\d+; Secure/);}
 h.Cookie=cookieJar(start);
 assert.notEqual((await request('session',undefined,h)).status,200);
 const setup=await request('mfa/recovery/setup',{},h);assert.equal(setup.status,200);const replacement=await setup.json();
 let op=await db.prepare('SELECT * FROM auth_mfa_recovery_operations').first();assert.equal(op.expires_at-op.created_at,300);
 const sealed={ciphertext:op.secret_ciphertext,nonce:op.secret_nonce,keyId:op.key_id},context={environment:'dev',userId:id,id:op.new_factor_id,purpose:'pending'};
 assert.equal(await call('decrypt',sealed,keys,context),replacement.secret);assert.equal(await call('decrypt',sealed,keys,{...context,environment:'local'}),null);
 // One guarded commit; a duplicate cannot switch twice or emit another notice.
 const code=await call('otp',replacement.secret);assert.equal((await request('mfa/recovery/commit',{code},h)).status,200);
 assert.notEqual((await request('mfa/recovery/commit',{code},h)).status,200);assert.equal(await call('sends'),1);
 op=await db.prepare('SELECT * FROM auth_mfa_recovery_operations').first();assert.equal(op.phase,'committed');assert.equal(op.display_expires_at-op.committed_at,300);assert.ok(op.display_ciphertext);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes WHERE set_id=?').bind(before.recovery_set_id).first('n'),0);
 assert.equal(await db.prepare('SELECT count(*) n FROM auth_mfa_recovery_codes').first('n'),10);
 assert.equal(await db.prepare('SELECT auth_version FROM users').first('auth_version'),op.auth_version+1);
 await call('clock',time+30);
 const revealCode=await call('otp',replacement.secret,time+30),reveal=await request('mfa/recovery/reveal',{code:revealCode},h);assert.equal(reveal.status,200);
 const codes=(await reveal.json()).codes;assert.equal(codes.length,10);assert.equal(new Set(codes).size,10);
 assert.notEqual((await request('mfa/recovery/reveal',{code:revealCode},h)).status,200);
 await call('clock',time+60);
 assert.deepEqual((await(await request('mfa/recovery/reveal',{code:await call('otp',replacement.secret,time+60)},h)).json()).codes,codes);
 assert.equal((await request('mfa/recovery/ack',{confirmed:true},h)).status,200);
 assert.equal(await db.prepare('SELECT display_ciphertext FROM auth_mfa_recovery_operations').first('display_ciphertext'),null);
 assert.notEqual((await request('session',undefined,h)).status,200);
 const next=await request('login',{email:'r3@example.test',password});assert.equal((await next.clone().json()).next,'/mfa');
 assert.notEqual((await f.finish(next,recovery)).status,200);
 const old=await request('login',{email:'r3@example.test',password});assert.notEqual((await f.finish(old,await call('otp',secret,time+60),'totp')).status,200);
 // Restore the fixture wall clock before checking SQLite's real-clock session
 // guard; the new recovery set is a valid second factor for a fresh normal login.
 await call('clock',Math.floor(Date.now()/1000));
 const fresh=await request('login',{email:'r3@example.test',password});await f.session(await f.finish(fresh,codes[0]));
 assert.deepEqual((await db.prepare('SELECT * FROM member_numbers ORDER BY member_number').all()).results,ledger.results);assert.deepEqual(await db.prepare('SELECT * FROM user_password_credentials').first(),credentials);
 assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);assert.equal(await db.prepare('PRAGMA quick_check').first('quick_check'),'ok');
},{enabled:true}));

test('hosted Google-only lost-start response bootstraps secure Lax cookies and validates cross-site callback',()=>local(async f=>{
 const {db,request}=f;await db.prepare('DELETE FROM user_password_credentials').run();
 const h=await restricted(f,await f.google());
 // Deliberately discard successful start cookies, as in R1-F1.
 assert.equal((await request('mfa/recovery/start',{code:recovery,confirmed:true},h)).status,200);
 const status=await request('mfa/recovery/status',undefined,h);assert.equal(status.status,200);assert.equal((await status.json()).phase,'pending');
 for(const cookie of status.headers.getSetCookie()){assert.match(cookie,/__Host-lan_mfa_recovery/);assert.match(cookie,/SameSite=Lax/);assert.match(cookie,/; Secure/);}
 h.Cookie=cookieJar(status);const before=await db.prepare('SELECT * FROM auth_mfa_recovery_operations').first();
 const wrong=await f.refreshGoogle(h,{subject:'different-subject'});assert.equal(wrong.response.headers.get('location'),'/login?google=unavailable');
 for(const extra of [{'Sec-Fetch-Mode':'cors'},{'Sec-Fetch-Dest':'empty'},{'X-Forwarded-Host':'dev.lan-party.club'},{Origin:'https://evil.example.test'}]){
  const invalid=await f.refreshGoogle(h,{extra});assert.equal(invalid.response.headers.get('location'),'/login?google=unavailable');
 }
 const good=await f.refreshGoogle(h);assert.equal(good.response.headers.get('location'),'/mfa?recovery=1');assert.equal(good.response.headers.get('set-cookie'),null);
 assert.equal((await good.callback()).headers.get('location'),'/login?google=unavailable');
 const after=await db.prepare('SELECT * FROM auth_mfa_recovery_operations').first();assert.equal(after.expires_at,before.expires_at);assert.equal(after.primary_method,'google');assert.equal(after.oidc_state_digest,null);
 assert.notEqual((await request('session',undefined,h)).status,200);assert.equal(await f.call('sends'),0);
 const setup=await request('mfa/recovery/setup',{},h);assert.equal(setup.status,200);const replacement=await setup.json();
 assert.equal((await request('mfa/recovery/commit',{code:await f.call('otp',replacement.secret)},h)).status,200);
 const post=await f.refreshGoogle(h);assert.equal(post.response.headers.get('location'),'/mfa?recovery=1');assert.equal(await db.prepare('SELECT count(*) n FROM user_auth_providers').first('n'),1);
 assert.equal(await db.prepare('SELECT count(*) n FROM user_password_credentials').first('n'),0);
 assert.notEqual((await request('session',undefined,h)).status,200);
},{enabled:true}));

test('hosted recovery rejects stale primary proof until refreshed without extending its deadline',()=>local(async f=>{
 const {db,request}=f,h=await restricted(f,await request('login',{email:'r3@example.test',password}));
 assert.equal((await request('mfa/recovery/start',{code:recovery,confirmed:true},h)).status,200);
 const before=await db.prepare('SELECT * FROM auth_mfa_recovery_operations').first(),setup=await(await request('mfa/recovery/setup',{},h)).json();
 await db.prepare('UPDATE auth_mfa_recovery_operations SET primary_authenticated_at=?').bind(Math.floor(Date.now()/1000)-120).run();
 const code=await f.call('otp',setup.secret);assert.equal((await request('mfa/recovery/commit',{code},h)).status,428);
 assert.equal((await request('mfa/recovery/primary',{password},h)).status,200);
 assert.equal((await request('mfa/recovery/commit',{code},h)).status,200);
 assert.equal((await db.prepare('SELECT expires_at FROM auth_mfa_recovery_operations').first('expires_at')),before.expires_at);
},{enabled:true}));

test('restricted recovery shares fail-closed DEV matrix and never makes aliases or default builds eligible',async()=>{
 const actions=['status','start','setup','primary','commit','reveal','ack','cancel'];
 for(const bundle of ['default','wrong'])await local(async({request})=>{
  for(const action of actions)assert.equal((await request('mfa/recovery/'+action,action==='status'?undefined:{})).status,404);
  assert.notEqual((await request('google/start',{purpose:'reauth',returnAction:'recovery'})).status,200);
 },{bundle});
 await local(async({request})=>{
  for(const extra of [{Host:'lan-party.club'},{Forwarded:'host=dev.lan-party.club'},{'X-Forwarded-Host':'dev.lan-party.club'},{'Sec-Fetch-Site':'cross-site'},{Origin:'https://evil.example.test'}]){
   for(const action of actions)assert.equal((await request('mfa/recovery/'+action,action==='status'?undefined:{},extra)).status,404);
   assert.notEqual((await request('google/start',{purpose:'reauth',returnAction:'recovery'},extra)).status,200);
  }
  for(const host of ['https://lan-party-dev.servok.workers.dev','https://preview.example.test','https://lan-party.club'])for(const action of actions)assert.equal((await request('mfa/recovery/'+action,action==='status'?undefined:{},{},host)).status,404);
 });
 for(const overrides of [{AUTH_ENVIRONMENT:'prod'},{AUTH_SESSION_MODE:'off'},{AUTH_EMAIL_TRANSPORT:'local'},{MFA_ENCRYPTION_KEYS:''},{MFA_ACTIVE_KEY_ID:'missing'}])await local(async({request})=>{
  for(const action of actions)assert.equal((await request('mfa/recovery/'+action,action==='status'?undefined:{})).status,404);
 },{overrides});
});
