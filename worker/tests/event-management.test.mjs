import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {local} from './helpers/role-fixture.mjs';
const headers=u=>({'X-LAN-Session-Proof':u?.csrf??'','X-CSRF-Token':u?.csrf??''});
const call=(f,u,body,path='manage/events',extra={})=>f.request(path,u,body,{...headers(u),...extra});
async function venue(f){const id=randomUUID();await f.sql("INSERT INTO locations(id,name,address_line,postal_code,city,country_code,capacity,default_rental_cents,created_at,updated_at) VALUES (?,'Fictional Hall','Example 1','0000 AA','Example','NL',10,12345,0,0)",id).run();return id;}
const draft=(locationId,patch={})=>{
 const body={action:'create',operationId:randomUUID(),locationId,locationRevision:0,title:'Fictional LAN',description:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Welcome to the LAN'}]}]},startsAt:Date.parse('2030-03-01T17:00:00Z')/1000,endsAt:Date.parse('2030-03-03T19:00:00Z')/1000,minimumParticipants:1,maxGuests:2,...patch};
 if(body.action==='update'||body.action==='duplicate'){delete body.locationId;delete body.locationRevision;}return body;
};
async function create(f,u,l,patch={}){const r=await call(f,u,draft(l,patch));assert.equal(r.status,200,await r.clone().text());return(await r.json()).id;}
async function list(f,u){const r=await call(f,u);assert.equal(r.status,200,await r.clone().text());return(await r.json()).events;}

test('snapshots remain immutable while unregistered dates can be corrected; registration history then locks them',()=>local(async f=>{
 const u=await f.user({genuine:true}),l=await venue(f),id=await create(f,u,l);
 let [row]=await list(f,u);assert.equal(row.registrationHistory,0);assert.equal(row.minimumParticipants,1);assert.equal(Object.hasOwn(row,'financeEnabled'),false);assert.equal(row.capacity,10);assert.deepEqual(row.days,[{date:'2030-03-01'},{date:'2030-03-02'},{date:'2030-03-03'}]);
 await f.sql("UPDATE locations SET address_line='Changed template',capacity=20,default_rental_cents=99999,revision=revision+1 WHERE id=?",l).run();
 for(const assignment of ["venue='{}'",'capacity=11'])await assert.rejects(f.sql('UPDATE event_management SET '+assignment+' WHERE event_id=?',id).run(),/immutable/);
 const original=(await f.sql('SELECT id,attendance_date FROM event_days WHERE event_id=? ORDER BY attendance_date',id).all()).results;
 assert.equal((await call(f,u,draft(l,{action:'update',id,revision:0,title:'Corrected LAN',endsAt:draft(l).endsAt+86400,minimumParticipants:5}))).status,200);
 row=(await list(f,u))[0];assert.equal(row.days.length,4);assert.equal(row.minimumParticipants,5);assert.equal(row.venue.addressLine,'Example 1');assert.equal(row.capacity,10);assert.equal(row.rentalCents,12345);
 const saved=(await f.sql('SELECT id,attendance_date FROM event_days WHERE event_id=? ORDER BY attendance_date',id).all()).results;assert.deepEqual(saved.slice(0,3),original);
 const registration=randomUUID(),day=saved[0].id;await f.sql('INSERT INTO registrations(id,user_id,event_id,registered_at,created_at,updated_at) VALUES (?,?,?,0,0,0)',registration,u.id,id).run();await f.sql('INSERT INTO registration_days(registration_id,event_id,event_day_id,selected_at) VALUES (?,?,?,0)',registration,id,day).run();
 assert.equal((await call(f,u,draft(l,{action:'update',id,revision:1,endsAt:draft(l).endsAt+86400*2}))).status,400);
 await assert.rejects(f.sql("UPDATE event_days SET attendance_date='2030-03-05' WHERE event_id=?",id).run(),/locked/);await assert.rejects(f.sql('DELETE FROM event_days WHERE event_id=?',id).run(),/locked/);
 assert.equal((await call(f,u,draft(l,{action:'update',id,revision:1,title:'Details remain editable',endsAt:draft(l).endsAt+86400}))).status,200);
 await f.sql('UPDATE locations SET is_active=0 WHERE id=?',l).run();
 const copy=await create(f,u,l,{action:'duplicate',sourceId:id,sourceRevision:2,title:'Independent LAN',startsAt:Date.parse('2031-04-01T16:00:00Z')/1000,endsAt:Date.parse('2031-04-02T18:00:00Z')/1000});
 assert.equal(await f.sql('SELECT count(*) n FROM registrations WHERE event_id=?',copy).first('n'),0);assert.equal(await f.sql('SELECT count(*) n FROM event_activity WHERE event_id=?',copy).first('n'),1);
 const copied=(await list(f,u)).find(e=>e.id===copy);assert.equal(copied.registrationHistory,0);assert.equal(copied.capacity,10);assert.equal(copied.rentalCents,12345);assert.equal(copied.venue.addressLine,'Example 1');assert.equal(copied.revision,0);
}));

test('derived D1 dates use Netherlands midnight boundaries across DST rather than event-time copies',()=>local(async f=>{
 const u=await f.user({genuine:true}),l=await venue(f),id=await create(f,u,l,{startsAt:Date.parse('2030-03-30T23:00:00Z')/1000,endsAt:Date.parse('2030-04-01T18:00:00Z')/1000});
 const days=(await f.sql('SELECT attendance_date,starts_at,ends_at FROM event_days WHERE event_id=? ORDER BY attendance_date',id).all()).results;
 assert.deepEqual(days.map(d=>d.attendance_date),['2030-03-31','2030-04-01']);assert.equal(days[0].ends_at-days[0].starts_at,23*3600);assert.equal(days[1].ends_at-days[1].starts_at,24*3600);assert.equal(days[0].ends_at,days[1].starts_at);
}));

test('description API canonicalizes supported editor JSON and rejects executable content before writes',()=>local(async f=>{
 const u=await f.user({genuine:true}),l=await venue(f),rich={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Venue',marks:[{type:'bold'},{type:'link',attrs:{href:'https://example.test/venue',target:'_blank',rel:'noopener',class:null,title:null}}]}]}]};
 const id=await create(f,u,l,{description:rich,minimumParticipants:50}),saved=JSON.parse(await f.sql('SELECT description FROM events WHERE id=?',id).first('description'));
 assert.deepEqual(saved.content[0].content[0].marks[1].attrs,{href:'https://example.test/venue'});
 for(const description of ['<p>raw HTML</p>',{type:'doc',content:[{type:'script',text:'evil'}]},{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Bad',marks:[{type:'link',attrs:{href:'javascript:evil'}}]}]}]},{type:'doc',content:[{type:'paragraph',attrs:{onclick:'evil'},content:[]}]},{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'x'.repeat(8001)}]}]}])assert.equal((await call(f,u,draft(l,{description}))).status,400);
 assert.equal(await f.sql('SELECT count(*) n FROM events').first('n'),1);assert.equal(await f.sql('SELECT minimum_participants FROM event_management WHERE event_id=?',id).first('minimum_participants'),50);
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
 for(const patch of [{title:' '},{startsAt:1,endsAt:1},{endsAt:draft(l).endsAt+86400*32},{maxGuests:0},{financeEnabled:true},{minimumParticipants:0},{days:[]},{capacity:2},{venue:{}},{guestsEnabled:false},{action:'publish'},{action:'delete'},{action:'cancel'},{unexpected:true}])assert.equal((await call(f,u,draft(l,patch))).status,400,JSON.stringify(patch));
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

test('both pre-management and superseded 0025 schemas fail safely before any event mutation',async()=>{for(const count of [24,25,26])await local(async f=>{const u=await f.user({genuine:true});assert.equal((await call(f,u)).status,503);assert.equal((await call(f,u,{action:'create'})).status,503);assert.equal(await f.sql('SELECT count(*) n FROM events').first('n'),0);},count);});

const deletion=(row,patch={})=>({action:'delete',id:row.id,revision:row.revision,operationId:randomUUID(),confirmation:row.title,...patch});
test('Administrator-only confirmed deletion retains durable audit with no orphaned event rows',()=>local(async f=>{
 const u=await f.user({genuine:true}),planner=await f.user({admin:true}),l=await venue(f),id=await create(f,u,l),row=(await list(f,u))[0];
 assert.equal((await call(f,planner,deletion(row))).status,403);assert.equal((await call(f,u,deletion(row,{confirmation:'wrong'}))).status,400);assert.equal((await call(f,u,deletion(row),'manage/events',{'X-CSRF-Token':''})).status,403);
 assert.equal((await call(f,u,deletion(row))).status,200);for(const table of ['events','event_days','event_management'])assert.equal(await f.sql('SELECT count(*) n FROM '+table+' WHERE '+(table==='events'?'id':'event_id')+'=?',id).first('n'),0);
 const audit=(await f.sql('SELECT event_id,event_reference,event_title,operation FROM event_activity ORDER BY sequence').all()).results;assert.deepEqual(audit.map(r=>r.event_id),[null,null]);assert.deepEqual(audit.map(r=>r.event_reference),[id,id]);assert.equal(audit.at(-1).operation,'event.delete');assert.equal(audit.at(-1).event_title,row.title);
 const logs=await(await call(f,u,undefined,'manage/event-activity')).json();assert.equal(logs.entries[0].operation,'event.delete');assert.equal(logs.entries[0].title,row.title);
 assert.equal((await call(f,u,deletion(row))).status,409);
}));
test('past registration permanently blocks deletion/date changes even after registration rows are removed',()=>local(async f=>{
 const u=await f.user({genuine:true}),l=await venue(f),id=await create(f,u,l),registration=randomUUID();await f.sql('INSERT INTO registrations(id,user_id,event_id,registered_at,created_at,updated_at) VALUES (?,?,?,0,0,0)',registration,u.id,id).run();
 await f.sql("UPDATE registrations SET status='cancelled',cancelled_at=0 WHERE id=?",registration).run();const row=(await list(f,u))[0];assert.equal(row.registrationHistory,1);assert.equal((await call(f,u,deletion(row))).status,409);
 await f.sql('DELETE FROM registrations WHERE id=?',registration).run();assert.equal((await call(f,u,deletion(row))).status,409);await assert.rejects(f.sql('UPDATE events SET registration_recorded=0 WHERE id=?',id).run(),/cannot be cleared/);await assert.rejects(f.sql('DELETE FROM events WHERE id=?',id).run(),/Registration history/);
 assert.equal((await call(f,u,draft(l,{action:'update',id,revision:(await list(f,u))[0].revision,endsAt:draft(l).endsAt+86400}))).status,400);
}));
test('deletion and edits fence revisions; an audit failure rolls back every deletion effect',()=>local(async f=>{
 const u=await f.user({genuine:true}),l=await venue(f),id=await create(f,u,l),row=(await list(f,u))[0];
 await f.sql("CREATE TRIGGER fixture_delete_audit_failure BEFORE INSERT ON event_activity WHEN NEW.operation='event.delete' BEGIN SELECT RAISE(ABORT,'Fictional failure'); END").run();assert.equal((await call(f,u,deletion(row))).status,503);assert.equal(await f.sql('SELECT revision FROM event_management WHERE event_id=?',id).first('revision'),0);assert.equal(await f.sql('SELECT count(*) n FROM event_days WHERE event_id=?',id).first('n'),3);await f.sql('DROP TRIGGER fixture_delete_audit_failure').run();
 const results=await Promise.all([call(f,u,deletion(row)),call(f,u,draft(l,{action:'update',id,revision:0,title:'Changed'}))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
}));
test('0027 preserves populated records/audit sequence and seeds permanent registration history without Finance artifacts',()=>local(async f=>{
 const u=await f.user(),l=await venue(f),id=randomUUID(),day=randomUUID(),registration=randomUUID();await f.sql("INSERT INTO events(id,location_id,slug,title,description,created_at,updated_at) VALUES (?,?,'history','Fictional historical event','Plain old description',0,0)",id,l).run();await f.sql("INSERT INTO event_days(id,event_id,attendance_date,starts_at,ends_at,created_at,updated_at) VALUES (?,?,'2030-03-01',1,2,0,0)",day,id).run();await f.sql("INSERT INTO event_management(event_id,starts_at,ends_at,venue,capacity,max_guests,finance_enabled) VALUES (?,1,2,'{}',10,1,1)",id).run();await f.sql('INSERT INTO registrations(id,user_id,event_id,registered_at,created_at,updated_at) VALUES (?,?,?,0,0,0)',registration,u.id,id).run();await f.sql("INSERT INTO event_activity(operation_id,occurred_at,event_id,operation,fields) VALUES (?,0,?,'event.create','[]')",randomUUID(),id).run();await f.sql("UPDATE sqlite_sequence SET seq=120 WHERE name='event_activity'").run();
 await assert.rejects(f.migrate(27,["SELECT json('Fictional failure')"]));assert.equal(await f.sql("SELECT count(*) n FROM pragma_table_info('event_management') WHERE name='finance_enabled'").first('n'),1);await f.migrate(27);
 assert.equal(await f.sql('SELECT registration_recorded FROM events WHERE id=?',id).first('registration_recorded'),1);assert.equal(await f.sql('SELECT minimum_participants FROM event_management WHERE event_id=?',id).first('minimum_participants'),1);assert.equal(await f.sql("SELECT count(*) n FROM pragma_table_info('event_management') WHERE name='finance_enabled'").first('n'),0);assert.equal(await f.sql('SELECT description FROM events WHERE id=?',id).first('description'),'Plain old description');
 const audit=await f.sql('SELECT event_reference,event_title FROM event_activity').first();assert.deepEqual(audit,{event_reference:id,event_title:'Fictional historical event'});await f.sql("INSERT INTO event_activity(operation_id,occurred_at,event_id,event_reference,event_title,operation,fields) VALUES (?,0,?,?,?,'event.update','[]')",randomUUID(),id,id,'Fictional historical event').run();assert.equal(await f.sql('SELECT max(sequence) n FROM event_activity').first('n'),121);
},26));

test('new and changed times require quarter hours; unchanged legacy timestamps survive exact saves',()=>local(async f=>{
 const u=await f.user({genuine:true}),l=await venue(f),base=draft(l);
 for(const patch of [{startsAt:base.startsAt+60},{endsAt:base.endsAt+1}])assert.equal((await call(f,u,draft(l,patch))).status,400);
 const fold=Date.parse('2030-10-27T01:30:00Z')/1000;
 assert.equal((await call(f,u,draft(l,{startsAt:fold,endsAt:fold+3600}))).status,400);
 const id=await create(f,u,l),legacy=base.endsAt+32*60+17;await f.sql('UPDATE event_management SET ends_at=? WHERE event_id=?',legacy,id).run();
 assert.equal((await call(f,u,draft(l,{action:'update',id,revision:0,endsAt:legacy,title:'Unchanged legacy time'}))).status,200);
 assert.equal(await f.sql('SELECT ends_at FROM event_management WHERE event_id=?',id).first('ends_at'),legacy);
 assert.equal((await call(f,u,draft(l,{action:'update',id,revision:1,endsAt:legacy+60}))).status,400);
 assert.equal((await call(f,u,draft(l,{action:'duplicate',sourceId:id,sourceRevision:1,endsAt:legacy}))).status,400);
 assert.equal((await call(f,u,draft(l,{action:'update',id,revision:1,endsAt:base.endsAt+45*60}))).status,200);
 assert.equal(await f.sql('SELECT ends_at FROM event_management WHERE event_id=?',id).first('ends_at'),base.endsAt+45*60);
}));


test('event rental overrides preserve the Location and siblings, validate cents and audit changes',()=>local(async f=>{
 const u=await f.user({genuine:true}),plain=await f.user(),l=await venue(f),id=await create(f,u,l),other=await create(f,u,l);
 const saved=await f.sql('SELECT venue,capacity FROM event_management WHERE event_id=?',id).first();
 for(const rentalCents of [-1,1.2,100000001,'100'])assert.equal((await call(f,u,draft(l,{action:'update',id,revision:0,rentalCents}))).status,400);
 assert.equal((await call(f,plain,draft(l,{action:'update',id,revision:0,rentalCents:0}))).status,403);
 assert.equal((await call(f,u,draft(l,{action:'update',id,revision:0,rentalCents:0}))).status,200);
 assert.equal(await f.sql('SELECT rental_cents FROM event_management WHERE event_id=?',id).first('rental_cents'),0);
 assert.equal(await f.sql('SELECT rental_cents FROM event_management WHERE event_id=?',other).first('rental_cents'),12345);
 assert.equal(await f.sql('SELECT default_rental_cents FROM locations WHERE id=?',l).first('default_rental_cents'),12345);
 assert.deepEqual(await f.sql('SELECT venue,capacity FROM event_management WHERE event_id=?',id).first(),saved);
 assert.ok(JSON.parse(await f.sql("SELECT fields FROM event_activity WHERE event_id=? AND operation='event.update'",id).first('fields')).includes('rentalCents'));
 assert.equal((await call(f,u,draft(l,{action:'update',id,revision:0,rentalCents:5000}))).status,409);
 const custom=await create(f,u,l,{rentalCents:5000});assert.equal(await f.sql('SELECT rental_cents FROM event_management WHERE event_id=?',custom).first('rental_cents'),5000);
},34));

test('pricing migration preserves existing rows and rejects failed migration atomically',()=>local(async f=>{
 const u=await f.user({genuine:true}),l=await venue(f),id=await create(f,u,l),before=await f.sql('SELECT * FROM event_management WHERE event_id=?',id).first();
 assert.equal((await call(f,u,draft(l,{action:'update',id,revision:0,rentalCents:0}))).status,503);
 await assert.rejects(f.migrate(34,["SELECT json('Fictional pricing migration failure')"]));
 await assert.rejects(f.sql('UPDATE event_management SET rental_cents=0 WHERE event_id=?',id).run(),/immutable/);
 await f.migrate(34);assert.deepEqual(await f.sql('SELECT * FROM event_management WHERE event_id=?',id).first(),before);
 for(const assignment of ["venue='{}'",'capacity=11'])await assert.rejects(f.sql('UPDATE event_management SET '+assignment+' WHERE event_id=?',id).run(),/immutable/);
 assert.equal((await call(f,u,draft(l,{action:'update',id,revision:0,rentalCents:0}))).status,200);
},33));
