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
 const contents=`import app from './worker/index';import {generateToken,digestToken} from './worker/auth/tokens';import {sessionCsrfToken} from './worker/auth/csrf';
 globalThis.fetch=async()=>{throw Error('External provider access forbidden in activation fixture');};
 export default{async fetch(request,env,ctx){
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
async function local(run,trusted=true){
 const instance=new Miniflare(convertV4MiniflareOptions({modules:true,script:scripts[trusted?1:0],cf:false,compatibilityDate:'2026-10-11',d1Databases:{DB:randomUUID()},bindings:{AUTH_ENVIRONMENT:'prod',AUTH_SESSION_MODE:'hosted-prod',AUTH_PUBLIC_ORIGIN:origin,AUTH_EMAIL_TRANSPORT:'resend',AUTH_RATE_LIMIT_SECRET:'33'.repeat(32),PASSWORD_PEPPER:'44'.repeat(32),MFA_ENCRYPTION_KEYS:JSON.stringify({fixture:'55'.repeat(32)}),MFA_ACTIVE_KEY_ID:'fixture',AUTH_LIFECYCLE_ADMIN_MODE:'enabled'}}));
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
test('trusted PROD administration exposes approved sections and preserves member, role and log authority',()=>local(async f=>{
 const admin=await f.user(true),member=await f.user();
 const caps=await f.request('manage/capabilities',admin);assert.equal(caps.status,200);assert.deepEqual((await caps.json()).sections,['users','roles','activity','events','userActivity','feedback']);
 for(const path of ['manage/users','manage/roles','manage/role-activity','manage/user-activity','manage/feedback']){
  assert.equal((await f.request(path,admin)).status,200,path);assert.equal((await f.request(path,member)).status,403,path);assert.equal((await f.request(path)).status,401,path);
 }
 assert.equal((await f.request('auth/session',admin)).status,200);
 assert.equal((await f.request('auth/lifecycle/member',admin,{userId:member.id})).status,200);
 assert.equal((await f.request('manage/locations',admin)).status,404);
 await f.sql('DELETE FROM user_roles WHERE user_id=?',admin.id).run();
 assert.equal((await f.request('manage/roles',admin)).status,403);
}));
test('PROD feedback retains private ownership, administrator triage and mutation CSRF',()=>local(async f=>{
 const admin=await f.user(true),member=await f.user(),other=await f.user();
 const create={operationId:randomUUID(),kind:'bug',title:'Fictional activation fixture',description:'Fictional expected and actual behavior'};
 assert.equal((await f.request('feedback/requests',member,create,{'X-CSRF-Token':null})).status,403);
 const created=await f.request('feedback/requests',member,create);assert.equal(created.status,200);const id=(await created.json()).requestId;
 assert.equal((await f.request('feedback/requests/'+id,member)).status,200);assert.equal((await f.request('feedback/requests/'+id,other)).status,404);
 assert.equal((await f.request('manage/feedback/'+id,admin)).status,200);assert.equal((await f.request('manage/feedback/'+id,member)).status,403);
 const triage={operationId:randomUUID(),revision:1,decision:'yes',progress:'planned'};
 assert.equal((await f.request('manage/feedback/'+id+'/triage',admin,triage)).status,200);
}));
test('PROD activation preserves exact origin, session proof, cross-site and alias denial',()=>local(async f=>{
 const admin=await f.user(true);
 for(const path of ['manage/roles','feedback/requests']){
  for(const headers of [{Origin:'https://untrusted.example'},{'Sec-Fetch-Site':'cross-site'},{'X-LAN-Request':null},{'X-LAN-Session-Proof':null},{'X-LAN-Session-Proof':'00'.repeat(32)}])assert.ok([403,409].includes((await f.request(path,admin,undefined,headers)).status));
  for(const base of ['https://dev.lan-party.club','https://lan-party.club','https://lan-party.servok.workers.dev'])assert.equal((await f.request(path,admin,undefined,{'X-Forwarded-Host':'www.lan-party.club'},base)).status,404);
 }
}));
test('runtime PROD variables cannot activate an untrusted/default Worker build',()=>local(async f=>{
 for(const path of ['manage/capabilities','manage/roles','feedback/requests'])assert.equal((await f.request(path)).status,404);
},false));
test('Feedback presentation is enabled only by the existing canonical frontend environment gate',async()=>{
 const previous=globalThis.window;
 try{
  for(const flag of ['', 'hosted-dev','hosted-prod']){
   const code=(await build({stdin:{resolveDir:process.cwd(),contents:"export {FEEDBACK_UI_AVAILABLE} from './src/lib/feedback';"},bundle:true,packages:'external',write:false,format:'cjs',platform:'node',loader:{'.css':'empty'},define:{'import.meta.env.DEV':'false','import.meta.env.VITE_AUTH_MODE':JSON.stringify(flag)}})).outputFiles[0].text;
   for(const base of ['https://dev.lan-party.club',origin,'https://lan-party.club','https://lan-party.servok.workers.dev']){
    globalThis.window={location:{origin:base}};
    const compiled=new Module(import.meta.filename);compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(code,import.meta.filename);
    assert.equal(compiled.exports.FEEDBACK_UI_AVAILABLE,flag==='hosted-prod'&&base===origin||flag==='hosted-dev'&&base==='https://dev.lan-party.club');
   }
  }
 }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
