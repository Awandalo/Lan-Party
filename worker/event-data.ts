import {finalizedEvent,finalizationReady} from './event-finalization-data';
import {administratorPredicate} from './rbac-authority';
import {mfaSessionCondition} from './auth/mfa-session';
import {UUID} from './role-administration';
import {locationDraft,locationColumns} from './location-data';
import {validateEventDocument} from '../src/lib/event-document';
import type {EventNode} from '../src/lib/event-document';
import {eventDates,eventInstant,eventLocalTime} from '../src/lib/event-time';
import {registrationReady,mutateRegistration} from './event-registration-data';

export class EventError extends Error {constructor(public status:number,message:string){super(message);}}
export async function eventsReady(db:D1Database){
 const schema=await db.prepare("SELECT (SELECT count(*) FROM pragma_table_info('event_management') WHERE name='is_listed') AS ready,(SELECT count(*) FROM pragma_table_info('event_management') WHERE name='finance_enabled') AS obsolete").first<{ready:number;obsolete:number}>();
 return schema?.ready===1&&schema.obsolete===0;
}
const permission=(code:string)=>`EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id WHERE ur.user_id=u.id AND r.is_active=1 AND ur.assigned_at<=unixepoch() AND rp.granted_at<=unixepoch() AND p.code='${code}')`;
export function eventActor(code:string|null){return `EXISTS(SELECT 1 FROM users u JOIN auth_sessions s ON s.user_id=u.id WHERE u.id=? AND s.token_digest=? AND u.status='active' AND u.email_verified_at IS NOT NULL AND u.updated_at<=unixepoch() AND s.auth_version=u.auth_version AND s.revoked_at IS NULL AND s.created_at<=unixepoch() AND s.expires_at>unixepoch() AND NOT EXISTS(SELECT 1 FROM account_lifecycle WHERE user_id=u.id) AND ${mfaSessionCondition} AND (${code?administratorPredicate()+' OR '+permission(code):administratorPredicate()}))`;}
const actor=eventActor;
function text(value:unknown,max:number,required=false){if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)||required&&!value.trim())throw new EventError(400,'Check the event fields');return value.trim();}
function integer(value:unknown,min:number,max:number){if(!Number.isSafeInteger(value)||Number(value)<min||Number(value)>max)throw new EventError(400,'Invalid event number');return Number(value);}
function venue(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new EventError(400,'Complete the venue address');
 const v=raw as Record<string,unknown>,keys=['name','addressLine','postalCode','city','countryCode','instructions','directionsUrl'];
 if(Object.keys(v).some(k=>!keys.includes(k)))throw new EventError(400,'Invalid venue');
 const values=locationDraft({...v,capacity:null,rentalCents:0});
 if(values.slice(0,5).some(v=>!v))throw new EventError(400,'Complete the venue address');
 return Object.fromEntries(keys.map((key,i)=>[key,values[[0,1,2,3,4,5,8][i]]??'']));
}
// Retained pre-0027 anonymous totals are also registration history. Their rows
// remain after account deletion; an empty identifying registration table is not proof.
const history=`(e.registration_recorded=1 OR EXISTS(SELECT 1 FROM registrations r WHERE r.event_id=e.id) OR EXISTS(SELECT 1 FROM anonymous_event_registrations a WHERE a.event_id=e.id) OR EXISTS(SELECT 1 FROM anonymous_day_registrations a WHERE a.event_id=e.id))`;
const noHistory=`EXISTS(SELECT 1 FROM events e WHERE e.id=event_management.event_id AND NOT ${history})`;
const columns=`e.id,e.title,e.description,e.location_id AS locationId,e.publication_status AS status,e.registration_status AS registrationStatus,m.starts_at AS startsAt,m.ends_at AS endsAt,m.venue,m.minimum_participants AS minimumParticipants,CAST(${history} AS INTEGER) AS registrationHistory,m.rental_cents AS rentalCents,m.capacity,m.max_guests AS maxGuests,m.revision,m.is_listed AS listed,(SELECT is_active FROM locations WHERE id=e.location_id) AS templateActive`;
export async function readEvents(db:D1Database,url:URL,logs=false,includeNames=false){
 const allowed=logs?['search','before']:['search','status'];
 if([...url.searchParams.keys()].some(k=>!allowed.includes(k)||url.searchParams.getAll(k).length!==1))throw new EventError(400,'Invalid query');
 const search=url.searchParams.get('search')??'';if(search.length>80||/[\u0000-\u001f\u007f]/.test(search))throw new EventError(400,'Invalid search');
 if(logs){
  const before=url.searchParams.get('before')??'9223372036854775807';if(!/^[1-9][0-9]{0,18}$/.test(before)||BigInt(before)>9223372036854775807n)throw new EventError(400,'Invalid cursor');
  const rows=(await db.prepare(`SELECT CAST(a.sequence AS TEXT) AS sequence,a.occurred_at AS occurredAt,a.operation,a.fields,coalesce(e.title,a.event_title) AS title,${includeNames?'n.nickname':'NULL'} AS actorName FROM event_activity a LEFT JOIN events e ON e.id=a.event_id LEFT JOIN user_nicknames n ON n.user_id=a.actor_id WHERE a.sequence<CAST(? AS INTEGER) AND instr(lower(coalesce(e.title,a.event_title)),lower(?))>0 ORDER BY a.sequence DESC LIMIT 21`).bind(before,search).all()).results;
  return {entries:rows.slice(0,20),nextBefore:rows.length>20?String(rows[19].sequence):null};
 }
 const status=url.searchParams.get('status')??'all';if(!['all','draft','published','unpublished','archived','cancelled'].includes(status))throw new EventError(400,'Invalid status');
 const rows=(await db.prepare(`SELECT ${columns},${await finalizationReady(db)?'(EXISTS(SELECT 1 FROM event_finalizations f WHERE f.event_id=e.id))':'0'} AS finalized FROM events e LEFT JOIN event_management m ON m.event_id=e.id WHERE (?='all' OR (?='unpublished' AND e.publication_status='published' AND m.is_listed=0) OR (e.publication_status=? AND (?<>'published' OR m.is_listed=1))) AND instr(lower(e.title),lower(?))>0 ORDER BY e.created_at DESC,e.id LIMIT 201`).bind(status,status,status,status,search).all()).results;
 if(rows.length>200)throw new EventError(503,'Event catalogue exceeds its supported size');
 const days=(await db.prepare('SELECT event_id AS eventId,attendance_date AS date FROM event_days ORDER BY attendance_date,id').all()).results;
 return {events:rows.map(r=>({...r,venue:r.venue?JSON.parse(String(r.venue)):null,days:days.filter(d=>d.eventId===r.id).map(d=>({date:d.date}))}))};
}
export async function writeEvent(db:D1Database,userId:string,digest:string,raw:Record<string,unknown>){
 if(['update','delete','publish','unpublish','cancel'].includes(String(raw.action))&&UUID.test(String(raw.id))&&await finalizedEvent(db,String(raw.id)))throw new EventError(409,'This event is permanently finalized');
 if(raw.action==='delete')return deleteEvent(db,userId,digest,raw);
 if(['publish','unpublish','cancel'].includes(String(raw.action)))return lifecycleEvent(db,userId,digest,raw);
 const update=raw.action==='update',duplicate=raw.action==='duplicate';
 const keys=['action','operationId','title','description','startsAt','endsAt','minimumParticipants','maxGuests','rentalCents',...(update?['id','revision']:duplicate?['sourceId','sourceRevision']:['locationId','locationRevision'])];
 if(Object.keys(raw).some(k=>!keys.includes(k))||!UUID.test(String(raw.operationId))||!['create','update','duplicate'].includes(String(raw.action)))throw new EventError(400,'Invalid event request');
 const id=update?String(raw.id):crypto.randomUUID(),title=text(raw.title,160,true),description=descriptionValue(raw.description),starts=integer(raw.startsAt,0,253402300799),ends=integer(raw.endsAt,1,253402300799),maxGuests=integer(raw.maxGuests,1,20),minimumParticipants=integer(raw.minimumParticipants,1,100000);
 if(!UUID.test(id))throw new EventError(400,'Invalid event settings');
 let dates:string[];try{dates=eventDates(starts,ends);}catch(error){throw new EventError(400,(error as Error).message);}
 const revision=update?integer(raw.revision,0,Number.MAX_SAFE_INTEGER):0;
 let datesChanged=false;
 let snapshot:Record<string,unknown>,rental:number,capacity:number,locationId:string,sourceRevision=0,current:Record<string,unknown>|null=null;
 if(update||duplicate){
  const sourceId=update?id:String(raw.sourceId);if(!UUID.test(sourceId))throw new EventError(400,'Invalid source event');
  sourceRevision=update?revision:integer(raw.sourceRevision,0,Number.MAX_SAFE_INTEGER);
  current=await db.prepare(`SELECT ${columns} FROM events e JOIN event_management m ON m.event_id=e.id WHERE e.id=?`).bind(sourceId).first<Record<string,unknown>>();
  if(!current||current.revision!==sourceRevision||update&&!['draft','published'].includes(String(current.status)))throw new EventError(409,'Event changed. Reload before trying again.');
  snapshot=JSON.parse(String(current.venue));rental=Number(current.rentalCents);capacity=Number(current.capacity);locationId=String(current.locationId);
  if(update){
   const locked=(await db.prepare('SELECT attendance_date AS date FROM event_days WHERE event_id=? ORDER BY attendance_date').bind(id).all<{date:string}>()).results;
   datesChanged=JSON.stringify(locked.map(d=>d.date))!==JSON.stringify(dates);
   if(datesChanged&&current.registrationHistory===1)throw new EventError(400,'Attendance days are locked because this event has registration history.');
  }
 }else{
  locationId=String(raw.locationId);if(!UUID.test(locationId))throw new EventError(400,'Select a completed location');
  sourceRevision=integer(raw.locationRevision,0,Number.MAX_SAFE_INTEGER);
  const template=await db.prepare(`SELECT ${locationColumns} FROM locations WHERE id=? AND is_active=1 AND revision=?`).bind(locationId,sourceRevision).first<Record<string,unknown>>();
  if(!template)throw new EventError(409,'The location changed or was archived. Reload before creating.');
  snapshot=venue(Object.fromEntries(['name','addressLine','postalCode','city','countryCode','instructions','directionsUrl'].map(k=>[k,template[k]??''])));
  capacity=integer(template.capacity,1,100000);rental=integer(template.rentalCents,0,100000000);
 }
 const requestedRental=raw.rentalCents===undefined?rental:integer(raw.rentalCents,0,100000000);
 const rentalChanged=requestedRental!==rental;
 if(rentalChanged&&!await db.prepare("SELECT 1 FROM sqlite_schema WHERE type='trigger' AND name='event_rental_finalized_locked'").first())throw new EventError(503,'Event pricing is awaiting its database migration');
 rental=requestedRental;
 // Existing timestamps remain exact; new or changed values use quarter hours.
 for(const [value,original] of [[starts,current?.startsAt],[ends,current?.endsAt]]){
  if(update&&value===original)continue;
  if(Number(value)%900!==0)throw new EventError(400,'Choose quarter-hour start and end times (minutes 00, 15, 30 or 45; seconds 00).');
  if(eventInstant(eventLocalTime(Number(value)))!==value)throw new EventError(400,'Choose an unambiguous Netherlands time outside the daylight-saving clock change.');
 }
 const guard=actor(update?'events.update':'events.create'),statements:D1PreparedStatement[]=[];
 const assertChanged=()=>db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('Event conflict') END");
 const fields=update?['title','description',...current?.startsAt!==starts||current?.endsAt!==ends?['times']:[],...current?.minimumParticipants!==minimumParticipants?['minimumParticipants']:[],...current?.maxGuests!==maxGuests?['guestLimit']:[],...rentalChanged?['rentalCents']:[]]:['created'];
 if(update){
  statements.push(db.prepare(`UPDATE event_management SET starts_at=?,ends_at=?,minimum_participants=?,max_guests=?,rental_cents=?,revision=revision+1 WHERE event_id=? AND revision=? AND ${guard} AND EXISTS(SELECT 1 FROM events WHERE id=? AND publication_status IN ('draft','published')) ${datesChanged?`AND ${noHistory}`:''}`).bind(starts,ends,minimumParticipants,maxGuests,rental,id,revision,userId,digest,id),assertChanged());
  statements.push(db.prepare('UPDATE events SET title=?,description=?,updated_at=unixepoch() WHERE id=?').bind(title,description,id));
  if(datesChanged){
   const payload=JSON.stringify(dayRows(dates));
   statements.push(db.prepare("DELETE FROM event_days WHERE event_id=? AND attendance_date NOT IN (SELECT json_extract(value,'$.date') FROM json_each(?))").bind(id,payload));
   statements.push(dayInsert(db,id,payload));
   statements.push(db.prepare("UPDATE event_days SET sort_order=(SELECT CAST(key AS INTEGER) FROM json_each(?) WHERE json_extract(value,'$.date')=attendance_date),updated_at=unixepoch() WHERE event_id=?").bind(payload,id));
  }

 }else{
  const sourceGuard=duplicate?'EXISTS(SELECT 1 FROM event_management WHERE event_id=? AND revision=?)':'EXISTS(SELECT 1 FROM locations WHERE id=? AND revision=? AND is_active=1)';
  statements.push(db.prepare(`INSERT INTO events(id,location_id,slug,title,description,created_at,updated_at) SELECT ?,?,?,?,?,unixepoch(),unixepoch() WHERE ${guard} AND ${sourceGuard} AND (SELECT count(*) FROM events)<200`).bind(id,locationId,id,title,description,userId,digest,duplicate?raw.sourceId:locationId,sourceRevision),assertChanged());
  statements.push(dayInsert(db,id,JSON.stringify(dayRows(dates))));
  statements.push(db.prepare('INSERT INTO event_management(event_id,creator_id,starts_at,ends_at,venue,minimum_participants,rental_cents,capacity,max_guests) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,userId,starts,ends,JSON.stringify(snapshot),minimumParticipants,rental,capacity,maxGuests));
 }
 statements.push(db.prepare('INSERT INTO event_activity(operation_id,occurred_at,actor_id,event_id,event_reference,event_title,operation,fields) VALUES (?,unixepoch(),?,?,?,?,?,?)').bind(raw.operationId,userId,id,id,title,'event.'+raw.action,JSON.stringify(fields)));
 try{await db.batch(statements);}catch(error){if(/Finalized event is locked|Event conflict|malformed JSON|UNIQUE constraint failed: event_activity.operation_id/i.test(String(error)))throw new EventError(409,'Event or access changed, or request already processed. Reload before retrying.');throw error;}
 return {id};
}

function descriptionValue(raw:unknown){try{return JSON.stringify(validateEventDocument(raw));}catch(error){throw new EventError(400,(error as Error).message);}}
function dayRows(dates:string[]){return dates.map(date=>{const next=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);return{id:crypto.randomUUID(),date,start:eventInstant(date+'T00:00'),end:eventInstant(next+'T00:00')};});}
function dayInsert(db:D1Database,id:string,payload:string){return db.prepare(`INSERT INTO event_days(id,event_id,attendance_date,starts_at,ends_at,sort_order,created_at,updated_at) SELECT json_extract(value,'$.id'),?,json_extract(value,'$.date'),json_extract(value,'$.start'),json_extract(value,'$.end'),CAST(key AS INTEGER),unixepoch(),unixepoch() FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM event_days WHERE event_id=? AND attendance_date=json_extract(j.value,'$.date'))`).bind(id,payload,id);}
async function deleteEvent(db:D1Database,userId:string,digest:string,raw:Record<string,unknown>){
 if(Object.keys(raw).some(k=>!['action','id','revision','operationId','confirmation'].includes(k))||!UUID.test(String(raw.id))||!UUID.test(String(raw.operationId)))throw new EventError(400,'Invalid deletion request');
 const id=String(raw.id),revision=integer(raw.revision,0,Number.MAX_SAFE_INTEGER),row=await db.prepare(`SELECT e.title,CAST(${history} AS INTEGER) AS registrationHistory FROM events e WHERE e.id=?`).bind(id).first<{title:string;registrationHistory:number}>();
 if(!row)throw new EventError(409,'Event no longer exists. Reload.');if(raw.confirmation!==row.title)throw new EventError(400,'Type the event name to confirm permanent deletion');
 if(row.registrationHistory)throw new EventError(409,'An event with registration history cannot be permanently deleted');
 try{await db.batch([
  db.prepare(`UPDATE event_management SET revision=revision+1 WHERE event_id=? AND revision=? AND ${actor(null)} AND ${noHistory}`).bind(id,revision,userId,digest),
  db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('Event conflict') END"),
  db.prepare("INSERT INTO event_activity(operation_id,occurred_at,actor_id,event_id,event_reference,event_title,operation,fields) VALUES (?,unixepoch(),?,?,?,?,'event.delete',?)").bind(raw.operationId,userId,id,id,row.title,JSON.stringify(['deleted'])),
  db.prepare('DELETE FROM event_days WHERE event_id=?').bind(id),db.prepare('DELETE FROM event_management WHERE event_id=?').bind(id),db.prepare('DELETE FROM events WHERE id=?').bind(id)
 ]);}catch(error){if(/malformed JSON|Registration history|Event conflict|UNIQUE constraint failed: event_activity.operation_id/i.test(String(error)))throw new EventError(409,'Event or access changed. Reload before deleting.');throw error;}
 return {id,deleted:true};
}

async function lifecycleEvent(db:D1Database,userId:string,digest:string,raw:Record<string,unknown>){
 if(Object.keys(raw).some(k=>!['action','id','revision','operationId','confirmation','acknowledgeArchivedTemplate'].includes(k))||!UUID.test(String(raw.id))||!UUID.test(String(raw.operationId))||raw.acknowledgeArchivedTemplate!==undefined&&typeof raw.acknowledgeArchivedTemplate!=='boolean')throw new EventError(400,'Invalid publication request');
 const id=String(raw.id),revision=integer(raw.revision,0,Number.MAX_SAFE_INTEGER),action=String(raw.action);
 const row=await db.prepare(`SELECT ${columns} FROM events e JOIN event_management m ON m.event_id=e.id WHERE e.id=?`).bind(id).first<Record<string,unknown>>();
 if(!row||row.revision!==revision)throw new EventError(409,'Event changed. Reload before trying again.');
 if(raw.confirmation!==row.title)throw new EventError(400,'Type the event name to confirm');
 if(!['draft','published'].includes(String(row.status)))throw new EventError(409,'This event is read-only');
 if(action==='publish'){
  if(row.listed===1)throw new EventError(409,'Event is already published');
  const doc=validateEventDocument(JSON.parse(String(row.description)));
  const hasText=(node:EventNode):boolean=>!!node.text?.trim()||!!node.content?.some(hasText);
  if(!hasText(doc))throw new EventError(400,'Add an event description before publishing');
  text(row.title,160,true);venue(JSON.parse(String(row.venue)));integer(row.capacity,1,100000);
  const dates=eventDates(Number(row.startsAt),Number(row.endsAt));
  const saved=(await db.prepare("SELECT attendance_date AS date FROM event_days WHERE event_id=? AND status='scheduled' ORDER BY attendance_date").bind(id).all<{date:string}>()).results;
  if(JSON.stringify(dates)!==JSON.stringify(saved.map(d=>d.date)))throw new EventError(409,'Review attendance days before publishing');
  if(row.templateActive!==1&&raw.acknowledgeArchivedTemplate!==true)throw new EventError(409,'The source location is archived. Review and confirm the saved venue before publishing.');
 }else if(action==='unpublish'&&(row.status!=='published'||row.listed!==1))throw new EventError(409,'Event is not publicly listed');
 if(action==='cancel'&&row.registrationHistory===1){
  if(await registrationReady(db))return mutateRegistration(db,id,userId,digest,{action:'cancel-event',revision,operationId:raw.operationId},true);
  throw new EventError(409,'Cancellation with registration history awaits participant notification support');
 }
 const next=action==='cancel'?'cancelled':'published',listed=action==='publish'?1:0;
 const guard=action==='cancel'?`AND ${noHistory}`:action==='publish'&&raw.acknowledgeArchivedTemplate!==true?'AND EXISTS(SELECT 1 FROM locations WHERE id=? AND is_active=1)':'';
 const bindings:(string|number)[]=[listed,id,revision,userId,digest,String(row.status),Number(row.listed)];
 if(action==='publish'&&raw.acknowledgeArchivedTemplate!==true)bindings.push(String(row.locationId));
 try{await db.batch([
  db.prepare(`UPDATE event_management SET is_listed=?,revision=revision+1 WHERE event_id=? AND revision=? AND ${actor(action==='cancel'?'events.cancel':'events.publish')} AND EXISTS(SELECT 1 FROM events WHERE id=event_management.event_id AND publication_status=?) AND is_listed=? ${guard}`).bind(...bindings),
  db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('Event conflict') END"),
  db.prepare("UPDATE events SET publication_status=?,registration_status='closed',updated_at=unixepoch() WHERE id=?").bind(next,id),
  db.prepare('INSERT INTO event_activity(operation_id,occurred_at,actor_id,event_id,event_reference,event_title,operation,fields) VALUES (?,unixepoch(),?,?,?,?,?,?)').bind(raw.operationId,userId,id,id,row.title,'event.'+action,JSON.stringify(['publication','registration']))
 ]);}catch(error){if(/malformed JSON|Event conflict|UNIQUE constraint failed: event_activity.operation_id/i.test(String(error)))throw new EventError(409,'Event or access changed. Reload before trying again.');throw error;}
 return {id};
}
