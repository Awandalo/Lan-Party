import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {before,test} from 'node:test';
const require=createRequire(import.meta.url),wr=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=wr('miniflare'),{build}=wr('esbuild');
const origin='http://127.0.0.1:5173',password='fictional lifecycle password';
const bindings={AUTH_SESSION_MODE:'local-only',AUTH_EMAIL_TRANSPORT:'local',AUTH_PUBLIC_ORIGIN:origin,
 AUTH_RATE_LIMIT_SECRET:'33'.repeat(32),PASSWORD_PEPPER:'55'.repeat(32),MFA_ENCRYPTION_KEYS:JSON.stringify({fixture:'44'.repeat(32)}),MFA_ACTIVE_KEY_ID:'fixture'};
let script,migrations;
before(async()=>{
 script=(await build({stdin:{resolveDir:fileURLToPath(new URL('../../',import.meta.url)),contents:`
 import app from './worker/index';import * as lifecycle from './worker/auth/account-lifecycle';
 import * as reactivate from './worker/auth/account-reactivation';import * as deletion from './worker/auth/account-deletion';
 import {hashPassword} from './worker/auth/passwords';import {digestToken,generateToken} from './worker/auth/tokens';
 import {sessionCsrfToken} from './worker/auth/csrf';import * as mfa from './worker/auth/mfa-crypto';
 import {LoginLimiter} from './worker/auth/login-limits';import {localMailbox} from './worker/auth/email';
 import {generate} from '@otplib/totp';import {crypto as otpCrypto} from '@otplib/plugin-crypto-web';import {base32} from '@otplib/plugin-base32-scure';
 export default{async fetch(request,env){
 if(new URL(request.url).pathname!='/fixture')return app.fetch(request,env);
 const {action,args=[]}=await request.json();
 try{
 if(action==='credential')return Response.json(await hashPassword(args[0],env.PASSWORD_PEPPER));
 if(action==='session'){const token=generateToken(),digest=await digestToken(token,'session');return Response.json({token,digest,csrf:await sessionCsrfToken(digest,env.AUTH_RATE_LIMIT_SECRET)});}
 if(action==='mail')return Response.json(localMailbox.take(args[0],Math.floor(Date.now()/1000),'account-reactivation'));
 if(action==='seal')return Response.json(await mfa.encryptTotpSecret(args[0],env,{environment:'local',userId:args[1],id:args[2],purpose:'active'}));
 if(action==='otp')return Response.json(await generate({secret:base32.decode(args[0]),crypto:otpCrypto,epoch:args[1]}));
 if(action==='codes')return Response.json(await mfa.generateRecoveryCodes(...args));
 if(action==='finish'){
 const row=await reactivate.reactivationContext(env.DB,args[0]);if(!row||!await reactivate.verifyReactivationPassword(row,args[1],env.PASSWORD_PEPPER))return Response.json(false);
 const limiter=await LoginLimiter.create(env.DB,env.AUTH_RATE_LIMIT_SECRET,'fictional-fixture'),held=await limiter.reserveMfa(row.user_id,row.context_digest);
 try{if(args[3]==='expireLease')await env.DB.prepare('UPDATE registration_rate_limits SET expires_at=0').run();return Response.json(await reactivate.finishReactivation(env.DB,row,args[2],env,'local',held,Math.floor(Date.now()/1000)));}finally{await held.finish(false);}
 }
 const fn=lifecycle[action]??reactivate[action]??deletion[action];if(!fn)throw Error('Unknown fixture action');
 return Response.json(await fn(env.DB,...args)??null);
 }catch{return Response.json({error:'Fictional lifecycle rejected'},{status:409});}
 }};`},bundle:true,write:false,format:'esm',platform:'browser'})).outputFiles[0].text;
 migrations=[];
 for(const name of(await readdir(new URL('../../migrations/',import.meta.url))).filter(n=>/^\d{4}_.*\.sql$/.test(n)).sort()){
 let rest=(await readFile(new URL('../../migrations/'+name,import.meta.url),'utf8')).replace(/--[^\n]*/g,'').trim(),parts=[];
 while(rest){const end=rest.startsWith('CREATE TRIGGER')?rest.indexOf('\nEND;')+5:rest.indexOf(';')+1;if(end<=0||end===4)throw Error('Incomplete SQL '+name);parts.push(rest.slice(0,end));rest=rest.slice(end).trim();}
 migrations.push(parts);
 }
});
async function local(run,count=18){
 const simulator=new Miniflare(convertV4MiniflareOptions({modules:true,script,compatibilityDate:'2026-10-11',cf:false,d1Databases:{DB:randomUUID()},bindings}));
 const db=await simulator.getD1Database('DB');
 const call=async(action,...args)=>{const r=await simulator.dispatchFetch(origin+'/fixture',{method:'POST',body:JSON.stringify({action,args})});return {status:r.status,body:await r.json()};};
 const value=async(action,...args)=>{const r=await call(action,...args);assert.equal(r.status,200,action+' rejected');return r.body;};
 const sql=(q,...args)=>db.prepare(q).bind(...args);
 const now=async()=>sql('SELECT unixepoch() AS n').first('n');
 const user=async({admin=false,mfa=false}={})=>{
 const id=randomUUID(),time=await now(),session=await value('session');
 await sql("INSERT INTO users(id,first_name,last_name,email,email_normalized,email_verified_at,created_at,updated_at) VALUES (?,'Fictional','Person',?,?,?, ?,?)",id,id+'@example.test',id+'@example.test',time-10,time-10,time-10).run();
 await sql("INSERT INTO user_nicknames(user_id,nickname,created_at,updated_at) VALUES (?,?,?,?)",id,'User '+id.slice(0,8),time-10,time-10).run();
 const hash=await value('credential',password);
 await sql('INSERT INTO user_password_credentials VALUES (?,?,?,?,?)',id,hash,time-10,time-10,time-10).run();
 if(admin)await sql("INSERT INTO user_roles(user_id,role_id,assigned_at) SELECT ?,id,? FROM roles WHERE code='admin'",id,time).run();
 let factor=null,codes=null;const secret='JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
 if(mfa){factor=randomUUID();const set=randomUUID(),sealed=await value('seal',secret,id,factor);
 await sql('INSERT INTO auth_totp_factors(user_id,factor_id,secret_ciphertext,secret_nonce,key_id,last_step,recovery_set_id,enabled_at) VALUES (?,?,?,?,?,0,?,?)',id,factor,sealed.ciphertext,sealed.nonce,sealed.keyId,set,time-10).run();
 codes=await value('codes',id,set);
 for(const verifier of codes.verifiers)await sql('INSERT INTO auth_mfa_recovery_codes(user_id,set_id,verifier,created_at) VALUES (?,?,?,?)',id,set,verifier,time-10).run();
 }
 await sql('INSERT INTO auth_sessions(id,user_id,token_digest,auth_version,created_at,expires_at) VALUES (?,?,?,0,?,?)',randomUUID(),id,session.digest,time,time+604800).run();
 await sql("INSERT INTO auth_recent_authentication(session_digest,user_id,auth_version,method,authenticated_at,expires_at) VALUES (?,?,0,'password',?,?)",session.digest,id,time,time+300).run();
 if(mfa)await sql("INSERT INTO auth_session_mfa VALUES (?,?,0,?,'totp',?,'password',?)",session.digest,id,factor,time,time).run();
 return {id,...session,time,secret,factor,codes};
 };
 const request=async(path,u,input,headers={})=>simulator.dispatchFetch(origin+'/api/auth/lifecycle/'+path,{method:input===undefined?'GET':'POST',headers:{'X-LAN-Request':'1',...(input===undefined?{}:{Origin:origin,'Content-Type':'application/json'}),...(u?{Cookie:'__Host-lan_session='+u.token,'X-CSRF-Token':u.csrf}:{}),...headers},...(input===undefined?{}:{body:JSON.stringify(input)})});
 try{for(const parts of migrations.slice(0,count))await db.batch(parts.map(p=>db.prepare(p)));await run({db,sql,now,user,call,value,request,simulator});
 assert.equal(await sql('PRAGMA quick_check').first('quick_check'),'ok');assert.deepEqual((await sql('PRAGMA foreign_key_check').all()).results,[]);
 }finally{await simulator.dispose();}
}
test('lifecycle absent and partial schema fail closed; deletion has no route',()=>local(async({request,user,db})=>{
 const u=await user();assert.deepEqual(await(await request('status',u)).json(),{available:false});
 assert.equal((await request('deactivate',u,{confirm:'DEACTIVATE'})).status,503);
 assert.equal((await request('delete',u,{confirm:'DELETE'})).status,404);
 await db.batch(migrations[16].slice(0,1).map(p=>db.prepare(p)));
 assert.equal((await request('status',u)).status,503);
},16));
test('deactivation erases private names, preserves protection and numbers, revokes sessions and refuses normal login',()=>local(async({user,value,sql,request,simulator})=>{
 const u=await user({mfa:true});const number=await sql('SELECT member_number FROM member_numbers WHERE user_id=?',u.id).first('member_number');
 assert.equal((await request('deactivate',u,{confirm:'DEACTIVATE'},{'X-CSRF-Token':'00'.repeat(32)})).status,403);
 await value('deactivateAccount',u.id,0,u.digest);
 assert.deepEqual(await sql('SELECT status,first_name,last_name,auth_version FROM users WHERE id=?',u.id).first(),{status:'disabled',first_name:'Deactivated',last_name:'User',auth_version:1});
 assert.equal(await sql('SELECT member_number FROM member_numbers WHERE user_id=?',u.id).first('member_number'),number);
 assert.equal(await sql('SELECT count(*) AS n FROM auth_mfa_recovery_codes WHERE user_id=? AND consumed_at IS NULL',u.id).first('n'),10);
 assert.ok(await sql('SELECT revoked_at FROM auth_sessions WHERE user_id=?',u.id).first('revoked_at'));
 assert.equal((await request('status',u)).status,401);
 assert.equal((await simulator.dispatchFetch(origin+'/api/auth/session',{headers:{'X-LAN-Request':'1',Cookie:'__Host-lan_session='+u.token}})).status,401);
 assert.equal((await request('reactivation/claim',null,{token:'00'.repeat(32)})).status,409);
}));
test('last active administrator cannot deactivate; two simultaneous administrators leave one active',()=>local(async({user,call,sql})=>{
 const a=await user({admin:true});
 assert.equal((await call('deactivateAccount',a.id,0,a.digest)).status,409);
 const b=await user({admin:true});
 const results=await Promise.all([call('deactivateAccount',a.id,0,a.digest),call('deactivateAccount',b.id,0,b.digest)]);
 assert.equal(results.filter(r=>r.status===200).length,1);
 assert.equal(await sql("SELECT count(*) AS n FROM users WHERE status='active'").first('n'),1);
}));
test('exact two-minute primary or MFA boundary refuses deactivation without touching identity',()=>local(async({user,call,sql})=>{
 for(const which of ['primary','mfa']){
 const u=await user({mfa:true});
 if(which==='primary')await sql('UPDATE auth_recent_authentication SET authenticated_at=unixepoch()-120,expires_at=unixepoch()+180 WHERE user_id=?',u.id).run();
 else{await sql('DELETE FROM auth_session_mfa WHERE user_id=?',u.id).run();await sql("INSERT INTO auth_session_mfa VALUES (?,?,0,?,'totp',unixepoch()-120,'password',unixepoch()-120)",u.digest,u.id,u.factor).run();}
 assert.equal((await call('deactivateAccount',u.id,0,u.digest)).status,409);
 assert.equal(await sql('SELECT status FROM users WHERE id=?',u.id).first('status'),'active');
 }
}));
test('admin invitation is required, expires, single-use claim, and replacement invalidates old browser proof',()=>local(async({user,value,call,sql,request})=>{
 const admin=await user({admin:true}),u=await user(),other=await user();
 await value('deactivateAccount',u.id,0,u.digest);
 assert.equal((await call('initiateReactivation',other.id,0,other.digest,u.id)).status,409);
 let invite=await value('initiateReactivation',admin.id,0,admin.digest,u.id);
 assert.equal((await request('reactivation/claim',null)).status,405);
 const context=await value('claimReactivation',invite.token);assert.ok(context.context);
 assert.equal(await value('claimReactivation',invite.token),null);
 assert.ok(await value('reactivationContext',context.context));
 invite=await value('initiateReactivation',admin.id,0,admin.digest,u.id);
 assert.equal(await value('reactivationContext',context.context),null);
 await sql("UPDATE users SET auth_version=auth_version+1 WHERE id=?",u.id).run();
 assert.equal(await value('claimReactivation',invite.token),null);
}));
test('restricted reactivation requires password and unused MFA, restores names, never promotes old session',()=>local(async({user,value,call,sql,request})=>{
 const admin=await user({admin:true}),u=await user({mfa:true});
 await value('deactivateAccount',u.id,0,u.digest);
 const invite=await value('initiateReactivation',admin.id,0,admin.digest,u.id),c=await value('claimReactivation',invite.token);
 const input={firstName:'Restored',lastName:'Fictional',code:u.codes.codes[0],method:'recovery'};
 assert.equal(await value('finish',c.context,'wrong password',input),false);
 assert.equal(await value('finish',c.context,password,{...input,code:'AAAA'}),false);
 assert.ok((await value('finish',c.context,password,input)).token);
 assert.equal(await value('finish',c.context,password,input),false);
 assert.deepEqual(await sql('SELECT status,first_name,last_name,auth_version FROM users WHERE id=?',u.id).first(),{status:'active',first_name:'Restored',last_name:'Fictional',auth_version:2});
 assert.equal(await sql('SELECT count(*) AS n FROM auth_mfa_recovery_codes WHERE user_id=? AND consumed_at IS NOT NULL',u.id).first('n'),1);
 assert.equal((await request('status',u)).status,401);
 assert.equal(await value('reactivationContext','11'.repeat(32)),null);
}));
test('TOTP reactivation consumes a fresh step while stale factors and spent recovery proof are rejected',()=>local(async({user,value,sql,now})=>{
 const admin=await user({admin:true}),u=await user({mfa:true});
 await value('deactivateAccount',u.id,0,u.digest);
 const invite=await value('initiateReactivation',admin.id,0,admin.digest,u.id),c=await value('claimReactivation',invite.token);
 const code=await value('otp',u.secret,await now());
 assert.ok((await value('finish',c.context,password,{firstName:'Fresh',lastName:'Proof',code,method:'totp'})).token);
 assert.ok(await sql('SELECT last_step FROM auth_totp_factors WHERE user_id=?',u.id).first('last_step')>0);
}));
test('deletion has atomic anonymous event/day totals, removes identity links, preserves unrelated content and number non-reuse',()=>local(async({user,value,sql,now,db})=>{
 const u=await user(),other=await user(),time=await now(),event=randomUUID(),future=randomUUID(),day1=randomUUID(),day2=randomUUID(),futureDay=randomUUID();
 const number=await sql('SELECT member_number FROM member_numbers WHERE user_id=?',u.id).first('member_number');
 for(const [id,slug]of[[event,'closed'],[future,'future']])await sql("INSERT INTO events(id,slug,title,description,publication_status,created_at,updated_at) VALUES (?,?,'Fixture','Fictional','archived',?,?)",id,slug,time-100,time-100).run();
 for(const[id,ev,date,start,end]of[[day1,event,'2026-10-10',time-100,time-90],[day2,event,'2026-10-11',time-80,time-70],[futureDay,future,'2026-11-01',time+200,time+400]])
 await sql("INSERT INTO event_days(id,event_id,attendance_date,starts_at,ends_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",id,ev,date,start,end,time-100,time-100).run();
 for(const[uid,ev,days]of[[u.id,event,[day1,day2]],[other.id,event,[day1]],[u.id,future,[futureDay]]]){
 const id=randomUUID();await sql("INSERT INTO registrations(id,user_id,event_id,registered_at,created_at,updated_at) VALUES (?,?,?,?,?,?)",id,uid,ev,time-50,time-50,time-50).run();
 for(const day of days)await sql('INSERT INTO registration_days VALUES (?,?,?,?)',id,ev,day,time-50).run();
 }
 await sql("INSERT INTO news_articles(id,title,slug,content,author_user_id,updated_by_user_id,created_at,updated_at) VALUES (?,'Fixture','fixture','Fictional content',?,?,?,?)",randomUUID(),u.id,u.id,time,time).run();
 const before=await value('registrationTotals',event);assert.equal(before.registrations,2);assert.deepEqual(before.days.map(d=>d.registrations).sort(),[1,2]);
 await value('deleteAccount',u.id,0,u.digest);
 assert.equal(await sql('SELECT count(*) AS n FROM users WHERE id=?',u.id).first('n'),0);
 assert.equal(await sql('SELECT count(*) AS n FROM registrations WHERE user_id=?',u.id).first('n'),0);
 assert.deepEqual(await value('registrationTotals',event),before);
 assert.equal((await value('registrationTotals',future)).registrations,0);
 assert.deepEqual(await sql('SELECT user_id,reserved_by_user_id,retired FROM member_numbers WHERE member_number=?',number).first(),{user_id:null,reserved_by_user_id:null,retired:1});
 assert.equal(await sql('SELECT author_user_id FROM news_articles').first('author_user_id'),null);
 assert.equal((await sql('SELECT count(*) AS n FROM news_articles').first('n')),1);
 assert.equal((await sql('SELECT count(*) AS n FROM users WHERE id=?',other.id).first('n')),1);
 const newer=await user();assert.ok(await sql('SELECT member_number FROM member_numbers WHERE user_id=?',newer.id).first('member_number')>number);
 await assert.rejects(sql('UPDATE member_numbers SET retired=0,user_id=? WHERE member_number=?',newer.id,number).run());
 await assert.rejects(sql('INSERT OR REPLACE INTO member_numbers(member_number,user_id,registered,issued_at) VALUES (?,?,1,?)',number,newer.id,time).run());
}));
test('injected deletion failure rolls back aggregate, account, credential and number changes',()=>local(async({user,value,call,sql,db})=>{
 const u=await user(),time=Math.floor(Date.now()/1000),event=randomUUID(),day=randomUUID(),registration=randomUUID();
 await sql("INSERT INTO events(id,slug,title,description,publication_status,created_at,updated_at) VALUES (?,'rollback-history','History','Fictional','archived',?,?)",event,time-100,time-100).run();
 await sql("INSERT INTO event_days(id,event_id,attendance_date,starts_at,ends_at,created_at,updated_at) VALUES (?,?,'2026-10-10',?,?,?,?)",day,event,time-100,time-90,time-100,time-100).run();
 await sql("INSERT INTO registrations(id,user_id,event_id,registered_at,created_at,updated_at) VALUES (?,?,?,?,?,?)",registration,u.id,event,time-50,time-50,time-50).run();
 await sql('INSERT INTO registration_days VALUES (?,?,?,?)',registration,event,day,time-50).run();
 await db.exec("CREATE TRIGGER fixture_failure BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT,'fictional failure'); END;");
 assert.equal((await call('deleteAccount',u.id,0,u.digest)).status,409);
 assert.equal(await sql('SELECT status FROM users WHERE id=?',u.id).first('status'),'active');
 assert.equal(await sql('SELECT count(*) AS n FROM account_lifecycle WHERE user_id=?',u.id).first('n'),0);
 assert.equal(await sql('SELECT count(*) AS n FROM user_password_credentials WHERE user_id=?',u.id).first('n'),1);
 assert.equal(await sql('SELECT retired FROM member_numbers WHERE user_id=?',u.id).first('retired'),0);
 assert.equal(await sql('SELECT count(*) AS n FROM anonymous_event_registrations').first('n'),0);
 assert.equal(await sql('SELECT count(*) AS n FROM registrations WHERE user_id=?',u.id).first('n'),1);
}));
test('HTTP lifecycle enforces session, origin, proof and administrator access; pending context has no normal API access',()=>local(async({user,request,value,simulator})=>{
 const u=await user(),admin=await user({admin:true});
 assert.equal((await request('status')).status,401);
 assert.equal((await request('users',u,{query:'fictional'})).status,403);
 assert.equal((await request('deactivate',u,{confirm:'DEACTIVATE'},{Origin:'https://evil.example'})).status,403);
 assert.equal((await request('deactivate',u,{confirm:'DEACTIVATE'})).status,200);
 const invite=await value('initiateReactivation',admin.id,0,admin.digest,u.id);
 const r=await request('reactivation/claim',null,{token:invite.token}),cookie=r.headers.get('set-cookie').split(';')[0];
 assert.equal(r.status,200);
 assert.equal((await simulator.dispatchFetch(origin+'/api/auth/session',{headers:{'X-LAN-Request':'1',Cookie:cookie}})).status,401);
 assert.equal((await request('reactivation/complete',null,{password},{Cookie:cookie})).status,403);
 const csrf=(await r.json()).csrfToken;
 const done=await request('reactivation/complete',null,{password,firstName:'New',lastName:'Fictional',code:'',method:'totp'},{Cookie:cookie,'X-CSRF-Token':csrf});
 assert.equal(done.status,200);
 const normal=done.headers.getSetCookie().find(c=>c.startsWith('__Host-lan_session=')).split(';')[0];
 assert.equal((await simulator.dispatchFetch(origin+'/api/auth/session',{headers:{'X-LAN-Request':'1',Cookie:normal}})).status,200);
}));

test('invitation and claimed context use strict fixed deadlines and cannot revive expired proof',()=>local(async({user,value,sql,request})=>{
 const admin=await user({admin:true}),u=await user();await value('deactivateAccount',u.id,0,u.digest);
 const invitation=await value('initiateReactivation',admin.id,0,admin.digest,u.id);
 await sql("UPDATE account_reactivation SET phase='cancelled' WHERE user_id=?",u.id).run();
 await sql("INSERT INTO account_reactivation(invitation_digest,user_id,auth_version,email_normalized,phase,created_at,expires_at) SELECT invitation_digest||'x',user_id,auth_version,email_normalized,'invited',unixepoch()-1800,unixepoch() FROM account_reactivation WHERE user_id=?",u.id).run().then(()=>assert.fail('Digest constraint must reject invalid length'),()=>{});
 // Insert an exact expiry boundary with the valid digest after removing the old cancelled row.
 const row=await sql('SELECT * FROM account_reactivation WHERE user_id=?',u.id).first();
 await sql('DELETE FROM account_reactivation WHERE user_id=?',u.id).run();
 await sql("INSERT INTO account_reactivation(invitation_digest,user_id,auth_version,email_normalized,phase,created_at,expires_at) VALUES (?,?,?,?,'invited',unixepoch()-1800,unixepoch())",row.invitation_digest,u.id,row.auth_version,row.email_normalized).run();
 assert.equal(await value('claimReactivation',invitation.token),null);
 await sql("UPDATE account_reactivation SET phase='cancelled' WHERE user_id=?",u.id).run();
 const fresh=await value('initiateReactivation',admin.id,0,admin.digest,u.id),context=await value('claimReactivation',fresh.token);
 const claimed=await sql('SELECT * FROM account_reactivation WHERE user_id=? AND phase=\'claimed\'',u.id).first();
 await sql('DELETE FROM account_reactivation WHERE user_id=?',u.id).run();
 await sql("INSERT INTO account_reactivation(invitation_digest,user_id,auth_version,email_normalized,phase,created_at,expires_at,context_digest,claimed_at) VALUES (?,?,?,?,'claimed',unixepoch()-400,unixepoch()+1400,?,unixepoch()-300)",claimed.invitation_digest,u.id,claimed.auth_version,claimed.email_normalized,claimed.context_digest).run();
 assert.equal(await value('reactivationContext',context.context),null);
}));
test('reactivation HTTP uses existing email transport; completion rejects foreign browser, wrong password and spent code',()=>local(async({user,value,call,sql,request,simulator})=>{
 const admin=await user({admin:true}),u=await user({mfa:true});
 await sql('UPDATE auth_mfa_recovery_codes SET consumed_at=unixepoch() WHERE user_id=? AND verifier=?',u.id,u.codes.verifiers[0]).run();
 await value('deactivateAccount',u.id,0,u.digest);
 const sent=await request('invite',admin,{userId:u.id});assert.equal(sent.status,200);
 const mail=await value('mail',u.id+'@example.test');assert.equal(mail.purpose,undefined);
 const token=new URL(mail.url).hash.slice(1);
 const claim=await request('reactivation/claim',null,{token});assert.equal(claim.status,200);
 const cookie=claim.headers.get('set-cookie').split(';')[0],csrf=(await claim.json()).csrfToken;
 const input={password,firstName:'Fresh',lastName:'Fixture',code:u.codes.codes[0],method:'recovery'};
 assert.equal((await request('reactivation/complete',null,input,{'X-CSRF-Token':csrf})).status,401);
 assert.equal((await request('reactivation/complete',null,{...input,password:'wrong'},{Cookie:cookie,'X-CSRF-Token':csrf})).status,401);
 assert.equal((await request('reactivation/complete',null,input,{Cookie:cookie,'X-CSRF-Token':csrf})).status,401);
 assert.equal((await request('reactivation/complete',null,{...input,code:u.codes.codes[1]},{Cookie:cookie,'X-CSRF-Token':csrf})).status,200);
 assert.equal((await request('reactivation/complete',null,{...input,code:u.codes.codes[1]},{Cookie:cookie,'X-CSRF-Token':csrf})).status,401);
 assert.equal(await sql('SELECT count(*) AS n FROM auth_mfa_recovery_codes WHERE user_id=? AND consumed_at IS NOT NULL',u.id).first('n'),2);
}));
test('legacy disabled users are not eligible and last administrator cannot delete',()=>local(async({user,value,call,sql})=>{
 const admin=await user({admin:true}),u=await user();
 await sql("UPDATE users SET status='disabled' WHERE id=?",u.id).run();
 assert.equal((await call('initiateReactivation',admin.id,0,admin.digest,u.id)).status,409);
 assert.equal((await call('deleteAccount',admin.id,0,admin.digest)).status,409);
 assert.equal(await sql('SELECT status FROM users WHERE id=?',admin.id).first('status'),'active');
}));

test('0017 alone enables only approved safe operations while irreversible deletion remains unrouted',()=>local(async({user,request,value})=>{
 const admin=await user({admin:true}),u=await user();
 assert.equal((await request('status',u)).status,200);
 assert.equal((await request('delete',u,{confirm:'DELETE'})).status,404);
 await value('deactivateAccount',u.id,0,u.digest);
 assert.equal((await request('invite',admin,{userId:u.id})).status,200);
},17));
test('cancelled context and expired verification lease cannot consume proof or reactivate',()=>local(async({user,value,call,sql,request})=>{
 const admin=await user({admin:true}),u=await user({mfa:true});await value('deactivateAccount',u.id,0,u.digest);
 let invite=await value('initiateReactivation',admin.id,0,admin.digest,u.id),context=await value('claimReactivation',invite.token);
 const input={firstName:'Fictional',lastName:'Participant',code:u.codes.codes[0],method:'recovery'};
 assert.equal((await call('finish',context.context,password,input,'expireLease')).status,409);
 assert.equal(await sql('SELECT status FROM users WHERE id=?',u.id).first('status'),'disabled');
 assert.equal(await sql('SELECT count(*) AS n FROM auth_mfa_recovery_codes WHERE user_id=? AND consumed_at IS NOT NULL',u.id).first('n'),0);
 // A new explicit invitation invalidates the prior browser context.
 invite=await value('initiateReactivation',admin.id,0,admin.digest,u.id);
 const claim=await request('reactivation/claim',null,{token:invite.token}),cookie=claim.headers.get('set-cookie').split(';')[0],csrf=(await claim.json()).csrfToken;
 assert.equal((await request('reactivation/cancel',null,{}, {Cookie:cookie,'X-CSRF-Token':csrf})).status,200);
 assert.equal((await request('reactivation/status',null,undefined,{Cookie:cookie})).status,401);
}));
test('completed cancellation exclusions, consecutive deletion and role actor scrubbing preserve anonymous totals exactly once',()=>local(async({user,value,call,sql,now})=>{
 const a=await user({admin:true}),b=await user({admin:true}),u=await user(),time=await now(),event=randomUUID(),day=randomUUID();
 await sql("UPDATE user_roles SET assigned_by_user_id=? WHERE user_id=?",a.id,b.id).run();
 await sql("INSERT INTO events(id,slug,title,description,publication_status,created_at,updated_at) VALUES (?,'history','History','Fictional','archived',?,?)",event,time-100,time-100).run();
 await sql("INSERT INTO event_days(id,event_id,attendance_date,starts_at,ends_at,created_at,updated_at) VALUES (?,?,'2026-10-10',?,?,?,?)",day,event,time-100,time-90,time-100,time-100).run();
 for(const actor of[a,b,u]){const id=randomUUID();await sql("INSERT INTO registrations(id,user_id,event_id,registered_at,created_at,updated_at) VALUES (?,?,?,?,?,?)",id,actor.id,event,time-50,time-50,time-50).run();await sql("INSERT INTO registration_days VALUES (?,?,?,?)",id,event,day,time-50).run();}
 await sql("UPDATE registrations SET status='cancelled',cancelled_at=?,updated_at=? WHERE user_id=?",time,time,u.id).run();
 await value('deleteAccount',a.id,0,a.digest);
 assert.equal(await sql('SELECT assigned_by_user_id FROM user_roles WHERE user_id=?',b.id).first('assigned_by_user_id'),null);
 assert.equal((await call('deleteAccount',a.id,0,a.digest)).status,409);
 await value('deleteAccount',u.id,0,u.digest);
 const totals=await value('registrationTotals',event);assert.equal(totals.registrations,2);assert.equal(totals.days[0].registrations,2);
 assert.equal(await sql('SELECT total FROM anonymous_event_registrations WHERE event_id=?',event).first('total'),1);
 assert.equal(await sql('SELECT count(*) AS n FROM users WHERE id=?',b.id).first('n'),1);
}));

test('missing lifecycle trigger blocks readiness and reserved member attribution can be erased without releasing its number',()=>local(async({user,value,sql,request,db,now})=>{
 const actor=await user({admin:true}),other=await user({admin:true}),reserved=randomUUID(),time=await now();
 await db.batch([
 sql('UPDATE member_numbers SET user_id=?,reserved_by_user_id=? WHERE member_number=1',reserved,actor.id),
 sql("INSERT INTO users(id,first_name,last_name,email,email_normalized,created_at,updated_at) VALUES (?,'Fictional','Organizer',?,?,?,?)",reserved,reserved+'@example.test',reserved+'@example.test',time,time)
 ]);
 await value('deleteAccount',actor.id,0,actor.digest);
 assert.deepEqual(await sql('SELECT user_id,reserved_by_user_id,registered,retired FROM member_numbers WHERE member_number=1').first(),{user_id:reserved,reserved_by_user_id:null,registered:1,retired:0});
 await assert.rejects(sql('UPDATE member_numbers SET user_id=NULL WHERE member_number=1').run());
 await db.exec('DROP TRIGGER account_reactivation_identity;');
 assert.equal((await request('status',other)).status,503);
}));
test('new schema migration failure rolls back ledger, attribution, sequence and lifecycle dependencies',()=>local(async({user,db,sql})=>{
 const u=await user(),snapshot=await sql('SELECT * FROM member_numbers ORDER BY member_number').all();
 const schema=await sql('SELECT name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY name').all();
 const statements=migrations[17].map(part=>db.prepare(part));
 statements.splice(statements.length-2,0,db.prepare("SELECT json('fictional migration rollback')"));
 await assert.rejects(db.batch(statements));
 assert.deepEqual((await sql('SELECT * FROM member_numbers ORDER BY member_number').all()).results,snapshot.results);
 assert.deepEqual((await sql('SELECT name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY name').all()).results,schema.results);
 assert.equal(await sql('SELECT status FROM users WHERE id=?',u.id).first('status'),'active');
},17));

test('final recovery code reactivation issues a new assured session without reusing the code or promoting the restricted cookie',()=>local(async({user,value,sql,request,simulator})=>{
 const admin=await user({admin:true}),u=await user({mfa:true});
 await sql('UPDATE auth_mfa_recovery_codes SET consumed_at=unixepoch() WHERE user_id=? AND verifier<>?',u.id,u.codes.verifiers[0]).run();
 await value('deactivateAccount',u.id,0,u.digest);
 const invitation=await value('initiateReactivation',admin.id,0,admin.digest,u.id);
 const claim=await request('reactivation/claim',null,{token:invitation.token});
 const contextCookie=claim.headers.get('set-cookie').split(';')[0],csrf=(await claim.json()).csrfToken;
 const done=await request('reactivation/complete',null,{password,firstName:'Restored',lastName:'Participant',method:'recovery',code:u.codes.codes[0]},{Cookie:contextCookie,'X-CSRF-Token':csrf});
 assert.equal(done.status,200);
 const cookies=done.headers.getSetCookie(),normal=cookies.find(c=>c.startsWith('__Host-lan_session=')).split(';')[0];
 assert.notEqual(normal,contextCookie);assert.notEqual(normal,'__Host-lan_session='+u.token);
 const session=await simulator.dispatchFetch(origin+'/api/auth/session',{headers:{'X-LAN-Request':'1',Cookie:normal}});
 assert.equal(session.status,200);const body=await session.json();assert.equal(body.account.userId,u.id);assert.equal(body.recoveryCodesRemaining,0);
 assert.equal(await sql("SELECT method FROM auth_session_mfa WHERE user_id=? AND auth_version=2",u.id).first('method'),'recovery');
 assert.equal((await request('reactivation/status',null,undefined,{Cookie:contextCookie})).status,401);
 assert.equal((await request('status',u)).status,401);
}));

for(const method of ['totp','recovery'])test('HTTP '+method+' step-up continues deactivation once with the rotated session and no second proof',()=>local(async({user,sql,now,value,request,simulator})=>{
 const u=await user({mfa:true}),time=await now();
 await sql('DELETE FROM auth_session_mfa WHERE session_digest=?',u.digest).run();
 await sql("INSERT INTO auth_session_mfa VALUES (?,?,0,?,'totp',?,'password',?)",u.digest,u.id,u.factor,time-121,u.time).run();
 const initial=await request('deactivate',u,{confirm:'DEACTIVATE'});assert.equal(initial.status,428);
 assert.equal((await initial.json()).code,'mfa_required');
 if(method==='recovery')await sql('UPDATE auth_mfa_recovery_codes SET consumed_at=? WHERE user_id=? AND verifier<>?',time,u.id,u.codes.verifiers[0]).run();
 const code=method==='totp'?await value('otp',u.secret,time):u.codes.codes[0];
 const headers={Origin:origin,'Content-Type':'application/json','X-LAN-Request':'1','X-CSRF-Token':u.csrf,Cookie:'__Host-lan_session='+u.token};
 const up=await simulator.dispatchFetch(origin+'/api/auth/mfa/step-up',{method:'POST',headers,body:JSON.stringify({method,code})});assert.equal(up.status,200);
 const cookie=up.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 const session=await simulator.dispatchFetch(origin+'/api/auth/session',{headers:{'X-LAN-Request':'1',Cookie:cookie}});assert.equal(session.status,200);
 const state=await session.json();assert.equal(state.account.userId,u.id);assert.notEqual(state.csrfToken,u.csrf);
 const token=/__Host-lan_session=([a-f0-9]{64})/.exec(cookie)?.[1];assert.ok(token);
 const next={...u,token,csrf:state.csrfToken};
 assert.equal((await request('deactivate',next,{confirm:'DEACTIVATE'},{'X-CSRF-Token':u.csrf})).status,403);
 assert.equal((await request('deactivate',next,{confirm:'DEACTIVATE'})).status,200);
 assert.equal(await sql('SELECT status FROM users WHERE id=?',u.id).first('status'),'disabled');
 assert.equal(await sql('SELECT count(*) AS n FROM auth_sessions WHERE user_id=? AND revoked_at IS NULL',u.id).first('n'),0);
 if(method==='recovery')assert.equal(await sql('SELECT count(*) AS n FROM auth_mfa_recovery_codes WHERE user_id=? AND consumed_at IS NULL',u.id).first('n'),0);
 else assert.ok(await sql('SELECT last_step FROM auth_totp_factors WHERE user_id=?',u.id).first('last_step')>0);
 assert.equal((await request('deactivate',next,{confirm:'DEACTIVATE'})).status,401);
}));

test('lifecycle expiry diagnosis returns explicit primary or MFA requirements without account changes',()=>local(async({user,sql,request})=>{
 const primary=await user();await sql('UPDATE auth_recent_authentication SET authenticated_at=unixepoch()-120,expires_at=unixepoch()+180 WHERE user_id=?',primary.id).run();
 const p=await request('deactivate',primary,{confirm:'DEACTIVATE'});assert.equal(p.status,428);assert.equal((await p.json()).code,'primary_required');
 const mfa=await user({mfa:true});await sql('DELETE FROM auth_session_mfa WHERE user_id=?',mfa.id).run();
 await sql("INSERT INTO auth_session_mfa VALUES (?,?,0,?,'totp',unixepoch()-120,'password',unixepoch()-120)",mfa.digest,mfa.id,mfa.factor).run();
 const m=await request('deactivate',mfa,{confirm:'DEACTIVATE'});assert.equal(m.status,428);assert.equal((await m.json()).code,'mfa_required');
 for(const u of [primary,mfa]){assert.equal(await sql('SELECT status FROM users WHERE id=?',u.id).first('status'),'active');assert.equal(await sql('SELECT count(*) AS n FROM account_lifecycle WHERE user_id=?',u.id).first('n'),0);}
}));
test('inconsistent manual restoration rejects deactivation without changing records',()=>local(async({user,sql,request})=>{
 const u=await user();await sql("INSERT INTO account_lifecycle VALUES (?,'deactivated',unixepoch())",u.id).run();
 const r=await request('deactivate',u,{confirm:'DEACTIVATE'});assert.equal(r.status,409);assert.equal((await r.json()).code,'lifecycle_state_conflict');
 assert.equal(await sql('SELECT status FROM users WHERE id=?',u.id).first('status'),'active');
 assert.equal(await sql('SELECT count(*) AS n FROM account_lifecycle WHERE user_id=?',u.id).first('n'),1);
}));
