import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {local} from './helpers/role-fixture.mjs';
const proof=u=>({'X-LAN-Session-Proof':u?.csrf??'','X-CSRF-Token':u?.csrf??''});
const call=(f,id,u,body,headers={})=>f.request('event-review/'+id,u,body,{...proof(u),...headers});
async function setup(f){
 const admin=await f.user({genuine:true}),member=await f.user(),planner=await f.user({admin:true}),outsider=await f.user(),location=randomUUID();
 await f.sql("INSERT INTO locations(id,name,address_line,postal_code,city,country_code,capacity,default_rental_cents,created_at,updated_at) VALUES (?,'Fictional Hall','Example 1','0000 AA','Example','NL',10,30000,0,0)",location).run();
 const response=await f.request('manage/events',admin,{action:'create',operationId:randomUUID(),locationId:location,locationRevision:0,title:'Fictional review LAN',description:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Review'}]}]},startsAt:Date.parse('2030-11-01T17:00Z')/1000,endsAt:Date.parse('2030-11-03T19:00Z')/1000,minimumParticipants:1,maxGuests:2},proof(admin));
 assert.equal(response.status,200,await response.clone().text());const {id}=await response.json(),days=['2030-11-01','2030-11-02','2030-11-03'];
 await f.sql("UPDATE events SET publication_status='published',registration_status='open' WHERE id=?",id).run();await f.sql('UPDATE event_management SET is_listed=1 WHERE event_id=?',id).run();
 const guest={id:randomUUID(),name:'Fictional Guest',email:'guest@example.test',days:[days[1]]};
 const registration=await f.request('event-registration/'+id,member,{action:'save',revision:0,operationId:randomUUID(),draft:{days,guests:[guest]}},proof(member));assert.equal(registration.status,200,await registration.clone().text());
 const original=(await f.sql('SELECT * FROM event_registration_parties').all()).results;
 const end=async()=>{await f.sql("UPDATE events SET registration_status='closed' WHERE id=?",id).run();await f.sql('UPDATE event_management SET starts_at=1,ends_at=2 WHERE event_id=?',id).run();};
 const read=async(u=admin)=>{const r=await call(f,id,u);assert.equal(r.status,200,await r.clone().text());return r.json();};
 const change=async(u,action,extra={},headers={})=>{const r=await read(u);return call(f,id,u,{action,revision:r.revision,operationId:randomUUID(),reason:'Fictional review correction',...extra},headers);};
 return {admin,member,planner,outsider,id,days,guest,end,read,change,original};
}
test('review removes individual confirmed days without altering registrations or independent guests; changes are auditable and reversible',()=>local(async f=>{
 const s=await setup(f);await s.end();const before=await s.read(),person=before.people.find(p=>p.kind==='Member');
 assert.equal((await s.change(s.planner,'attendance',{registrationId:person.registrationId,personId:person.id,days:[]})).status,200);
 let after=await s.read();assert.deepEqual(after.people.find(p=>p.id===person.id).days,[]);assert.deepEqual(after.people.find(p=>p.id===s.guest.id).days,[s.days[1]]);
 assert.deepEqual((await f.sql('SELECT * FROM event_registration_parties').all()).results,s.original);assert.equal(await f.sql('SELECT count(*) n FROM event_registration_places').first('n'),4);
 assert.equal(after.activity[0].action,'attendance');assert.equal(after.activity[0].personName,person.name);assert.equal(after.activity[0].reason,'Fictional review correction');
 assert.equal((await s.change(s.planner,'attendance',{registrationId:person.registrationId,personId:person.id,days:[s.days[0]]})).status,200);
 after=await s.read();assert.deepEqual(after.people.find(p=>p.id===person.id).days,[s.days[0]]);
},30));
test('Pay/Free and payment instructions require both explicit planner and Finance grants, never creator or role name',()=>local(async f=>{
 const s=await setup(f),person=(await s.read()).people[0],payload={registrationId:person.registrationId,personId:person.id,complimentary:true};
 assert.equal((await s.change(s.planner,'complimentary',payload)).status,403);
 await f.sql("INSERT INTO role_permissions(role_id,permission_id,granted_at) SELECT '30000000-0000-4000-8000-000000000001',id,0 FROM permissions WHERE code='finance.manage'").run();
 assert.equal((await s.change(s.planner,'complimentary',payload)).status,200);
 assert.equal((await s.read()).people[0].complimentary,true);assert.equal((await s.read()).people[0].days.length,3);
 assert.equal((await s.change(s.planner,'instructions',{paymentUrl:'https://tikkie.me/pay/fictional',instructions:'Fictional bank instructions'})).status,200);
 await f.sql("DELETE FROM role_permissions WHERE role_id='30000000-0000-4000-8000-000000000001' AND permission_id IN (SELECT id FROM permissions WHERE code='events.manage_registrations')").run();
 assert.equal((await call(f,s.id,s.planner)).status,403);assert.equal((await call(f,s.id,s.member)).status,403);
},30));
test('authorized staff can correct billable days before the end while registration is open, without changing original selections',()=>local(async f=>{
 const s=await setup(f),person=(await s.read()).people[0],before=(await f.sql('SELECT * FROM event_registration_parties').all()).results;
 assert.equal((await s.change(s.planner,'attendance',{registrationId:person.registrationId,personId:person.id,days:[s.days[0]]})).status,200);
 assert.deepEqual((await s.read()).people.find(p=>p.id===person.id).days,[s.days[0]]);assert.deepEqual((await f.sql('SELECT * FROM event_registration_parties').all()).results,before);
 assert.equal(await f.sql('SELECT registration_status FROM events WHERE id=?',s.id).first('registration_status'),'open');
},30));

test('review validates person ownership, valid days, reasons and safe payment request URLs while registration is open',()=>local(async f=>{
 const s=await setup(f),person=(await s.read()).people[0],extra={registrationId:person.registrationId,personId:person.id,days:[]};
 for(const patch of [{days:['2030-11-04']},{days:[s.days[0],s.days[0]]},{personId:randomUUID()},{registrationId:randomUUID()},{reason:'x'}])assert.equal((await s.change(s.admin,'attendance',{...extra,...patch})).status,400);
 for(const paymentUrl of ['javascript:alert(1)','https://tikkie.me.evil.test/x','https://user@tikkie.me/x','http://tikkie.me/x','https://example.test/x'])assert.equal((await s.change(s.admin,'instructions',{paymentUrl,instructions:''})).status,400);
 assert.equal(await f.sql('SELECT count(*) n FROM event_review_activity').first('n'),0);
},30));
test('stale/replayed and simultaneous corrections commit exactly once, without notices or public financial data',()=>local(async f=>{
 const s=await setup(f);await s.end();const data=await s.read(),person=data.people[0],body={action:'attendance',registrationId:person.registrationId,personId:person.id,days:[],reason:'Fictional no-show',operationId:randomUUID(),revision:data.revision};
 const results=await Promise.all([call(f,s.id,s.admin,body),call(f,s.id,s.admin,body)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal((await call(f,s.id,s.admin,body)).status,409);assert.equal(await f.sql('SELECT count(*) n FROM event_review_activity').first('n'),1);
 const publicEvent=JSON.stringify(await (await f.request('events/'+s.id)).json());assert.equal(publicEvent.includes('complimentary'),false);assert.equal(publicEvent.includes('Fictional no-show'),false);
 assert.equal(await f.sql('SELECT count(*) n FROM event_registration_notifications').first('n'),1);
},30));
test('live session and permission revocation at the commit window reject review without partial writes',()=>local(async f=>{
 const s=await setup(f);await s.end();const person=(await s.read()).people[0];
 const r=await s.change(s.planner,'attendance',{registrationId:person.registrationId,personId:person.id,days:[]},{'X-Fixture-Registration-Fence':'permission','X-Fixture-Actor':s.planner.id});
 assert.equal(r.status,409);assert.equal(await f.sql('SELECT count(*) n FROM event_attendance_review').first('n'),0);assert.equal(await f.sql('SELECT count(*) n FROM event_review_activity').first('n'),0);
},30));
test('account deletion retains reviewed exclusions anonymously while erasing private people and contacts',()=>local(async f=>{
 const s=await setup(f);await s.end();const person=(await s.read()).people.find(p=>p.kind==='Member');
 assert.equal((await s.change(s.admin,'attendance',{registrationId:person.registrationId,personId:person.id,days:[]})).status,200);
 await f.sql("INSERT INTO auth_recent_authentication(session_digest,user_id,auth_version,method,authenticated_at,expires_at) VALUES (?,?,0,'password',unixepoch(),unixepoch()+300)",s.member.digest,s.member.id).run();
 const response=await f.request('auth/lifecycle/delete',s.member,{confirm:'DELETE',acknowledged:true},{'X-CSRF-Token':s.member.csrf});assert.equal(response.status,200,await response.clone().text());
 const after=await s.read();assert.equal(after.deletedAccounts,1);assert.equal(after.anonymousPeople,1);assert.deepEqual(after.anonymousDays.map(d=>d.total),[0,1,0]);assert.deepEqual(after.people,[]);assert.equal(after.activity[0].personName,null);
 assert.equal(await f.sql('SELECT count(*) n FROM event_attendance_review').first('n'),0);assert.equal(await f.sql('SELECT count(*) n FROM event_registration_parties').first('n'),0);
},30));
test('review rejects anonymous, missing proof, cross-origin and missing CSRF requests',()=>local(async f=>{
 const s=await setup(f),data=await s.read(),person=data.people[0],body={action:'complimentary',revision:data.revision,operationId:randomUUID(),reason:'Fictional correction',registrationId:person.registrationId,personId:person.id,complimentary:true};
 assert.equal((await call(f,s.id,null)).status,401);
 assert.equal((await call(f,s.id,s.admin,undefined,{'X-LAN-Session-Proof':'bad'})).status,409);
 assert.equal((await call(f,s.id,s.admin,body,{Origin:'https://evil.example.test'})).status,403);
 assert.equal((await call(f,s.id,s.admin,body,{'X-CSRF-Token':''})).status,403);
 assert.equal(await f.sql('SELECT count(*) n FROM event_review_activity').first('n'),0);
},30));
test('audit failure rolls back review state and revision; session loss rejects the commit',()=>local(async f=>{
 const s=await setup(f);await s.end();const before=await s.read(),person=before.people[0],extra={registrationId:person.registrationId,personId:person.id,days:[]};
 await f.sql("CREATE TRIGGER fixture_review_audit_failure BEFORE INSERT ON event_review_activity BEGIN SELECT RAISE(ABORT,'fictional audit failure'); END").run();
 assert.equal((await s.change(s.admin,'attendance',extra)).status,503);assert.equal((await s.read()).revision,before.revision);assert.equal(await f.sql('SELECT count(*) n FROM event_attendance_review').first('n'),0);
 await f.sql('DROP TRIGGER fixture_review_audit_failure').run();
 const r=await s.change(s.planner,'attendance',extra,{'X-Fixture-Registration-Fence':'session','X-Fixture-Digest':s.planner.digest});assert.equal(r.status,409);assert.equal(await f.sql('SELECT count(*) n FROM event_review_activity').first('n'),0);
},30));
test('0030 preserves populated registrations and grants; a failed migration rolls back before retry',()=>local(async f=>{
 const s=await setup(f),tables=['registrations','registration_days','event_registration_parties','event_registration_places','user_roles','role_permissions'],before={};
 for(const table of tables)before[table]=(await f.sql('SELECT * FROM '+table+' ORDER BY 1,2').all()).results;
 await assert.rejects(f.migrate(30,["SELECT json('fictional migration failure')"]));
 assert.equal(await f.sql("SELECT count(*) n FROM sqlite_schema WHERE name='event_attendance_review'").first('n'),0);
 await f.migrate(30);
 for(const table of tables)assert.deepEqual((await f.sql('SELECT * FROM '+table+' ORDER BY 1,2').all()).results,before[table]);
 assert.equal(await f.sql("SELECT count(*) n FROM permissions WHERE code='finance.manage'").first('n'),1);
 assert.equal((await call(f,s.id,s.planner)).status,200);
},29));
test('organizer can add a missed event day after end without changing original bookings, and deletion retains corrected history anonymously',()=>local(async f=>{
 const s=await setup(f);await s.end();const guest=(await s.read()).people.find(p=>p.id===s.guest.id);
 assert.deepEqual(guest.confirmed,[s.days[1]]);
 assert.equal((await s.change(s.planner,'attendance',{registrationId:guest.registrationId,personId:guest.id,days:[s.days[0],s.days[1]]})).status,200);
 assert.deepEqual((await s.read()).people.find(p=>p.id===guest.id).days,[s.days[0],s.days[1]]);
 assert.deepEqual((await f.sql('SELECT * FROM event_registration_parties').all()).results,s.original);
 await f.sql("INSERT INTO auth_recent_authentication(session_digest,user_id,auth_version,method,authenticated_at,expires_at) VALUES (?,?,0,'password',unixepoch(),unixepoch()+300)",s.member.digest,s.member.id).run();
 const response=await f.request('auth/lifecycle/delete',s.member,{confirm:'DELETE',acknowledged:true},{'X-CSRF-Token':s.member.csrf});assert.equal(response.status,200,await response.clone().text());
 const after=await s.read();assert.equal(after.anonymousPeople,2);assert.deepEqual(after.anonymousDays.map(d=>d.total),[2,2,1]);
},30));


test('bank payment links preserve complete query/fragment identifiers and reject deceptive domains without partial saves',()=>local(async f=>{
 const s=await setup(f),urls=[
  'https://tikkie.me/pay/fictional',
  'https://www.tikkie.me/pay/fictional',
  'https://betaalverzoek.rabobank.nl/betaalverzoek/?id=fictional&amount=10',
  'https://www.ing.nl/particulier/betaalverzoek/index.html?trxid=fictional',
  'https://www.ing.nl/de-ing/payreq?trxid=fictional',
  'https://bunq.me/fictional-lan',
  'https://diensten.asnbank.nl/online/betaalverzoek/#/v2/fictional',
  'https://diensten.snsbank.nl/online/betaalverzoek/#/v2/fictional',
  'https://diensten.regiobank.nl/online/betaalverzoek/#/v2/fictional'
 ];
 for(const paymentUrl of urls){const response=await s.change(s.admin,'instructions',{paymentUrl,instructions:'Fictional transfer reference'});assert.equal(response.status,200,await response.clone().text());assert.equal((await s.read()).settings.payment_url,paymentUrl);}
 const before=await s.read();
 for(const paymentUrl of ['https://betaalverzoek.rabobank.nl.evil.test/betaalverzoek/?id=fictional','https://evil.test/?url=https://tikkie.me/pay/fictional','https://user:password@bunq.me/fictional','https://diensten.asnbank.nl:8443/online/betaalverzoek/','http://betaalverzoek.rabobank.nl/betaalverzoek/','https://rabobank.nl/betaalverzoek/','https://www.ing.nl/login','https://www.ing.nl.evil.test/de-ing/payreq?trxid=fictional','https://www.ing.nl/de-ing/payreq.evil','https://betaalverzoek-rabobank.nl/fictional','https://tikkie.me./pay/fictional','javascript:alert(1)','https://bunq.me/fictional\nrequest']){
  const response=await s.change(s.admin,'instructions',{paymentUrl,instructions:'Rejected change'});assert.equal(response.status,400,await response.clone().text());
 }
 const after=await s.read();assert.equal(after.revision,before.revision);assert.deepEqual(after.settings,before.settings);assert.equal(after.activity.length,before.activity.length);
 assert.equal((await s.change(s.admin,'instructions',{paymentUrl:'',instructions:'Fictional bank transfer instructions only'})).status,200);assert.equal((await s.read()).settings.payment_url,'');
},33));
