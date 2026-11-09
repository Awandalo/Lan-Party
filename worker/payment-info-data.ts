import {paymentInfoText} from '../src/lib/payment-info';
import type {PaymentInfo,PaymentInfoPreview} from '../src/lib/payment-info';
import type {BillLine} from '../src/lib/event-billing';
import type {AuthenticationEnvironment} from './auth/http';
import {authOrigin,emailTransport,hostedDev} from './auth/environment';
import {EmailDeliveryError} from './auth/email';
import {assertDevEmailRecipient,DevEmailPolicyError,DevEmailBudgetExceeded} from './auth/dev-email';
import {emailAddress} from './auth/accounts';
import {EventError,eventActor} from './event-data';
import {finalizedEvent} from './event-finalization-data';
import {reviewSnapshot} from './event-review-data';
import {UUID} from './role-administration';

const authority=eventActor('events.manage_registrations')+' AND '+eventActor('finance.manage');
const BATCH_SIZE=5;
interface Recipient {key:string;billId:string;recipientKey:string;owner:string;name:string;email:string;kind:'Member'|'Invited guest';info:PaymentInfo;state:'ready'|'sending'|'sent'|'failed'|'unknown'}
export async function paymentInfoReady(db:D1Database){return !!await db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='event_payment_info_emails'").first();}
async function plan(db:D1Database,id:string,userId:string){
 if(!await paymentInfoReady(db))throw new EventError(503,'Payment emails are awaiting their database migration');
 const final=await finalizedEvent(db,id);if(!final)throw new EventError(409,'Finish the event before sending payment information');
 const review=await reviewSnapshot(db,id,userId);
 const bills=(await db.prepare(`SELECT b.id,b.owner_id,b.lines,b.total_cents,u.email,coalesce(n.nickname,'Member') AS name,p.draft FROM event_bills b JOIN users u ON u.id=b.owner_id LEFT JOIN user_nicknames n ON n.user_id=u.id JOIN registrations r ON r.event_id=b.event_id AND r.user_id=b.owner_id JOIN event_registration_parties p ON p.registration_id=r.id WHERE b.event_id=? AND u.status='active' AND u.email_verified_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM account_lifecycle WHERE user_id=u.id) ORDER BY b.id`).bind(id).all<Record<string,unknown>>()).results;
 const records=(await db.prepare('SELECT bill_id,recipient_key,state FROM event_payment_info_emails WHERE bill_id IN (SELECT id FROM event_bills WHERE event_id=?)').bind(id).all<{bill_id:string;recipient_key:string;state:Recipient['state']}>()).results;
 const recipients:Recipient[]=[];
 for(const bill of bills){
  const lines=JSON.parse(String(bill.lines)) as BillLine[],owner=String(bill.owner_id),billId=String(bill.id),name=String(bill.name);
  if(!lines.length)continue;
  const info:PaymentInfo={name,event:String(review.snapshot.meta.title),dailyRateCents:Number(final.daily_rate_cents),lines,totalCents:Number(bill.total_cents),paymentUrl:String(final.payment_url),instructions:String(final.instructions)};
  const add=(recipientKey:string,email:string,name:string,kind:Recipient['kind'],info:PaymentInfo)=>{recipients.push({key:billId+':'+recipientKey,billId,recipientKey,owner,email:emailAddress(email).toLowerCase(),name,kind,info,state:records.find(r=>r.bill_id===billId&&r.recipient_key===recipientKey)?.state??'ready'});};
  add('member',String(bill.email),name,'Member',info);
  const people=review.people.filter(p=>p.owner===owner&&p.days.length),draft=JSON.parse(String(bill.draft));
  for(let index=0;index<lines.length;index++){
   const line=lines[index],person=people[index];
   if(!person||person.kind!==line.kind||JSON.stringify(person.days)!==JSON.stringify(line.days))throw new EventError(409,'Bill details changed. Check the event before sending');
   if(line.kind!=='Invited guest')continue;
   const guest=draft.guests.find((g:{id:string})=>g.id===person.id);if(!guest?.email)continue;
   add('guest:'+index,guest.email,line.name,'Invited guest',{name:line.name,event:info.event,dailyRateCents:info.dailyRateCents,lines:[line],totalCents:line.totalCents,paymentUrl:'',instructions:'',responsibleMember:name});
  }
 }
 const encoded=new TextEncoder().encode(JSON.stringify(recipients.map(({key,email,info})=>({key,email,info}))));
 const previewToken=[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoded))].map(n=>n.toString(16).padStart(2,'0')).join('');
 return {revision:review.snapshot.state.revision,previewToken,missingInstructions:!final.payment_url&&!final.instructions,recipients};
}
function publicPreview(value:Awaited<ReturnType<typeof plan>>):PaymentInfoPreview{return {...value,recipients:value.recipients.map(({key,name,email,kind,info,state})=>({key,name,email,kind,text:paymentInfoText(info),state}))};}
export function paymentInfoSendBlock(request:Request,env:AuthenticationEnvironment,recipients:{email:string;state:string}[]){
 if(!hostedDev(request,env))return undefined;
 try{for(const recipient of recipients)if(['ready','failed'].includes(recipient.state))assertDevEmailRecipient(env,recipient.email);}
 catch(error){if(error instanceof DevEmailPolicyError)return 'DEV email sending is blocked: a recipient is not approved for DEV, or DEV email settings are unavailable. Check the recipient addresses. Nothing was sent by this action.';throw error;}
 return undefined;
}
export async function paymentInfoAction(request:Request,env:AuthenticationEnvironment,id:string,userId:string,digest:string,raw:Record<string,unknown>){
 if(!['payment-info-preview','send-payment-info'].includes(String(raw.action))||Object.keys(raw).some(k=>!['action','revision','operationId','previewToken','retryFailed'].includes(k))||!UUID.test(String(raw.operationId))||!Number.isSafeInteger(raw.revision))throw new EventError(400,'Invalid payment email request');
 const value=await plan(env.DB,id,userId);
 const check=()=>env.DB.prepare(`SELECT 1 FROM event_management WHERE event_id=? AND revision=? AND ${authority}`).bind(id,raw.revision,userId,digest,userId,digest).first();
 if(value.revision!==raw.revision||!await check())throw new EventError(409,'Event or permissions changed. Review again before sending');
 if(raw.action==='payment-info-preview')return {...publicPreview(value),sendBlockedReason:paymentInfoSendBlock(request,env,value.recipients)};
 if(raw.previewToken!==value.previewToken||typeof raw.retryFailed!=='boolean')throw new EventError(409,'Recipient or bill details changed. Preview again before sending');
 // Each confirmed click covers this immutable content/recipient set. Small chunks
 // keep one slow provider from exhausting Worker/request limits; never auto-retry.
 const pending=value.recipients.filter(r=>r.state===(raw.retryFailed?'failed':'ready')).slice(0,BATCH_SIZE);
 if(!pending.length)return {revision:value.revision,remaining:0};
 const blocked=paymentInfoSendBlock(request,env,value.recipients.filter(r=>r.state===(raw.retryFailed?'failed':'ready')));
 if(blocked)throw new EventError(403,blocked);
 const statements=[env.DB.prepare(`UPDATE event_management SET revision=revision+1 WHERE event_id=? AND revision=? AND ${authority}`).bind(id,raw.revision,userId,digest,userId,digest),env.DB.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('Payment email conflict') END")];
 for(const r of pending){
  statements.push(env.DB.prepare(`INSERT INTO event_payment_info_emails(bill_id,recipient_key,state,attempt,operation_id,updated_at) VALUES (?,?,'sending',1,?,unixepoch()) ON CONFLICT(bill_id,recipient_key) DO UPDATE SET state='sending',attempt=attempt+1,operation_id=excluded.operation_id,provider_id=NULL,updated_at=unixepoch() WHERE state='failed' AND ?=1`).bind(r.billId,r.recipientKey,raw.operationId,raw.retryFailed?1:0),env.DB.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('Payment email conflict') END"));
 }
 statements.push(env.DB.prepare(`INSERT INTO event_activity(operation_id,occurred_at,actor_id,event_id,event_reference,event_title,operation,fields) SELECT ?,unixepoch(),?,id,id,title,'event.update','["payment-info email"]' FROM events WHERE id=?`).bind(raw.operationId,userId,id));
 try{await env.DB.batch(statements);}catch(e){if(/malformed JSON|UNIQUE|Payment email conflict/.test(String(e)))throw new EventError(409,'Payment email request changed or was already processed. Check again');throw e;}
 let stopped=false;
 for(const r of pending){
  let state:'sent'|'failed'|'unknown'='unknown',providerId:string|null=null;
  try{
   if(stopped){state='failed';}else{
   // Recheck the sender and recipient after claiming, immediately before disclosure.
   const live=await env.DB.prepare(`SELECT 1 FROM event_bills b JOIN users u ON u.id=b.owner_id WHERE b.id=? AND b.owner_id=? AND u.status='active' AND u.email_verified_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM account_lifecycle WHERE user_id=u.id) AND ${authority}`).bind(r.billId,r.owner,userId,digest,userId,digest).first();
   if(!live){state='failed';}else{
    const current=await plan(env.DB,id,userId),recipient=current.recipients.find(p=>p.key===r.key);
    if(!recipient||current.previewToken!==value.previewToken){state='failed';}else{
     const receipt=await emailTransport(request,env).send({to:r.email,url:authOrigin(request,env).origin+'/events/'+id+'/registration',expiresAt:Math.floor(Date.now()/1000)+86400,idempotencyKey:String(raw.operationId)+':'+r.key,purpose:'event-payment',paymentInfo:r.info});
     providerId=receipt?.id??null;state='sent';
    }
   }
   }
  }catch(e){state=e instanceof EmailDeliveryError?e.outcome:e instanceof DevEmailPolicyError||e instanceof DevEmailBudgetExceeded?'failed':'unknown';}
  if(state!=='sent')stopped=true;
  await env.DB.prepare("UPDATE event_payment_info_emails SET state=?,provider_id=?,updated_at=unixepoch() WHERE bill_id=? AND recipient_key=? AND operation_id=? AND state='sending'").bind(state,providerId,r.billId,r.recipientKey,raw.operationId).run();
 }
 // Keep the response aggregate-only. Provider diagnostics stay outside the product.
 return {revision:Number(raw.revision)+1,stopped,remaining:value.recipients.filter(r=>r.state===(raw.retryFailed?'failed':'ready')).length-pending.length};
}
