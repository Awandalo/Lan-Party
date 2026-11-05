import {EventError,eventActor} from './event-data';
import {reviewSnapshot} from './event-review-data';
import {calculateEventBills} from '../src/lib/event-billing';
import {UUID} from './role-administration';

export async function finalizationReady(db:D1Database){return !!await db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='event_finalizations'").first();}
export async function finalizedEvent(db:D1Database,id:string){return await finalizationReady(db)?db.prepare('SELECT * FROM event_finalizations WHERE event_id=?').bind(id).first<Record<string,unknown>>():null;}
export async function closurePreview(db:D1Database,id:string,userId:string){
 const review=await reviewSnapshot(db,id,userId);
 if(review.snapshot.meta.publication_status!=='published')throw new EventError(409,'Only a published event can be finalized');
 const summary=calculateEventBills(Number(review.snapshot.meta.rental_cents),review.people);
 const validDays=new Set(review.snapshot.state.days);
 if(review.people.some(p=>p.days.some(d=>!validDays.has(d))))throw new EventError(409,'Resolve invalid attendance days before finalizing');
 return {review,summary};
}
export async function finalizeEvent(db:D1Database,id:string,userId:string,digest:string,raw:Record<string,unknown>){
 if(Object.keys(raw).some(k=>!['action','revision','operationId','confirmation'].includes(k))||raw.action!=='finalize'||!UUID.test(String(raw.operationId))||!Number.isSafeInteger(raw.revision))throw new EventError(400,'Invalid finalization request');
 const {review,summary}=await closurePreview(db,id,userId),{snapshot}=review;
 if(await finalizedEvent(db,id))throw new EventError(409,'This event is already permanently finalized');
 if(snapshot.state.revision!==raw.revision)throw new EventError(409,'Attendance changed. Review the latest totals before finalizing');
 if(!snapshot.state.ended||snapshot.state.open)throw new EventError(409,'Finalize after the event ends and registration is closed');
 if(raw.confirmation!==snapshot.meta.title)throw new EventError(400,'Enter the exact event name to confirm permanent closure');
 if(!summary.participantDays)throw new EventError(400,'At least one retained participant-day is required');
 const bills=summary.bills.map(b=>({...b,id:crypto.randomUUID()}));
 try{await db.batch([
  db.prepare(`UPDATE event_management SET revision=revision+1 WHERE event_id=? AND revision=? AND ends_at<=unixepoch() AND ${eventActor('events.manage_registrations')} AND EXISTS(SELECT 1 FROM events e WHERE e.id=event_id AND e.publication_status='published' AND e.registration_status='closed') AND NOT EXISTS(SELECT 1 FROM event_finalizations f WHERE f.event_id=event_management.event_id)`).bind(id,raw.revision,userId,digest),
  db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('Finalization conflict') END"),
  db.prepare('INSERT INTO event_finalizations(event_id,operation_id,actor_id,closed_at,rental_cents,participant_days,daily_rate_cents,payment_url,instructions) VALUES (?,?,?,unixepoch(),?,?,?,?,?)').bind(id,raw.operationId,userId,summary.rentalCents,summary.participantDays,summary.dailyRateCents,String(review.settings.payment_url),String(review.settings.instructions)),
  db.prepare(`INSERT INTO event_bills(id,event_id,owner_id,lines,total_cents) SELECT json_extract(value,'$.id'),?,json_extract(value,'$.owner'),json_extract(value,'$.lines'),json_extract(value,'$.totalCents') FROM json_each(?)`).bind(id,JSON.stringify(bills)),
  db.prepare("INSERT INTO event_activity(operation_id,occurred_at,actor_id,event_id,event_reference,event_title,operation,fields) VALUES (?,unixepoch(),?,?,?,?,'event.update','[\"finalization\"]')").bind(raw.operationId,userId,id,id,String(snapshot.meta.title))
 ]);}catch(e){if(/malformed JSON|UNIQUE constraint|Finalization conflict/i.test(String(e)))throw new EventError(409,'Event or permissions changed. Review again before finalizing');throw e;}
 return {revision:snapshot.state.revision+1};
}
