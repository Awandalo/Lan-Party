import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {local} from './helpers/role-fixture.mjs';
import {paymentExample,proof} from './helpers/payment-info-fixture.mjs';

test('skip at early finalization persists across reads and blocks member/guest previews, sends and retries without changing bills',()=>local(async f=>{
 const s=await paymentExample(f),before=await(await s.call()).json();
 assert.equal(before.canSkipPaymentEmails,true);
 const response=await s.command('finalize',{confirmation:'Fictional payment info LAN',acknowledgeEarly:true,skipPaymentEmails:true},s.planner);
 assert.equal(response.status,200,await response.clone().text());
 const final=await(await s.call()).json();assert.equal(final.skipPaymentEmails,true);assert.equal(final.canManagePayments,true);
 assert.deepEqual(final.bills.map(b=>({lines:b.lines,total:b.totalCents})),before.bills.map(b=>({lines:b.lines,total:b.totalCents})));
 assert.equal(await f.sql('SELECT registration_status FROM events WHERE id=?',s.id).first('registration_status'),'closed');
 assert.equal((await s.review()).skipPaymentEmails,true);
 const member=await f.request('event-finance/'+s.id,s.member,undefined,proof(s.member));assert.equal(member.status,200);assert.equal((await member.json()).bill.totalCents,30000);
 for(const body of [{action:'payment-info-preview'},{action:'send-payment-info',previewToken:'stale',retryFailed:false},{action:'send-payment-info',previewToken:'stale',retryFailed:true}]){
  const denied=await s.command(body.action,body);assert.equal(denied.status,409);assert.match((await denied.json()).error,/emails were skipped/);
 }
 assert.equal((await s.command('payment-info-preview',{},s.member)).status,403);
 assert.deepEqual(await s.mails(),[]);assert.equal(await f.sql('SELECT count(*) n FROM event_payment_info_emails').first('n'),0);
 await assert.rejects(f.sql('UPDATE event_finalizations SET skip_payment_emails=0 WHERE event_id=?',s.id).run(),/permanent/);
 assert.equal((await s.command('payment',{billId:final.bills[0].id,paid:true})).status,200);
 assert.equal((await(await s.call()).json()).skipPaymentEmails,true);
},41));

test('normal finalization retains explicit preview/send behavior; malformed skip and missing CSRF cannot close an event',()=>local(async f=>{
 const s=await paymentExample(f),base={confirmation:'Fictional payment info LAN',acknowledgeEarly:true};
 for(const skipPaymentEmails of ['true',1,null])assert.equal((await s.command('finalize',{...base,skipPaymentEmails})).status,400);
 assert.equal((await s.command('finalize',{...base,skipPaymentEmails:true},s.admin,{'X-CSRF-Token':''})).status,403);
 assert.equal(await f.sql('SELECT count(*) n FROM event_finalizations').first('n'),0);
 assert.equal((await s.command('finalize',{...base,skipPaymentEmails:false})).status,200);
 assert.equal((await(await s.call()).json()).skipPaymentEmails,false);assert.deepEqual(await s.mails(),[]);
 assert.equal((await s.send(await s.preview())).status,200);assert.equal((await s.mails()).length,2);
},41));

test('skip choice rolls back together with failed finalization audit, bills and registration closure',()=>local(async f=>{
 const s=await paymentExample(f),revision=await s.revision();
 await f.sql("CREATE TRIGGER reject_skipped_finish BEFORE INSERT ON event_activity WHEN json_extract(NEW.fields,'$[0]')='finalization' BEGIN SELECT RAISE(ABORT,'Fictional closure failure'); END").run();
 assert.equal((await s.command('finalize',{confirmation:'Fictional payment info LAN',acknowledgeEarly:true,skipPaymentEmails:true})).status,503);
 assert.equal(await s.revision(),revision);assert.equal(await f.sql('SELECT registration_status FROM events WHERE id=?',s.id).first('registration_status'),'open');
 assert.equal(await f.sql('SELECT count(*) n FROM event_finalizations').first('n'),0);assert.equal(await f.sql('SELECT count(*) n FROM event_bills').first('n'),0);assert.deepEqual(await s.mails(),[]);
},41));

test('0041 preserves existing finalizations, bills, registrations and grants, rolls back on failure and defaults old events to normal email behavior',()=>local(async f=>{
 const s=await paymentExample(f),revision=await s.revision();
 assert.equal((await(await s.call()).json()).canSkipPaymentEmails,false);
 assert.equal((await s.command('finalize',{confirmation:'Fictional payment info LAN',acknowledgeEarly:true,skipPaymentEmails:true})).status,503);assert.equal(await s.revision(),revision);
 await s.finalize();const tables=['event_finalizations','event_bills','registrations','role_permissions','event_payment_info_emails','event_activity'];
 const rows=async()=>Object.fromEntries(await Promise.all(tables.map(async name=>[name,(await f.sql('SELECT * FROM '+name+' ORDER BY rowid').all()).results])));
 const before=await rows();await assert.rejects(f.migrate(41,["SELECT json('Fictional migration failure')"]));assert.deepEqual(await rows(),before);
 await f.migrate(41);const after=await rows();assert.equal(after.event_finalizations[0].skip_payment_emails,0);delete after.event_finalizations[0].skip_payment_emails;assert.deepEqual(after,before);
 assert.equal((await(await s.call()).json()).skipPaymentEmails,false);assert.equal((await s.preview()).recipients.length,2);
 await assert.rejects(f.sql('UPDATE event_finalizations SET skip_payment_emails=1 WHERE event_id=?',s.id).run(),/permanent/);
 await assert.rejects(f.sql('UPDATE event_bills SET total_cents=1 WHERE event_id=?',s.id).run(),/immutable/);
 const schema=await f.sql("SELECT sql FROM sqlite_schema WHERE name='event_finalization_email_choice_locked'").first('sql');assert.ok(schema.includes('skip_payment_emails'));
},40));
