import assert from 'node:assert/strict';
import {test} from 'node:test';
import {local} from './helpers/role-fixture.mjs';
const call=(f,u,path='manage/user-activity',extra={})=>f.request(path,u,undefined,{'X-LAN-Session-Proof':u?.csrf??'a'.repeat(64),...extra});
test('User Log requires genuine current Administrator and session-correlated same-origin reads',()=>local(async f=>{
 const a=await f.user({genuine:true}),d=await f.user({admin:true}),member=await f.user();
 assert.equal((await call(f,a)).status,200);
 for(const u of [d,member,null])assert.equal((await call(f,u)).status,u?403:401);
 for(const headers of [{'X-LAN-Session-Proof':''},{Origin:'https://example.test'},{'Sec-Fetch-Site':'cross-site'}])assert.ok([403,409].includes((await call(f,a,undefined,headers)).status));
 assert.equal((await f.request('manage/user-activity',a)).status,403);
 const caps=await (await f.request('manage/capabilities',a)).json();assert.ok(caps.sections.includes('userActivity'));
 assert.ok(!(await (await f.request('manage/capabilities',d)).json()).sections.includes('userActivity'));
 await f.sql('DELETE FROM user_roles WHERE user_id=?',a.id).run();assert.equal((await call(f,a)).status,403);
}));
test('User Log paginates with validated filters, safe projection and no retained contact data',()=>local(async f=>{
 const a=await f.user({genuine:true}),u=await f.user();
 await f.sql("INSERT INTO user_nicknames(user_id,nickname,created_at,updated_at) VALUES (?,'Fictional Player',0,0)",u.id).run();
 await f.db.batch(Array.from({length:24},()=>f.sql("INSERT INTO user_activity(event,actor_kind,actor_id,target_id) VALUES ('invitation.prepared','administrator',?,?)",a.id,u.id)));
 const first=await (await call(f,a,'manage/user-activity?event=invitation.prepared&search=Fictional')).json();
 assert.equal(first.entries.length,20);assert.ok(first.nextBefore);assert.equal(first.entries[0].targetName,'Fictional Player');
 assert.ok(first.entries.every(e=>!('email' in e)&&!('delta' in e)&&e.dateOnly===0));
 const second=await (await call(f,a,'manage/user-activity?event=invitation.prepared&before='+first.nextBefore)).json();assert.equal(second.entries.length,4);
 assert.ok(second.entries.every(e=>BigInt(e.sequence)<BigInt(first.nextBefore)));assert.equal(second.nextBefore,null);
 const r=await call(f,a);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal(r.headers.get('Referrer-Policy'),'no-referrer');
 for(const query of ['before=0','before=9223372036854775808','before=1&before=2','date=2026-02-30','event=invitation.expired','unknown=x','search='+encodeURIComponent('\n'),'search='+'x'.repeat(81)])assert.equal((await call(f,a,'manage/user-activity?'+query)).status,400,query);
 assert.equal((await call(f,a,'manage/user-activity?search='+encodeURIComponent("' OR 1=1 --"))).status,200);
}));
test('read-time retention uses the database calendar cutoff, independently of purge',()=>local(async f=>{
 const a=await f.user({genuine:true});
 const cutoff=await f.sql("SELECT CAST(strftime('%s','now','-2 years') AS INTEGER) AS n").first('n');
 await f.db.batch([-1,0,100].map(offset=>f.sql("INSERT INTO user_activity(event,actor_kind,occurred_at) VALUES ('invitation.unconfirmed','system',?)",cutoff+offset)));
 const rows=await (await call(f,a,'manage/user-activity?event=invitation.unconfirmed')).json();assert.equal(rows.entries.length,1);assert.equal(rows.entries[0].occurredAt,cutoff+100);
 assert.equal(await f.sql("SELECT count(*) n FROM user_activity WHERE event='invitation.unconfirmed'").first('n'),3);
 const day=new Date((cutoff+100)*1000).toISOString().slice(0,10),filtered=await (await call(f,a,'manage/user-activity?event=invitation.unconfirmed&date='+day)).json();assert.equal(filtered.entries.length,1);
}));
test('hidden nicknames cannot be searched; deleted groups never regain identities and have day-only dates',()=>local(async f=>{
 const a=await f.user({genuine:true}),u=await f.user();
 await f.sql("INSERT INTO user_nicknames(user_id,nickname,created_at,updated_at) VALUES (?,'Fictional Hidden',0,0)",u.id).run();
 await f.sql("INSERT INTO user_activity(event,actor_kind,actor_id,target_id,operation_id) VALUES ('invitation.prepared','administrator',?,?,'fictional-operation')",a.id,u.id).run();
 await f.sql("UPDATE users SET status='disabled' WHERE id=?",u.id).run();
 let body=await (await call(f,a,'manage/user-activity?event=invitation.prepared')).json();assert.equal(body.entries[0].targetName,null);
 assert.equal((await (await call(f,a,'manage/user-activity?search=Fictional%20Hidden')).json()).entries.length,0);
 await f.sql('DELETE FROM auth_sessions WHERE user_id=?',u.id).run();await f.sql('DELETE FROM user_nicknames WHERE user_id=?',u.id).run();await f.sql('DELETE FROM users WHERE id=?',u.id).run();
 body=await (await call(f,a,'manage/user-activity?event=invitation.prepared')).json();const row=body.entries[0];
 assert.equal(row.dateOnly,1);assert.equal(row.actorKind,'anonymous');assert.equal(row.occurredAt%86400,0);
 for(const key of ['actorId','targetId','operationId','actorName','targetName'])assert.equal(row[key],null,key);
 assert.equal((await (await call(f,a,'manage/user-activity?search=fictional-operation')).json()).entries.length,0);
}));
