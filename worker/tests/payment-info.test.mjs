import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {local} from './helpers/role-fixture.mjs';
import {paymentExample,proof} from './helpers/payment-info-fixture.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const policyBundle=await build({stdin:{resolveDir:process.cwd(),contents:"export {paymentInfoAction,paymentInfoSendBlock} from './worker/payment-info-data';export {EventError} from './worker/event-data';"},bundle:true,format:'esm',platform:'node',write:false});
const {paymentInfoAction,paymentInfoSendBlock,EventError}=await import('data:text/javascript;base64,'+Buffer.from(policyBundle.outputFiles[0].text).toString('base64'));

test('preview uses locked daily rate, administrator-corrected day counts and private guest-only information',()=>local(async f=>{
 const s=await paymentExample(f);assert.equal((await s.command('payment-info-preview')).status,409);
 await s.finalize();assert.deepEqual(await s.mails(),[]);
 const p=await s.preview();assert.equal(p.recipients.length,2);assert.equal(p.recipients[0].kind,'Member');
 assert.match(p.recipients[0].text,/Daily price: €\s100,00/);assert.match(p.recipients[0].text,/Pixel Alice — 2 days/);assert.match(p.recipients[0].text,/Guest Nova — 1 day/);assert.match(p.recipients[0].text,/Combined total: €\s300,00/);
 assert.match(p.recipients[1].text,/Your share: €\s100,00/);assert.equal(p.recipients[1].text.includes('300,00'),false);assert.equal(p.recipients[1].text.includes('tikkie.me'),false);assert.equal(p.recipients[1].text.includes('bank reference'),false);
 assert.equal((await s.send(p)).status,200);const mails=await s.mails();assert.equal(mails.length,2);assert.equal(mails[1].paymentInfo.lines.length,1);assert.equal(mails[1].paymentInfo.responsibleMember,'Pixel Alice');
 assert.deepEqual((await f.sql('SELECT state,provider_id FROM event_payment_info_emails').all()).results.map(r=>[r.state,!!r.provider_id]),[['sent',true],['sent',true]]);
 assert.equal((await s.send(await s.preview())).status,200);assert.equal((await s.mails()).length,2);
},35));

test('only Planner plus Finance may preview/send; proof, origin, CSRF, stale revisions and preview changes are rejected',()=>local(async f=>{
 const s=await paymentExample(f);await s.finalize();
 for(const u of [s.member,s.outsider,s.planner,null])assert.ok([401,403].includes((await s.command('payment-info-preview',{},u)).status));
 const p=await s.preview();
 assert.equal((await s.call(s.admin,{action:'send-payment-info',revision:p.revision,operationId:randomUUID(),previewToken:p.previewToken,retryFailed:false},{'X-CSRF-Token':''})).status,403);
 assert.equal((await s.call(s.admin,undefined,{Origin:'https://evil.example.test'})).status,403);
 assert.equal((await s.send(p,{previewToken:'tampered'})).status,409);
 assert.equal((await s.send(p,{to:'outsider@example.test'})).status,400);
 await f.sql("UPDATE users SET email='new@example.test',email_normalized='new@example.test' WHERE id=?",s.member.id).run();assert.equal((await s.send(p)).status,409);assert.deepEqual(await s.mails(),[]);
},35));

test('concurrent send clicks claim recipients once, while a changed or replayed operation cannot resend',()=>local(async f=>{
 const s=await paymentExample(f);await s.finalize();const p=await s.preview(),body={action:'send-payment-info',revision:p.revision,operationId:randomUUID(),previewToken:p.previewToken,retryFailed:false};
 const results=await Promise.all([s.call(s.admin,body),s.call(s.admin,body)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await s.mails()).length,2);
 assert.equal((await s.call(s.admin,body)).status,409);assert.equal((await s.mails()).length,2);
},35));

test('confirmed rejection needs an explicit failed-only retry; uncertain sends are never retried',()=>local(async f=>{
 const s=await paymentExample(f);await s.finalize();assert.equal((await s.send(await s.preview(),{},{'X-Fixture-Payment-Outcome':'failed'})).status,200);
 assert.equal((await s.mails()).length,1);assert.ok((await s.preview()).recipients.every(r=>r.state==='failed'));
 await s.send(await s.preview(),{},{'X-Fixture-Payment-Outcome':'sent'});assert.equal((await s.mails()).length,1);
 await s.send(await s.preview(),{retryFailed:true});assert.equal((await s.mails()).length,3);assert.ok((await s.preview()).recipients.every(r=>r.state==='sent'));
},35));
test('unknown first send remains blocked while proven-unsent recipients can be retried without duplicating it',()=>local(async f=>{
 const s=await paymentExample(f);await s.finalize();await s.send(await s.preview(),{},{'X-Fixture-Payment-Outcome':'unknown'});
 assert.deepEqual((await s.preview()).recipients.map(r=>r.state),['unknown','failed']);assert.equal((await s.mails()).length,1);
 await s.send(await s.preview(),{retryFailed:true},{'X-Fixture-Payment-Outcome':'sent'});assert.equal((await s.mails()).length,2);assert.deepEqual((await s.preview()).recipients.map(r=>r.state),['unknown','sent']);
},35));
test('blank optional instructions have an honest fallback; missing migration fails closed without modifying final bills',()=>local(async f=>{
 const s=await paymentExample(f);await s.finalize({instructions:'',paymentUrl:''});const before=(await f.sql('SELECT lines,total_cents FROM event_bills').all()).results;
 const p=await s.preview();assert.equal(p.missingInstructions,true);assert.match(p.recipients[0].text,/Contact the organizer/);await s.send(p);
 assert.deepEqual((await f.sql('SELECT lines,total_cents FROM event_bills').all()).results,before);
 await f.sql('DROP TABLE event_payment_info_emails').run();assert.equal((await s.command('payment-info-preview')).status,503);
},35));
test('one crew projection uses explicit corrected selections before or after finalization and never reveals guest/contact details',()=>local(async f=>{
 const s=await paymentExample(f),crew=async u=>{const r=await f.request('event-registration/'+s.id,u,undefined,proof(u));return {status:r.status,data:await r.json()};};
 let seen=await crew(s.outsider);assert.deepEqual(seen.data.crew[0].days,s.days);assert.equal(JSON.stringify(seen.data.crew).includes('Guest Nova'),false);
 await s.end();const person=(await s.review()).people.find(p=>p.id===s.member.id);await s.edit(person,[s.days[2]]);
 seen=await crew(s.outsider);assert.deepEqual(seen.data.crew[0].days,[s.days[2]]);assert.equal(seen.data.finalized,undefined);assert.equal(JSON.stringify(seen.data.crew).includes('@'),false);assert.equal((await crew(null)).status,401);
 await s.edit(person,[]);assert.deepEqual((await crew(s.outsider)).data.crew,[]);
},35));

test('larger confirmed recipient sets continue in bounded chunks without resending the first chunk',()=>local(async f=>{
 const s=await paymentExample(f);
 for(let index=0;index<2;index++){
  const member=await f.user();
  const response=await f.request('event-registration/'+s.id,member,{action:'save',revision:await s.revision(),operationId:randomUUID(),draft:{days:[s.days[0]],guests:[{id:randomUUID(),name:'Fictional Guest '+index,email:'guest'+index+'@example.test',days:[s.days[0]]}]}},proof(member));assert.equal(response.status,200,await response.clone().text());
 }
 await s.finalize();const p=await s.preview();assert.equal(p.recipients.length,6);
 const first=await s.send(p);assert.equal(first.status,200);assert.equal((await first.json()).remaining,1);assert.equal((await s.mails()).length,5);
 const next=await s.preview();assert.equal(next.previewToken,p.previewToken);assert.equal(next.recipients.filter(r=>r.state==='ready').length,1);
 assert.equal((await s.send(next)).status,200);assert.equal((await s.mails()).length,6);assert.equal(new Set((await s.mails()).map(m=>m.idempotencyKey)).size,6);
},35));

test('failed audit rolls back claims/revision before sending; deactivated owners and their guests are excluded',()=>local(async f=>{
 const s=await paymentExample(f);await s.finalize();const p=await s.preview();
 await f.sql("CREATE TRIGGER reject_payment_audit BEFORE INSERT ON event_activity BEGIN SELECT RAISE(ABORT,'Fictional audit failure'); END").run();
 assert.equal((await s.send(p)).status,503);assert.equal(await s.revision(),p.revision);assert.equal(await f.sql('SELECT count(*) FROM event_payment_info_emails').first('count(*)'),0);assert.deepEqual(await s.mails(),[]);
 await f.sql('DROP TRIGGER reject_payment_audit').run();await f.sql("UPDATE users SET status='disabled' WHERE id=?",s.member.id).run();
 assert.equal((await s.send(p)).status,409);assert.deepEqual((await s.preview()).recipients,[]);assert.deepEqual(await s.mails(),[]);
},35));

test('hosted DEV previews explain blocked guests/settings and reject the entire send before any claim or provider attempt',()=>local(async f=>{
 const s=await paymentExample(f);await s.finalize();const revision=await s.revision(),request=new Request('https://dev.lan-party.club/api/event-finance/'+s.id+'/manage');
 const address=await f.sql('SELECT email FROM users WHERE id=?',s.member.id).first('email');
 const env={DB:f.db,AUTH_ENVIRONMENT:'dev',AUTH_EMAIL_TRANSPORT:'resend',AUTH_PUBLIC_ORIGIN:'https://dev.lan-party.club',AUTH_DEV_RECIPIENT_ALLOWLIST:JSON.stringify([address])};
 const action=(body,settings=env)=>paymentInfoAction(request,settings,s.id,s.admin.id,s.admin.digest,{revision,operationId:randomUUID(),...body});
 const preview=await action({action:'payment-info-preview'});assert.equal(preview.recipients.length,2);assert.match(preview.sendBlockedReason,/recipient is not approved for DEV/);assert.equal(preview.sendBlockedReason.includes(address),false);assert.equal(preview.sendBlockedReason.includes('Finalization'),false);
 await assert.rejects(action({action:'send-payment-info',previewToken:preview.previewToken,retryFailed:false}),e=>e instanceof EventError&&e.status===403&&e.message===preview.sendBlockedReason);
 assert.equal(await s.revision(),revision);assert.equal(await f.sql('SELECT count(*) n FROM event_payment_info_emails').first('n'),0);assert.equal(await f.sql('SELECT count(*) n FROM auth_email_daily_budget').first('n'),0);assert.deepEqual(await s.mails(),[]);
 const unavailable=await action({action:'payment-info-preview'},{...env,AUTH_DEV_RECIPIENT_ALLOWLIST:undefined});assert.match(unavailable.sendBlockedReason,/settings are unavailable/);
 const allowed=await action({action:'payment-info-preview'},{...env,AUTH_DEV_RECIPIENT_ALLOWLIST:JSON.stringify([address,s.guest.email])});assert.equal(allowed.sendBlockedReason,undefined);
 assert.equal(paymentInfoSendBlock(request,env,[{email:s.guest.email,state:'sent'},{email:s.guest.email,state:'unknown'}]),undefined);
},35));
