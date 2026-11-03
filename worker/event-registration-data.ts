import {changeRegistration,ownPlaces} from '../src/lib/registration-allocation';
import type {PreviewCommand,PreviewRegistrationState,Party,Group} from '../src/lib/registration-allocation';
import type {RegistrationDraft} from '../src/lib/event-registration';
import {EventError,eventActor} from './event-data';
import {mfaSessionCondition} from './auth/mfa-session';
import {UUID} from './role-administration';
import {emailAddress} from './auth/accounts';

export async function registrationReady(db:D1Database){return !!await db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='event_registration_notifications'").first();}
export interface RegistrationSnapshot {state:PreviewRegistrationState;meta:Record<string,unknown>;members:{id:string;name:string}[]}
export async function registrationSnapshot(db:D1Database,id:string):Promise<RegistrationSnapshot>{
 const result=await db.batch<Record<string,unknown>>([
  db.prepare(`SELECT m.*,e.title,e.publication_status,e.registration_status,c.sequence,unixepoch() AS now,coalesce((SELECT total FROM anonymous_event_registrations WHERE event_id=e.id),0) AS anonymousTotal FROM event_management m JOIN events e ON e.id=m.event_id JOIN event_registration_control c ON c.event_id=m.event_id WHERE e.id=?`).bind(id),
  db.prepare(`SELECT r.id,r.user_id,r.status,p.draft,CASE WHEN u.status='active' THEN coalesce(n.nickname,'Member') ELSE 'Deactivated user' END AS name FROM registrations r JOIN users u ON u.id=r.user_id LEFT JOIN event_registration_parties p ON p.registration_id=r.id LEFT JOIN user_nicknames n ON n.user_id=r.user_id WHERE r.event_id=? ORDER BY r.id`).bind(id),
  db.prepare(`SELECT r.user_id,d.attendance_date AS day,p.person_id,p.state,p.queue_sequence FROM event_registration_places p JOIN registrations r ON r.id=p.registration_id JOIN event_days d ON d.id=p.event_day_id WHERE p.event_id=? AND r.status='registered' ORDER BY p.queue_sequence,p.person_id`).bind(id),
  db.prepare('SELECT d.attendance_date AS day,coalesce(a.total,0) AS anonymous FROM event_days d LEFT JOIN anonymous_day_registrations a ON a.event_day_id=d.id WHERE d.event_id=? ORDER BY d.attendance_date').bind(id)
 ]);
 const meta=result[0].results[0];if(!meta)throw new EventError(404,'Event not found');
 meta.anonymousDays=Object.fromEntries(result[3].results.map(d=>[String(d.day),Number(d.anonymous)]));
 if(result[1].results.some(p=>p.draft===null))throw new EventError(503,'Registration history needs review before activation');
 const parties:Party[]=result[1].results.map(p=>({...JSON.parse(String(p.draft)),owner:String(p.user_id),active:p.status==='registered'}));
 const confirmed:Group[]=[],waiting:Group[]=[];
 for(const row of result[2].results){const list=row.state==='confirmed'?confirmed:waiting;let group=list.find(g=>g.owner===row.user_id&&g.day===row.day&&g.sequence===row.queue_sequence);if(!group){group={owner:String(row.user_id),day:String(row.day),sequence:Number(row.queue_sequence),people:[]};list.push(group);}group.people.push(String(row.person_id));}
 const state:PreviewRegistrationState={revision:Number(meta.revision),sequence:Number(meta.sequence),open:meta.registration_status==='open',ended:Number(meta.ends_at)<=Number(meta.now),cancelled:meta.publication_status==='cancelled',capacity:Number(meta.capacity),days:result[3].results.map(r=>String(r.day)),maxGuests:Number(meta.max_guests),parties,confirmed,waiting,notices:[]};
 return {meta,state,members:result[1].results.map(p=>({id:String(p.user_id),name:String(p.name)}))};
}
export function registrationProjection(snapshot:RegistrationSnapshot,userId:string,manager=false){
 const {state,meta,members}=snapshot,party=state.parties.find(p=>p.owner===userId),places=ownPlaces(state,userId);
 const crew=members.flatMap(m=>{const days=state.days.filter(day=>state.confirmed.some(g=>g.owner===m.id&&g.day===day&&g.people.includes(m.id)));return days.length?[{...m,days}]:[];});
 const daily=state.days.map(day=>({date:day,confirmed:state.confirmed.filter(g=>g.day===day).reduce((n,g)=>n+g.people.length,0)+Number((meta.anonymousDays as Record<string,number>)[day]??0),waiting:state.waiting.filter(g=>g.day===day).reduce((n,g)=>n+g.people.length,0),capacity:state.capacity}));
 return {revision:state.revision,open:state.open&&!state.ended&&!state.cancelled,ended:state.ended,cancelled:state.cancelled,maxGuests:state.maxGuests,startsAt:Number(meta.starts_at),endsAt:Number(meta.ends_at),days:daily,own:party?{days:party.days,guests:party.guests,active:party.active,places}:null,crew,...manager?{participants:state.parties.filter(p=>p.active).flatMap(p=>[{id:p.owner,name:members.find(m=>m.id===p.owner)?.name??'Member',kind:'Member',owner:p.owner,places:ownPlaces(state,p.owner).filter(x=>x.personId===p.owner)},...p.guests.map(g=>({id:g.id,name:g.name,kind:'Invited guest',owner:p.owner,places:ownPlaces(state,p.owner).filter(x=>x.personId===g.id)}))]),total:new Set(state.confirmed.flatMap(g=>g.people.map(person=>g.owner+':'+person))).size+Number(meta.anonymousTotal??0)}:{} };
}
export const memberActor=`EXISTS(SELECT 1 FROM users u JOIN auth_sessions s ON s.user_id=u.id WHERE u.id=? AND s.token_digest=? AND u.status='active' AND u.email_verified_at IS NOT NULL AND u.updated_at<=unixepoch() AND s.auth_version=u.auth_version AND s.revoked_at IS NULL AND s.created_at<=unixepoch() AND s.expires_at>unixepoch() AND NOT EXISTS(SELECT 1 FROM account_lifecycle WHERE user_id=u.id) AND ${mfaSessionCondition})`;
function draftInput(raw:unknown):RegistrationDraft{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new EventError(400,'Check registration fields');
 const value=raw as Record<string,unknown>;
 if(Object.keys(value).some(k=>!['days','guests'].includes(k))||!Array.isArray(value.days)||!Array.isArray(value.guests)||value.guests.length>20||value.days.length>31||!value.days.every(d=>typeof d==='string'))throw new EventError(400,'Check registration fields');
 for(const g of value.guests){if(!g||typeof g!=='object'||Array.isArray(g)||Object.keys(g).some(k=>!['id','name','email','days'].includes(k))||typeof g.id!=='string'||!UUID.test(g.id)||typeof g.name!=='string'||typeof g.email!=='string'||/[\u0000-\u001f\u007f]/.test(g.name+g.email)||!Array.isArray(g.days)||g.days.length>31||!g.days.every((d:unknown)=>typeof d==='string'))throw new EventError(400,'Check guest details');}
 try{for(const g of value.guests)emailAddress(g.email.trim());}catch{throw new EventError(400,'Check guest email');}
 return value as unknown as RegistrationDraft;
}
export async function mutateRegistration(db:D1Database,id:string,userId:string,digest:string,raw:Record<string,unknown>,manager:boolean){
 const action=String(raw.action),allowed=manager?['open','close','capacity','cancel-event']:['save','cancel'];
 if(Object.keys(raw).some(k=>!['action','revision','operationId',...(action==='save'?['draft']:action==='capacity'?['capacity']:[])].includes(k))||!allowed.includes(action)||!Number.isSafeInteger(raw.revision)||!UUID.test(String(raw.operationId)))throw new EventError(400,'Invalid registration request');
 const snapshot=await registrationSnapshot(db,id),{state,meta}=snapshot;
 if(meta.publication_status!=='published'||!manager&&meta.is_listed!==1)throw new EventError(409,'This event is not accepting changes');
 if(action==='open'&&state.ended)throw new EventError(409,'An ended event cannot reopen registration');
 if(action==='capacity'&&state.ended)throw new EventError(409,'An ended event cannot change capacity');
 if(state.parties.length>=1000&&!state.parties.some(p=>p.owner===userId)&&action==='save')throw new EventError(409,'Contact the organizer to register');
 if(action==='capacity'&&!Number.isSafeInteger(raw.capacity))throw new EventError(400,'Use a whole-number capacity');
 const command:PreviewCommand=action==='save'?{action,owner:userId,draft:draftInput(raw.draft)}:action==='cancel'?{action,owner:userId}:action==='capacity'?{action,capacity:Number(raw.capacity)}:{action:action as 'open'|'close'|'cancel-event'};
 let next:PreviewRegistrationState;try{next=changeRegistration(state,Number(raw.revision),command);}catch(e){throw new EventError(state.revision!==raw.revision?409:400,(e as Error).message);}
 const payload=JSON.stringify(next.parties.map(p=>({...p,id:crypto.randomUUID()}))),groups=JSON.stringify([...next.confirmed.map(g=>({...g,status:'confirmed'})),...next.waiting.map(g=>({...g,status:'waitlisted'}))]);
 const sessionGuard=manager?eventActor(action==='cancel-event'?'events.cancel':'events.manage_registrations'):memberActor;
 const statements=[
  db.prepare(`UPDATE event_management SET revision=revision+1,capacity=? WHERE event_id=? AND revision=? AND ${sessionGuard} AND ends_at=? AND max_guests=? AND capacity=? AND (SELECT count(*) FROM event_registration_operations WHERE actor_id=? AND occurred_at>unixepoch()-600)<20 AND EXISTS(SELECT 1 FROM events e WHERE e.id=event_management.event_id AND publication_status='published' ${manager?'':"AND registration_status='open' AND event_management.is_listed=1"}) ${['open','save','cancel'].includes(action)?'AND ends_at>unixepoch()':''}`).bind(next.capacity,id,state.revision,userId,digest,meta.ends_at,meta.max_guests,meta.capacity,userId),
  db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('Registration conflict') END"),
  db.prepare('INSERT INTO event_registration_operations(operation_id,event_id,actor_id,action,occurred_at,revision) VALUES (?,?,?,?,unixepoch(),?)').bind(raw.operationId,id,userId,action,next.revision),
  db.prepare('UPDATE event_registration_control SET sequence=? WHERE event_id=?').bind(next.sequence,id),
  db.prepare("UPDATE events SET registration_status=?,publication_status=CASE WHEN ?=1 THEN 'cancelled' ELSE publication_status END,updated_at=unixepoch() WHERE id=?").bind(next.open?'open':'closed',next.cancelled?1:0,id),
  db.prepare(`INSERT INTO registrations(id,user_id,event_id,status,registered_at,cancelled_at,created_at,updated_at) SELECT json_extract(value,'$.id'),json_extract(value,'$.owner'),?,CASE WHEN json_extract(value,'$.active')=1 THEN 'registered' ELSE 'cancelled' END,unixepoch(),CASE WHEN json_extract(value,'$.active')=1 THEN NULL ELSE unixepoch() END,unixepoch(),unixepoch() FROM json_each(?) WHERE 1 ON CONFLICT(user_id,event_id) DO UPDATE SET status=excluded.status,cancelled_at=CASE WHEN registrations.status<>excluded.status THEN excluded.cancelled_at ELSE registrations.cancelled_at END,updated_at=excluded.updated_at WHERE registrations.status<>excluded.status OR registrations.user_id=?`).bind(id,payload,manager?'':userId),
  db.prepare(`INSERT INTO event_registration_parties(registration_id,draft) SELECT r.id,json_object('days',json(json_extract(j.value,'$.days')),'guests',json(json_extract(j.value,'$.guests'))) FROM json_each(?) j JOIN registrations r ON r.user_id=json_extract(j.value,'$.owner') AND r.event_id=? WHERE 1 ON CONFLICT(registration_id) DO UPDATE SET draft=excluded.draft`).bind(payload,id),
  db.prepare('DELETE FROM event_registration_places WHERE event_id=?').bind(id),
  db.prepare(`INSERT INTO event_registration_places SELECT r.id,?,d.id,person.value,json_extract(g.value,'$.status'),json_extract(g.value,'$.sequence') FROM json_each(?) g JOIN json_each(json_extract(g.value,'$.people')) person JOIN registrations r ON r.user_id=json_extract(g.value,'$.owner') AND r.event_id=? JOIN event_days d ON d.event_id=r.event_id AND d.attendance_date=json_extract(g.value,'$.day')`).bind(id,groups,id),
  db.prepare("DELETE FROM registration_days WHERE event_id=? AND registration_id IN (SELECT id FROM registrations WHERE event_id=? AND status='registered')").bind(id,id),
  db.prepare(`INSERT OR IGNORE INTO registration_days SELECT p.registration_id,p.event_id,p.event_day_id,unixepoch() FROM event_registration_places p JOIN registrations r ON r.id=p.registration_id WHERE p.event_id=? AND p.state='confirmed' AND p.person_id=r.user_id`).bind(id)
 ];
 for(const owner of new Set(next.notices.map(n=>n.owner)))statements.push(db.prepare('INSERT INTO event_registration_notifications(id,operation_id,user_id,event_id,created_at) VALUES (?,?,?,?,unixepoch())').bind(crypto.randomUUID(),raw.operationId,owner,id));
 if(manager)statements.push(db.prepare('INSERT INTO event_activity(operation_id,occurred_at,actor_id,event_id,event_reference,event_title,operation,fields) VALUES (?,unixepoch(),?,?,?,?,?,?)').bind(raw.operationId,userId,id,id,String(meta.title),action==='cancel-event'?'event.cancel':'event.update',JSON.stringify([action==='capacity'?'capacity':'registration.'+action])));
 try{await db.batch(statements);}catch(e){if(/malformed JSON|Registration conflict|UNIQUE constraint/i.test(String(e)))throw new EventError(409,'Event, session or registration changed, request already processed, or change limit reached. Reload before trying again; allow ten minutes after repeated changes.');throw e;}
 return {revision:next.revision};
}
