import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {local} from './helpers/role-fixture.mjs';
const call=(f,id,u,body,manager=false,headers={})=>f.request((manager?'event-participants/':'event-registration/')+id,u,body,{'X-LAN-Session-Proof':u?.csrf??'','X-CSRF-Token':u?.csrf??'',...headers});
async function setup(f,capacity=3){
 const admin=await f.user({genuine:true}),a=await f.user(),b=await f.user(),c=await f.user(),l=randomUUID();
 await f.sql("INSERT INTO locations(id,name,address_line,postal_code,city,country_code,capacity,default_rental_cents,created_at,updated_at) VALUES (?,'Fictional Hall','Example 1','0000 AA','Example','NL',?,100,0,0)",l,capacity).run();
 const r=await f.request('manage/events',admin,{action:'create',operationId:randomUUID(),locationId:l,locationRevision:0,title:'Fictional registration LAN',description:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Welcome'}]}]},startsAt:Date.parse('2030-11-01T17:00Z')/1000,endsAt:Date.parse('2030-11-03T19:00Z')/1000,minimumParticipants:1,maxGuests:2},{'X-LAN-Session-Proof':admin.csrf,'X-CSRF-Token':admin.csrf});
 assert.equal(r.status,200,await r.clone().text());const {id}=await r.json();
 await f.sql("UPDATE events SET publication_status='published' WHERE id=?",id).run();await f.sql('UPDATE event_management SET is_listed=1 WHERE event_id=?',id).run();
 const read=async(u=a,manager=false)=>{const r=await call(f,id,u,undefined,manager);assert.equal(r.status,200,await r.clone().text());return r.json();};
 const change=async(u,action,extra={},manager=false)=>{const s=await read(u,manager);return call(f,id,u,{action,revision:s.revision,operationId:randomUUID(),...extra},manager);};
 assert.equal((await change(admin,'open',{},true)).status,200);
 return {id,admin,a,b,c,read,change,days:(await read()).days.map(d=>d.date)};
}
const guest=(days,email='guest@example.test')=>({id:randomUUID(),name:'Fictional Guest',email,days});
test('real D1 persists independent guest days, private own view and confirmed-only member roster',()=>local(async f=>{
 const {id,a,b,admin,read,change,days}=await setup(f);const g=guest([days[1]]);
 const r=await change(a,'save',{draft:{days:[days[0]],guests:[g]}});assert.equal(r.status,200,await r.clone().text());
 const own=await read();assert.equal(own.own.guests[0].email,g.email);assert.equal(own.own.places.length,2);assert.deepEqual(own.crew.map(m=>m.days),[[days[0]]]);
 const other=await read(b);assert.equal(other.own,null);assert.equal(JSON.stringify(other).includes(g.email),false);assert.equal(JSON.stringify(other).includes(g.name),false);
 const manage=await read(admin,true);assert.equal(manage.total,2);assert.equal(manage.participants.length,2);assert.equal(manage.days[1].confirmed,1);assert.equal(JSON.stringify(manage).includes(g.email),false);
 assert.equal((await call(f,id,null)).status,401);
 const publicEvent=await(await f.request('events/'+id)).json();assert.equal(publicEvent.event.days[0].remaining,2);assert.equal(publicEvent.event.days[1].remaining,2);
 assert.equal((await call(f,id,b,undefined,true)).status,403);
},29));
test('session revocation, credential generation, closure and permission loss inside the commit window fence writes',async()=>{
 for(const fence of ['session','generation','close','permission'])await local(async f=>{
  const {id,a,admin,read,days}=await setup(f),manager=fence==='permission',u=manager?admin:a,s=await read(u,manager);
  const response=await call(f,id,u,{action:manager?'close':'save',revision:s.revision,operationId:randomUUID(),...manager?{}:{draft:{days,guests:[]}}},manager,{'X-Fixture-Registration-Fence':fence,'X-Fixture-Actor':u.id,'X-Fixture-Digest':u.digest,'X-Fixture-Event':id});
  assert.equal(response.status,409,await response.clone().text());assert.equal(await f.sql("SELECT count(*) n FROM event_registration_operations WHERE event_id=? AND action<>'open'",id).first('n'),0);
 },29);
});
test('manual cancellation retains history, cancels all groups and records one notification per responsible member',()=>local(async f=>{
 const {id,a,b,admin,read,change,days}=await setup(f,1);
 assert.equal((await change(a,'save',{draft:{days,guests:[]}})).status,200);assert.equal((await change(b,'save',{draft:{days,guests:[]}})).status,200);
 const before=await read(admin,true),op=randomUUID();
 assert.equal((await call(f,id,admin,{action:'cancel-event',revision:before.revision,operationId:randomUUID()},true)).status,400);
 const response=await f.request('manage/events',admin,{action:'cancel',id,revision:before.revision,operationId:op,confirmation:'Fictional registration LAN'},{'X-LAN-Session-Proof':admin.csrf,'X-CSRF-Token':admin.csrf});assert.equal(response.status,200,await response.clone().text());
 const after=await read(admin,true);assert.equal(after.cancelled,true);assert.equal(after.total,0);assert.equal(after.participants.length,0);assert.equal(await f.sql('SELECT count(*) n FROM event_registration_notifications WHERE operation_id=?',op).first('n'),2);
 assert.equal(await f.sql('SELECT registration_recorded FROM events WHERE id=?',id).first('registration_recorded'),1);assert.equal((await f.request('events/'+id)).status,404);
 assert.equal((await change(admin,'open',{},true)).status,409);
},29));
test('0029 backfills legacy member intent and preserves foundation rows; failure rolls back all new objects',()=>local(async f=>{
 const admin=await f.user({genuine:true}),l=randomUUID(),id=randomUUID(),d=randomUUID(),r=randomUUID();
 await f.sql("INSERT INTO locations(id,name,created_at,updated_at) VALUES (?,'Fictional preserved venue',0,0)",l).run();
 await f.sql("INSERT INTO events(id,location_id,slug,title,description,created_at,updated_at) VALUES (?,?,?,'Preserved event','Welcome',0,0)",id,l,id).run();
 await f.sql("INSERT INTO event_management(event_id,starts_at,ends_at,venue,capacity,max_guests) VALUES (?,1,2,'{}',3,1)",id).run();
 await f.sql("INSERT INTO event_days(id,event_id,attendance_date,starts_at,ends_at,sort_order,created_at,updated_at) VALUES (?,?,'2030-11-01',1,2,0,0,0)",d,id).run();
 await f.sql('INSERT INTO registrations(id,user_id,event_id,registered_at,created_at,updated_at) VALUES (?,?,?,0,0,0)',r,admin.id,id).run();await f.sql('INSERT INTO registration_days VALUES (?,?,?,0)',r,id,d).run();
 const before=await f.sql('SELECT * FROM registrations WHERE id=?',r).first();
 await assert.rejects(f.migrate(29,["SELECT json('fixture migration rollback')"]));assert.equal(await f.sql("SELECT count(*) n FROM sqlite_schema WHERE name='event_registration_places'").first('n'),0);
 await f.migrate(29);assert.deepEqual(await f.sql('SELECT * FROM registrations WHERE id=?',r).first(),before);assert.deepEqual(JSON.parse(await f.sql('SELECT draft FROM event_registration_parties WHERE registration_id=?',r).first('draft')),{days:['2030-11-01'],guests:[]});
 assert.equal(await f.sql("SELECT count(*) n FROM event_registration_places WHERE state='confirmed'").first('n'),1);assert.equal(await f.sql("SELECT count(*) n FROM sqlite_schema WHERE name LIKE '%_next'").first('n'),0);
},28));
test('registration notification failure is retained without undoing confirmation or resending on replay',()=>local(async f=>{
 const {id,a,read,days}=await setup(f),s=await read(),op=randomUUID(),body={action:'save',revision:s.revision,operationId:op,draft:{days,guests:[]}};
 const response=await call(f,id,a,body,false,{'X-Fixture-Mail-Failure':'1'});assert.equal(response.status,200);await f.drain();
 assert.ok((await read()).own.places.every(p=>p.status==='confirmed'));assert.equal(await f.sql('SELECT state FROM event_registration_notifications WHERE operation_id=?',op).first('state'),'failed');
 assert.equal((await call(f,id,a,body)).status,409);assert.equal(await f.sql('SELECT count(*) n FROM event_registration_notifications WHERE operation_id=?',op).first('n'),1);
},29));
test('MFA assurance is required for registration reads/writes and removal invalidates access',()=>local(async f=>{
 const {id,a,days}=await setup(f),factor=randomUUID();
 await f.sql('INSERT INTO auth_totp_factors(user_id,factor_id,secret_ciphertext,secret_nonce,key_id,last_step,recovery_set_id,enabled_at) VALUES (?,?,?,?,?,0,?,unixepoch()-600)',a.id,factor,'22'.repeat(36),'11'.repeat(12),'fixture',randomUUID()).run();
 assert.equal((await call(f,id,a)).status,401);
 await f.sql("INSERT INTO auth_session_mfa VALUES (?,?,0,?,'totp',unixepoch()-300,'password',unixepoch()-300)",a.digest,a.id,factor).run();
 const state=await(await call(f,id,a)).json();assert.equal(state.open,true);
 assert.equal((await call(f,id,a,{action:'save',revision:state.revision,operationId:randomUUID(),draft:{days,guests:[]}})).status,200);
 await f.sql('DELETE FROM auth_session_mfa WHERE user_id=?',a.id).run();assert.equal((await call(f,id,a)).status,401);
},29));
test('real account deletion removes private guests and atomically promotes waiting groups',()=>local(async f=>{
 const {id,a,b,change,read,days}=await setup(f,2);
 assert.equal((await change(a,'save',{draft:{days,guests:[guest(days)]}})).status,200);assert.equal((await change(b,'save',{draft:{days,guests:[]}})).status,200);assert.ok((await read(b)).own.places.every(p=>p.status==='waitlisted'));
 await f.sql("INSERT INTO auth_recent_authentication(session_digest,user_id,auth_version,method,authenticated_at,expires_at) VALUES (?,?,0,'password',unixepoch(),unixepoch()+300)",a.digest,a.id).run();
 const deleted=await f.request('auth/lifecycle/delete',a,{confirm:'DELETE',acknowledged:true},{'X-CSRF-Token':a.csrf});assert.equal(deleted.status,200,await deleted.clone().text());
 assert.equal(await f.sql('SELECT count(*) n FROM users WHERE id=?',a.id).first('n'),0);assert.equal(await f.sql("SELECT count(*) n FROM event_registration_parties WHERE draft LIKE '%guest@example.test%'").first('n'),0);
 assert.ok((await read(b)).own.places.every(p=>p.status==='confirmed'));assert.equal(await f.sql("SELECT count(*) n FROM event_registration_places WHERE event_id=? AND state='confirmed'",id).first('n'),3);
},29));
test('completed event deletion preserves anonymous member and guest totals without private identities',()=>local(async f=>{
 const {id,a,admin,read,change,days}=await setup(f,3);
 assert.equal((await change(a,'save',{draft:{days:[days[0]],guests:[guest([days[1],days[2]])]}})).status,200);
 await f.sql('UPDATE event_management SET starts_at=1,ends_at=2 WHERE event_id=?',id).run();const before=await read(admin,true),publicBefore=(await(await f.request('events/'+id)).json()).event.days;
 await f.sql("INSERT INTO auth_recent_authentication(session_digest,user_id,auth_version,method,authenticated_at,expires_at) VALUES (?,?,0,'password',unixepoch(),unixepoch()+300)",a.digest,a.id).run();
 const response=await f.request('auth/lifecycle/delete',a,{confirm:'DELETE',acknowledged:true},{'X-CSRF-Token':a.csrf});assert.equal(response.status,200,await response.clone().text());
 const after=await read(admin,true);assert.equal(after.total,before.total);assert.deepEqual(after.days,before.days);assert.deepEqual(after.participants,[]);assert.equal(after.crew.length,0);assert.equal(await f.sql('SELECT count(*) n FROM event_registration_parties').first('n'),0);
 assert.deepEqual((await(await f.request('events/'+id)).json()).event.days,publicBefore);
},29));
test('existing maintenance recovers unattempted notices and mutation limits leave places unchanged',()=>local(async f=>{
 const {id,a,read,days}=await setup(f),op=randomUUID();
 await f.sql("INSERT INTO event_registration_operations VALUES (?,?,NULL,'close',unixepoch(),0)",op,id).run();
 await f.sql('INSERT INTO event_registration_notifications(id,operation_id,user_id,event_id,created_at) VALUES (?,?,?,?,unixepoch())',randomUUID(),op,a.id,id).run();
 assert.equal((await f.fetch('http://127.0.0.1:5173/fixture-registration-maintenance')).status,200);await f.drain();assert.equal(await f.sql('SELECT state FROM event_registration_notifications WHERE operation_id=?',op).first('state'),'sent');
 for(let i=0;i<20;i++)await f.sql("INSERT INTO event_registration_operations VALUES (?,?,?,'save',unixepoch(),0)",randomUUID(),id,a.id).run();
 const state=await read();const result=await call(f,id,a,{action:'save',revision:state.revision,operationId:randomUUID(),draft:{days,guests:[]}});assert.equal(result.status,409);assert.equal((await read()).own,null);
},29));
test('D1 groups wait together, preserve confirmed places, promote first fitting group and lose cancelled queue position',()=>local(async f=>{
 const {a,b,c,read,change,days}=await setup(f);const g=guest(days);
 assert.equal((await change(a,'save',{draft:{days,guests:[g]}})).status,200);
 const bg=guest(days,'b@example.test');assert.equal((await change(b,'save',{draft:{days,guests:[bg]}})).status,200);
 assert.ok((await read(b)).own.places.every(p=>p.status==='waitlisted'));
 assert.equal((await change(c,'save',{draft:{days,guests:[]}})).status,200);assert.ok((await read(c)).own.places.every(p=>p.status==='confirmed'));
 assert.equal((await change(a,'save',{draft:{days,guests:[]}})).status,200);assert.ok((await read(b)).own.places.every(p=>p.status==='waitlisted'));
 assert.equal((await change(c,'cancel')).status,200);assert.ok((await read(b)).own.places.every(p=>p.status==='confirmed'));
 assert.equal((await read(a)).own.places.length,3);
},29));
test('concurrent requests and replay cannot overbook or duplicate audit/notification effects',()=>local(async f=>{
 const {id,a,b,read,days}=await setup(f,1),s=await read();
 const body={action:'save',operationId:randomUUID(),revision:s.revision,draft:{days,guests:[]}};
 const result=await Promise.all([call(f,id,a,body),call(f,id,b,{...body,operationId:randomUUID()})]);assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);
 assert.equal(await f.sql("SELECT count(*) n FROM event_registration_places WHERE event_id=? AND state='confirmed'",id).first('n'),3);
 assert.equal((await call(f,id,a,body)).status,409);
 assert.equal(await f.sql("SELECT count(*) n FROM event_registration_operations WHERE event_id=? AND action='save'",id).first('n'),1);
 assert.equal(await f.sql('SELECT count(*) n FROM event_registration_notifications WHERE event_id=?',id).first('n'),1);
},29));
test('closed, ended, stale/session-swapped, invalid input and duplicate guest emails fail without private disclosures',()=>local(async f=>{
 const {id,a,b,admin,read,change,days}=await setup(f);const g=guest(days);
 assert.equal((await change(a,'save',{draft:{days,guests:[g]}})).status,200);
 const duplicate=await change(b,'save',{draft:{days,guests:[guest(days,' GUEST@example.test ')]}});assert.equal(duplicate.status,400);assert.equal((await duplicate.text()).includes(a.id),false);
 for(const draft of [{days:[],guests:[]},{days:['2099-01-01'],guests:[]},{days,guests:[{...g,name:44}]},{days,guests:[{...g,days:null}]}])assert.equal((await change(b,'save',{draft})).status,400);
 const s=await read(b);assert.equal((await call(f,id,b,{action:'save',revision:s.revision,operationId:randomUUID(),owner:a.id,draft:{days,guests:[]}})).status,400);
 assert.equal((await call(f,id,b,undefined,false,{'X-LAN-Session-Proof':a.csrf})).status,409);
 assert.equal((await change(admin,'close',{},true)).status,200);assert.equal((await change(a,'cancel')).status,400);
 assert.equal((await change(admin,'open',{},true)).status,200);
 assert.equal((await change(admin,'capacity',{capacity:1},true)).status,400);
 await f.sql('UPDATE event_management SET starts_at=unixepoch()-86400,ends_at=unixepoch()-1 WHERE event_id=?',id).run();assert.equal((await change(a,'cancel')).status,400);assert.equal((await change(admin,'open',{},true)).status,409);
},29));
test('audit failure rolls back registrations and promotions; private guests cascade on account registration removal',()=>local(async f=>{
 const {id,a,read,change,days}=await setup(f);await f.sql("CREATE TRIGGER fixture_fail_registration BEFORE INSERT ON event_registration_notifications BEGIN SELECT RAISE(ABORT,'fixture failure'); END").run();
 assert.equal((await change(a,'save',{draft:{days,guests:[guest(days)]}})).status,503);assert.equal((await read()).own,null);
 assert.equal(await f.sql('SELECT count(*) n FROM registrations WHERE event_id=?',id).first('n'),0);
 await f.sql('DROP TRIGGER fixture_fail_registration').run();assert.equal((await change(a,'save',{draft:{days,guests:[guest(days)]}})).status,200);
 const before=(await read()).revision;await f.sql('DELETE FROM registration_days WHERE event_id=?',id).run();await f.sql('DELETE FROM registrations WHERE event_id=?',id).run();
 assert.equal(await f.sql('SELECT count(*) n FROM event_registration_parties').first('n'),0);assert.equal(await f.sql('SELECT count(*) n FROM event_registration_places').first('n'),0);assert.ok((await read()).revision>before);
},29));
