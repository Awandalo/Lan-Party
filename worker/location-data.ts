import {administratorPredicate} from './rbac-authority';
import {mfaSessionCondition} from './auth/mfa-session';
import {UUID} from './role-administration';

export class LocationError extends Error {constructor(public status:number,message:string){super(message);}}
export const locationColumns=`id,name,address_line AS addressLine,postal_code AS postalCode,city,country_code AS countryCode,
 public_description AS instructions,is_active AS active,capacity,default_rental_cents AS rentalCents,directions_url AS directionsUrl,revision`;
export async function locationsReady(db:D1Database){
 const row=await db.prepare(`SELECT (SELECT count(*) FROM pragma_table_info('locations') WHERE name IN ('capacity','default_rental_cents','directions_url','revision')) AS columns,
 (SELECT count(*) FROM sqlite_schema WHERE type='table' AND name='location_activity') AS logs`).first<{columns:number;logs:number}>();
 return row?.columns===4&&row.logs===1;
}
function text(value:unknown,max:number,required=false,multiline=false){
 if(typeof value!=='string')throw new LocationError(400,'Invalid location fields');
 const v=value.trim();if(v.length>max||required&&!v|| (multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/).test(v))throw new LocationError(400,'Invalid location fields');return v||null;
}
export function locationDraft(raw:Record<string,unknown>){
 const name=text(raw.name,120,true),address=text(raw.addressLine,200),postal=text(raw.postalCode,30),city=text(raw.city,100),country=text(raw.countryCode,2),instructions=text(raw.instructions,8000,false,true),directions=text(raw.directionsUrl,2048);
 if(country&&!/^[A-Z]{2}$/.test(country))throw new LocationError(400,'Use a two-letter uppercase country code');
 if(raw.capacity!==null&&(!Number.isSafeInteger(raw.capacity)||Number(raw.capacity)<1||Number(raw.capacity)>100000))throw new LocationError(400,'Capacity must be a positive whole number');
 if(!Number.isSafeInteger(raw.rentalCents)||Number(raw.rentalCents)<0||Number(raw.rentalCents)>100000000)throw new LocationError(400,'Invalid default rental');
 if(directions){let u:URL;try{u=new URL(directions);}catch{throw new LocationError(400,'Invalid Google Maps URL');}
  const google=u.hostname==='maps.google.com'||u.hostname==='www.google.com'||u.hostname==='google.com';
  if(u.protocol!=='https:'||u.username||u.password||u.port||!(google&&(u.hostname==='maps.google.com'||u.pathname==='/maps'||u.pathname.startsWith('/maps/'))||u.hostname==='maps.app.goo.gl'&&u.pathname.length>1))throw new LocationError(400,'Use an HTTPS Google Maps link');
 }
 return [name,address,postal,city,country,instructions,raw.capacity,raw.rentalCents,directions];
}
const grant=`EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id
 WHERE ur.user_id=u.id AND r.is_active=1 AND ur.assigned_at<=unixepoch() AND rp.granted_at<=unixepoch() AND p.code='locations.manage')`;
// Repeat live authority inside the write transaction, including session/MFA fences.
const actor=`EXISTS(SELECT 1 FROM users u JOIN auth_sessions s ON s.user_id=u.id WHERE u.id=? AND s.token_digest=?
 AND u.status='active' AND u.email_verified_at IS NOT NULL AND u.updated_at<=unixepoch()
 AND s.auth_version=u.auth_version AND s.revoked_at IS NULL AND s.created_at<=unixepoch() AND s.expires_at>unixepoch()
 AND NOT EXISTS(SELECT 1 FROM account_lifecycle WHERE user_id=u.id) AND ${mfaSessionCondition}
 AND (${administratorPredicate()} OR ${grant}))`;
export async function writeLocation(db:D1Database,userId:string,digest:string,raw:Record<string,unknown>){
 const allowed=['action','id','revision','operationId','name','addressLine','postalCode','city','countryCode','instructions','capacity','rentalCents','directionsUrl'];
 if(Object.keys(raw).some(k=>!allowed.includes(k))||!UUID.test(String(raw.operationId))||!['create','update','archive','restore'].includes(String(raw.action)))throw new LocationError(400,'Invalid location request');
 const create=raw.action==='create',id=create?crypto.randomUUID():String(raw.id),revision=raw.revision;
 if(!UUID.test(id)||!create&&(!Number.isSafeInteger(revision)||Number(revision)<0))throw new LocationError(400,'Invalid location revision');
 const current=create?null:await db.prepare(`SELECT ${locationColumns} FROM locations WHERE id=?`).bind(id).first<Record<string,unknown>>();
 if(!create&&!current)throw new LocationError(404,'Location not found');
 const editing=create||raw.action==='update',values=editing?locationDraft(raw):null;
 const fields=create?['name']:editing?['name','addressLine','postalCode','city','countryCode','instructions','capacity','rentalCents','directionsUrl'].filter((k,i)=>(current?.[k]??null)!==values![i]):['active'];
 if(!create&&(!fields.length||raw.action==='archive'&&current?.active===0||raw.action==='restore'&&current?.active===1))throw new LocationError(409,'No changes to save');
 const guard=create?`(SELECT count(*) FROM locations)<200`:'EXISTS(SELECT 1 FROM locations WHERE id=? AND revision=?)';
 const mutation=create?db.prepare(`INSERT INTO locations(id,name,address_line,postal_code,city,country_code,public_description,capacity,default_rental_cents,directions_url,created_at,updated_at)
 SELECT ?,?,?,?,?,?,?,?,?,?,unixepoch(),unixepoch() WHERE ${actor} AND ${guard}`).bind(id,...values!,userId,digest)
 :editing?db.prepare(`UPDATE locations SET name=?,address_line=?,postal_code=?,city=?,country_code=?,public_description=?,capacity=?,default_rental_cents=?,directions_url=?,revision=revision+1,updated_at=unixepoch()
 WHERE id=? AND revision=? AND ${actor}`).bind(...values!,id,revision,userId,digest)
 :db.prepare(`UPDATE locations SET is_active=?,revision=revision+1,updated_at=unixepoch() WHERE id=? AND revision=? AND ${actor}`).bind(raw.action==='restore'?1:0,id,revision,userId,digest);
 try{
  await db.batch([mutation,db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('Location conflict') END"),
   db.prepare('INSERT INTO location_activity(operation_id,occurred_at,actor_id,location_id,operation,fields) VALUES (?,unixepoch(),?,?,?,?)').bind(raw.operationId,userId,id,'location.'+raw.action,JSON.stringify(fields))]);
 }catch(error){
  if(/Location conflict|malformed JSON|UNIQUE constraint failed: location_activity.operation_id|Location operation already recorded/.test(String(error)))throw new LocationError(409,'The location or your access changed. Reload before submitting again.');
  throw error;
 }
 return {id};
}
export async function readLocations(db:D1Database,url:URL,activity=false){
 const keys=activity?['before','operation','search']:['status','search'];
 if([...url.searchParams.keys()].some(k=>!keys.includes(k)||url.searchParams.getAll(k).length!==1))throw new LocationError(400,'Invalid query');
 const search=url.searchParams.get('search')??'';
 if(search.length>80||/[\u0000-\u001f\u007f]/.test(search))throw new LocationError(400,'Invalid search');
 if(activity){
  const before=url.searchParams.get('before')??'9223372036854775807',operation=url.searchParams.get('operation')??'';
  if(!/^[1-9][0-9]{0,18}$/.test(before)||BigInt(before)>9223372036854775807n||operation&&!['location.create','location.update','location.archive','location.restore'].includes(operation))throw new LocationError(400,'Invalid log query');
  const rows=(await db.prepare(`SELECT CAST(a.sequence AS TEXT) AS sequence,a.occurred_at AS occurredAt,a.operation,a.fields,l.name AS locationName,n.nickname AS actorName
   FROM location_activity a JOIN locations l ON l.id=a.location_id LEFT JOIN user_nicknames n ON n.user_id=a.actor_id WHERE a.sequence<CAST(? AS INTEGER)
   AND (?='' OR a.operation=?) AND (?='' OR instr(lower(l.name||' '||a.operation),lower(?))>0) ORDER BY a.sequence DESC LIMIT 21`).bind(before,operation,operation,search,search).all()).results;
  return {entries:rows.slice(0,20),nextBefore:rows.length>20?String(rows[19].sequence):null};
 }
 const status=url.searchParams.get('status')??'active';if(!['active','archived','all'].includes(status))throw new LocationError(400,'Invalid location status');
 const rows=(await db.prepare(`SELECT ${locationColumns} FROM locations WHERE (?='all' OR is_active=?) AND (?='' OR instr(lower(name||' '||coalesce(city,'')),lower(?))>0) ORDER BY name COLLATE NOCASE,id LIMIT 201`).bind(status,status==='active'?1:0,search,search).all()).results;
 if(rows.length>200)throw new LocationError(503,'Location catalogue exceeds its supported size');
 return {locations:rows};
}
