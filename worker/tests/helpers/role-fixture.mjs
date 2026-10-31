import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {before,test} from 'node:test';
const require=createRequire(import.meta.url),wr=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=wr('miniflare'),{build}=wr('esbuild');
const origin='http://127.0.0.1:5173';
let script,migrations;
before(async()=>{
 script=(await build({stdin:{resolveDir:fileURLToPath(new URL('../../../',import.meta.url)),contents:`
 import app from './worker/index';import {sessionCsrfToken} from './worker/auth/csrf';import {generateToken,digestToken} from './worker/auth/tokens';
 export default{async fetch(request,env){if(new URL(request.url).pathname!='/fixture')return app.fetch(request,env);
 const token=generateToken();const digest=await digestToken(token,'session');return Response.json({token,digest,csrf:await sessionCsrfToken(digest,env.AUTH_RATE_LIMIT_SECRET)});}};`},bundle:true,write:false,format:'esm',platform:'browser'})).outputFiles[0].text;
 migrations=[];
 for(const name of(await readdir(new URL('../../../migrations/',import.meta.url))).filter(n=>/^\d{4}_.*\.sql$/.test(n)).sort()){
 let rest=(await readFile(new URL('../../../migrations/'+name,import.meta.url),'utf8')).replace(/--[^\n]*/g,'').trim(),parts=[];
 while(rest){const end=rest.startsWith('CREATE TRIGGER')?rest.indexOf('\nEND;')+5:rest.indexOf(';')+1;if(end<=0||end===4)throw Error('Incomplete SQL '+name);parts.push(rest.slice(0,end));rest=rest.slice(end).trim();}migrations.push(parts);
 }
});
async function local(run,count){
 const simulator=new Miniflare(convertV4MiniflareOptions({modules:true,script,compatibilityDate:'2026-10-11',cf:false,d1Databases:{DB:randomUUID()},bindings:{AUTH_RATE_LIMIT_SECRET:'33'.repeat(32),AUTH_SESSION_MODE:'local-only',AUTH_EMAIL_TRANSPORT:'local',AUTH_PUBLIC_ORIGIN:origin}}));
 try{
 const db=await simulator.getD1Database('DB'),sql=(q,...args)=>db.prepare(q).bind(...args);
 const migrate=(index,after=[])=>db.batch([...migrations[index-1],...after].map(p=>db.prepare(p)));
 for(const parts of migrations.slice(0,count))await db.batch(parts.map(p=>db.prepare(p)));
 const value=async()=> (await simulator.dispatchFetch(origin+'/fixture')).json();
 const user=async({admin=false,genuine=false}={})=>{
 const id=randomUUID(),time=await sql('SELECT unixepoch() n').first('n'),session=await value();
 await sql("INSERT INTO users(id,first_name,last_name,email,email_normalized,email_verified_at,created_at,updated_at) VALUES (?,'Fictional','Person',?,?,?,?,?)",id,id+'@example.test',id+'@example.test',time-10,time-10,time-10).run();
  if(genuine)await sql("INSERT INTO user_roles(user_id,role_id,assigned_at) SELECT ?,id,0 FROM roles WHERE code='admin'",id).run();
 if(admin){
 await sql("INSERT OR IGNORE INTO roles(id,code,name,is_active,created_at,updated_at) VALUES ('30000000-0000-4000-8000-000000000001','fixture_admin','Fictional delegated staff',1,0,0)").run();
 await sql("INSERT OR IGNORE INTO role_permissions(role_id,permission_id,granted_at) SELECT '30000000-0000-4000-8000-000000000001',permission_id,0 FROM role_permissions WHERE role_id='1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7'").run();
 await sql("INSERT INTO user_roles(user_id,role_id,assigned_at) VALUES (?,'30000000-0000-4000-8000-000000000001',0)",id).run();
 }
 await sql('INSERT INTO auth_sessions(id,user_id,token_digest,auth_version,created_at,expires_at) VALUES (?,?,?,0,?,?)',randomUUID(),id,session.digest,time-1,time+604800).run();return{id,...session};
 };
 const request=(path,u,input,headers={})=>simulator.dispatchFetch(origin+'/api/'+path,{method:input===undefined?'GET':'POST',headers:{'X-LAN-Request':'1',...(u?{Cookie:'__Host-lan_session='+u.token}:{}),...(input===undefined?{}:{'Content-Type':'application/json',Origin:origin}),...headers},...(input===undefined?{}:{body:JSON.stringify(input)})});
 await run({db,sql,user,value,request,migrate});
 assert.equal(await sql('PRAGMA quick_check').first('quick_check'),'ok');assert.deepEqual((await sql('PRAGMA foreign_key_check').all()).results,[]);
 }finally{await simulator.dispose();}
}

export {local};
