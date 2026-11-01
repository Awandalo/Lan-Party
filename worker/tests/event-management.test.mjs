import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {local} from './helpers/role-fixture.mjs';
const headers=u=>({'X-LAN-Session-Proof':u?.csrf??'','X-CSRF-Token':u?.csrf??''});
const call=(f,u,body,path='manage/events',extra={})=>f.request(path,u,body,{...headers(u),...extra});
async function venue(f){const id=randomUUID();await f.sql("INSERT INTO locations(id,name,address_line,postal_code,city,country_code,capacity,default_rental_cents,created_at,updated_at) VALUES (?,'Fictional Hall','Example 1','0000 AA','Example','NL',10,12345,0,0)",id).run();return id;}
const draft=(locationId,patch={})=>{
 const body={action:'create',operationId:randomUUID(),locationId,locationRevision:0,title:'Fictional LAN',description:'# Welcome\n**Games** and *friends*\n- Bring cables',startsAt:Date.parse('2030-03-01T17:00:00Z')/1000,endsAt:Date.parse('2030-03-03T19:00:00Z')/1000,financeEnabled:true,maxGuests:2,...patch};
 if(body.action==='update'||body.action==='duplicate'){delete body.locationId;delete body.locationRevision;}return body;
};
async function create(f,u,l,patch={}){const r=await call(f,u,draft(l,patch));assert.equal(r.status,200,await r.clone().text());return(await r.json()).id;}
async function list(f,u){const r=await call(f,u);assert.equal(r.status,200,await r.clone().text());return(await r.json()).events;}

test('completed template is server-owned; inclusive dates/common capacity and immutable snapshot survive template edits and duplication',()=>local(async f=>{
 const u=await f.user({genuine:true}),l=await venue(f),id=await create(f,u,l);
 let [row]=await list(f,u);assert.equal(row.status,'draft');assert.equal(row.registrationStatus,'closed');assert.equal(row.revision,0);assert.equal(row.venue.addressLine,'Example 1');assert.equal(row.capacity,10);assert.deepEqual(row.days,[{date:'2030-03-01'},{date:'2030-03-02'},{date:'2030-03-03'}]);assert.equal(row.rentalCents,12345);assert.equal(Object.hasOwn(row,'guestsEnabled'),false);
 await f.sql("UPDATE locations SET address_line='Changed template',capacity=20,default_rental_cents=99999,revision=revision+1 WHERE id=?",l).run();row=(await list(f,u))[0];assert.equal(row.venue.addressLine,'Example 1');assert.equal(row.capacity,10);assert.equal(row.rentalCents,12345);
 for(const assignment of ["venue='{}'",'capacity=11','rental_cents=1'])await assert.rejects(f.sql('UPDATE event_management SET '+assignment+' WHERE event_id=?',id).run(),/immutable/);
 assert.equal((await call(f,u,draft(l,{action:'update',id,revision:0,title:'Updated LAN',startsAt:draft(l).startsAt+3600}))).status,200);
 assert.equal((await call(f,u,draft(l,{action:'update',id,revision:1,endsAt:draft(l).endsAt+86400}))).status,400);
 assert.equal((await call(f,u,draft(l,{action:'update',id,revision:1,capacity:15}))).status,400);
 await assert.rejects(f.sql("UPDATE event_days SET attendance_date='2030-03-05' WHERE event_id=?",id).run(),/locked/);await assert.rejects(f.sql('DELETE FROM event_days WHERE event_id=?',id).run(),/locked/);
 await assert.rejects(f.sql("INSERT INTO event_days(id,event_id,attendance_date,starts_at,ends_at,created_at,updated_at) VALUES (?,?,'2030-03-05',1,2,0,0)",randomUUID(),id).run(),/locked/);
 const day=await f.sql('SELECT id FROM event_days WHERE event_id=? ORDER BY attendance_date LIMIT 1',id).first('id'),registration=randomUUID();await f.sql('INSERT INTO registrations(id,user_id,event_id,registered_at,created_at,updated_at) VALUES (?,?,?,0,0,0)',registration,u.id,id).run();await f.sql('INSERT INTO registration_days(registration_id,event_id,event_day_id,selected_at) VALUES (?,?,?,0)',registration,id,day).run();
 await f.sql('UPDATE locations SET is_active=0 WHERE id=?',l).run();
 const copy=await create(f,u,l,{action:'duplicate',sourceId:id,sourceRevision:1,title:'Independent LAN',startsAt:Date.parse('2031-04-01T16:00:00Z')/1000,endsAt:Date.parse('2031-04-02T18:00:00Z')/1000});
 assert.equal(await f.sql('SELECT count(*) n FROM registrations WHERE event_id=?',copy).first('n'),0);assert.equal(await f.sql('SELECT count(*) n FROM event_activity WHERE event_id=?',copy).first('n'),1);
 const copied=(await list(f,u)).find(e=>e.id===copy);assert.equal(copied.status,'draft');assert.deepEqual(copied.venue,row.venue);assert.equal(copied.rentalCents,12345);assert.equal(copied.capacity,10);assert.equal(copied.revision,0);assert.deepEqual(copied.days,[{date:'2031-04-01'},{date:'2031-04-02'}]);
 const logs=await(await call(f,u,undefined,'manage/event-activity')).json();assert.equal(logs.entries[0].operation,'event.duplicate');assert.ok(!JSON.stringify(logs).includes('Example 1'));assert.equal((await call(f,u)).headers.get('Cache-Control'),'no-store');
}));

test('derived D1 dates use Netherlands midnight boundaries across DST rather than event-time copies',()=>local(async f=>{
 const u=await f.user({genuine:true}),l=await venue(f),id=await create(f,u,l,{startsAt:Date.parse('2030-03-30T23:00:00Z')/1000,endsAt:Date.parse('2030-04-01T18:00:00Z')/1000});
 const days=(await f.sql('SELECT attendance_date,starts_at,ends_at FROM event_days WHERE event_id=? ORDER BY attendance_date',id).all()).results;
 assert.deepEqual(days.map(d=>d.attendance_date),['2030-03-31','2030-04-01']);assert.equal(days[0].ends_at-days[0].starts_at,23*3600);assert.equal(days[1].ends_at-days[1].starts_at,24*3600);assert.equal(days[0].ends_at,days[1].starts_at);
}));

test('event permission remains shared/action-specific with proof, CSRF, origin and revocation guards',()=>local(async f=>{
 const admin=await f.user({genuine:true}),plain=await f.user(),planner=await f.user({admin:true}),l=await venue(f);await f.sql("DELETE FROM role_permissions WHERE role_id='30000000-0000-4000-8000-000000000001'").run();
 for(const path of ['manage/events','manage/event-activity']){assert.equal((await call(f,null,undefined,path)).status,401);assert.equal((await call(f,plain,undefined,path)).status,403);assert.equal((await call(f,planner,undefined,path)).status,403);}
 assert.equal((await f.request('manage/events',admin)).status,403);assert.equal((await call(f,admin,draft(l),'manage/events',{'X-CSRF-Token':''})).status,403);assert.equal((await call(f,admin,draft(l),'manage/events',{Origin:'https://example.test'})).status,403);
 await f.sql("INSERT INTO role_permissions(role_id,permission_id,granted_at) SELECT '30000000-0000-4000-8000-000000000001',id,0 FROM permissions WHERE code='events.update'").run();const id=await create(f,admin,l);assert.equal((await call(f,planner,draft(l))).status,403);assert.equal((await call(f,planner,draft(l,{action:'update',id,revision:0,title:'Another planner'}))).status,200);
 await f.sql("DELETE FROM role_permissions WHERE role_id='30000000-0000-4000-8000-000000000001'").run();assert.equal((await call(f,planner,draft(l,{action:'update',id,revision:1}))).status,403);assert.equal((await call(f,admin,undefined,'manage/events',{'X-LAN-Session-Proof':plain.csrf})).status,409);
}));

test('obsolete manual inputs and guest switch are rejected; incomplete/stale/archived templates cannot create',()=>local(async f=>{
 const u=await f.user({genuine:true}),l=await venue(f);
 for(const patch of [{title:' '},{startsAt:1,endsAt:1},{endsAt:draft(l).endsAt+86400*32},{maxGuests:0},{financeEnabled:1},{days:[]},{capacity:2},{rentalCents:1},{venue:{}},{guestsEnabled:false},{action:'publish'},{action:'delete'},{action:'cancel'},{unexpected:true}])assert.equal((await call(f,u,draft(l,patch))).status,400,JSON.stringify(patch));
 await f.sql('UPDATE locations SET capacity=NULL WHERE id=?',l).run();assert.equal((await call(f,u,draft(l))).status,400);await f.sql("UPDATE locations SET capacity=10,city=NULL WHERE id=?",l).run();assert.equal((await call(f,u,draft(l))).status,400);await f.sql("UPDATE locations SET city='Example',revision=1 WHERE id=?",l).run();assert.equal((await call(f,u,draft(l))).status,409);await f.sql('UPDATE locations SET is_active=0,revision=0 WHERE id=?',l).run();assert.equal((await call(f,u,draft(l))).status,409);
 for(const q of ['?status=no','?search=a&search=b','?unknown=1'])assert.equal((await call(f,u,undefined,'manage/events'+q)).status,400);assert.equal((await call(f,u,draft(l),'manage/event-activity')).status,405);assert.equal(await f.sql('SELECT count(*) n FROM events').first('n'),0);
}));

test('concurrent edits, operation replay, stale duplicate and audit failure roll back atomically',()=>local(async f=>{
 const u=await f.user({genuine:true}),l=await venue(f),id=await create(f,u,l);const changes=await Promise.all(['A','B'].map(title=>call(f,u,draft(l,{action:'update',id,revision:0,title}))));assert.deepEqual(changes.map(r=>r.status).sort(),[200,409]);
 const operationId=randomUUID();await create(f,u,l,{operationId});assert.equal((await call(f,u,draft(l,{operationId}))).status,409);assert.equal(await f.sql('SELECT count(*) n FROM events').first('n'),2);assert.equal((await call(f,u,draft(l,{action:'duplicate',sourceId:id,sourceRevision:0}))).status,409);
 await f.sql("CREATE TRIGGER fixture_event_audit_failure BEFORE INSERT ON event_activity BEGIN SELECT RAISE(ABORT,'Fictional failure'); END").run();assert.equal((await call(f,u,draft(l,{action:'update',id,revision:1,title:'Must roll back'}))).status,503);assert.notEqual((await list(f,u)).find(e=>e.id===id).title,'Must roll back');assert.equal(await f.sql('SELECT revision FROM event_management WHERE event_id=?',id).first('revision'),1);
}));

test('0026 physically removes obsolete fields, preserves registered IDs/dates/audit/snapshot, and rejects lossy mixed capacities',()=>local(async f=>{
 const u=await f.user(),l=await venue(f),id=randomUUID(),day=randomUUID(),registration=randomUUID();
 await f.sql("INSERT INTO events(id,location_id,slug,title,description,created_at,updated_at) VALUES (?,?,'old','Old LAN','Old',0,0)",id,l).run();await f.sql("INSERT INTO event_days(id,event_id,attendance_date,starts_at,ends_at,capacity,created_at,updated_at) VALUES (?,?,'2030-03-01',1,2,10,0,0)",day,id).run();
 await f.sql("INSERT INTO event_management(event_id,creator_id,starts_at,ends_at,venue,rental_cents,guests_enabled,max_guests) VALUES (?,?,1,2,'{}',100,0,0)",id,u.id).run();await f.sql('INSERT INTO registrations(id,event_id,user_id,registered_at,created_at,updated_at) VALUES (?,?,?,0,0,0)',registration,id,u.id).run();await f.sql('INSERT INTO registration_days(registration_id,event_id,event_day_id,selected_at) VALUES (?,?,?,0)',registration,id,day).run();await f.sql("INSERT INTO event_activity(operation_id,occurred_at,event_id,operation,fields) VALUES (?,0,?,'event.create','[]')",randomUUID(),id).run();
 const tables=['events','event_days','registrations','registration_days','event_activity'],before=await Promise.all(tables.map(t=>f.sql('SELECT * FROM '+t).all()));
 await assert.rejects(f.migrate(26,["SELECT json('Fictional failure')"]));assert.equal(await f.sql("SELECT count(*) n FROM pragma_table_info('event_days') WHERE name='capacity'").first('n'),1);
 await f.migrate(26);for(let i=0;i<tables.length;i++){const rows=(await f.sql('SELECT * FROM '+tables[i]).all()).results;for(let j=0;j<rows.length;j++)for(const[k,v]of Object.entries(before[i].results[j]))if(!(tables[i]==='event_days'&&k==='capacity'))assert.equal(rows[j][k],v);}
 assert.equal(await f.sql("SELECT count(*) n FROM pragma_table_info('event_days') WHERE name='capacity'").first('n'),0);assert.equal(await f.sql("SELECT count(*) n FROM pragma_table_info('event_management') WHERE name='guests_enabled'").first('n'),0);assert.equal(await f.sql('SELECT capacity FROM event_management WHERE event_id=?',id).first('capacity'),10);assert.equal(await f.sql('SELECT max_guests FROM event_management WHERE event_id=?',id).first('max_guests'),1);
},25));

test('0026 refuses unequal capacities without leaving temporary tables or schema effects',()=>local(async f=>{
 const l=await venue(f),id=randomUUID();await f.sql("INSERT INTO events(id,location_id,slug,title,description,created_at,updated_at) VALUES (?,?,'mixed','Mixed','',0,0)",id,l).run();for(const[date,capacity]of [['2030-01-01',10],['2030-01-02',11]])await f.sql('INSERT INTO event_days(id,event_id,attendance_date,starts_at,ends_at,capacity,created_at,updated_at) VALUES (?,?,?,1,2,?,0,0)',randomUUID(),id,date,capacity).run();await f.sql("INSERT INTO event_management(event_id,starts_at,ends_at,venue) VALUES (?,1,2,'{}')",id).run();await assert.rejects(f.migrate(26));assert.equal(await f.sql("SELECT count(*) n FROM sqlite_schema WHERE name='event_capacity_guard'").first('n'),0);assert.equal(await f.sql("SELECT count(*) n FROM pragma_table_info('event_days') WHERE name='capacity'").first('n'),1);
},25));

test('both pre-management and superseded 0025 schemas fail safely before any event mutation',async()=>{for(const count of [24,25])await local(async f=>{const u=await f.user({genuine:true});assert.equal((await call(f,u)).status,503);assert.equal((await call(f,u,{action:'create'})).status,503);assert.equal(await f.sql('SELECT count(*) n FROM events').first('n'),0);},count);});
