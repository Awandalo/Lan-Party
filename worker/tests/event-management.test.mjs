import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {local} from './helpers/role-fixture.mjs';
const headers=u=>({'X-LAN-Session-Proof':u?.csrf??'','X-CSRF-Token':u?.csrf??''});
const call=(f,u,body,path='manage/events',extra={})=>f.request(path,u,body,{...headers(u),...extra});
async function venue(f){const id=randomUUID();await f.sql("INSERT INTO locations(id,name,address_line,postal_code,city,country_code,created_at,updated_at) VALUES (?,'Fictional Hall','Example 1','0000 AA','Example','NL',0,0)",id).run();return id;}
const draft=(locationId,patch={})=>({action:'create',operationId:randomUUID(),locationId,title:'Fictional LAN',description:'# Welcome\n**Games** and *friends*\n- Bring cables',startsAt:1900000000,endsAt:1900100000,days:[{date:'2030-03-01',capacity:10},{date:'2030-03-03',capacity:12}],venue:{name:'Copied Hall',addressLine:'Example 2',postalCode:'0000 AB',city:'Example','countryCode':'NL',instructions:'Parking at side',directionsUrl:''},financeEnabled:true,rentalCents:12345,guestsEnabled:true,maxGuests:2,...patch});
async function create(f,u,l,patch={}){const r=await call(f,u,draft(l,patch));assert.equal(r.status,200,await r.clone().text());return(await r.json()).id;}
async function list(f,u){const r=await call(f,u);assert.equal(r.status,200,await r.clone().text());return(await r.json()).events;}

test('create/edit locks selected dates; snapshot is independent; duplicate copies no registrations or history',()=>local(async f=>{
 const u=await f.user({genuine:true}),l=await venue(f),id=await create(f,u,l);
 let [row]=await list(f,u);assert.equal(row.status,'draft');assert.equal(row.registrationStatus,'closed');assert.equal(row.revision,0);assert.equal(row.venue.addressLine,'Example 2');assert.deepEqual(row.days,draft(l).days);
 await f.sql("UPDATE locations SET address_line='Changed template' WHERE id=?",l).run();assert.equal((await list(f,u))[0].venue.addressLine,'Example 2');
 assert.equal((await call(f,u,draft(l,{action:'update',id,revision:0,title:'Updated LAN',days:[{date:'2030-03-01',capacity:15},{date:'2030-03-03',capacity:12}]}))).status,200);
 assert.equal((await call(f,u,draft(l,{action:'update',id,revision:1,days:[{date:'2030-03-02',capacity:10}]}))).status,400);
 await assert.rejects(f.sql("UPDATE event_days SET attendance_date='2030-03-02' WHERE event_id=?",id).run(),/locked/);
 await assert.rejects(f.sql('DELETE FROM event_days WHERE event_id=?',id).run(),/locked/);
 await assert.rejects(f.sql("INSERT INTO event_days(id,event_id,attendance_date,starts_at,ends_at,created_at,updated_at) VALUES (?,?,'2030-03-05',1,2,0,0)",randomUUID(),id).run(),/locked/);
 const day=await f.sql('SELECT id FROM event_days WHERE event_id=? ORDER BY attendance_date LIMIT 1',id).first('id'),registration=randomUUID();
 await f.sql('INSERT INTO registrations(id,user_id,event_id,registered_at,created_at,updated_at) VALUES (?,?,?,0,0,0)',registration,u.id,id).run();await f.sql('INSERT INTO registration_days(registration_id,event_id,event_day_id,selected_at) VALUES (?,?,?,0)',registration,id,day).run();
 const second=await f.user(),secondRegistration=randomUUID();await f.sql('INSERT INTO registrations(id,user_id,event_id,registered_at,created_at,updated_at) VALUES (?,?,?,0,0,0)',secondRegistration,second.id,id).run();await f.sql('INSERT INTO registration_days(registration_id,event_id,event_day_id,selected_at) VALUES (?,?,?,0)',secondRegistration,id,day).run();
 assert.equal((await call(f,u,draft(l,{action:'update',id,revision:1,days:[{date:'2030-03-01',capacity:1},{date:'2030-03-03',capacity:12}]}))).status,409);assert.equal(await f.sql('SELECT revision FROM event_management WHERE event_id=?',id).first('revision'),1);
 row=(await list(f,u))[0];await f.sql('UPDATE locations SET is_active=0 WHERE id=?',l).run();
 const copy=await create(f,u,l,{action:'duplicate',sourceId:id,sourceRevision:1,title:'Independent LAN',days:[{date:'2031-04-01',capacity:15}],venue:row.venue});
 assert.equal(await f.sql('SELECT count(*) n FROM registrations WHERE event_id=?',copy).first('n'),0);assert.equal(await f.sql('SELECT count(*) n FROM event_activity WHERE event_id=?',copy).first('n'),1);
 const copied=(await list(f,u)).find(e=>e.id===copy);assert.equal(copied.status,'draft');assert.deepEqual(copied.venue,row.venue);assert.equal(copied.rentalCents,12345);assert.equal(copied.revision,0);
 const logs=await(await call(f,u,undefined,'manage/event-activity')).json();assert.equal(logs.entries[0].operation,'event.duplicate');assert.ok(!JSON.stringify(logs).includes('Example 2'));assert.equal((await call(f,u)).headers.get('Cache-Control'),'no-store');
}));

test('event permission is shared, action-specific and never creator ownership; proof, CSRF and revocation fail closed',()=>local(async f=>{
 const admin=await f.user({genuine:true}),plain=await f.user(),planner=await f.user({admin:true}),l=await venue(f);
 await f.sql("DELETE FROM role_permissions WHERE role_id='30000000-0000-4000-8000-000000000001'").run();
 for(const path of ['manage/events','manage/event-activity']){assert.equal((await call(f,null,undefined,path)).status,401);assert.equal((await call(f,plain,undefined,path)).status,403);assert.equal((await call(f,planner,undefined,path)).status,403);}
 assert.equal((await f.request('manage/events',admin)).status,403);assert.equal((await call(f,admin,draft(l),'manage/events',{'X-CSRF-Token':''})).status,403);assert.equal((await call(f,admin,draft(l),'manage/events',{Origin:'https://example.test'})).status,403);
 await f.sql("INSERT INTO role_permissions(role_id,permission_id,granted_at) SELECT '30000000-0000-4000-8000-000000000001',id,0 FROM permissions WHERE code='events.update'").run();
 const id=await create(f,admin,l);assert.equal((await call(f,planner,draft(l))).status,403);assert.equal((await call(f,planner,draft(l,{action:'update',id,revision:0,title:'Edited by another planner'}))).status,200);
 await f.sql('DELETE FROM role_permissions WHERE role_id=?','30000000-0000-4000-8000-000000000001').run();assert.equal((await call(f,planner,draft(l,{action:'update',id,revision:1}))).status,403);
 assert.equal((await call(f,admin,undefined,'manage/events',{'X-LAN-Session-Proof':plain.csrf})).status,409);
}));

test('validation rejects incomplete snapshots, invalid dates/capacity/settings, unknown operations and unsupported publication',()=>local(async f=>{
 const u=await f.user({genuine:true}),l=await venue(f);
 for(const patch of [{title:' '},{startsAt:1,endsAt:1},{days:[]},{days:[{date:'2030-02-30',capacity:1}]},{days:[{date:'2030-99-01',capacity:1}]},{days:[{date:'2030-01-01',capacity:0}]},{days:[{date:'2030-01-01',capacity:1},{date:'2030-01-01',capacity:1}]},{venue:{...draft(l).venue,city:''}},{venue:{...draft(l).venue,directionsUrl:'javascript:alert(1)'}},{rentalCents:-1},{financeEnabled:1},{guestsEnabled:false,maxGuests:2},{action:'publish'},{action:'cancel'},{action:'restore'},{unexpected:true}])assert.equal((await call(f,u,draft(l,patch))).status,400,JSON.stringify(patch));
 for(const q of ['?status=no','?search=a&search=b','?unknown=1'])assert.equal((await call(f,u,undefined,'manage/events'+q)).status,400);
 assert.equal((await call(f,u,draft(l),'manage/event-activity')).status,405);assert.equal(await f.sql('SELECT count(*) n FROM events').first('n'),0);
}));

test('concurrent edits, replay, stale duplicate and audit failure are atomic',()=>local(async f=>{
 const u=await f.user({genuine:true}),l=await venue(f),id=await create(f,u,l);
 const changes=await Promise.all(['A','B'].map(title=>call(f,u,draft(l,{action:'update',id,revision:0,title}))));assert.deepEqual(changes.map(r=>r.status).sort(),[200,409]);
 const operationId=randomUUID();await create(f,u,l,{operationId});assert.equal((await call(f,u,draft(l,{operationId}))).status,409);assert.equal(await f.sql('SELECT count(*) n FROM events').first('n'),2);
 assert.equal((await call(f,u,draft(l,{action:'duplicate',sourceId:id,sourceRevision:0}))).status,409);
 await f.sql("CREATE TRIGGER fixture_event_audit_failure BEFORE INSERT ON event_activity BEGIN SELECT RAISE(ABORT,'Fictional failure'); END").run();
 assert.equal((await call(f,u,draft(l,{action:'update',id,revision:1,title:'Must roll back'}))).status,503);assert.notEqual((await list(f,u)).find(e=>e.id===id).title,'Must roll back');assert.equal(await f.sql('SELECT revision FROM event_management WHERE event_id=?',id).first('revision'),1);
}));

test('0025 preserves populated legacy rows and composite registration foreign keys; failed migration rolls back',()=>local(async f=>{
 const u=await f.user(),l=await venue(f),id=randomUUID(),day=randomUUID(),registration=randomUUID();
 await f.sql("INSERT INTO events(id,location_id,slug,title,description,publication_status,created_at,updated_at) VALUES (?,?,'old','Old LAN','Old','published',0,0)",id,l).run();await f.sql("INSERT INTO event_days(id,event_id,attendance_date,starts_at,ends_at,created_at,updated_at) VALUES (?,?,'2030-03-01',1,2,0,0)",day,id).run();await f.sql('INSERT INTO registrations(id,event_id,user_id,registered_at,created_at,updated_at) VALUES (?,?,?,0,0,0)',registration,id,u.id).run();await f.sql('INSERT INTO registration_days(registration_id,event_id,event_day_id,selected_at) VALUES (?,?,?,0)',registration,id,day).run();
 const tables=['events','event_days','registrations','registration_days'],before=await Promise.all(tables.map(t=>f.sql('SELECT * FROM '+t).all()));await assert.rejects(f.migrate(25,["SELECT json('Fictional failure')"]));assert.equal(await f.sql("SELECT count(*) n FROM pragma_table_info('event_days') WHERE name='capacity'").first('n'),0);
 await f.migrate(25);for(let i=0;i<tables.length;i++){const rows=(await f.sql('SELECT * FROM '+tables[i]).all()).results;for(let j=0;j<rows.length;j++)for(const[k,v]of Object.entries(before[i].results[j]))assert.equal(rows[j][k],v);}
 assert.equal(await f.sql('SELECT count(*) n FROM event_management').first('n'),0);await assert.rejects(f.sql('DELETE FROM events WHERE id=?',id).run(),/FOREIGN KEY/);
},24));

test('pre-migration event routes fail safely, with no schema or data effects',()=>local(async f=>{const u=await f.user({genuine:true});assert.equal((await call(f,u)).status,503);assert.equal((await call(f,u,{action:'create'})).status,503);assert.equal(await f.sql('SELECT count(*) n FROM events').first('n'),0);},24));
