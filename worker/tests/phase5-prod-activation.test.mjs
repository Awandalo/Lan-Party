import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire,Module} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {before,test} from 'node:test';
const require=createRequire(import.meta.url),wr=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=wr('miniflare'),{build}=wr('esbuild');
const origin='https://www.lan-party.club',target='lan-party:9fbe3402-c26b-45fd-be67-71775e5e6a3e';
let scripts,migrations;
before(async()=>{
 const contents=`import app from './worker/index';import {emailTransport} from './worker/auth/environment';import {generateToken,digestToken} from './worker/auth/tokens';import {sessionCsrfToken} from './worker/auth/csrf';
 const emails=[];globalThis.fetch=async(url,options)=>{if(String(url)!=='https://api.resend.com/emails')throw Error('External request forbidden');emails.push(JSON.parse(options.body));return Response.json({id:crypto.randomUUID()});};
 export default{async fetch(request,env,ctx){
  if(new URL(request.url).pathname==='/api/fixture-emails')return Response.json(emails);
  if(new URL(request.url).pathname==='/api/fixture-email'){try{return Response.json(await emailTransport(new Request('https://www.lan-party.club'),env).send(await request.json())??{});}catch{return Response.json({error:'Denied'}, {status:503});}}
  if(new URL(request.url).pathname==='/fixture'){const token=generateToken(),digest=await digestToken(token,'session');return Response.json({token,digest,csrf:await sessionCsrfToken(digest,env.AUTH_RATE_LIMIT_SECRET)});}
  const headers=new Headers(request.headers),host=headers.get('X-Fixture-Host');headers.delete('X-Fixture-Host');
  if(host!==null){if(!/^127[.]0[.]0[.]1:[0-9]+$/.test(headers.get('Host')??''))throw Error('Unexpected fixture transport');headers.set('Host',host);}
  return app.fetch(new Request(request,{headers}),env,ctx);
 }};`;
 scripts=await Promise.all([{}, {__LAN_MFA_TARGET__:JSON.stringify(target)}].map(async define=>(await build({stdin:{resolveDir:fileURLToPath(new URL('../../',import.meta.url)),contents},define,bundle:true,write:false,format:'esm',platform:'browser'})).outputFiles[0].text));
 migrations=[];
 for(const name of(await readdir(new URL('../../migrations/',import.meta.url))).filter(n=>/^\d{4}_.*\.sql$/.test(n)).sort()){
  let rest=(await readFile(new URL('../../migrations/'+name,import.meta.url),'utf8')).replace(/--[^\n]*/g,'').trim();const parts=[];
  while(rest){const end=rest.startsWith('CREATE TRIGGER')?rest.indexOf('\nEND;')+5:rest.indexOf(';')+1;if(end<=0||end===4)throw Error('Incomplete migration');parts.push(rest.slice(0,end));rest=rest.slice(end).trim();}migrations.push(parts);
 }
});
async function local(run,trusted=true,enabled=true){
 const instance=new Miniflare(convertV4MiniflareOptions({modules:true,script:scripts[trusted?1:0],cf:false,compatibilityDate:'2026-10-11',d1Databases:{DB:randomUUID()},bindings:{EVENTS_MODE:enabled?'enabled':'disabled',RESEND_API_KEY:'fixture-only',AUTH_PROD_EMAIL_DAILY_LIMIT:'60',AUTH_PROD_EMAIL_MONTHLY_LIMIT:'3000',AUTH_EMAIL_PROVIDER_DAILY_LIMIT:'100',AUTH_EMAIL_PROVIDER_MONTHLY_LIMIT:'3000',AUTH_ENVIRONMENT:'prod',AUTH_SESSION_MODE:'hosted-prod',AUTH_PUBLIC_ORIGIN:origin,AUTH_EMAIL_TRANSPORT:'resend',AUTH_RATE_LIMIT_SECRET:'33'.repeat(32),PASSWORD_PEPPER:'44'.repeat(32),MFA_ENCRYPTION_KEYS:JSON.stringify({fixture:'55'.repeat(32)}),MFA_ACTIVE_KEY_ID:'fixture',AUTH_LIFECYCLE_ADMIN_MODE:'enabled'}}));
 try{
  const db=await instance.getD1Database('DB'),sql=(q,...args)=>db.prepare(q).bind(...args);
  for(const parts of migrations)await db.batch(parts.map(s=>db.prepare(s)));
  const user=async(admin=false)=>{
   const id=randomUUID(),now=await sql('SELECT unixepoch() n').first('n'),session=await(await instance.dispatchFetch(origin+'/fixture')).json();
   await sql("INSERT INTO users(id,first_name,last_name,email,email_normalized,email_verified_at,created_at,updated_at) VALUES(?,'Fictional','Activation',?,?,?,?,?)",id,id+'@example.test',id+'@example.test',now-5,now-5,now-5).run();
   await sql('INSERT INTO user_nicknames(user_id,nickname,created_at,updated_at) VALUES(?,?,?,?)',id,'Fixture '+id.slice(0,8),now-5,now-5).run();
   if(admin)await sql("INSERT INTO user_roles(user_id,role_id,assigned_at) VALUES(?,'1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7',0)",id).run();
   await sql('INSERT INTO auth_sessions(id,user_id,token_digest,auth_version,created_at,expires_at) VALUES(?,?,?,0,?,?)',randomUUID(),id,session.digest,now-1,now+3600).run();return{id,...session};
  };
  const request=(path,u,body,overrides={},base=origin)=>{
   const headers=new Headers({'X-Fixture-Host':new URL(base).host,'X-LAN-Request':'1','CF-Connecting-IP':'203.0.113.1',Origin:origin,...(u?{Cookie:'__Host-lan_session='+u.token,'X-LAN-Session-Proof':u.csrf,'X-CSRF-Token':u.csrf}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})});
   for(const [key,value] of Object.entries(overrides))value===null?headers.delete(key):headers.set(key,value);
   return instance.dispatchFetch(base+'/api/'+path,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
  };
  await run({sql,user,request});
  assert.equal(await sql('PRAGMA quick_check').first('quick_check'),'ok');assert.deepEqual((await sql('PRAGMA foreign_key_check').all()).results,[]);
 }finally{await instance.dispose();}
}

test('Phase 5 production gate denies disabled activation, default bundles and noncanonical origins',async()=>{
 const id='20000000-0000-4000-8000-000000000001';
 for(const [trusted,enabled] of [[false,true],[true,false]])await local(async f=>{
  const admin=await f.user(true);for(const path of ['events','events/'+id,'event-registration/'+id,'event-participants/'+id,'event-review/'+id,'event-finance/'+id+'/manage','manage/events','manage/locations'])assert.equal((await f.request(path,admin)).status,404,path);
 },trusted,enabled);
 await local(async f=>{const admin=await f.user(true);for(const base of ['https://dev.lan-party.club','https://lan-party.club','https://lan-party.servok.workers.dev'])assert.equal((await f.request('events',admin,undefined,{'X-Forwarded-Host':'www.lan-party.club'},base)).status,404);});
});

test('production event flow preserves privacy, closure locks and explicit recipient-scoped email receipts',()=>local(async f=>{
 const admin=await f.user(true),member=await f.user(),other=await f.user(),location=randomUUID();
 const caps=await f.request('manage/capabilities',admin);assert.equal(caps.status,200);assert.ok((await caps.json()).sections.includes('locations'));
 assert.equal((await f.request('manage/locations',member)).status,403);assert.equal((await f.request('manage/events')).status,401);
 await f.sql("INSERT INTO locations(id,name,address_line,postal_code,city,country_code,capacity,default_rental_cents,created_at,updated_at) VALUES (?,'Fictional Hall','Example 1','0000 AA','Example','NL',10,15000,0,0)",location).run();
 const title='Fictional production-mode LAN',body={action:'create',operationId:randomUUID(),locationId:location,locationRevision:0,title,description:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Fictional production test'}]}]},startsAt:Date.parse('2030-11-01T17:00Z')/1000,endsAt:Date.parse('2030-11-03T19:00Z')/1000,minimumParticipants:1,maxGuests:2};
 let response=await f.request('manage/events',admin,body);assert.equal(response.status,200,await response.clone().text());const {id}=await response.json();
 response=await f.request('manage/events',admin,{action:'publish',id,revision:0,operationId:randomUUID(),confirmation:title});assert.equal(response.status,200,await response.clone().text());
 const guest={id:randomUUID(),name:'Fictional Guest',email:'guest@example.test',days:['2030-11-02']};
 assert.equal((await f.request('event-registration/'+id,member,{action:'save',revision:1,operationId:randomUUID(),draft:{days:['2030-11-01','2030-11-02'],guests:[guest]}})).status,200);
 const publicEvent=await(await f.request('events/'+id)).json();assert.equal(publicEvent.event.registrationStatus,'open');assert.equal(JSON.stringify(publicEvent).includes(guest.name),false);assert.equal(JSON.stringify(publicEvent).includes('@example.test'),false);
 const own=await(await f.request('event-registration/'+id,member)).json();assert.equal(own.own.guests[0].name,guest.name);
 const otherView=await(await f.request('event-registration/'+id,other)).json();assert.equal(otherView.own,null);assert.equal(JSON.stringify(otherView).includes(guest.name),false);
 assert.equal((await f.request('event-participants/'+id,member)).status,403);
 assert.equal((await f.request('event-finance/'+id+'/manage',member)).status,403);
 assert.equal((await f.request('event-finance/'+id+'/manage',admin,{action:'finalize',revision:2,operationId:randomUUID(),confirmation:title,acknowledgeEarly:true},{'X-CSRF-Token':null})).status,403);
 const preview=await(await f.request('event-finance/'+id+'/manage',admin)).json();assert.equal(preview.participantDays,3);
 const before=(await(await f.request('fixture-emails',admin)).json()).length;
 assert.equal((await f.request('event-finance/'+id+'/manage',admin,{action:'finalize',revision:preview.revision,operationId:randomUUID(),confirmation:title,acknowledgeEarly:true})).status,200);
 assert.equal((await(await f.request('fixture-emails',admin)).json()).length,before);
 const infoResponse=await f.request('event-finance/'+id+'/manage',admin,{action:'payment-info-preview',operationId:randomUUID(),revision:await f.sql('SELECT revision FROM event_management WHERE event_id=?',id).first('revision')});assert.equal(infoResponse.status,200,await infoResponse.clone().text());const info=await infoResponse.json();assert.equal(info.recipients.length,2);
 const send={action:'send-payment-info',revision:info.revision,previewToken:info.previewToken,retryFailed:false,operationId:randomUUID()};
 response=await f.request('event-finance/'+id+'/manage',admin,send);assert.equal(response.status,200,await response.clone().text());
 const records=(await f.sql('SELECT state,provider_id FROM event_payment_info_emails ORDER BY recipient_key').all()).results;assert.equal(records.length,2);assert.ok(records.every(r=>r.state==='sent'&&/^[0-9a-f-]{36}$/.test(r.provider_id)));
 assert.equal((await f.request('event-finance/'+id+'/manage',admin,send)).status,409);
 const mails=await(await f.request('fixture-emails',admin)).json(),guestMail=mails.find(m=>m.to.includes(guest.email));assert.ok(guestMail);assert.equal(guestMail.html.includes('Open payment request'),false);assert.equal(guestMail.text.includes('Combined total'),false);
 await assert.rejects(f.sql('UPDATE event_bills SET total_cents=1 WHERE event_id=?',id).run(),/immutable/);
}));

test('production event emails require activation, exact event paths and preserve authentication delivery',async()=>{
 const id='20000000-0000-4000-8000-000000000001',mail={purpose:'event-registration',to:'fictional@example.test',url:origin+'/events/'+id,expiresAt:Math.floor(Date.now()/1000)+600,idempotencyKey:randomUUID()};
 await local(async f=>{
  for(const url of [origin+'/verify-email',origin+'/events/'+id+'/registration',origin+'/events/'+id+'#x','https://dev.lan-party.club/events/'+id])assert.equal((await f.request('fixture-email',null,{...mail,url})).status,503);
  assert.equal(await f.sql('SELECT count(*) n FROM auth_email_daily_budget').first('n'),0);
  const receipt=await f.request('fixture-email',null,mail);assert.equal(receipt.status,200);assert.equal((await(await f.request('fixture-emails')).json()).length,1);
  assert.equal(await f.sql('SELECT sum(attempts) n FROM auth_email_daily_budget').first('n'),1);
 });
 await local(async f=>{assert.equal((await f.request('fixture-email',null,mail)).status,503);const auth={...mail,purpose:'email-verification',url:origin+'/verify-email#fictional'};assert.equal((await f.request('fixture-email',null,auth)).status,200);},true,false);
});

test('public event UI follows the canonical DEV/PROD presentation gate',async()=>{
 const previous=globalThis.window;
 try{for(const flag of ['', 'hosted-dev','hosted-prod']){
  const code=(await build({stdin:{resolveDir:process.cwd(),contents:"export {PUBLIC_EVENTS_AVAILABLE} from './src/lib/public-events';"},bundle:true,packages:'external',write:false,format:'cjs',platform:'node',define:{'import.meta.env.DEV':'false','import.meta.env.VITE_AUTH_MODE':JSON.stringify(flag)}})).outputFiles[0].text;
  for(const base of ['https://dev.lan-party.club',origin,'https://lan-party.club','https://lan-party.servok.workers.dev']){
   globalThis.window={location:{origin:base}};const compiled=new Module(import.meta.filename);compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(code,import.meta.filename);
   assert.equal(compiled.exports.PUBLIC_EVENTS_AVAILABLE,flag==='hosted-prod'&&base===origin||flag==='hosted-dev'&&base==='https://dev.lan-party.club');
  }
 }}finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
