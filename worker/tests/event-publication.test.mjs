import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {local} from './helpers/role-fixture.mjs';
const call=(f,u,body,path='manage/events')=>f.request(path,u,body,{'X-LAN-Session-Proof':u?.csrf??'','X-CSRF-Token':u?.csrf??''});
async function setup(f,overrides={}){
 const u=await f.user({genuine:true}),l=randomUUID();
 await f.sql("INSERT INTO locations(id,name,address_line,postal_code,city,country_code,capacity,default_rental_cents,created_at,updated_at) VALUES (?,'Fictional Hall','Example 1','0000 AA','Example','NL',10,12345,0,0)",l).run();
 const body={action:'create',operationId:randomUUID(),locationId:l,locationRevision:0,title:'Fictional LAN',description:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Welcome'}]}]},startsAt:Date.parse('2030-03-01T17:00Z')/1000,endsAt:Date.parse('2030-03-03T19:00Z')/1000,minimumParticipants:1,maxGuests:2,...overrides};
 const response=await call(f,u,body);assert.equal(response.status,200,await response.clone().text());const {id}=await response.json();
 const action=(name,revision,extra={})=>({action:name,id,revision,operationId:randomUUID(),confirmation:body.title,...extra});
 return {u,l,id,body,action};
}
test('publication exposes only approved public fields; unpublish and cancellation hide direct URLs',()=>local(async f=>{
 const {u,id,body,action}=await setup(f);
 assert.equal((await f.request('events/'+id)).status,404);
 assert.deepEqual(await(await f.request('events')).json(),{events:[]});
 assert.equal((await call(f,u,action('publish',0,{confirmation:'wrong'}))).status,400);
 const publish=action('publish',0);assert.equal((await call(f,u,publish)).status,200);
 assert.equal((await call(f,u,publish)).status,409);
 let response=await f.request('events/'+id);assert.equal(response.status,200,await response.clone().text());assert.equal(response.headers.get('Cache-Control'),'no-store');
 let {event}=await response.json();assert.deepEqual(Object.keys(event).sort(),['id','title','description','startsAt','endsAt','registrationStatus','venue','days'].sort());assert.equal(event.registrationStatus,'open');assert.equal(event.days.length,3);assert.equal(event.days[0].remaining,10);
 const {locationId,locationRevision,...edit}=body;
 assert.equal((await call(f,u,{...edit,action:'update',id,revision:1,title:'Updated public title',operationId:randomUUID()})).status,200);
 assert.equal((await(await f.request('events/'+id)).json()).event.title,'Updated public title');
 assert.equal((await call(f,u,action('unpublish',2,{confirmation:'Updated public title'}))).status,200);assert.equal((await f.request('events/'+id)).status,404);
 assert.equal(await f.sql('SELECT publication_status FROM events WHERE id=?',id).first('publication_status'),'published');
 assert.equal(await f.sql('SELECT registration_status FROM events WHERE id=?',id).first('registration_status'),'closed');
 assert.equal((await call(f,u,action('publish',3,{confirmation:'Updated public title'}))).status,200);
 assert.equal(await f.sql('SELECT registration_status FROM events WHERE id=?',id).first('registration_status'),'open');
 assert.equal((await call(f,u,action('cancel',4,{confirmation:'Updated public title'}))).status,200);assert.equal((await f.request('events/'+id)).status,404);
 assert.equal((await call(f,u,action('publish',5,{confirmation:'Updated public title'}))).status,409);
 assert.deepEqual((await f.sql('SELECT operation FROM event_activity ORDER BY sequence').all()).results.map(r=>r.operation),['event.create','event.publish','event.update','event.unpublish','event.publish','event.cancel']);
}));
test('legacy public counts exclude cancelled registrations and identities; venue proof fences account changes',()=>local(async f=>{
 const {u,id,action}=await setup(f),other=await f.user(),day=await f.sql('SELECT id FROM event_days WHERE event_id=? ORDER BY attendance_date',id).first('id');
 for(const [who,status] of [[u,'registered'],[other,'cancelled']]){const r=randomUUID();await f.sql('INSERT INTO registrations(id,user_id,event_id,status,cancelled_at,registered_at,created_at,updated_at) VALUES (?,?,?,?,?,0,0,0)',r,who.id,id,status,status==='cancelled'?0:null).run();await f.sql('INSERT INTO registration_days(registration_id,event_id,event_day_id,selected_at) VALUES (?,?,?,0)',r,id,day).run();}
 await f.sql("UPDATE events SET location_visibility='authenticated' WHERE id=?",id).run();assert.equal((await call(f,u,action('publish',0))).status,200);
 const anon=await(await f.request('events/'+id,u)).json();assert.equal(anon.event.venue,null);assert.equal(anon.event.days[0].remaining,9);assert.equal(JSON.stringify(anon).includes(u.id),false);assert.equal(JSON.stringify(anon).includes('@example.test'),false);
 const member=await call(f,u,undefined,'events/'+id);assert.equal(member.status,200);assert.equal((await member.json()).event.venue.name,'Fictional Hall');
 assert.equal((await f.request('events/'+id,other,undefined,{'X-LAN-Session-Proof':u.csrf})).status,409);
 await f.sql('UPDATE auth_sessions SET revoked_at=unixepoch() WHERE user_id=?',u.id).run();assert.equal((await call(f,u,undefined,'events/'+id)).status,401);
 assert.equal((await call(f,other,action('cancel',1))).status,403);
 const admin=await f.user({genuine:true});assert.equal((await call(f,admin,action('cancel',1))).status,409);
},28));
test('archived source confirmation, live permissions, stale revisions and audit failure guard lifecycle writes',()=>local(async f=>{
 const {u,l,id,action}=await setup(f),planner=await f.user({admin:true});
 await f.sql("DELETE FROM role_permissions WHERE role_id='30000000-0000-4000-8000-000000000001'").run();
 await f.sql("INSERT INTO role_permissions(role_id,permission_id,granted_at) SELECT '30000000-0000-4000-8000-000000000001',id,0 FROM permissions WHERE code='events.update'").run();
 assert.equal((await call(f,planner,action('publish',0))).status,403);
 await f.sql('UPDATE locations SET is_active=0 WHERE id=?',l).run();assert.equal((await call(f,u,action('publish',0))).status,409);
 await f.sql("CREATE TRIGGER fixture_publication_failure BEFORE INSERT ON event_activity WHEN NEW.operation='event.publish' BEGIN SELECT RAISE(ABORT,'Fictional audit failure'); END").run();
 assert.equal((await call(f,u,action('publish',0,{acknowledgeArchivedTemplate:true}))).status,503);
 assert.equal(await f.sql('SELECT is_listed FROM event_management WHERE event_id=?',id).first('is_listed'),0);assert.equal(await f.sql('SELECT revision FROM event_management WHERE event_id=?',id).first('revision'),0);
 assert.equal(await f.sql('SELECT registration_status FROM events WHERE id=?',id).first('registration_status'),'closed');
 await f.sql('DROP TRIGGER fixture_publication_failure').run();
 const results=await Promise.all([call(f,u,action('publish',0,{acknowledgeArchivedTemplate:true})),call(f,u,action('cancel',0))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
}));
test('public periods and next-event selection include ongoing events and published past archives',()=>local(async f=>{
 const {u,id,action}=await setup(f);assert.equal((await call(f,u,action('publish',0))).status,200);
 assert.equal((await(await f.request('events?period=upcoming&limit=1')).json()).events[0].id,id);
 assert.deepEqual((await(await f.request('events?period=past')).json()).events,[]);
 await f.sql('UPDATE event_management SET starts_at=1,ends_at=2 WHERE event_id=?',id).run();
 assert.equal((await(await f.request('events?period=past')).json()).events[0].id,id);
 assert.equal((await f.request('events/'+id)).status,200);
 for(const query of ['period=invalid','limit=2','period=past&period=upcoming','private=1'])assert.equal((await f.request('events?'+query)).status,400);
 assert.equal((await f.request('events/'+id+'?private=1')).status,400);
 assert.equal((await f.request('events',null,{})).status,405);
 for(const origin of ['https://www.lan-party.club','https://lan-party.club','https://preview.example.test','https://lan-party-dev.workers.dev'])assert.equal((await f.fetch(origin+'/api/events')).status,404);
}));
test('0028 retains every audit row and allocated sequence; old schemas stay gated',()=>local(async f=>{
 // An allocated-but-empty sequence must survive, along with deleted-event audit.
 await f.sql("INSERT INTO event_activity(sequence,operation_id,occurred_at,event_reference,event_title,operation,fields) VALUES (120,?,0,'deleted-fictional','Deleted fictional event','event.delete','[]')",randomUUID()).run();
 const l=randomUUID(),id=randomUUID();await f.sql("INSERT INTO locations(id,name,created_at,updated_at) VALUES (?,'Preserved venue',0,0)",l).run();
 await f.sql("INSERT INTO events(id,location_id,slug,title,description,created_at,updated_at) VALUES (?,?,?,'Preserved event','Preserved description',0,0)",id,l,id).run();
 await f.sql("INSERT INTO event_management(event_id,starts_at,ends_at,venue,capacity,max_guests) VALUES (?,1,2,'{}',10,1)",id).run();
 const eventBefore=await f.sql('SELECT * FROM events WHERE id=?',id).first(),managementBefore=await f.sql('SELECT * FROM event_management WHERE event_id=?',id).first();
 const before=(await f.sql('SELECT * FROM event_activity').all()).results;
 assert.equal((await f.request('events')).status,503);
 await assert.rejects(f.migrate(28,["SELECT json('Fictional failure')"]));assert.equal(await f.sql("SELECT count(*) n FROM pragma_table_info('event_management') WHERE name='is_listed'").first('n'),0);
 await f.migrate(28);assert.deepEqual((await f.sql('SELECT * FROM event_activity').all()).results,before);
 assert.deepEqual(await f.sql('SELECT * FROM events WHERE id=?',id).first(),eventBefore);assert.deepEqual(await f.sql('SELECT * FROM event_management WHERE event_id=?',id).first(),{...managementBefore,is_listed:0});
 assert.equal(await f.sql("SELECT seq FROM sqlite_sequence WHERE name='event_activity'").first('seq'),120);
 assert.equal(await f.sql("SELECT count(*) n FROM sqlite_master WHERE name LIKE '%_next'").first('n'),0);
},27));

test('publishing an ongoing event opens connected registration; ended events stay closed',()=>local(async f=>{
 const now=await f.sql('SELECT unixepoch() AS now').first('now'),hour=Math.floor(now/3600)*3600;
 for(const [startsAt,endsAt,expected] of [[hour-3600,hour+7200,true],[hour-7200,hour-3600,false]]){
  const {u,id,action}=await setup(f,{startsAt,endsAt});
  assert.equal((await call(f,u,action('publish',0))).status,200);
  const response=await call(f,u,undefined,'event-registration/'+id);
  assert.equal(response.status,200,await response.clone().text());
  const data=await response.json();assert.equal(data.open,expected);assert.equal(data.ended,!expected);
  assert.equal(await f.sql('SELECT registration_status FROM events WHERE id=?',id).first('registration_status'),expected?'open':'closed');
 }
}));
test('publication before connected registration migration stays closed',()=>local(async f=>{
 const {u,id,action}=await setup(f);
 assert.equal((await call(f,u,action('publish',0))).status,200);
 assert.equal(await f.sql('SELECT registration_status FROM events WHERE id=?',id).first('registration_status'),'closed');
},28));
