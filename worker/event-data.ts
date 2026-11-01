import {administratorPredicate} from './rbac-authority';
import {mfaSessionCondition} from './auth/mfa-session';
import {UUID} from './role-administration';
import {locationDraft,locationColumns} from './location-data';
import {eventDates,eventInstant} from '../src/lib/event-time';

export class EventError extends Error {constructor(public status:number,message:string){super(message);}}
export async function eventsReady(db:D1Database){
 const schema=await db.prepare("SELECT (SELECT count(*) FROM pragma_table_info('event_management') WHERE name='capacity') AS ready,(SELECT count(*) FROM pragma_table_info('event_management') WHERE name='guests_enabled')+(SELECT count(*) FROM pragma_table_info('event_days') WHERE name='capacity') AS obsolete").first<{ready:number;obsolete:number}>();
 return schema?.ready===1&&schema.obsolete===0;
}
const permission=(code:string)=>`EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id WHERE ur.user_id=u.id AND r.is_active=1 AND ur.assigned_at<=unixepoch() AND rp.granted_at<=unixepoch() AND p.code='${code}')`;
function actor(code:string){return `EXISTS(SELECT 1 FROM users u JOIN auth_sessions s ON s.user_id=u.id WHERE u.id=? AND s.token_digest=? AND u.status='active' AND u.email_verified_at IS NOT NULL AND u.updated_at<=unixepoch() AND s.auth_version=u.auth_version AND s.revoked_at IS NULL AND s.created_at<=unixepoch() AND s.expires_at>unixepoch() AND NOT EXISTS(SELECT 1 FROM account_lifecycle WHERE user_id=u.id) AND ${mfaSessionCondition} AND (${administratorPredicate()} OR ${permission(code)}))`;}
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
const columns=`e.id,e.title,e.description,e.location_id AS locationId,e.publication_status AS status,e.registration_status AS registrationStatus,m.starts_at AS startsAt,m.ends_at AS endsAt,m.venue,m.finance_enabled AS financeEnabled,m.rental_cents AS rentalCents,m.capacity,m.max_guests AS maxGuests,m.revision`;
export async function readEvents(db:D1Database,url:URL,logs=false,includeNames=false){
 const allowed=logs?['search','before']:['search','status'];
 if([...url.searchParams.keys()].some(k=>!allowed.includes(k)||url.searchParams.getAll(k).length!==1))throw new EventError(400,'Invalid query');
 const search=url.searchParams.get('search')??'';if(search.length>80||/[\u0000-\u001f\u007f]/.test(search))throw new EventError(400,'Invalid search');
 if(logs){
  const before=url.searchParams.get('before')??'9223372036854775807';if(!/^[1-9][0-9]{0,18}$/.test(before)||BigInt(before)>9223372036854775807n)throw new EventError(400,'Invalid cursor');
  const rows=(await db.prepare(`SELECT CAST(a.sequence AS TEXT) AS sequence,a.occurred_at AS occurredAt,a.operation,a.fields,e.title,${includeNames?'n.nickname':'NULL'} AS actorName FROM event_activity a JOIN events e ON e.id=a.event_id LEFT JOIN user_nicknames n ON n.user_id=a.actor_id WHERE a.sequence<CAST(? AS INTEGER) AND instr(lower(e.title),lower(?))>0 ORDER BY a.sequence DESC LIMIT 21`).bind(before,search).all()).results;
  return {entries:rows.slice(0,20),nextBefore:rows.length>20?String(rows[19].sequence):null};
 }
 const status=url.searchParams.get('status')??'all';if(!['all','draft','published','archived','cancelled'].includes(status))throw new EventError(400,'Invalid status');
 const rows=(await db.prepare(`SELECT ${columns} FROM events e LEFT JOIN event_management m ON m.event_id=e.id WHERE (?='all' OR e.publication_status=?) AND instr(lower(e.title),lower(?))>0 ORDER BY e.created_at DESC,e.id LIMIT 201`).bind(status,status,search).all()).results;
 if(rows.length>200)throw new EventError(503,'Event catalogue exceeds its supported size');
 const days=(await db.prepare('SELECT event_id AS eventId,attendance_date AS date FROM event_days ORDER BY attendance_date,id').all()).results;
 return {events:rows.map(r=>({...r,venue:r.venue?JSON.parse(String(r.venue)):null,days:days.filter(d=>d.eventId===r.id).map(d=>({date:d.date}))}))};
}
export async function writeEvent(db:D1Database,userId:string,digest:string,raw:Record<string,unknown>){
 const update=raw.action==='update',duplicate=raw.action==='duplicate';
 const keys=['action','operationId','title','description','startsAt','endsAt','financeEnabled','maxGuests',...(update?['id','revision']:duplicate?['sourceId','sourceRevision']:['locationId','locationRevision'])];
 if(Object.keys(raw).some(k=>!keys.includes(k))||!UUID.test(String(raw.operationId))||!['create','update','duplicate'].includes(String(raw.action)))throw new EventError(400,'Invalid event request');
 const id=update?String(raw.id):crypto.randomUUID(),title=text(raw.title,160,true),description=text(raw.description,8000),starts=integer(raw.startsAt,0,253402300799),ends=integer(raw.endsAt,1,253402300799),maxGuests=integer(raw.maxGuests,1,20);
 if(!UUID.test(id)||typeof raw.financeEnabled!=='boolean')throw new EventError(400,'Invalid event settings');
 let dates:string[];try{dates=eventDates(starts,ends);}catch(error){throw new EventError(400,(error as Error).message);}
 const revision=update?integer(raw.revision,0,Number.MAX_SAFE_INTEGER):0;
 let snapshot:Record<string,unknown>,rental:number,capacity:number,locationId:string,sourceRevision=0,current:Record<string,unknown>|null=null;
 if(update||duplicate){
  const sourceId=update?id:String(raw.sourceId);if(!UUID.test(sourceId))throw new EventError(400,'Invalid source event');
  sourceRevision=update?revision:integer(raw.sourceRevision,0,Number.MAX_SAFE_INTEGER);
  current=await db.prepare(`SELECT ${columns} FROM events e JOIN event_management m ON m.event_id=e.id WHERE e.id=?`).bind(sourceId).first<Record<string,unknown>>();
  if(!current||current.revision!==sourceRevision||update&&current.status!=='draft')throw new EventError(409,'Event changed. Reload before trying again.');
  snapshot=JSON.parse(String(current.venue));rental=Number(current.rentalCents);capacity=Number(current.capacity);locationId=String(current.locationId);
  if(update){
   const locked=(await db.prepare('SELECT attendance_date AS date FROM event_days WHERE event_id=? ORDER BY attendance_date').bind(id).all<{date:string}>()).results;
   if(JSON.stringify(locked.map(d=>d.date))!==JSON.stringify(dates))throw new EventError(400,'Attendance days are locked. Create a new event to change its calendar range.');
  }
 }else{
  locationId=String(raw.locationId);if(!UUID.test(locationId))throw new EventError(400,'Select a completed location');
  sourceRevision=integer(raw.locationRevision,0,Number.MAX_SAFE_INTEGER);
  const template=await db.prepare(`SELECT ${locationColumns} FROM locations WHERE id=? AND is_active=1 AND revision=?`).bind(locationId,sourceRevision).first<Record<string,unknown>>();
  if(!template)throw new EventError(409,'The location changed or was archived. Reload before creating.');
  snapshot=venue(Object.fromEntries(['name','addressLine','postalCode','city','countryCode','instructions','directionsUrl'].map(k=>[k,template[k]??''])));
  capacity=integer(template.capacity,1,100000);rental=integer(template.rentalCents,0,100000000);
 }
 const guard=actor(update?'events.update':'events.create'),statements:D1PreparedStatement[]=[];
 const assertChanged=()=>db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('Event conflict') END");
 const fields=update?['title','description',...current?.startsAt!==starts||current?.endsAt!==ends?['times']:[],...current?.financeEnabled!==Number(raw.financeEnabled)?['finance']:[],...current?.maxGuests!==maxGuests?['guestLimit']:[]]:['created'];
 if(update){
  statements.push(db.prepare(`UPDATE event_management SET starts_at=?,ends_at=?,finance_enabled=?,max_guests=?,revision=revision+1 WHERE event_id=? AND revision=? AND ${guard} AND EXISTS(SELECT 1 FROM events WHERE id=? AND publication_status='draft')`).bind(starts,ends,Number(raw.financeEnabled),maxGuests,id,revision,userId,digest,id),assertChanged());
  statements.push(db.prepare('UPDATE events SET title=?,description=?,updated_at=unixepoch() WHERE id=?').bind(title,description,id));
 }else{
  const sourceGuard=duplicate?'EXISTS(SELECT 1 FROM event_management WHERE event_id=? AND revision=?)':'EXISTS(SELECT 1 FROM locations WHERE id=? AND revision=? AND is_active=1)';
  statements.push(db.prepare(`INSERT INTO events(id,location_id,slug,title,description,created_at,updated_at) SELECT ?,?,?,?,?,unixepoch(),unixepoch() WHERE ${guard} AND ${sourceGuard} AND (SELECT count(*) FROM events)<200`).bind(id,locationId,id,title,description,userId,digest,duplicate?raw.sourceId:locationId,sourceRevision),assertChanged());
  const days=dates.map(date=>{const next=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);return{id:crypto.randomUUID(),date,start:eventInstant(date+'T00:00'),end:eventInstant(next+'T00:00')};});
  statements.push(db.prepare(`INSERT INTO event_days(id,event_id,attendance_date,starts_at,ends_at,sort_order,created_at,updated_at) SELECT json_extract(value,'$.id'),?,json_extract(value,'$.date'),json_extract(value,'$.start'),json_extract(value,'$.end'),CAST(key AS INTEGER),unixepoch(),unixepoch() FROM json_each(?)`).bind(id,JSON.stringify(days)));
  statements.push(db.prepare('INSERT INTO event_management(event_id,creator_id,starts_at,ends_at,venue,finance_enabled,rental_cents,capacity,max_guests) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,userId,starts,ends,JSON.stringify(snapshot),Number(raw.financeEnabled),rental,capacity,maxGuests));
 }
 statements.push(db.prepare('INSERT INTO event_activity(operation_id,occurred_at,actor_id,event_id,operation,fields) VALUES (?,unixepoch(),?,?,?,?)').bind(raw.operationId,userId,id,'event.'+raw.action,JSON.stringify(fields)));
 try{await db.batch(statements);}catch(error){if(/Event conflict|malformed JSON|UNIQUE constraint failed: event_activity.operation_id/i.test(String(error)))throw new EventError(409,'Event or access changed, or request already processed. Reload before retrying.');throw error;}
 return {id};
}
