import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {local} from './helpers/role-fixture.mjs';
const call=(f,u,body)=>f.request('manage/events',u,body,{'X-LAN-Session-Proof':u.csrf,'X-CSRF-Token':u.csrf});
async function setup(f,status='draft'){
 const admin=await f.user({genuine:true}),location=randomUUID();await f.sql("INSERT INTO locations(id,name,address_line,postal_code,city,country_code,capacity,default_rental_cents,created_at,updated_at) VALUES (?,'Fictional Hall','Example 1','0000 AA','Example','NL',10,2500,0,0)",location).run();
 const body={action:'create',operationId:randomUUID(),locationId:location,locationRevision:0,title:'Fictional deletion LAN',description:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Fictional event description'}]}]},startsAt:Date.parse('2030-03-01T17:00Z')/1000,endsAt:Date.parse('2030-03-03T19:00Z')/1000,minimumParticipants:1,maxGuests:1};
 const response=await call(f,admin,body);assert.equal(response.status,200);const {id}=await response.json();
 const change=(action,revision=0)=>({action,id,revision,operationId:randomUUID(),confirmation:body.title});
 if(status==='published')assert.equal((await call(f,admin,change('publish'))).status,200);
 if(status==='cancelled')assert.equal((await call(f,admin,change('cancel'))).status,200);
 return {admin,location,body,id,change,revision:status==='draft'?0:1};
}
test('deleting any never-registered lifecycle state removes public URLs but preserves source location and durable logs',()=>local(async f=>{
 for(const status of ['draft','published','cancelled']){
  const {admin,id,location,change,revision}=await setup(f,status);
  if(status==='published'){assert.equal((await f.request('events/'+id)).status,200);assert.equal((await f.fetch('http://127.0.0.1:5173/events/'+id)).status,200);}
  assert.equal((await call(f,admin,change('delete',revision))).status,200);
  for(const table of ['events','event_days','event_management'])assert.equal(await f.sql('SELECT count(*) n FROM '+table+' WHERE '+(table==='events'?'id':'event_id')+'=?',id).first('n'),0);
  assert.equal(await f.sql('SELECT count(*) n FROM locations WHERE id=?',location).first('n'),1);
  assert.equal((await f.request('events/'+id)).status,404);const html=await f.fetch('http://127.0.0.1:5173/events/'+id);assert.equal(html.status,404);assert.equal((await html.text()).includes('Fictional deletion LAN'),false);
  const log=(await f.sql('SELECT event_id,event_reference,event_title,operation FROM event_activity WHERE event_reference=? ORDER BY sequence',id).all()).results;
  assert(log.every(e=>e.event_id===null&&e.event_reference===id&&e.event_title==='Fictional deletion LAN'));assert.equal(log.at(-1).operation,'event.delete');
 }
}));
test('retained anonymous history from either aggregate locks dates and blocks deletion/cancellation, without deleting historical totals',()=>local(async f=>{
 for(const kind of ['event','day']){
  const {admin,id,body,change}=await setup(f),day=await f.sql('SELECT id FROM event_days WHERE event_id=? LIMIT 1',id).first('id');
  // Model a retained pre-0027 aggregate with no remaining identifying rows.
  if(kind==='event')await f.sql('INSERT INTO anonymous_event_registrations(event_id,total) VALUES (?,1)',id).run();else await f.sql('INSERT INTO anonymous_day_registrations(event_day_id,event_id,total) VALUES (?,?,1)',day,id).run();
  assert.equal(await f.sql('SELECT registration_recorded FROM events WHERE id=?',id).first('registration_recorded'),0);
  const listed=await(await call(f,admin)).json();assert.equal(listed.events.find(e=>e.id===id).registrationHistory,1);
  assert.equal((await call(f,admin,change('delete'))).status,409);assert.equal((await call(f,admin,change('cancel'))).status,409);
  const {locationId,locationRevision,...edit}=body;
  assert.equal((await call(f,admin,{...edit,action:'update',id,revision:0,operationId:randomUUID(),endsAt:body.endsAt+86400})).status,400);
  assert.equal(await f.sql('SELECT revision FROM event_management WHERE event_id=?',id).first('revision'),0);assert.equal(await f.sql('SELECT count(*) n FROM event_days WHERE event_id=?',id).first('n'),3);
  assert.equal(await f.sql('SELECT total FROM '+(kind==='event'?'anonymous_event_registrations':'anonymous_day_registrations')+' WHERE event_id=?',id).first('total'),1);
 }
}));
test('registration racing deletion cannot leave a registered event deleted or orphan a registration',()=>local(async f=>{
 const {admin,id,change}=await setup(f),registration=randomUUID();
 const [deletion,insert]=await Promise.allSettled([call(f,admin,change('delete')),f.sql('INSERT INTO registrations(id,user_id,event_id,registered_at,created_at,updated_at) VALUES (?,?,?,0,0,0)',registration,admin.id,id).run()]);
 assert.equal(deletion.status,'fulfilled');
 if(insert.status==='fulfilled'){
  assert.equal(deletion.value.status,409);assert.equal(await f.sql('SELECT registration_recorded FROM events WHERE id=?',id).first('registration_recorded'),1);assert.equal(await f.sql('SELECT count(*) n FROM registrations WHERE id=?',registration).first('n'),1);
 }else{
  assert.equal(deletion.value.status,200);assert.match(String(insert.reason),/FOREIGN KEY constraint/);assert.equal(await f.sql('SELECT count(*) n FROM events WHERE id=?',id).first('n'),0);assert.equal(await f.sql('SELECT count(*) n FROM registrations WHERE id=?',registration).first('n'),0);
 }
}));
test('retained history arriving after preflight fences deletion, cancellation and calendar edits inside the transaction',()=>local(async f=>{
 for(const action of ['delete','cancel','update']){
  const {admin,id,body,change}=await setup(f),{locationId,locationRevision,...edit}=body;
  const input=action==='update'?{...edit,action,id,revision:0,operationId:randomUUID(),endsAt:body.endsAt+86400}:change(action);
  const response=await f.request('manage/events',admin,input,{'X-LAN-Session-Proof':admin.csrf,'X-CSRF-Token':admin.csrf,'X-Fixture-Event-History':id});
  assert.equal(response.status,409);assert.equal(await f.sql('SELECT revision FROM event_management WHERE event_id=?',id).first('revision'),0);assert.equal(await f.sql('SELECT publication_status FROM events WHERE id=?',id).first('publication_status'),'draft');assert.equal(await f.sql('SELECT count(*) n FROM event_days WHERE event_id=?',id).first('n'),3);assert.equal(await f.sql('SELECT count(*) n FROM event_activity WHERE event_id=?',id).first('n'),1);assert.equal(await f.sql('SELECT total FROM anonymous_event_registrations WHERE event_id=?',id).first('total'),1);
 }
}));
