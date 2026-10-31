import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {local} from './helpers/role-fixture.mjs';
const headers=u=>({'X-LAN-Session-Proof':u.csrf,'X-CSRF-Token':u.csrf});
const call=(f,u,path='feedback/requests',body)=>f.request(path,u,body,headers(u));
const create=async(f,u,patch={})=>{const r=await call(f,u,'feedback/requests',{operationId:randomUUID(),kind:'bug',title:'Fictional bug',description:'Expected behavior\nActual behavior',...patch});assert.equal(r.status,200,await r.clone().text());return(await r.json()).requestId;};
const detail=async(f,u,id,admin=false)=>(await call(f,u,(admin?'manage/feedback/':'feedback/requests/')+id)).json();
const unread=async(f,u)=>(await call(f,u,'feedback/unread')).json();
test('feedback ownership, genuine Administrator authority, session correlation and no-store boundaries',()=>local(async f=>{
 const a=await f.user({genuine:true}),u=await f.user(),v=await f.user(),d=await f.user({admin:true}),id=await create(f,u);
 assert.equal((await call(f,v,'feedback/requests/'+id)).status,404);
 assert.equal((await call(f,v,'feedback/requests/'+id+'/replies',{operationId:randomUUID(),body:'Intrusion'})).status,404);
 for(const actor of [u,d])assert.equal((await call(f,actor,'manage/feedback')).status,403);
 const response=await call(f,a,'manage/feedback');assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
 const page=await response.json();assert.equal(page.requests.length,1);assert.equal(page.requests[0].title,'Fictional bug');assert.ok(!('email'in page.requests[0]));
 assert.equal((await f.request('feedback/requests',u)).status,403);
 assert.equal((await f.request('feedback/requests')).status,401);
 await f.sql('UPDATE auth_sessions SET revoked_at=created_at WHERE user_id=?',u.id).run();assert.equal((await call(f,u)).status,401);
}));
test('two-way replies, independent triage, closed/reopen, immutable messages and fixed closure deadline',()=>local(async f=>{
 const a=await f.user({genuine:true}),u=await f.user(),id=await create(f,u);
 const triage=async(decision,progress)=>{const d=await detail(f,a,id,true);return call(f,a,'manage/feedback/'+id+'/triage',{operationId:randomUUID(),revision:d.request.revision,decision,progress});};
 assert.equal((await triage('yes','new')).status,200);let d=await detail(f,u,id);assert.equal(d.request.decision,'yes');assert.equal(d.request.progress,'new');
 assert.equal((await triage('no','completed')).status,200);const closed=(await detail(f,u,id)).request.closedAt;
 assert.equal((await call(f,u,'feedback/requests/'+id+'/replies',{operationId:randomUUID(),body:'No'})).status,409);
 assert.equal((await triage('maybe','closed')).status,200);assert.equal((await detail(f,u,id)).request.closedAt,closed);
 assert.equal((await triage('pending','under_review')).status,200);assert.equal((await detail(f,u,id)).request.closedAt,null);
 assert.equal((await call(f,u,'feedback/requests/'+id+'/replies',{operationId:randomUUID(),body:'More detail'})).status,200);
 await assert.rejects(f.sql('UPDATE feedback_requests SET title=? WHERE id=?','Changed',id).run(),/immutable/);
 await assert.rejects(f.sql('UPDATE feedback_events SET body=? WHERE request_id=?','Changed',id).run(),/immutable/);
}));
test('member and per-administrator read watermarks preserve concurrent unread and do not reorder requests',()=>local(async f=>{
 const a=await f.user({genuine:true}),b=await f.user({genuine:true}),u=await f.user(),id=await create(f,u);
 assert.equal((await unread(f,a)).adminUnread,1);assert.equal((await unread(f,u)).memberUnread,0);
 const ad=await detail(f,a,id,true);await call(f,a,'manage/feedback/'+id+'/read',{through:ad.through});
 assert.equal((await unread(f,a)).adminUnread,0);assert.equal((await unread(f,b)).adminUnread,1);
 const reply=()=>call(f,a,'manage/feedback/'+id+'/replies',{operationId:randomUUID(),body:'Administrator reply'});
 assert.equal((await reply()).status,200);const shown=await detail(f,u,id);assert.equal((await unread(f,u)).memberUnread,1);
 assert.equal((await reply()).status,200);await call(f,u,'feedback/requests/'+id+'/read',{through:shown.through});assert.equal((await unread(f,u)).memberUnread,1);
 const latest=await detail(f,u,id),before=latest.request.updatedAt;await call(f,u,'feedback/requests/'+id+'/read',{through:latest.through});assert.equal((await unread(f,u)).memberUnread,0);assert.equal((await detail(f,u,id)).request.updatedAt,before);
 assert.equal((await call(f,u,'feedback/requests/'+id+'/read',{through:'999999999999999'})).status,400);
}));
test('idempotent writes, conflicting replay, bounded text, manual GitHub links, and feedback-only rate limits',()=>local(async f=>{
 const a=await f.user({genuine:true}),u=await f.user(),op=randomUUID(),id=await create(f,u,{operationId:op});assert.equal(await create(f,u,{operationId:op}),id);
 assert.equal((await call(f,u,'feedback/requests',{operationId:op,kind:'bug',title:'Different',description:'Other'})).status,409);
 for(const description of ['', 'x'.repeat(5001),'nul\0text'])assert.equal((await call(f,u,'feedback/requests',{operationId:randomUUID(),kind:'bug',title:'Fictional',description})).status,400);
 const reply={operationId:randomUUID(),body:'Same reply'};assert.equal((await call(f,u,'feedback/requests/'+id+'/replies',reply)).status,200);assert.equal((await call(f,u,'feedback/requests/'+id+'/replies',reply)).status,200);
 assert.equal(await f.sql("SELECT count(*) n FROM feedback_events WHERE kind='reply'").first('n'),1);
 let d=await detail(f,a,id,true);assert.equal((await call(f,a,'manage/feedback/'+id+'/github-link',{operationId:randomUUID(),revision:d.request.revision,url:'https://evil.test/issues/1'})).status,400);
 assert.equal((await call(f,a,'manage/feedback/'+id+'/github-link',{operationId:randomUUID(),revision:d.request.revision,url:'https://github.com/Awandalo/Lan-Party/issues/44'})).status,200);
 assert.equal((await detail(f,u,id)).request.githubNumber,44);
 for(let i=0;i<4;i++)await create(f,u);assert.equal((await call(f,u,'feedback/requests',{operationId:randomUUID(),kind:'feature',title:'Sixth',description:'No'})).status,429);
}));
test('account deletion cascades private threads, administrator deletion anonymizes history, 30-day expiry removes related rows',()=>local(async f=>{
 const a=await f.user({genuine:true}),u=await f.user(),id=await create(f,u);await f.user({genuine:true});
 await call(f,a,'manage/feedback/'+id+'/replies',{operationId:randomUUID(),body:'Fictional response'});
 await f.sql('DELETE FROM auth_sessions WHERE user_id=?',a.id).run();await f.sql('DELETE FROM user_roles WHERE user_id=?',a.id).run();await f.sql('DELETE FROM users WHERE id=?',a.id).run();
 assert.equal(await f.sql("SELECT count(*) n FROM feedback_events WHERE actor_id IS NULL AND actor_kind='administrator'").first('n'),1);
 assert.equal((await detail(f,u,id)).events.length,2);
 await f.sql("UPDATE feedback_requests SET progress='closed',closed_at=unixepoch()-2592000 WHERE id=?",id).run();
 assert.equal((await call(f,u,'feedback/requests/'+id)).status,404);assert.equal(await f.sql('SELECT count(*) n FROM feedback_events').first('n'),0);
 const second=await create(f,u);await f.sql('DELETE FROM auth_sessions WHERE user_id=?',u.id).run();await f.sql('DELETE FROM users WHERE id=?',u.id).run();assert.equal(await f.sql('SELECT count(*) n FROM feedback_requests WHERE id=?',second).first('n'),0);
}));
test('feedback migration is additive, absent/partial schema fails closed, and expired visibility does not depend on cleanup',()=>local(async f=>{
 const a=await f.user({genuine:true}),u=await f.user(),users=(await f.sql('SELECT id,status FROM users ORDER BY id').all()).results;
 assert.equal((await call(f,u)).status,503);await f.migrate(23);
 assert.deepEqual((await f.sql('SELECT id,status FROM users ORDER BY id').all()).results,users);
 assert.equal((await call(f,u)).status,200);
 await f.sql('DROP TRIGGER feedback_event_actor').run();assert.equal((await call(f,u)).status,503);
},22));
test('stable bounded feedback pages bind owner/filter criteria and reject forged fields or unsafe requests',()=>local(async f=>{
 const a=await f.user({genuine:true}),u=await f.user(),v=await f.user();
 for(let i=0;i<23;i++){const id=randomUUID(),owner=i<22?u.id:v.id;await f.sql('INSERT INTO feedback_requests(id,owner_id,creation_id,creation_hash,kind,title,description) VALUES (?,?,?,?,?,?,?)',id,owner,randomUUID(),'fixture','bug','Fictional '+i,'Fictional content').run();}
 const first=await(await call(f,u)).json();assert.equal(first.requests.length,20);assert.ok(first.nextCursor);
 const second=await(await call(f,u,'feedback/requests?cursor='+encodeURIComponent(first.nextCursor))).json();assert.equal(second.requests.length,2);
 assert.equal(new Set([...first.requests,...second.requests].map(x=>x.id)).size,22);
 assert.equal((await call(f,v,'feedback/requests?cursor='+encodeURIComponent(first.nextCursor))).status,400);
 assert.equal((await call(f,u,'feedback/requests?kind=feature&cursor='+encodeURIComponent(first.nextCursor))).status,400);
 for(const q of ['?ownerId='+v.id,'?kind=bug&kind=feature','?limit=99999','?progress=bad'])assert.equal((await call(f,u,'feedback/requests'+q)).status,400);
 assert.equal((await call(f,u,'feedback/requests',{operationId:randomUUID(),ownerId:v.id,kind:'bug',title:'Test',description:'Fictional'})).status,400);
 const r=await f.request('feedback/requests',u,{operationId:randomUUID(),kind:'bug',title:'Test',description:'Fictional'},{...headers(u),Origin:'https://evil.test'});assert.equal(r.status,403);
 assert.equal((await f.request('feedback/requests',u,{}, {'X-LAN-Session-Proof':u.csrf})).status,403);
 assert.equal((await call(f,a,'manage/feedback')).status,200);
}));
test('reply and creation races are idempotent; stale triage and audit failure roll back state and feedback counters',()=>local(async f=>{
 const a=await f.user({genuine:true}),u=await f.user(),op=randomUUID(),body={operationId:op,kind:'feature',title:'Fictional race',description:'Fictional request'};
 const created=await Promise.all([call(f,u,'feedback/requests',body),call(f,u,'feedback/requests',body)]);assert.deepEqual(created.map(r=>r.status),[200,200]);const id=(await created[0].json()).requestId;assert.equal((await created[1].json()).requestId,id);
 const reply={operationId:randomUUID(),body:'Fictional reply'},replies=await Promise.all([call(f,u,'feedback/requests/'+id+'/replies',reply),call(f,u,'feedback/requests/'+id+'/replies',reply)]);assert.deepEqual(replies.map(r=>r.status),[200,200]);
 assert.equal(await f.sql("SELECT count(*) n FROM feedback_events WHERE kind='reply'").first('n'),1);
 const before=await detail(f,a,id,true),triage={operationId:randomUUID(),revision:before.request.revision,decision:'yes',progress:'planned'};
 assert.equal((await call(f,a,'manage/feedback/'+id+'/triage',triage)).status,200);
 assert.equal((await call(f,a,'manage/feedback/'+id+'/triage',{...triage,operationId:randomUUID(),decision:'no'})).status,409);
 await f.sql("CREATE TRIGGER fixture_feedback_fail BEFORE INSERT ON feedback_events WHEN NEW.kind='reply' BEGIN SELECT RAISE(ABORT,'fixture audit unavailable'); END").run();
 const rows=(await f.sql('SELECT key_hash,hits FROM registration_rate_limits ORDER BY key_hash').all()).results,revision=(await detail(f,u,id)).request.revision;
 assert.equal((await call(f,u,'feedback/requests/'+id+'/replies',{operationId:randomUUID(),body:'Rollback'})).status,409);
 assert.deepEqual((await f.sql('SELECT key_hash,hits FROM registration_rate_limits ORDER BY key_hash').all()).results,rows);assert.equal((await detail(f,u,id)).request.revision,revision);
}));

test('feedback uses ordinary full MFA sessions without a new recent-proof gate and rejects lost assurance',()=>local(async f=>{
 const u=await f.user(),factor=randomUUID();
 await f.sql('INSERT INTO auth_totp_factors(user_id,factor_id,secret_ciphertext,secret_nonce,key_id,last_step,recovery_set_id,enabled_at) VALUES (?,?,?,?,?,0,?,unixepoch()-600)',u.id,factor,'22'.repeat(36),'11'.repeat(12),'fixture',randomUUID()).run();
 await f.sql("INSERT INTO auth_session_mfa VALUES (?,?,0,?,'totp',unixepoch()-300,'password',unixepoch()-300)",u.digest,u.id,factor).run();
 const id=await create(f,u);assert.equal((await call(f,u,'feedback/requests/'+id)).status,200);
 await f.sql('DELETE FROM auth_session_mfa WHERE user_id=?',u.id).run();assert.equal((await call(f,u)).status,401);
 assert.equal((await call(f,u,'feedback/requests/'+id+'/replies',{operationId:randomUUID(),body:'Rejected'})).status,401);
}));
test('replay hashing ignores JSON key order, does not spend authentication counters, and enforces reply limits',()=>local(async f=>{
 const u=await f.user(),id=await create(f,u),operationId=randomUUID(),path='feedback/requests/'+id+'/replies';
 await f.sql('INSERT INTO registration_rate_limits(key_hash,hits,expires_at) VALUES (?,4,unixepoch()+3600)','ee'.repeat(32)).run();
 assert.equal((await call(f,u,path,{operationId,body:'Fictional response'})).status,200);
 assert.equal((await call(f,u,path,{body:'Fictional response',operationId})).status,200);
 assert.equal(await f.sql('SELECT hits FROM registration_rate_limits WHERE key_hash=?','ee'.repeat(32)).first('hits'),4);
 for(let i=0;i<9;i++)assert.equal((await call(f,u,path,{operationId:randomUUID(),body:'More fictional detail'})).status,200);
 assert.equal((await call(f,u,path,{operationId:randomUUID(),body:'Over limit'})).status,429);
 assert.equal(await f.sql("SELECT count(*) n FROM feedback_events WHERE kind='reply'").first('n'),10);
}));
