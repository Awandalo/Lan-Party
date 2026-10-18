import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {before,test} from 'node:test';
const require=createRequire(import.meta.url),wr=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=wr('miniflare'),{build}=wr('esbuild');
const origin='http://127.0.0.1:5173',client='fictional.apps.googleusercontent.com';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'fictional',use:'sig',alg:'RS256'};
let script,migrations;
before(async()=>{
 script=(await build({stdin:{resolveDir:fileURLToPath(new URL('../../',import.meta.url)),contents:`
  import app from './worker/index';
  let sends=0;
  globalThis.fetch=async(input,init)=>{
   const url=String(input);
   if(url==='https://oauth2.googleapis.com/token'){
    const form=new URLSearchParams(init.body);
    if(form.get('client_id')!=='${client}'||form.get('client_secret')!=='fictional-google-secret'||form.get('code_verifier')?.length!==64)throw Error('Invalid fixture grant');
    if(form.get('code')==='network-failure')throw Error('Fictional private failure');
    return Response.json({access_token:'synthetic-access',token_type:'Bearer',expires_in:3600,id_token:form.get('code')});
   }
   if(url==='https://www.googleapis.com/oauth2/v3/certs')return Response.json({keys:[${JSON.stringify(jwk)}]},{headers:{'Cache-Control':'max-age=60'}});
   if(url==='https://challenges.cloudflare.com/turnstile/v0/siteverify')return Response.json({success:true,hostname:'127.0.0.1',action:'login'});
   if(url==='https://api.resend.com/emails'){sends++;return Response.json({id:'synthetic'});}
   throw Error('External request blocked in offline fixture');
  };
  export default {async fetch(request,env){if(new URL(request.url).pathname==='/fixture/sends')return Response.json(sends);return app.fetch(request,env);}};
 `},bundle:true,write:false,format:'esm',platform:'browser'})).outputFiles[0].text;
 migrations=[];
 for(const name of(await readdir(new URL('../../migrations/',import.meta.url))).filter(n=>/^\d{4}_.*\.sql$/.test(n)).sort()){
  let rest=(await readFile(new URL('../../migrations/'+name,import.meta.url),'utf8')).replace(/--[^\n]*/g,'').trim(),parts=[];
  while(rest){const end=rest.startsWith('CREATE TRIGGER')?rest.indexOf('\nEND;')+5:rest.indexOf(';')+1;if(end<=0||end===4)throw Error('Incomplete SQL');parts.push(rest.slice(0,end));rest=rest.slice(end).trim();}migrations.push(parts);
 }
});
function jwt(nonce,overrides={},wrongKey=false){const time=Math.floor(Date.now()/1000);
 const claims={iss:'https://accounts.google.com',aud:client,sub:'fictional-google-subject',email:'google@example.test',email_verified:true,hd:'example.test',nonce,iat:time,exp:time+300,auth_time:time,...overrides};
 const parts=[{alg:'RS256',kid:'fictional',typ:'JWT'},claims].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
 return parts+'.'+sign('RSA-SHA256',Buffer.from(parts),wrongKey?generateKeyPairSync('rsa',{modulusLength:2048}).privateKey:privateKey).toString('base64url');
}
async function local(run,overrides={},migrationCount=migrations.length){
 const instance=new Miniflare(convertV4MiniflareOptions({modules:true,script,cf:false,compatibilityDate:'2026-10-11',d1Databases:{DB:randomUUID()},
 bindings:{GOOGLE_AUTH_MODE:'local-only',AUTH_SESSION_MODE:'local-only',REGISTRATION_MODE:'local-only',AUTH_EMAIL_TRANSPORT:'local',AUTH_LOCAL_MAIL_SECRET:'33'.repeat(32),AUTH_PUBLIC_ORIGIN:origin,
 PASSWORD_PEPPER:'11'.repeat(32),AUTH_RATE_LIMIT_SECRET:'22'.repeat(32),GOOGLE_CLIENT_ID:client,GOOGLE_CLIENT_SECRET:'fictional-google-secret',
 AUTH_TURNSTILE_SITE_KEY:'synthetic-site-key',TURNSTILE_SECRET_KEY:'synthetic-only-turnstile-secret',...overrides}}));
 try{
  const db=await instance.getD1Database('DB');for(const part of migrations.slice(0,migrationCount))await db.batch(part.map(s=>db.prepare(s)));
  let ordinal=0;
  const request=(path,input,headers={})=>instance.dispatchFetch(origin+'/api/auth/'+path,{method:input?'POST':'GET',...(input?{body:JSON.stringify(input)}:{}),
   headers:{Origin:origin,'Content-Type':'application/json','X-LAN-Request':'1','CF-Connecting-IP':`203.0.113.${++ordinal}`,...headers}});
  async function start(purpose='signin',headers={}){
   const response=await request('google/start',{purpose},headers);assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
   const url=new URL((await response.json()).url),Cookie=response.headers.get('set-cookie').split(';')[0];
   assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
   assert.equal(url.searchParams.get('scope'),'openid email profile');
   return {url,Cookie,nonce:url.searchParams.get('nonce'),state:url.searchParams.get('state')};
  }
  const callback=(flow,claims={},headers={},bad=false)=>instance.dispatchFetch(origin+'/api/auth/google/callback?'+new URLSearchParams({state:flow.state,code:jwt(flow.nonce,claims,bad)}),{redirect:'manual',headers:{Cookie:flow.Cookie,...headers}});
  const complete=(flow,nickname='Google Player')=>request('google/complete',{nickname,firstName:'Fictional',lastName:'Tester'},{Cookie:flow.Cookie});
  async function session(response){const Cookie=response.headers.get('set-cookie').split(';')[0];const r=await request('session',undefined,{Cookie});assert.equal(r.status,200);return {Cookie,'X-CSRF-Token':(await r.json()).csrfToken};}
  const upgrade=()=>db.batch(migrations[11].map(s=>db.prepare(s)));
  await run({instance,db,request,start,callback,complete,session,upgrade});
 }finally{await instance.dispose();}
}
test('Google signup creates one UUID and normal member number without password; linked sign-in preserves identity',()=>local(async({db,start,callback,complete,session,request})=>{
 const flow=await start();assert.equal((await callback(flow)).headers.get('location'),'/google-complete');
 const created=await complete(flow);assert.equal(created.status,200);const headers=await session(created);
 assert.deepEqual(await(await request('google/methods',undefined,headers)).json(),{password:false,google:true});
 const user=await db.prepare('SELECT id FROM users').first('id');assert.equal(await db.prepare('SELECT COUNT(*) n FROM user_password_credentials').first('n'),0);
 assert.equal(await db.prepare('SELECT member_number FROM member_numbers WHERE user_id=?').bind(user).first('member_number'),11);
 const next=await callback(await start());assert.equal(next.headers.get('location'),'/account');await session(next);
 assert.equal(await db.prepare('SELECT COUNT(*) n FROM users').first('n'),1);
 assert.equal((await complete(flow)).status,503);
}));
test('invalid signature, issuer, audience, azp, nonce, expiry and email claims fail closed; callback is single-use',()=>local(async({start,callback,db})=>{
 for(const [claims,bad] of [[{},true],[{iss:'https://evil.example.test'},false],[{aud:'other'},false],[{azp:'other'},false],[{nonce:'wrong'},false],[{exp:1},false],[{email_verified:false},false],[{email:'invalid'},false]]){
  const flow=await start();const response=await callback(flow,claims,{},bad);assert.equal(response.headers.get('location'),'/login?google=unavailable');
  assert.equal((await callback(flow)).headers.get('location'),'/login?google=unavailable');
 }
 assert.equal(await db.prepare('SELECT COUNT(*) n FROM users').first('n'),0);
}));
test('callback browser binding, state, expiry and concurrent consumption protect against login CSRF and replay',()=>local(async({instance,start,callback,db})=>{
 const flow=await start();
 assert.equal((await instance.dispatchFetch(origin+'/api/auth/google/callback?state='+flow.state+'&code=none',{redirect:'manual'})).headers.get('location'),'/login?google=unavailable');
 const results=await Promise.all([callback(flow),callback(flow)]);assert.equal(results.filter(r=>r.headers.get('location')==='/google-complete').length,1);
 const expired=await start();await db.prepare('UPDATE auth_oidc_transactions SET created_at=0,expires_at=600 WHERE phase=\'pending\'').run();
 assert.equal((await callback(expired)).headers.get('location'),'/login?google=unavailable');
}));
test('email match never links accounts; duplicate signup rolls back without changing UUID or ledger',()=>local(async({request,db,start,callback,complete})=>{
 assert.equal((await request('register',{nickname:'Existing Player',firstName:'Fictional',lastName:'Tester',email:'google@example.test',password:'fictional original password'})).status,202);
 const before=await db.prepare('SELECT id FROM users').first('id');const flow=await start();await callback(flow);
 assert.equal((await complete(flow,'Different Player')).status,400);
 assert.equal(await db.prepare('SELECT COUNT(*) n FROM users').first('n'),1);
 assert.equal(await db.prepare('SELECT id FROM users').first('id'),before);
 assert.equal(await db.prepare('SELECT COUNT(*) n FROM user_auth_providers').first('n'),0);
 assert.equal(await db.prepare('SELECT seq FROM sqlite_sequence WHERE name=\'member_numbers\'').first('seq'),11);
}));
test('third-party Google email remains unverified and receives only local verification; Google-only recovery sends nothing',()=>local(async({db,start,callback,complete,request})=>{
 const flow=await start();await callback(flow,{hd:undefined});const result=await complete(flow);assert.equal((await result.json()).next,'/verify-email');
 assert.equal(await db.prepare('SELECT email_verified_at FROM users').first('email_verified_at'),null);
 const before=await db.prepare('SELECT COUNT(*) n FROM auth_action_tokens').first('n');
 assert.equal((await request('forgot-password',{email:'google@example.test'})).status,202);
 assert.equal(await db.prepare('SELECT COUNT(*) n FROM auth_action_tokens').first('n'),before);
 const again=await callback(await start());assert.equal(again.headers.get('location'),'/verify-email');
}));
test('Google recent authentication and separate email proof add first password atomically, invalidate sessions and prevent replay',()=>local(async({db,start,callback,complete,session,request})=>{
 const flow=await start();await callback(flow);const headers=await session(await complete(flow));
 assert.equal((await request('google/request-password',{},headers)).status,428);
 const recent=await start('reauth',headers);assert.equal(recent.url.searchParams.get('max_age'),'0');
 assert.equal((await callback(recent,{}, {Cookie:recent.Cookie+'; '+headers.Cookie})).headers.get('location'),'/account/security');
 const assurance=await db.prepare('SELECT method,assurance_level,mfa_verified FROM auth_recent_authentication').first();assert.deepEqual(assurance,{method:'google',assurance_level:1,mfa_verified:0});
 assert.equal((await request('google/unlink',{},headers)).status,428);
 assert.equal((await request('google/request-password',{},headers)).status,202);
 const mail=await(await request('local-mail',{email:'google@example.test',purpose:'password-setup'},{Authorization:'Bearer '+'33'.repeat(32)})).json();assert.ok(mail.mail);
 const token=new URLSearchParams(new URL(mail.mail.url).hash.slice(1)).get('setup');
 const password='fictional new password';
 const results=await Promise.all([request('google/add-password',{token,password},headers),request('google/add-password',{token,password},headers)]);
 assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(await db.prepare('SELECT COUNT(*) n FROM user_password_credentials').first('n'),1);
 assert.equal((await request('session',undefined,headers)).status,401);
 assert.equal(await db.prepare('SELECT auth_version FROM users').first('auth_version'),1);
 const login=await request('login',{email:'google@example.test',password});assert.equal(login.status,200);
 assert.equal((await request('google/add-password',{token,password},await session(login))).status,428);
 assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
}));
test('password proof is required for linking and unlinking; generation fencing preserves account history',()=>local(async({request,db,start,callback,session})=>{
 const password='fictional original password';await request('register',{nickname:'Local Player',firstName:'Fictional',lastName:'Tester',email:'google@example.test',password});
 await db.prepare('UPDATE users SET email_verified_at=unixepoch()').run();let headers=await session(await request('login',{email:'google@example.test',password}));
 const id=await db.prepare('SELECT id FROM users').first('id');
 const required=await request('google/start',{purpose:'link'},headers);assert.equal(required.status,428);
 assert.equal((await required.json()).code,'reauth_required');
 assert.equal((await request('google/reauth-password',{password:'wrong fictional password'},headers)).status,401);
 assert.equal((await request('google/reauth-password',{password},headers)).status,200);
 const flow=await start('link',headers),linked=await callback(flow,{}, {Cookie:flow.Cookie+'; '+headers.Cookie});
 assert.equal(linked.headers.get('location'),'/account/security');const replacement=await session(linked);
 assert.notEqual(replacement.Cookie,headers.Cookie);
 assert.deepEqual(await(await request('google/methods',undefined,replacement)).json(),{password:true,google:true});
 assert.equal((await callback(flow,{}, {Cookie:flow.Cookie+'; '+headers.Cookie})).headers.get('location'),'/login?google=unavailable');
 assert.equal((await request('session',undefined,headers)).status,401);
 headers=await session(await request('login',{email:'google@example.test',password}));
 assert.equal((await request('google/reauth-password',{password},headers)).status,200);
 assert.equal((await request('google/unlink',{},headers)).status,200);
 assert.equal(await db.prepare('SELECT COUNT(*) n FROM user_auth_providers').first('n'),0);
 assert.equal(await db.prepare('SELECT id FROM users').first('id'),id);
 assert.equal(await db.prepare('SELECT member_number FROM member_numbers WHERE user_id=?').bind(id).first('member_number'),11);
 assert.equal((await request('session',undefined,headers)).status,401);
 assert.equal((await request('session',undefined,replacement)).status,401);
}));
test('Google defaults off, rejects aliases and cross-origin mutations; provider errors are sanitized',()=>local(async({instance,request,start})=>{
 assert.equal((await instance.dispatchFetch('https://lan-party-dev.servok.workers.dev/api/auth/google/methods')).status,404);
 assert.equal((await request('google/start',{purpose:'signin'},{Origin:'https://evil.example.test'})).status,403);
 const flow=await start();const result=await instance.dispatchFetch(origin+'/api/auth/google/callback?'+new URLSearchParams({state:flow.state,code:'network-failure'}),{redirect:'manual',headers:{Cookie:flow.Cookie}});
 assert.equal(result.headers.get('location'),'/login?google=unavailable');assert.equal((await result.text()).includes('private'),false);
}));
test('Google routes remain off without separate explicit mode',()=>local(async({request})=>{assert.equal((await request('google/start',{purpose:'signin'})).status,404);},{GOOGLE_AUTH_MODE:''}));

test('validated Google names are private optional flow-bound hints, not account identity or automatic signup',()=>local(async({start,callback,request,db,complete})=>{
 const flow=await start();const response=await callback(flow,{given_name:'Fictional',family_name:'Tést Person'});
 assert.equal(response.headers.get('location'),'/google-complete');
 const profileCookie=response.headers.get('set-cookie').split(';')[0];
 assert.match(response.headers.get('set-cookie'),/HttpOnly/);assert.match(response.headers.get('set-cookie'),/SameSite=Lax/);
 const Cookie=flow.Cookie+'; '+profileCookie;
 const hints=await request('google/profile',undefined,{Cookie});assert.equal(hints.status,200);
 assert.equal(hints.headers.get('cache-control'),'no-store');assert.deepEqual(await hints.json(),{firstName:'Fictional',lastName:'Tést Person'});
 assert.equal(await db.prepare('SELECT COUNT(*) n FROM users').first('n'),0);
 assert.deepEqual(await(await request('google/profile',undefined,{Cookie:flow.Cookie})).json(),{});
 assert.equal((await request('google/profile',undefined,{Cookie,Origin:'https://evil.example.test'})).status,403);
 const malformed=profileCookie.slice(0,-1)+(profileCookie.endsWith('a')?'b':'a');
 assert.deepEqual(await(await request('google/profile',undefined,{Cookie:flow.Cookie+'; '+malformed})).json(),{});
 const result=await request('google/complete',{nickname:'Chosen Nickname',firstName:'Edited',lastName:'Private Name'},{Cookie});assert.equal(result.status,200);
 assert.match(result.headers.get('set-cookie'),/lan_google_profile_local=;.*Max-Age=0/);
 const stored=await db.prepare('SELECT first_name,last_name FROM users').first();assert.deepEqual(stored,{first_name:'Edited',last_name:'Private Name'});
 assert.equal((await request('google/profile',undefined,{Cookie})).status,503);
 const next=await start();await callback(next,{sub:'another-fictional-subject',email:'another@example.test'});
 assert.deepEqual(await(await request('google/profile',undefined,{Cookie:next.Cookie+'; '+profileCookie})).json(),{});
}));

test('invalid or missing optional Google name claims are ignored; unvalidated claims never produce profile hints',()=>local(async({start,callback,request})=>{
 for(const claims of [{given_name:' Leading',family_name:'Bad\nName'},{given_name:123,family_name:'x'.repeat(101)},{}]){
  const flow=await start();const response=await callback(flow,claims);
  assert.equal(response.headers.get('location'),'/google-complete');
  const Cookie=flow.Cookie+'; '+response.headers.get('set-cookie').split(';')[0];
  assert.deepEqual(await(await request('google/profile',undefined,{Cookie})).json(),{});
 }
 const flow=await start(),bad=await callback(flow,{given_name:'Forged',family_name:'Name'},{},true);
 assert.equal(bad.headers.get('location'),'/login?google=unavailable');assert.equal(bad.headers.get('set-cookie'),null);
}));

test('pre-0012 schema supports existing verification, login, recovery and logout while Google is off',()=>local(async({request,db})=>{
 const email='before-migration@example.test',password='fictional original password',replacement='fictional replacement password';
 assert.equal((await request('google/start',{purpose:'signin'})).status,404);
 assert.equal((await request('register',{nickname:'Preflight Player',firstName:'Fictional',lastName:'Tester',email,password})).status,202);
 const mail=async purpose=>{const r=await request('local-mail',{email,purpose},{Authorization:'Bearer '+'33'.repeat(32)});assert.equal(r.status,200);return new URLSearchParams(new URL((await r.json()).mail.url).hash.slice(1));};
 const verification=await mail('email-verification');
 assert.equal((await request('verify-email',{userId:verification.get('user'),token:verification.get('token')})).status,200);
 assert.equal((await request('login',{email,password})).status,200);
 assert.equal((await request('forgot-password',{email})).status,202);const reset=await mail('password-reset');
 assert.equal((await request('reset-password',{userId:reset.get('user'),token:reset.get('token'),password:replacement})).status,200);
 const login=await request('login',{email,password:replacement});assert.equal(login.status,200);
 const Cookie=login.headers.get('set-cookie').split(';')[0],body=await(await request('session',undefined,{Cookie})).json();
 assert.equal((await request('logout',{}, {Cookie,'X-CSRF-Token':body.csrfToken})).status,200);
 assert.equal(await db.prepare("SELECT COUNT(*) n FROM sqlite_schema WHERE name='auth_oidc_transactions'").first('n'),0);
},{GOOGLE_AUTH_MODE:'off'},11));

test('0012 upgrades populated 0011 without changing accounts, credentials, sessions or member ledger',()=>local(async({request,db,upgrade})=>{
 await request('register',{nickname:'Upgrade Fixture',firstName:'Fictional',lastName:'Tester',email:'upgrade@example.test',password:'fictional upgrade password'});
 await db.prepare('UPDATE users SET email_verified_at=unixepoch()').run();
 await request('login',{email:'upgrade@example.test',password:'fictional upgrade password'});
 const tables=['users','user_password_credentials','user_nicknames','auth_sessions','auth_action_tokens','member_numbers','sqlite_sequence','roles','user_roles','registration_rate_limits'];
 const snapshot=async()=>Promise.all(tables.map(t=>db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all().then(r=>r.results)));
 const before=await snapshot();await upgrade();assert.deepEqual(await snapshot(),before);
 for(const table of ['auth_oidc_transactions','auth_recent_authentication','auth_password_setup'])assert.equal(await db.prepare('SELECT COUNT(*) n FROM '+table).first('n'),0);
 assert.equal(await db.prepare('PRAGMA foreign_keys').first('foreign_keys'),1);
 assert.equal(await db.prepare('PRAGMA quick_check').first('quick_check'),'ok');
 assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
},{},11));

test('0012 refuses ambiguous legacy Google mappings and rolls back its entire D1 batch',async()=>{
 for(const collision of ['same-user','same-subject'])await local(async({db,request,upgrade})=>{
  for(const n of [1,2])await request('register',{nickname:'Legacy Player '+n,firstName:'Fictional',lastName:'Tester',email:`legacy${n}@example.test`,password:'fictional legacy password'});
  const users=(await db.prepare('SELECT id FROM users ORDER BY email_normalized').all()).results;
  for(const n of [0,1])await db.prepare(`INSERT INTO user_auth_providers(id,user_id,provider,identity_namespace,provider_subject,linked_at)
    VALUES (?,?,'google',?,?,unixepoch())`).bind(randomUUID(),users[collision==='same-user'?0:n].id,n?'accounts.google.com':'https://accounts.google.com',collision==='same-subject'?'shared-subject':'subject-'+n).run();
  await assert.rejects(()=>upgrade());
  assert.equal(await db.prepare("SELECT COUNT(*) n FROM sqlite_schema WHERE name IN ('auth_oidc_transactions','auth_recent_authentication','auth_password_setup','auth_google_user_idx','auth_google_subject_idx')").first('n'),0);
  assert.equal(await db.prepare('SELECT COUNT(*) n FROM user_auth_providers').first('n'),2);
  assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
 },{},11);
});

test('Google reauthentication rejects old or missing auth_time and a different provider identity',()=>local(async({request,start,callback,complete,session,db})=>{
 const flow=await start();await callback(flow);const headers=await session(await complete(flow));
 for(const claims of [{auth_time:1},{auth_time:undefined},{auth_time:Math.floor(Date.now()/1000)+300},{sub:'another-subject'}]){
  const reauth=await start('reauth',headers);
  assert.equal((await callback(reauth,claims,{Cookie:reauth.Cookie+'; '+headers.Cookie})).headers.get('location'),'/login?google=unavailable');
 }
 assert.equal(await db.prepare('SELECT COUNT(*) n FROM auth_recent_authentication').first('n'),0);
}));

test('Google initiation uses conditional server-validated challenge; missing or replayed proofs never bypass it',()=>local(async({request})=>{
 for(let i=0;i<59;i++)assert.equal((await request('google/start',{purpose:'signin'})).status,200);
 const required=await request('google/start',{purpose:'signin'});assert.equal(required.status,403);assert.equal((await required.json()).code,'challenge_required');
 const input={purpose:'signin',turnstileToken:'fictional-single-use-proof'};
 assert.equal((await request('google/start',input)).status,200);assert.equal((await request('google/start',input)).status,403);
}));
test('expired or stale recent proof and changed callback account generation reject linking',()=>local(async({request,start,callback,session,db})=>{
 const password='fictional original password';await request('register',{nickname:'Existing Player',firstName:'Fictional',lastName:'Tester',email:'google@example.test',password});
 await db.prepare('UPDATE users SET email_verified_at=unixepoch()').run();const headers=await session(await request('login',{email:'google@example.test',password}));
 await request('google/reauth-password',{password},headers);
 await db.prepare('UPDATE auth_recent_authentication SET authenticated_at=0,expires_at=300').run();
 assert.equal((await request('google/start',{purpose:'link'},headers)).status,428);
 await request('google/reauth-password',{password},headers);const flow=await start('link',headers);
 await db.prepare('UPDATE users SET auth_version=auth_version+1').run();
 assert.equal((await callback(flow,{}, {Cookie:flow.Cookie+'; '+headers.Cookie})).headers.get('location'),'/login?google=unavailable');
 assert.equal(await db.prepare('SELECT COUNT(*) n FROM user_auth_providers').first('n'),0);
}));
test('first-password failure rolls back proof consumption; crossover and expired email proofs fail safely',()=>local(async({request,start,callback,session,complete,db})=>{
 const flow=await start();await callback(flow);const headers=await session(await complete(flow));
 const reauth=await start('reauth',headers);await callback(reauth,{}, {Cookie:reauth.Cookie+'; '+headers.Cookie});
 await request('google/request-password',{},headers);
 const mail=await(await request('local-mail',{email:'google@example.test',purpose:'password-setup'},{Authorization:'Bearer '+'33'.repeat(32)})).json();
 const token=new URLSearchParams(new URL(mail.mail.url).hash.slice(1)).get('setup'),password='fictional new password';
 assert.equal((await request('reset-password',{userId:await db.prepare('SELECT id FROM users').first('id'),token,password})).status,400);
 await db.exec("CREATE TRIGGER fixture_setup_failure BEFORE INSERT ON user_password_credentials BEGIN SELECT RAISE(ABORT,'fixture'); END;");
 assert.equal((await request('google/add-password',{token,password},headers)).status,503);
 assert.equal(await db.prepare('SELECT consumed_at FROM auth_password_setup').first('consumed_at'),null);
 assert.equal(await db.prepare('SELECT COUNT(*) n FROM user_password_credentials').first('n'),0);
 await db.exec('DROP TRIGGER fixture_setup_failure;');
 await db.prepare('UPDATE auth_password_setup SET created_at=0,expires_at=600').run();
 assert.equal((await request('google/add-password',{token,password},headers)).status,400);
 assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
}));
