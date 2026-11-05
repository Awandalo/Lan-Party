import {finalizedEvent} from './event-finalization-data';
import {EventError,eventActor} from './event-data';
import {registrationSnapshot,registrationProjection} from './event-registration-data';
import {UUID} from './role-administration';

export async function reviewReady(db:D1Database){return !!await db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='event_review_activity'").first();}
export async function reviewSnapshot(db:D1Database,id:string,userId:string){
 const snapshot=await registrationSnapshot(db,id);
 const rows=await db.batch<Record<string,unknown>>([
  db.prepare('SELECT v.* FROM event_attendance_review v JOIN registrations r ON r.id=v.registration_id WHERE r.event_id=?').bind(id),
  db.prepare('SELECT id,user_id FROM registrations WHERE event_id=?').bind(id),
  db.prepare('SELECT payment_url,instructions FROM event_payment_instructions WHERE event_id=?').bind(id),
  db.prepare('SELECT excluded_people,added_people,deleted_accounts FROM event_review_anonymous WHERE event_id=?').bind(id),
  db.prepare('SELECT d.attendance_date AS day,v.excluded,v.added FROM event_review_anonymous_days v JOIN event_days d ON d.id=v.event_day_id WHERE d.event_id=?').bind(id),
  db.prepare('SELECT action,person_name AS personName,reason,detail,occurred_at AS occurredAt FROM event_review_activity WHERE event_id=? ORDER BY sequence DESC LIMIT 20').bind(id)
 ]);
 const projection=registrationProjection(snapshot,userId,true);
 const people=(projection.participants??[]).map(p=>{
  const registrationId=String(rows[1].results.find(r=>r.user_id===p.owner)!.id);
  const review=rows[0].results.find(r=>r.registration_id===registrationId&&r.person_id===p.id);
  const removed:string[]=review?JSON.parse(String(review.removed_days)):[];
  const added:string[]=review?JSON.parse(String(review.added_days)):[];
  const confirmed=p.places.filter(d=>d.status==='confirmed').map(d=>d.day);
  return {registrationId,owner:p.owner,id:p.id,name:p.name,kind:p.kind,confirmed,days:snapshot.state.days.filter(d=>confirmed.includes(d)&&!removed.includes(d)||added.includes(d)),complimentary:review?.complimentary===1};
 });
 const anonymousDays=projection.days.map(d=>({date:d.date,total:Math.max(0,Number((snapshot.meta.anonymousDays as Record<string,number>)[d.date]??0)-Number(rows[4].results.find(r=>r.day===d.date)?.excluded??0)+Number(rows[4].results.find(r=>r.day===d.date)?.added??0))}));
 return {snapshot,people,anonymousDays,deletedAccounts:Number(rows[3].results[0]?.deleted_accounts??0),
  anonymousPeople:Math.max(0,Number(snapshot.meta.anonymousTotal??0)-Number(rows[3].results[0]?.excluded_people??0)+Number(rows[3].results[0]?.added_people??0)),
  settings:rows[2].results[0]??{payment_url:'',instructions:''},activity:rows[5].results};
}
function boundedText(value:unknown,max:number){if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw new EventError(400,'Check the review fields');return value.trim();}
export async function writeReview(db:D1Database,id:string,userId:string,digest:string,raw:Record<string,unknown>){
 const action=String(raw.action),finance=['complimentary','instructions'].includes(action);
 const allowed=['action','revision','operationId','reason',...(action==='attendance'?['registrationId','personId','days']:action==='complimentary'?['registrationId','personId','complimentary']:action==='instructions'?['paymentUrl','instructions']:[])];
 if(!['attendance','complimentary','instructions'].includes(action)||Object.keys(raw).some(k=>!allowed.includes(k))||!Number.isSafeInteger(raw.revision)||!UUID.test(String(raw.operationId)))throw new EventError(400,'Invalid review request');
 const reason=boundedText(raw.reason,300);if(reason.length<3)throw new EventError(400,'Give a reason for this change');
 if(await finalizedEvent(db,id))throw new EventError(409,'This event is permanently finalized');
 const review=await reviewSnapshot(db,id,userId),{snapshot,people}=review;
 if(raw.revision!==snapshot.state.revision)throw new EventError(409,'Review changed. Reload before continuing');
 if(snapshot.meta.publication_status!=='published')throw new EventError(409,'This event cannot be reviewed');
 if(action==='attendance'&&(!snapshot.state.ended||snapshot.state.open))throw new EventError(409,'Review attendance after the event ends and registration is closed');
 const person=people.find(p=>p.registrationId===raw.registrationId&&p.id===raw.personId);
 if(action!=='instructions'&&!person)throw new EventError(400,'Participant not found');
 let removed:string[]=[],added:string[]=[],detail:object={},paymentUrl='',instructions='';
 if(action==='attendance'){
  if(!Array.isArray(raw.days)||raw.days.length>31||new Set(raw.days).size!==raw.days.length||!raw.days.every(d=>typeof d==='string'&&snapshot.state.days.includes(d)))throw new EventError(400,'Choose only valid event days');
  removed=person!.confirmed.filter(d=>!(raw.days as string[]).includes(d));added=(raw.days as string[]).filter(d=>!person!.confirmed.includes(d));detail={before:person!.days,after:raw.days};
 }else if(action==='complimentary'){
  if(typeof raw.complimentary!=='boolean')throw new EventError(400,'Choose Pay or Free');
  detail={before:person!.complimentary,after:raw.complimentary};
 }else{
  paymentUrl=boundedText(raw.paymentUrl,2048);instructions=boundedText(raw.instructions,2000);
  if(paymentUrl){let url:URL;try{url=new URL(paymentUrl);}catch{throw new EventError(400,'Use a full HTTPS Tikkie link');}
   if(url.protocol!=='https:'||url.hostname!=='tikkie.me'||url.username||url.password||url.port)throw new EventError(400,'Use an HTTPS tikkie.me payment link');}
  detail={fields:['payment instructions']};
 }
 const values:unknown[]=[id,raw.revision,userId,digest];if(finance)values.push(userId,digest);
 const guard=db.prepare(`UPDATE event_management SET revision=revision+1 WHERE event_id=? AND revision=? AND ${eventActor('events.manage_registrations')} ${finance?'AND '+eventActor('finance.manage'):''} AND EXISTS(SELECT 1 FROM events e WHERE e.id=event_id AND e.publication_status='published' ${action==='attendance'?"AND e.registration_status='closed' AND event_management.ends_at<=unixepoch()":''}) AND (SELECT count(*) FROM event_review_activity WHERE actor_id=? AND occurred_at>unixepoch()-600)<40`).bind(...values,userId);
 const statements=[guard,db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('Review conflict') END")];
 if(action==='attendance')statements.push(db.prepare(`INSERT INTO event_attendance_review(registration_id,person_id,removed_days,added_days) VALUES (?,?,?,?) ON CONFLICT(registration_id,person_id) DO UPDATE SET removed_days=excluded.removed_days,added_days=excluded.added_days`).bind(person!.registrationId,person!.id,JSON.stringify(removed),JSON.stringify(added)));
 if(action==='complimentary')statements.push(db.prepare(`INSERT INTO event_attendance_review(registration_id,person_id,complimentary) VALUES (?,?,?) ON CONFLICT(registration_id,person_id) DO UPDATE SET complimentary=excluded.complimentary`).bind(person!.registrationId,person!.id,raw.complimentary?1:0));
 if(action==='instructions')statements.push(db.prepare(`INSERT INTO event_payment_instructions(event_id,payment_url,instructions) VALUES (?,?,?) ON CONFLICT(event_id) DO UPDATE SET payment_url=excluded.payment_url,instructions=excluded.instructions`).bind(id,paymentUrl,instructions));
 statements.push(db.prepare('INSERT INTO event_review_activity(operation_id,event_id,actor_id,registration_id,person_id,person_name,action,reason,detail,occurred_at) VALUES (?,?,?,?,?,?,?,?,?,unixepoch())').bind(raw.operationId,id,userId,person?.registrationId??null,person?.id??null,person?.name??null,action,reason,JSON.stringify(detail)));
 try{await db.batch(statements);}catch(e){if(/malformed JSON|UNIQUE constraint/i.test(String(e)))throw new EventError(409,'Event or permission changed, change already saved, or review limit reached. Reload before trying again.');throw e;}
 return {revision:Number(raw.revision)+1};
}
