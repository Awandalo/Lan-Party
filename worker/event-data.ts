import {administratorPredicate} from './rbac-authority';
import {mfaSessionCondition} from './auth/mfa-session';
import {UUID} from './role-administration';
import {locationDraft} from './location-data';

export class EventError extends Error {constructor(public status:number,message:string){super(message);}}
export async function eventsReady(db:D1Database){return (await db.prepare("SELECT count(*) n FROM sqlite_schema WHERE type='table' AND name IN ('event_management','event_activity')").first<number>('n'))===2;}
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
const columns=`e.id,e.title,e.description,e.location_id AS locationId,e.publication_status AS status,e.registration_status AS registrationStatus,m.starts_at AS startsAt,m.ends_at AS endsAt,m.venue,m.finance_enabled AS financeEnabled,m.rental_cents AS rentalCents,m.guests_enabled AS guestsEnabled,m.max_guests AS maxGuests,m.revision`;
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
 const days=(await db.prepare('SELECT event_id AS eventId,attendance_date AS date,capacity FROM event_days ORDER BY attendance_date,id').all()).results;
 return {events:rows.map(r=>({...r,venue:r.venue?JSON.parse(String(r.venue)):null,days:days.filter(d=>d.eventId===r.id).map(d=>({date:d.date,capacity:d.capacity}))}))};
}
export async function writeEvent(db:D1Database,userId:string,digest:string,raw:Record<string,unknown>){
 const allowed=['action','operationId','id','revision','sourceId','sourceRevision','title','description','startsAt','endsAt','locationId','venue','days','financeEnabled','rentalCents','guestsEnabled','maxGuests'];
 if(Object.keys(raw).some(k=>!allowed.includes(k))||!UUID.test(String(raw.operationId))||!['create','update','duplicate'].includes(String(raw.action)))throw new EventError(400,'Invalid event request');
 const update=raw.action==='update',duplicate=raw.action==='duplicate',id=update?String(raw.id):crypto.randomUUID();
 if(!UUID.test(id)||!UUID.test(String(raw.locationId)))throw new EventError(400,'Select a location template');
 const title=text(raw.title,160,true),description=text(raw.description,8000),starts=integer(raw.startsAt,0,253402300799),ends=integer(raw.endsAt,1,253402300799);
 if(ends<=starts)throw new EventError(400,'Event end must follow its start');
 const snapshot=venue(raw.venue),rental=integer(raw.rentalCents,0,100000000),maxGuests=integer(raw.maxGuests,0,20);
 if(typeof raw.financeEnabled!=='boolean'||typeof raw.guestsEnabled!=='boolean'||!raw.guestsEnabled&&maxGuests!==0||raw.guestsEnabled&&maxGuests<1)throw new EventError(400,'Invalid event settings');
 if(!Array.isArray(raw.days)||raw.days.length<1||raw.days.length>31)throw new EventError(400,'Select between 1 and 31 attendance days');
 const days=raw.days.map(d=>{
  if(!d||typeof d!=='object'||Object.keys(d).some(k=>!['date','capacity'].includes(k))||typeof d.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||!/^20\d{2}-/.test(d.date)||!Number.isFinite(Date.parse(d.date+'T00:00:00Z'))||new Date(d.date+'T00:00:00Z').toISOString().slice(0,10)!==d.date)throw new EventError(400,'Invalid attendance date');
  return {date:d.date as string,capacity:integer(d.capacity,1,100000)};
 }).sort((a,b)=>a.date.localeCompare(b.date));
 if(new Set(days.map(d=>d.date)).size!==days.length)throw new EventError(400,'Duplicate attendance date');
 const revision=update?integer(raw.revision,0,Number.MAX_SAFE_INTEGER):0;
 const current=update?await db.prepare('SELECT publication_status,location_id FROM events WHERE id=?').bind(id).first():null;
 if(update&&(!current||current.publication_status!=='draft'))throw new EventError(409,'Only managed Drafts can be edited in this increment');
 if(update&&current?.location_id!==raw.locationId)throw new EventError(400,'The source template reference cannot be changed');
 if(update){
  const locked=(await db.prepare('SELECT attendance_date AS date FROM event_days WHERE event_id=? ORDER BY attendance_date').bind(id).all<{date:string}>()).results;
  if(JSON.stringify(locked.map(d=>d.date))!==JSON.stringify(days.map(d=>d.date)))throw new EventError(400,'Attendance days are locked. Create a new event to change them.');
 }
 if(duplicate&&(!UUID.test(String(raw.sourceId))||!Number.isSafeInteger(raw.sourceRevision)))throw new EventError(400,'Invalid duplicate source');
 const guard=actor(update?'events.update':'events.create'),statements:D1PreparedStatement[]=[];
 const assertChanged=()=>db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('Event conflict') END");
 if(update){
  statements.push(db.prepare(`UPDATE event_management SET starts_at=?,ends_at=?,venue=?,finance_enabled=?,rental_cents=?,guests_enabled=?,max_guests=?,revision=revision+1 WHERE event_id=? AND revision=? AND ${guard} AND EXISTS(SELECT 1 FROM events WHERE id=? AND publication_status='draft')`).bind(starts,ends,JSON.stringify(snapshot),Number(raw.financeEnabled),rental,Number(raw.guestsEnabled),maxGuests,id,revision,userId,digest,id),assertChanged());
  statements.push(db.prepare("UPDATE events SET title=?,description=?,updated_at=unixepoch() WHERE id=?").bind(title,description,id));
  statements.push(db.prepare(`UPDATE event_days SET capacity=(SELECT json_extract(value,'$.capacity') FROM json_each(?) WHERE json_extract(value,'$.date')=attendance_date),updated_at=unixepoch() WHERE event_id=? AND (SELECT json_extract(value,'$.capacity') FROM json_each(?) WHERE json_extract(value,'$.date')=attendance_date)>=(SELECT count(*) FROM registration_days rd JOIN registrations r ON r.id=rd.registration_id WHERE rd.event_day_id=event_days.id AND r.status='registered')`).bind(JSON.stringify(days),id,JSON.stringify(days)),db.prepare("SELECT CASE WHEN changes()=? THEN 1 ELSE json('Event conflict') END").bind(days.length));
 }else{
  // The source revision is fenced inside the same transaction; no history is copied.
  const source=duplicate?' AND EXISTS(SELECT 1 FROM event_management WHERE event_id=? AND revision=?)':'';
  statements.push(db.prepare(`INSERT INTO events(id,location_id,slug,title,description,created_at,updated_at) SELECT ?,?,?,?, ?,unixepoch(),unixepoch() WHERE ${guard} AND EXISTS(SELECT 1 FROM locations WHERE id=? ${duplicate?'':'AND is_active=1'}) AND (SELECT count(*) FROM events)<200${source}`).bind(id,raw.locationId,id,title,description,userId,digest,raw.locationId,...duplicate?[raw.sourceId,raw.sourceRevision]:[]),assertChanged());
  statements.push(db.prepare(`INSERT INTO event_days(id,event_id,attendance_date,starts_at,ends_at,sort_order,capacity,created_at,updated_at) SELECT json_extract(value,'$.id'),?,json_extract(value,'$.date'),?,?,CAST(key AS INTEGER),json_extract(value,'$.capacity'),unixepoch(),unixepoch() FROM json_each(?)`).bind(id,starts,ends,JSON.stringify(days.map(d=>({...d,id:crypto.randomUUID()})))));
  statements.push(db.prepare('INSERT INTO event_management(event_id,creator_id,starts_at,ends_at,venue,finance_enabled,rental_cents,guests_enabled,max_guests) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,userId,starts,ends,JSON.stringify(snapshot),Number(raw.financeEnabled),rental,Number(raw.guestsEnabled),maxGuests));
 }
 statements.push(db.prepare('INSERT INTO event_activity(operation_id,occurred_at,actor_id,event_id,operation,fields) VALUES (?,unixepoch(),?,?,?,?)').bind(raw.operationId,userId,id,'event.'+raw.action,JSON.stringify(update?['details','venue','capacities','settings']:['created'])));
 try{await db.batch(statements);}catch(error){if(/Event conflict|malformed JSON|UNIQUE constraint failed: event_activity.operation_id/i.test(String(error)))throw new EventError(409,'Event or access changed, or request already processed. Reload before retrying.');throw error;}
 return {id};
}
