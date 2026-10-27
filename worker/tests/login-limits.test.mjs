import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { before, test } from 'node:test';
const require=createRequire(import.meta.url), wr=createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions }=wr('miniflare'), { build }=wr('esbuild');
const origin='http://127.0.0.1:5173', email='player@example.test', password='fictional login password';
let script, migrations, LoginLimiter, LoginLimited, LoginBusy;
before(async()=>{
 script=(await build({entryPoints:[fileURLToPath(new URL('../index.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser'})).outputFiles[0].text;
 const code=(await build({entryPoints:[fileURLToPath(new URL('../auth/login-limits.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node'})).outputFiles[0].text;
 ({LoginLimiter,LoginLimited,LoginBusy}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')));
 migrations=[];
 for(const name of (await readdir(new URL('../../migrations/',import.meta.url))).filter(n=>/^\d{4}_.*\.sql$/.test(n)).sort()){
  let rest=(await readFile(new URL('../../migrations/'+name,import.meta.url),'utf8')).replace(/--[^\n]*/g,'').trim();const parts=[];
  while(rest){const end=rest.startsWith('CREATE TRIGGER')?rest.indexOf('\nEND;')+5:rest.indexOf(';')+1;if(end<=0||end===4)throw Error('Incomplete fixture');parts.push(rest.slice(0,end));rest=rest.slice(end).trim();}migrations.push(parts);
 }
});
async function local(run){
 let providerMode='ok', providerCalls=0;
 const instance=new Miniflare(convertV4MiniflareOptions({modules:true,script,cf:false,compatibilityDate:'2026-10-11',d1Databases:{DB:randomUUID()},bindings:{
  REGISTRATION_MODE:'local-only',AUTH_SESSION_MODE:'local-only',AUTH_PUBLIC_ORIGIN:origin,PASSWORD_PEPPER:'11'.repeat(32),AUTH_RATE_LIMIT_SECRET:'22'.repeat(32),
  AUTH_TURNSTILE_SITE_KEY:'synthetic-site-key',TURNSTILE_SECRET_KEY:'synthetic-only-turnstile-secret'},outboundService:async req=>{
   providerCalls++;assert.equal(req.url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');assert.equal(req.method,'POST');
   const input=await req.json();assert.equal(input.secret==='synthetic-only-turnstile-secret',true);
   if(providerMode==='network')throw Error('Fictional private transport detail');
   if(providerMode==='http')return new Response('private fixture',{status:503});
   if(providerMode==='redirect')return new Response(null,{status:302,headers:{Location:'https://forbidden.example.test'}});
   return Response.json({success:providerMode!=='rejected',hostname:providerMode==='hostname'?'wrong.example.test':'127.0.0.1',action:providerMode==='action'?'wrong':'login'});
  }}));
 try{
  const db=await instance.getD1Database('DB');for(const statements of migrations)await db.batch(statements.map(s=>db.prepare(s)));
  const request=(action,input,ip='203.0.113.9')=>instance.dispatchFetch('http://127.0.0.1:8787/api/auth/'+action,{method:input===undefined?'GET':'POST',...(input===undefined?{}:{body:JSON.stringify(input)}),headers:{Origin:origin,'X-LAN-Request':'1','Content-Type':'application/json','CF-Connecting-IP':ip}});
  const register=async()=>{assert.equal((await request('register',{nickname:'Fixture Player',firstName:'Fictional',lastName:'Tester',email,password})).status,202);await db.prepare('UPDATE users SET email_verified_at=unixepoch()').run();};
  const login=(options={},ip)=>request('login',{email,password,...options},ip);
  const limiter=(clock=()=>Math.floor(Date.now()/1000),ip='203.0.113.9')=>LoginLimiter.create(db,'22'.repeat(32),ip,clock);
  await run({db,request,register,login,limiter,mode:value=>{providerMode=value;},calls:()=>providerCalls});
 }finally{await instance.dispose();}
}
const proof=()=>({turnstileToken:'synthetic-'+randomUUID()});

test('100 distinct users plus ten password mistakes share one IP; challenges never become a blanket lockout',()=>local(async({db,register,login,calls})=>{
 await register();
 const hash=await db.prepare('SELECT password_hash FROM user_password_credentials').first('password_hash');
 // Clone a synthetic credential fixture only; hashing/salt correctness is covered separately.
 for(let i=1;i<100;i++){const id=randomUUID(),address=`player${i}@example.test`;await db.batch([
 db.prepare('INSERT INTO users(id,first_name,last_name,email,email_normalized,email_verified_at,created_at,updated_at) VALUES (?,?,?,?,?,unixepoch(),unixepoch(),unixepoch())').bind(id,'Fictional','Tester',address,address),
 db.prepare('INSERT INTO user_nicknames(user_id,nickname,created_at,updated_at) VALUES (?,?,unixepoch(),unixepoch())').bind(id,`Fixture Player ${i}`),
 db.prepare('INSERT INTO user_password_credentials(user_id,password_hash,password_changed_at,created_at,updated_at) VALUES (?,?,unixepoch(),unixepoch(),unixepoch())').bind(id,hash)]);}
 for(let i=0;i<10;i++)assert.equal((await login({email:i?`player${i}@example.test`:email,password:'incorrect fictional password'})).status,401);
 const responses=await Promise.all(Array.from({length:100},(_,i)=>login({email:i?`player${i}@example.test`:email}).then(async r=>({status:r.status,body:await r.json()}))));
 let challenges=0;for(let i=0;i<100;i++){
  if(responses[i].status===403){assert.equal(responses[i].body.code,'challenge_required');challenges++;assert.equal((await login({email:i?`player${i}@example.test`:email,...proof()})).status,200);}
  else assert.equal(responses[i].status,200);
 }
 console.info(`Shared-IP result: 100/100 signed in, 10 incorrect attempts, ${challenges} server-validated fixture challenges.`);
 assert.equal(challenges>0,true);assert.equal(calls(),challenges);
 assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').first('n'),100);
}));
test('four failures then correct fifth succeeds; five confirmed failures restrict only that email+IP with precise rolling expiry',()=>local(async({register,login,limiter})=>{
 await register();for(let i=0;i<4;i++)assert.equal((await login({password:'incorrect fictional password'})).status,401);
 assert.equal((await login()).status,200);assert.equal((await login({password:'incorrect fictional password'})).status,401);
 const blocked=await login({...proof()});assert.equal(blocked.status,429);const wait=Number(blocked.headers.get('retry-after'));assert.equal(wait>0&&wait<=900,true);
 assert.equal((await login({},'203.0.113.10')).status,200);
 const future=await limiter(()=>Math.floor(Date.now()/1000)+901);assert.equal(await(await future.reserve(email)).finish(false),true);
}));
test('concurrent incorrect passwords never exceed five confirmed failures; unknown accounts are equivalent',()=>local(async({register,login,db})=>{
 await register();const responses=await Promise.all(Array.from({length:8},()=>login({password:'incorrect fictional password'})));
 assert.equal(responses.filter(r=>r.status===401).length,5);assert.equal(responses.filter(r=>r.status===429).length,3);
 for(let n=0;n<5;n++)assert.equal((await login({email:'unknown@example.test'})).status,401);
 assert.equal((await login({email:'unknown@example.test'})).status,429);
 assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').first('n'),0);
}));
test('pending reservations are not failures; bounded waiting, lease expiry, stale completion and same-second ownership are fenced',()=>local(async({limiter})=>{
 let now=100000;const limit=await limiter(()=>now), old=await limit.reserve(email);
 await assert.rejects(()=>limit.reserve(email),LoginBusy);
 now+=31;const next=await limit.reserve(email);assert.equal(await old.finish(true),false);assert.equal(await next.finish(false),true);
 const fresh=await limit.reserve(email);assert.equal(await next.finish(true),false);assert.equal(await fresh.finish(false),true);
 for(let i=0;i<4;i++)assert.equal(await(await limit.reserve(email)).finish(true),true);
 assert.equal(await(await limit.reserve(email)).finish(false),true);
 assert.equal(await(await limit.reserve(email)).finish(true),true);
 await assert.rejects(()=>limit.reserve(email),error=>error instanceof LoginLimited&&error.retryAfter===900);
 now+=900;assert.equal(await(await limit.reserve(email)).finish(false),true);
}));
test('reservation completion rolls back on storage failure and never records uncertain work as a confirmed failure',()=>local(async({db,limiter})=>{
 const limit=await limiter(), held=await limit.reserve(email);
 await db.exec("CREATE TRIGGER fixture_failure BEFORE INSERT ON registration_rate_limits WHEN NEW.expires_at > unixepoch()+800 BEGIN SELECT RAISE(ABORT,'fixture'); END;");
 await assert.rejects(()=>held.finish(true));await db.exec('DROP TRIGGER fixture_failure;');assert.equal(await held.finish(false),true);
 for(let i=0;i<5;i++)assert.equal(await(await limit.reserve(email)).finish(true),true);
}));
test('shared failure thresholds challenge unrelated accounts instead of locking them out; challenge cannot bypass pair failures',()=>local(async({register,login,limiter,mode})=>{
 await register();const limit=await limiter();for(let i=0;i<30;i++)await(await limit.reserve(`missing${i}@example.test`)).finish(true);
 const needed=await login();assert.equal(needed.status,403);assert.equal((await needed.json()).code,'challenge_required');
 assert.equal((await login(proof())).status,200);
 for(let i=0;i<5;i++)assert.equal((await login({password:'incorrect fictional password',...proof()})).status,401);
 assert.equal((await login(proof())).status,429);
 mode('ok');assert.equal((await login({...proof()},'203.0.113.10')).status,200);
}));
test('server-side proof validation rejects wrong hostname/action, rejection, replay, outages and redirects without hashing or issuing sessions',()=>local(async({register,login,db,mode,calls})=>{
 await register();for(const value of ['hostname','action','rejected','http','network','redirect']){mode(value);const response=await login(proof());assert.equal(response.status,['http','network','redirect'].includes(value)?503:403);assert.equal((await response.text()).includes('private'),false);}
 mode('ok');const input=proof();assert.equal((await login(input)).status,200);assert.equal((await login(input)).status,403);
 const concurrent=proof();const results=await Promise.all([login(concurrent),login(concurrent)]);assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.status===403).length,1);
 assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').first('n'),2);
 assert.equal(calls(),10);
}));
test('soft volume markers saturate without violating schema and expire at the next minute',()=>local(async({limiter})=>{
 let now=120000;const limit=await limiter(()=>now);for(let i=0;i<59;i++)assert.equal(await limit.observe(),false);
 for(let i=0;i<100;i++)assert.equal(await limit.observe(),true);
 now+=60;assert.equal(await limit.observe(),false);
}));

test('a waiting same-pair request resumes after completion without recording a failure',()=>local(async({limiter})=>{
 const limit=await limiter(),first=await limit.reserve(email),second=limit.reserve(email);
 await new Promise(resolve=>setTimeout(resolve,60));assert.equal(await first.finish(false),true);assert.equal(await(await second).finish(false),true);
}));
