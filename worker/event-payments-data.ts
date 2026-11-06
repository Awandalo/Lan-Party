import {EventError,eventActor} from './event-data';
import {UUID} from './role-administration';

export async function paymentTrackingReady(db:D1Database){return !!await db.prepare("SELECT 1 FROM sqlite_schema WHERE name='event_bill_payment_activity' AND type='table'").first();}
export async function updateBillPayment(db:D1Database,id:string,userId:string,digest:string,raw:Record<string,unknown>){
 if(Object.keys(raw).some(k=>!['action','revision','operationId','billId','paid'].includes(k))||raw.action!=='payment'||!UUID.test(String(raw.operationId))||!UUID.test(String(raw.billId))||!Number.isSafeInteger(raw.revision)||typeof raw.paid!=='boolean')throw new EventError(400,'Invalid payment update');
 if(!await paymentTrackingReady(db))throw new EventError(503,'Payment tracking is awaiting its database migration');
 const paid=raw.paid?1:0;
 try{await db.batch([
  db.prepare(`UPDATE event_management SET revision=revision+1 WHERE event_id=? AND revision=? AND ${eventActor('events.manage_registrations')} AND ${eventActor('finance.manage')} AND EXISTS(SELECT 1 FROM event_bills b JOIN event_finalizations f ON f.event_id=b.event_id JOIN users u ON u.id=b.owner_id WHERE b.id=? AND b.event_id=event_management.event_id AND b.total_cents>0 AND b.paid<>?)`).bind(id,raw.revision,userId,digest,userId,digest,raw.billId,paid),
  db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('Payment conflict') END"),
  db.prepare('INSERT INTO event_bill_payment_activity(operation_id,event_id,bill_id,actor_id,was_paid,paid,occurred_at) SELECT ?,event_id,id,?,paid,?,unixepoch() FROM event_bills WHERE id=? AND event_id=?').bind(raw.operationId,userId,paid,raw.billId,id),
  db.prepare('UPDATE event_bills SET paid=? WHERE id=? AND event_id=?').bind(paid,raw.billId,id),
  db.prepare(`INSERT INTO event_activity(operation_id,occurred_at,actor_id,event_id,event_reference,event_title,operation,fields) SELECT ?,unixepoch(),?,id,id,title,'event.update','["payment"]' FROM events WHERE id=?`).bind(raw.operationId,userId,id)
 ]);}catch(e){if(/malformed JSON|UNIQUE constraint|Payment conflict/i.test(String(e)))throw new EventError(409,'Bill or permissions changed. Reload before changing payment status');throw e;}
 return {revision:Number(raw.revision)+1};
}
