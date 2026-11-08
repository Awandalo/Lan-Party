import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {local} from './helpers/role-fixture.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const compiled=await build({stdin:{resolveDir:process.cwd(),contents:"export {calculateEventBills} from './src/lib/event-billing';"},bundle:true,platform:'node',format:'esm',write:false});
const {calculateEventBills}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));

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
const finance=(f,s,u=s.admin,body,manager=true,headers={})=>f.request('event-finance/'+s.id+(manager?'/manage':''),u,body,{...proof(u),...headers});
const close=(f,s,u=s.planner,extra={})=>finance(f,s,u,{action:'finalize',revision:undefined,operationId:randomUUID(),confirmation:'Fictional review LAN',...extra});
const finalize=async(f,s,u=s.planner,extra={})=>{const p=await(await finance(f,s,u)).json();return close(f,s,u,{revision:p.revision,...extra});};

test('Planner alone permanently closes an ended closed event; bills include member/guest lines and no mail is sent',()=>local(async f=>{
 const s=await setup(f);await s.end();const notices=await f.sql('SELECT count(*) n FROM event_registration_notifications').first('n');
 const before=await finance(f,s,s.member,undefined,false);assert.deepEqual(await before.json(),{finalized:false});
 const preview=await(await finance(f,s,s.planner)).json();assert.equal(preview.dailyRateCents,7500);assert.equal(preview.participantDays,4);assert.equal(preview.bills.length,1);
 const result=await finalize(f,s);assert.equal(result.status,200,await result.clone().text());
 const own=await(await finance(f,s,s.member,undefined,false)).json();assert.equal(own.finalized,true);assert.equal(own.bill.totalCents,30000);assert.equal(own.bill.lines.length,2);assert.equal(own.bill.paid,0);
 const other=await(await finance(f,s,s.outsider,undefined,false)).json();assert.deepEqual(other,{finalized:true,bill:null});assert.equal(JSON.stringify(other).includes('Fictional Guest'),false);
 assert.equal(await f.sql('SELECT count(*) n FROM event_registration_notifications').first('n'),notices);
 assert.equal(await f.sql('SELECT count(*) n FROM event_activity WHERE fields=?',JSON.stringify(['finalization'])).first('n'),1);
},32));

test('closure retains complimentary days, locks instructions, and rounds upward to a half euro',()=>local(async f=>{
 const s=await setup(f);await s.end();const guest=(await s.read()).people.find(p=>p.kind==='Invited guest');
 assert.equal((await s.change(s.admin,'complimentary',{registrationId:guest.registrationId,personId:guest.id,complimentary:true})).status,200);
 assert.equal((await s.change(s.admin,'instructions',{paymentUrl:'https://betaalverzoek.rabobank.nl/betaalverzoek/?id=fictional',instructions:'Fictional bank reference'})).status,200);
 assert.equal((await finalize(f,s)).status,200);const bill=(await(await finance(f,s,s.member,undefined,false)).json()).bill;
 assert.equal(bill.totalCents,22500);assert.equal(bill.lines.find(l=>l.kind==='Invited guest').totalCents,0);assert.equal(bill.paymentUrl,'https://betaalverzoek.rabobank.nl/betaalverzoek/?id=fictional');assert.equal(bill.instructions,'Fictional bank reference');
 const denied=await s.change(s.admin,'instructions',{paymentUrl:'',instructions:'Changed'});assert.equal(denied.status,409);
 const days=await s.change(s.admin,'attendance',{registrationId:guest.registrationId,personId:guest.id,days:[]});assert.equal(days.status,409);
},32));

test('finalization requires early acknowledgement, exact name, nonzero attendance and staff authority',()=>local(async f=>{
 const s=await setup(f);assert.equal((await finalize(f,s)).status,409);
 assert.equal((await finalize(f,s,s.planner,{acknowledgeEarly:'yes'})).status,400);
 assert.equal((await finalize(f,s,s.planner,{acknowledgeEarly:true,confirmation:'wrong'})).status,400);assert.equal((await finance(f,s,s.member,{action:'finalize'})).status,403);
 for(const person of (await s.read()).people)assert.equal((await s.change(s.admin,'attendance',{registrationId:person.registrationId,personId:person.id,days:[]})).status,200);
 assert.equal((await finalize(f,s,s.planner,{acknowledgeEarly:true})).status,400);assert.equal(await f.sql('SELECT count(*) n FROM event_finalizations').first('n'),0);
},32));

test('one acknowledged early finish closes open registration and locks bills without email or date changes',()=>local(async f=>{
 const s=await setup(f),dates=await f.sql('SELECT starts_at,ends_at FROM event_management WHERE event_id=?',s.id).first();
 const notices=await f.sql('SELECT count(*) n FROM event_registration_notifications').first('n');
 assert.equal((await finalize(f,s,s.planner,{acknowledgeEarly:true})).status,200);
 assert.equal(await f.sql('SELECT registration_status FROM events WHERE id=?',s.id).first('registration_status'),'closed');
 assert.deepEqual(await f.sql('SELECT starts_at,ends_at FROM event_management WHERE event_id=?',s.id).first(),dates);
 assert.equal(await f.sql('SELECT participant_days FROM event_finalizations WHERE event_id=?',s.id).first('participant_days'),4);
 assert.equal(await f.sql('SELECT count(*) n FROM event_registration_notifications').first('n'),notices);
 const denied=await f.request('event-registration/'+s.id,s.member,{action:'save',revision:await f.sql('SELECT revision FROM event_management WHERE event_id=?',s.id).first('revision'),operationId:randomUUID(),draft:{days:s.days,guests:[s.guest]}},proof(s.member));assert.equal(denied.status,409);
},32));

test('ended events with registration still open finish without a separate Close registration action',()=>local(async f=>{
 const s=await setup(f);await f.sql('UPDATE event_management SET starts_at=1,ends_at=2 WHERE event_id=?',s.id).run();
 assert.equal((await finalize(f,s)).status,200);assert.equal(await f.sql('SELECT registration_status FROM events WHERE id=?',s.id).first('registration_status'),'closed');
},32));

test('early finish audit failure rolls back registration closure, revision and all bill locks',()=>local(async f=>{
 const s=await setup(f),revision=await f.sql('SELECT revision FROM event_management WHERE event_id=?',s.id).first('revision');
 await f.sql("CREATE TRIGGER reject_early_finish BEFORE INSERT ON event_activity WHEN json_extract(NEW.fields,'$[0]')='finalization' BEGIN SELECT RAISE(ABORT,'Fictional early finish failure'); END").run();
 assert.equal((await finalize(f,s,s.admin,{acknowledgeEarly:true})).status,503);
 assert.equal(await f.sql('SELECT registration_status FROM events WHERE id=?',s.id).first('registration_status'),'open');assert.equal(await f.sql('SELECT revision FROM event_management WHERE event_id=?',s.id).first('revision'),revision);
 assert.equal(await f.sql('SELECT count(*) n FROM event_finalizations').first('n'),0);assert.equal(await f.sql('SELECT count(*) n FROM event_bills').first('n'),0);
},32));

test('registration edit racing an early finish either wins first or is rejected; final bills never retain open registration',()=>local(async f=>{
 const s=await setup(f),preview=await(await finance(f,s)).json(),body={action:'finalize',revision:preview.revision,operationId:randomUUID(),confirmation:'Fictional review LAN',acknowledgeEarly:true};
 const responses=await Promise.all([finance(f,s,s.planner,body),f.request('event-registration/'+s.id,s.member,{action:'save',revision:preview.revision,operationId:randomUUID(),draft:{days:[s.days[0]],guests:[s.guest]}},proof(s.member))]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 if(responses[0].status===409){assert.equal(await f.sql('SELECT count(*) n FROM event_finalizations').first('n'),0);assert.equal((await finalize(f,s,s.planner,{acknowledgeEarly:true})).status,200);}
 const review=await s.read();assert.equal(await f.sql('SELECT registration_status FROM events WHERE id=?',s.id).first('registration_status'),'closed');assert.equal(await f.sql('SELECT participant_days FROM event_finalizations WHERE event_id=?',s.id).first('participant_days'),review.people.reduce((n,p)=>n+p.days.length,0));
},32));

test('concurrent closure, stale revisions and replay cannot duplicate bills or reprice an event',()=>local(async f=>{
 const s=await setup(f);await s.end();const p=await(await finance(f,s)).json(),body={action:'finalize',revision:p.revision,operationId:randomUUID(),confirmation:'Fictional review LAN'};
 const responses=await Promise.all([finance(f,s,s.planner,body),finance(f,s,s.planner,body)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 assert.equal((await finance(f,s,s.planner,body)).status,409);assert.equal(await f.sql('SELECT count(*) n FROM event_bills').first('n'),1);
 await assert.rejects(f.sql('UPDATE event_finalizations SET daily_rate_cents=50').run(),/permanent/);await assert.rejects(f.sql('UPDATE event_bills SET total_cents=1').run(),/immutable/);await assert.rejects(f.sql('UPDATE event_registration_control SET capacity=1').run(),/locked/);await assert.rejects(f.sql("UPDATE events SET registration_status='open' WHERE id=?",s.id).run(),/locked/);
 const reg=await f.request('event-participants/'+s.id,s.admin,{action:'open',revision:p.revision+1,operationId:randomUUID()},proof(s.admin));assert.equal(reg.status,409);
 const edit=await f.request('manage/events',s.admin,{action:'unpublish',id:s.id,revision:p.revision+1,operationId:randomUUID()},proof(s.admin));assert.equal(edit.status,409);
},32));

test('revocation at commit and failed audit roll back all finalization state',()=>local(async f=>{
 const s=await setup(f);await s.end();const preview=await(await finance(f,s,s.planner)).json();
 const revoked=await finance(f,s,s.planner,{action:'finalize',revision:preview.revision,operationId:randomUUID(),confirmation:'Fictional review LAN'},true,{'X-Fixture-Registration-Fence':'permission','X-Fixture-Actor':s.planner.id});assert.equal(revoked.status,409);
 assert.equal(await f.sql('SELECT count(*) n FROM event_finalizations').first('n'),0);
 await f.sql("CREATE TRIGGER fictional_finalization_audit BEFORE INSERT ON event_activity WHEN json_extract(NEW.fields,'$[0]')='finalization' BEGIN SELECT RAISE(ABORT,'Fictional audit failure'); END").run();
 assert.equal((await finalize(f,s,s.admin)).status,503);assert.equal(await f.sql('SELECT count(*) n FROM event_bills').first('n'),0);assert.equal(await f.sql('SELECT revision FROM event_management WHERE event_id=?',s.id).first('revision'),preview.revision);
 await f.sql('DROP TRIGGER fictional_finalization_audit').run();assert.equal((await finalize(f,s,s.admin)).status,200);
},32));

test('account erasure after closure scrubs bill identity but preserves locked totals and other accounts cannot read it',()=>local(async f=>{
 const s=await setup(f);await s.end();await f.sql("INSERT INTO user_roles(user_id,role_id,assigned_at) VALUES (?,'30000000-0000-4000-8000-000000000001',0)",s.member.id).run();assert.equal((await finalize(f,s,s.member)).status,200);const locked=await f.sql('SELECT participant_days,daily_rate_cents FROM event_finalizations WHERE event_id=?',s.id).first();
 await f.sql("INSERT INTO auth_recent_authentication(session_digest,user_id,auth_version,method,authenticated_at,expires_at) VALUES (?,?,0,'password',unixepoch(),unixepoch()+300)",s.member.digest,s.member.id).run();
 const deletion=await f.request('auth/lifecycle/delete',s.member,{confirm:'DELETE',acknowledged:true},{'X-CSRF-Token':s.member.csrf});assert.equal(deletion.status,200,await deletion.clone().text());
 const bill=await f.sql('SELECT owner_id,lines,total_cents FROM event_bills').first();assert.equal(bill.owner_id,null);assert.equal(bill.lines,'[]');assert.equal(bill.total_cents,30000);assert.equal(await f.sql('SELECT actor_id FROM event_finalizations').first('actor_id'),null);assert.deepEqual(await f.sql('SELECT participant_days,daily_rate_cents FROM event_finalizations WHERE event_id=?',s.id).first(),locked);
 assert.equal((await finance(f,s,s.member,undefined,false)).status,401);const other=(await(await finance(f,s,s.outsider,undefined,false)).json());assert.equal(other.bill,null);
},32));

test('deleted accounts before closure contribute no billable days; historical records remain separate',()=>local(async f=>{
 const s=await setup(f);await s.end();await f.sql("INSERT INTO auth_recent_authentication(session_digest,user_id,auth_version,method,authenticated_at,expires_at) VALUES (?,?,0,'password',unixepoch(),unixepoch()+300)",s.member.digest,s.member.id).run();assert.equal((await f.request('auth/lifecycle/delete',s.member,{confirm:'DELETE',acknowledged:true},{'X-CSRF-Token':s.member.csrf})).status,200);
 const p=await(await finance(f,s)).json();assert.equal(p.participantDays,0);assert.equal(p.bills.length,0);assert.equal((await finalize(f,s)).status,400);assert.equal(await f.sql('SELECT sum(total) n FROM anonymous_day_registrations').first('n'),4);assert.equal(await f.sql('SELECT count(*) n FROM event_bills').first('n'),0);
},32));

test('finance routes enforce proof, origin, CSRF and member-only own projections',()=>local(async f=>{
 const s=await setup(f);await s.end();assert.equal((await finance(f,s,null,undefined,false)).status,401);assert.equal((await finance(f,s,s.member,undefined,true)).status,403);
 assert.equal((await finance(f,s,s.admin,undefined,true,{'X-LAN-Session-Proof':''})).status,409);assert.equal((await finance(f,s,s.admin,{action:'finalize'},true,{'X-CSRF-Token':''})).status,403);assert.equal((await finance(f,s,s.admin,undefined,true,{Origin:'https://evil.example.test'})).status,403);
},32));


test('worked daily price examples cover rounding, 1/2/3 days, mixed Free and combined guest bills',()=>{
 const person=(owner,id,count,complimentary=false)=>({owner,id,name:id,kind:'Member',days:Array.from({length:count},(_,i)=>'2030-11-'+String(i+1).padStart(2,'0')),complimentary});
 const result=calculateEventBills(30000,[person('one','one',1),person('two','two',2),person('three','three',3),person('two','guest',1),person('free','free',11,true)]);
 assert.equal(result.participantDays,18);assert.equal(result.dailyRateCents,1700);assert.equal(result.bills.find(b=>b.owner==='one').totalCents,1700);assert.equal(result.bills.find(b=>b.owner==='two').totalCents,5100);assert.equal(result.bills.find(b=>b.owner==='three').totalCents,5100);assert.equal(result.bills.find(b=>b.owner==='free').totalCents,0);
 assert.equal(calculateEventBills(30000,[person('a','a',20)]).dailyRateCents,1500);assert.equal(calculateEventBills(0,[person('a','a',1)]).dailyRateCents,0);assert.equal(calculateEventBills(30001,[person('a','a',20)]).dailyRateCents,1550);
 const zero=calculateEventBills(30000,[]);assert.equal(zero.participantDays,0);assert.equal(zero.bills.length,0);assert.equal(Number.isFinite(zero.dailyRateCents),true);
});

test('a changed attendance review invalidates the previously previewed closure',()=>local(async f=>{
 const s=await setup(f);await s.end();const old=await(await finance(f,s)).json(),person=(await s.read()).people[0];
 assert.equal((await s.change(s.admin,'attendance',{registrationId:person.registrationId,personId:person.id,days:[]})).status,200);
 const response=await close(f,s,s.planner,{revision:old.revision});assert.equal(response.status,409);assert.equal(await f.sql('SELECT count(*) n FROM event_finalizations').first('n'),0);
},32));

test('0032 preserves populated registrations and grants, and a failed schema application rolls back',()=>local(async f=>{
 const s=await setup(f);await s.end();const registrations=(await f.sql('SELECT * FROM registrations ORDER BY id').all()).results,grants=(await f.sql('SELECT * FROM role_permissions ORDER BY role_id,permission_id').all()).results;
 await assert.rejects(f.migrate(32,["SELECT json('Fictional finalization schema failure')"]));assert.equal(await f.sql("SELECT count(*) n FROM sqlite_schema WHERE name='event_finalizations'").first('n'),0);
 await f.migrate(32);assert.deepEqual((await f.sql('SELECT * FROM registrations ORDER BY id').all()).results,registrations);assert.deepEqual((await f.sql('SELECT * FROM role_permissions ORDER BY role_id,permission_id').all()).results,grants);assert.equal(await f.sql('SELECT count(*) n FROM event_finalizations').first('n'),0);
 assert.equal((await finalize(f,s)).status,200);
},31));

test('deletion before closure removes days from pricing; deletion after closure preserves the locked five-day price',()=>local(async f=>{
 const s=await setup(f),former=await f.user();
 for(const [u,days] of [[s.outsider,[s.days[0]]],[former,s.days.slice(0,2)]]){
  const revision=await f.sql('SELECT revision FROM event_management WHERE event_id=?',s.id).first('revision');
  const response=await f.request('event-registration/'+s.id,u,{action:'save',revision,operationId:randomUUID(),draft:{days,guests:[]}},proof(u));assert.equal(response.status,200);
 }
 await s.end();const old=await(await finance(f,s)).json();assert.equal(old.participantDays,7);
 const erase=async u=>{await f.sql("INSERT INTO auth_recent_authentication(session_digest,user_id,auth_version,method,authenticated_at,expires_at) VALUES (?,?,0,'password',unixepoch(),unixepoch()+300)",u.digest,u.id).run();const response=await f.request('auth/lifecycle/delete',u,{confirm:'DELETE',acknowledged:true},{'X-CSRF-Token':u.csrf});assert.equal(response.status,200,await response.clone().text());};
 await erase(former);
 const preview=await(await finance(f,s)).json();assert.equal(preview.participantDays,5);assert.equal(preview.dailyRateCents,6000);assert.equal(preview.bills.reduce((n,b)=>n+b.totalCents,0),30000);
 assert.equal(await f.sql('SELECT sum(total) n FROM anonymous_day_registrations').first('n'),2);
 assert.equal((await close(f,s,s.planner,{revision:old.revision})).status,409);
 assert.equal((await finalize(f,s)).status,200);await erase(s.member);
 const final=await(await finance(f,s)).json();assert.equal(final.finalized,true);assert.equal(final.participantDays,5);assert.equal(final.dailyRateCents,6000);assert.equal(final.bills.reduce((n,b)=>n+b.totalCents,0),30000);
 const erased=final.bills.find(b=>b.owner===null);assert.equal(erased.totalCents,24000);assert.deepEqual(erased.lines,[]);
},32));


const payment=async(f,s,u,paid,extra={},headers={})=>{
 const data=await(await finance(f,s,s.admin)).json();
 return finance(f,s,u,{action:'payment',revision:data.revision,operationId:randomUUID(),billId:data.bills[0]?.id??randomUUID(),paid,...extra},true,headers);
};
const grantFinance=f=>f.sql("INSERT INTO role_permissions(role_id,permission_id,granted_at) SELECT '30000000-0000-4000-8000-000000000001',id,0 FROM permissions WHERE code='finance.manage'").run();

test('manual payment needs finalization and Planner plus Finance; combined bill toggles both ways with immutable amounts and no mail',()=>local(async f=>{
 const s=await setup(f);await s.end();assert.equal((await payment(f,s,s.admin,true)).status,409);assert.equal((await finalize(f,s)).status,200);
 assert.equal((await payment(f,s,s.planner,true)).status,403);assert.equal((await payment(f,s,s.member,true)).status,403);
 const before=await f.sql('SELECT lines,total_cents FROM event_bills').first(),notices=await f.sql('SELECT count(*) n FROM event_registration_notifications').first('n');
 await grantFinance(f);assert.equal((await(await finance(f,s,s.planner)).json()).canManagePayments,true);
 const current=await(await finance(f,s)).json(),body={action:'payment',revision:current.revision,operationId:randomUUID(),billId:current.bills[0].id,paid:true};
 assert.equal((await finance(f,s,s.planner,body)).status,200);assert.equal((await finance(f,s,s.planner,body)).status,409);
 assert.equal((await(await finance(f,s,s.member,undefined,false)).json()).bill.paid,1);
 assert.equal((await payment(f,s,s.planner,false)).status,200);assert.equal(await f.sql('SELECT paid FROM event_bills').first('paid'),0);
 assert.deepEqual(await f.sql('SELECT lines,total_cents FROM event_bills').first(),before);
 assert.deepEqual((await f.sql('SELECT was_paid,paid FROM event_bill_payment_activity ORDER BY sequence').all()).results,[{was_paid:0,paid:1},{was_paid:1,paid:0}]);
 assert.equal(await f.sql('SELECT count(*) n FROM event_registration_notifications').first('n'),notices);
},33));

test('payment mutation enforces CSRF, types, bill ownership, free/erased exclusions and older-schema compatibility',()=>local(async f=>{
 const s=await setup(f);await s.end();await finalize(f,s);
 assert.equal((await(await finance(f,s)).json()).canManagePayments,false);assert.equal((await payment(f,s,s.admin,true)).status,503);
 const old=await f.sql('SELECT * FROM event_bills').first();await assert.rejects(f.migrate(33,["SELECT json('Fictional payment migration failure')"]));assert.equal(await f.sql("SELECT count(*) n FROM sqlite_schema WHERE name='event_bill_payment_activity'").first('n'),0);
 await f.migrate(33);assert.deepEqual(await f.sql('SELECT * FROM event_bills').first(),old);
 assert.equal((await payment(f,s,s.admin,'yes')).status,400);assert.equal((await payment(f,s,s.admin,true,{billId:randomUUID()})).status,409);
 assert.equal((await payment(f,s,s.admin,true,{}, {'X-CSRF-Token':''})).status,403);
 assert.equal((await payment(f,s,s.admin,true,{}, {Origin:'https://evil.example.test'})).status,403);
 assert.equal((await finance(f,s,s.member,{action:'payment'},false)).status,405);
 await f.sql("UPDATE event_bills SET owner_id=NULL,lines='[]'").run();assert.equal((await payment(f,s,s.admin,true)).status,409);
 assert.equal(await f.sql('SELECT count(*) n FROM event_bill_payment_activity').first('n'),0);
},32));

test('zero-value bills have no payable status mutation',()=>local(async f=>{
 const s=await setup(f);await s.end();for(const p of(await s.read()).people)assert.equal((await s.change(s.admin,'complimentary',{registrationId:p.registrationId,personId:p.id,complimentary:true})).status,200);
 await finalize(f,s);assert.equal((await payment(f,s,s.admin,true)).status,409);assert.equal(await f.sql('SELECT paid FROM event_bills').first('paid'),0);
},33));

for(const fence of ['permission','session','generation'])test('payment commit rechecks '+fence+' without a partial audit',()=>local(async f=>{
 const s=await setup(f);await s.end();await finalize(f,s);await grantFinance(f);
 const headers={'X-Fixture-Registration-Fence':fence,'X-Fixture-Payment-Commit':'1','X-Fixture-Actor':s.planner.id,'X-Fixture-Digest':s.planner.digest};
 assert.equal((await payment(f,s,s.planner,true,{},headers)).status,409);assert.equal(await f.sql('SELECT paid FROM event_bills').first('paid'),0);assert.equal(await f.sql('SELECT count(*) n FROM event_bill_payment_activity').first('n'),0);
},33));

test('payment audit failure rolls back status and revision; concurrent updates reject stale state',()=>local(async f=>{
 const s=await setup(f);await s.end();await finalize(f,s);const before=await f.sql('SELECT revision FROM event_management WHERE event_id=?',s.id).first('revision');
 await f.sql("CREATE TRIGGER fictional_payment_audit BEFORE INSERT ON event_activity WHEN json_extract(NEW.fields,'$[0]')='payment' BEGIN SELECT RAISE(ABORT,'Fictional audit failure'); END").run();
 assert.equal((await payment(f,s,s.admin,true)).status,503);assert.equal(await f.sql('SELECT paid FROM event_bills').first('paid'),0);assert.equal(await f.sql('SELECT revision FROM event_management WHERE event_id=?',s.id).first('revision'),before);assert.equal(await f.sql('SELECT count(*) n FROM event_bill_payment_activity').first('n'),0);
 await f.sql('DROP TRIGGER fictional_payment_audit').run();
 const data=await(await finance(f,s)).json(),command=()=>({action:'payment',revision:data.revision,operationId:randomUUID(),billId:data.bills[0].id,paid:true});
 const responses=await Promise.all([finance(f,s,s.admin,command()),finance(f,s,s.admin,command())]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(await f.sql('SELECT count(*) n FROM event_bill_payment_activity').first('n'),1);
},33));


test('adjusted event rental feeds preview and final bills, remains private before finalization and locks afterwards',()=>local(async f=>{
 const s=await setup(f),row=await f.sql('SELECT starts_at,ends_at,revision FROM event_management WHERE event_id=?',s.id).first();
 const update={action:'update',operationId:randomUUID(),id:s.id,revision:row.revision,title:'Fictional review LAN',description:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Review'}]}]},startsAt:row.starts_at,endsAt:row.ends_at,minimumParticipants:1,maxGuests:2,rentalCents:20000};
 const change=await f.request('manage/events',s.admin,update,proof(s.admin));assert.equal(change.status,200,await change.clone().text());
 assert.deepEqual(await(await finance(f,s,s.member,undefined,false)).json(),{finalized:false});
 await s.end();const preview=await(await finance(f,s)).json();assert.equal(preview.rentalCents,20000);assert.equal(preview.dailyRateCents,5000);
 assert.equal((await finalize(f,s)).status,200);const bill=await(await finance(f,s,s.member,undefined,false)).json();assert.equal(bill.bill.totalCents,20000);
 const denied=await f.request('manage/events',s.admin,{...update,operationId:randomUUID(),rentalCents:0},proof(s.admin));assert.equal(denied.status,409);
 await assert.rejects(f.sql('UPDATE event_management SET rental_cents=0 WHERE event_id=?',s.id).run(),/locked/);
 assert.equal((await(await finance(f,s)).json()).dailyRateCents,5000);
},34));
