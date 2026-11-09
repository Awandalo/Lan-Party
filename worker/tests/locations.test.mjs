import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {local} from './helpers/role-fixture.mjs';
const headers=u=>({'X-LAN-Session-Proof':u.csrf,'X-CSRF-Token':u.csrf});
const call=(f,u,body,path='manage/locations',extra={})=>f.request(path,u,body,{...headers(u??{}),...extra});
const draft=(patch={})=>({action:'create',operationId:randomUUID(),name:'Fictional Hall',addressLine:'',postalCode:'',city:'',countryCode:'',instructions:'',capacity:null,rentalCents:0,directionsUrl:'',...patch});
async function create(f,u,patch={}){const r=await call(f,u,draft(patch));assert.equal(r.status,200,await r.clone().text());return (await r.json()).id;}
async function list(f,u,path='manage/locations'){const r=await call(f,u,undefined,path);assert.equal(r.status,200,await r.clone().text());return (await r.json()).locations;}

test('name-only creation, complete editing, archive and restore preserve history with explicit revisions',()=>local(async f=>{
 const u=await f.user({genuine:true}),id=await create(f,u);
 const [row]=await list(f,u);assert.equal(row.name,'Fictional Hall');assert.equal(row.capacity,null);assert.equal(row.addressLine,null);assert.equal(row.rentalCents,0);
 const change=draft({action:'update',id,revision:0,addressLine:'Example Street 1',postalCode:'0000 AA',city:'Fictional Town',countryCode:'NL',capacity:30,rentalCents:12345,instructions:'Parking\nUse side door'});
 assert.equal((await call(f,u,change)).status,200);
 const updated=(await list(f,u))[0];assert.equal(updated.revision,1);assert.equal(updated.rentalCents,12345);
 assert.equal((await call(f,u,{action:'archive',id,revision:1,operationId:randomUUID()})).status,200);
 assert.deepEqual(await list(f,u),[]);assert.equal((await list(f,u,'manage/locations?status=archived'))[0].active,0);
 assert.equal((await call(f,u,{action:'restore',id,revision:2,operationId:randomUUID()})).status,200);
 assert.equal((await list(f,u))[0].active,1);
 const logs=await(await call(f,u,undefined,'manage/location-activity')).json();assert.deepEqual(logs.entries.map(e=>e.operation),['location.restore','location.archive','location.update','location.create']);
 assert.ok(!JSON.stringify(logs).includes('Example Street'));assert.ok(!JSON.stringify(logs).includes(u.id));
 assert.equal((await call(f,u,undefined,'manage/locations')).headers.get('Cache-Control'),'no-store');
}));

test('only explicit locations.manage or genuine Administrator permits API and navigation, including logs',()=>local(async f=>{
 const regular=await f.user(),delegated=await f.user({admin:true}),admin=await f.user({genuine:true});
 await f.sql("DELETE FROM role_permissions WHERE role_id='30000000-0000-4000-8000-000000000001'").run();
 for(const path of ['manage/locations','manage/location-activity']){
 assert.equal((await call(f,null,undefined,path)).status,401);assert.equal((await call(f,regular,undefined,path)).status,403);assert.equal((await call(f,delegated,undefined,path)).status,403);
 }
 assert.equal((await call(f,regular,draft())).status,403);
 await f.sql("INSERT INTO role_permissions(role_id,permission_id,granted_at) SELECT '30000000-0000-4000-8000-000000000001',id,0 FROM permissions WHERE code='locations.manage'").run();
 assert.deepEqual((await(await f.request('manage/capabilities',delegated)).json()).sections,['locations']);
 await create(f,delegated);assert.equal((await list(f,delegated)).length,1);
 await f.sql('DELETE FROM role_permissions').run();assert.equal((await call(f,delegated,draft())).status,403);await create(f,admin);
 await f.sql("UPDATE users SET status='disabled' WHERE id=?",admin.id).run();assert.equal((await call(f,admin,undefined)).status,401);
}));

test('session proof, CSRF, origin, body/method/query and field validation fail closed',()=>local(async f=>{
 const u=await f.user({genuine:true}),other=await f.user({genuine:true});
 assert.equal((await f.request('manage/locations',u)).status,403);
 assert.equal((await call(f,u,undefined,'manage/locations',{'X-LAN-Session-Proof':other.csrf})).status,409);
 assert.equal((await call(f,u,draft(),'manage/locations',{'X-CSRF-Token':''})).status,403);
 assert.equal((await call(f,u,draft(),'manage/locations',{Origin:'https://example.test'})).status,403);
 assert.equal((await call(f,u,draft(),'manage/location-activity')).status,405);
 for(const query of ['?status=wrong','?search=a&search=b','?unknown=1'])assert.equal((await call(f,u,undefined,'manage/locations'+query)).status,400);
 for(const patch of [{name:' '},{name:'x'.repeat(121)},{capacity:0},{capacity:1.5},{rentalCents:-1},{rentalCents:.1},{countryCode:'NLD'},{addressLine:'a\nb'},
 {directionsUrl:'https://www.google.com.evil.test/maps'},{directionsUrl:'https://www.google.com/search?q=x'},{directionsUrl:'javascript:alert(1)'},{directionsUrl:'https://user:pass@maps.google.com/maps'},{unrecognized:'value'}])assert.equal((await call(f,u,draft(patch))).status,400,JSON.stringify(patch));
 assert.equal((await call(f,u,draft({instructions:'x'.repeat(20000)}))).status,413);
 assert.equal(await f.sql('SELECT count(*) n FROM locations').first('n'),0);assert.equal(await f.sql('SELECT count(*) n FROM location_activity').first('n'),0);
 for(const url of ['https://www.google.com/maps/dir/?api=1&destination=Example','https://maps.google.com/?q=Example','https://maps.app.goo.gl/Fictional'])await create(f,u,{directionsUrl:url});
}));

test('concurrent updates have one winner, replay rolls back and audit failure cannot leave unaudited changes',()=>local(async f=>{
 const u=await f.user({genuine:true}),id=await create(f,u);
 const change=name=>draft({action:'update',id,revision:0,name});
 const results=await Promise.all([call(f,u,change('Fictional A')),call(f,u,change('Fictional B'))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal(await f.sql('SELECT revision FROM locations WHERE id=?',id).first('revision'),1);assert.equal(await f.sql('SELECT count(*) n FROM location_activity').first('n'),2);
 const operationId=randomUUID(),body=draft({operationId});await create(f,u,{operationId});
 assert.equal((await call(f,u,body)).status,409);assert.equal(await f.sql('SELECT count(*) n FROM locations').first('n'),2);
 await f.sql("CREATE TRIGGER fixture_audit_failure BEFORE INSERT ON location_activity BEGIN SELECT RAISE(ABORT,'Fictional audit failure'); END").run();
 assert.equal((await call(f,u,draft({action:'update',id,revision:1,name:'Must roll back'}))).status,503);
 assert.notEqual(await f.sql('SELECT name FROM locations WHERE id=?',id).first('name'),'Must roll back');
}));

test('migration preserves populated event/location/day/registration references and rolls back on failure',()=>local(async f=>{
 const u=await f.user(),location=randomUUID(),event=randomUUID(),day=randomUUID(),registration=randomUUID();
 await f.sql("INSERT INTO locations(id,name,address_line,postal_code,city,country_code,created_at,updated_at) VALUES (?,'Old Hall','Example 1','0000 AA','Example','NL',0,0)",location).run();
 await f.sql("INSERT INTO events(id,location_id,slug,title,description,publication_status,created_at,updated_at) VALUES (?,?,'fictional','Existing LAN','Existing','published',0,0)",event,location).run();
 await f.sql("INSERT INTO event_days(id,event_id,attendance_date,starts_at,ends_at,created_at,updated_at) VALUES (?,?,'2026-11-01',1,2,0,0)",day,event).run();
 await f.sql("INSERT INTO registrations(id,event_id,user_id,registered_at,created_at,updated_at) VALUES (?,?,?,0,0,0)",registration,event,u.id).run();
 await f.sql('INSERT INTO registration_days(registration_id,event_id,event_day_id,selected_at) VALUES (?,?,?,0)',registration,event,day).run();
 const tables=['locations','events','event_days','registrations','registration_days'],before=await Promise.all(tables.map(t=>f.sql('SELECT * FROM '+t).all()));
 await assert.rejects(f.migrate(24,["SELECT json('Fictional failure')"]));
 for(let i=0;i<tables.length;i++)assert.deepEqual((await f.sql('SELECT * FROM '+tables[i]).all()).results,before[i].results);
 await f.migrate(24);
 for(let i=1;i<tables.length;i++)assert.deepEqual((await f.sql('SELECT * FROM '+tables[i]).all()).results,before[i].results);
 const legacy=await f.sql('SELECT * FROM locations WHERE id=?',location).first();for(const [key,value] of Object.entries(before[0].results[0]))assert.equal(legacy[key],value);
 await assert.rejects(f.sql('DELETE FROM locations WHERE id=?',location).run(),/FOREIGN KEY/);
 await assert.rejects(f.sql('UPDATE events SET location_id=? WHERE id=?',randomUUID(),event).run(),/FOREIGN KEY/);
},23));

test('pre-migration Locations stays hidden and authenticated API fails safely',()=>local(async f=>{
 const u=await f.user({genuine:true});assert.equal((await call(f,u,undefined)).status,503);
 assert.ok(!(await(await f.request('manage/capabilities',u)).json()).sections.includes('locations'));
},23));

test('location log numeric pagination and filters preserve stable bounded history',()=>local(async f=>{
 const u=await f.user({genuine:true}),id=await create(f,u);
 for(let revision=0;revision<22;revision++)assert.equal((await call(f,u,draft({action:'update',id,revision,name:'Fictional '+revision}))).status,200);
 const first=await(await call(f,u,undefined,'manage/location-activity')).json(),second=await(await call(f,u,undefined,'manage/location-activity?before='+first.nextBefore)).json();
 assert.equal(first.entries.length,20);assert.equal(second.entries.length,3);assert.equal(new Set([...first.entries,...second.entries].map(e=>e.sequence)).size,23);
 assert.equal((await call(f,u,undefined,'manage/location-activity?before=9223372036854775808')).status,400);
 const created=await(await call(f,u,undefined,'manage/location-activity?operation=location.create')).json();assert.equal(created.entries.length,1);
}));
