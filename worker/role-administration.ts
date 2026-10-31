import {ADMIN_ROLE_ID,USER_ROLE_ID,PROTECTED_PERMISSIONS,administratorPredicate} from './rbac-authority';
import {mfaSessionCondition} from './auth/mfa-session';

export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export class RoleDenied extends Error {}
export class RoleConflict extends Error {}
export class RoleInvalid extends Error {}
export class RoleAssigned extends RoleConflict {}
export async function roleDeletionReady(db:D1Database){
 const schema=await db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='role_activity'").first<string>('sql');
 return !!schema?.includes("'role.delete'");
}
export async function roleSchemaReady(db:D1Database) {
 const row=await db.prepare("SELECT count(*) n FROM sqlite_schema WHERE type='table' AND name IN ('rbac_state','role_activity')").first<number>('n');
 if(row===0)return false;
 if(row!==2)throw Error('Partial role schema');
 const columns=(await db.prepare('PRAGMA table_info(roles)').all<{name:string}>()).results;
 const triggers=await db.prepare("SELECT count(*) n FROM sqlite_schema WHERE type='trigger' AND name IN ('role_activity_no_update','role_activity_no_delete','role_activity_no_replace','builtin_role_no_update','builtin_role_no_delete','builtin_role_no_replace')").first<number>('n');
 if(!columns.some(c=>c.name==='is_protected')||triggers!==6)throw Error('Partial role schema');
 return true;
}
export async function isAdministrator(db:D1Database,userId:string) {
 return !!await db.prepare(`SELECT 1 FROM users u WHERE u.id=? AND ${administratorPredicate()}`).bind(userId).first();
}
const grantSql=`EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
 JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id
 WHERE ur.user_id=u.id AND r.is_active=1 AND ur.assigned_at<=unixepoch() AND rp.granted_at<=unixepoch() AND p.code='roles.manage')`;
const actorSql=`EXISTS(SELECT 1 FROM users u JOIN auth_sessions s ON s.user_id=u.id
 WHERE u.id=? AND u.status='active' AND u.email_verified_at IS NOT NULL
 AND s.token_digest=? AND s.auth_version=u.auth_version AND s.revoked_at IS NULL
 AND s.created_at<=unixepoch() AND s.expires_at>unixepoch() AND u.updated_at<=unixepoch()
 AND NOT EXISTS(SELECT 1 FROM account_lifecycle al WHERE al.user_id=u.id)
 AND ${mfaSessionCondition} AND (${administratorPredicate()} OR ${grantSql}))`;
const assertOne=(db:D1Database)=>db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('RBAC conflict') END");
interface RoleRow {id:string;code:string;name:string;description:string|null;isActive:number;isProtected:number}
const roleColumns='id,code,name,description,is_active AS isActive,is_protected AS isProtected';
export async function roleCatalogue(db:D1Database,userId:string,includeMemberCounts=false) {
 // A version must describe these exact rows. Separate reads could attach a newer
 // revision to stale definitions and allow a subsequent editor to lose a change.
 const snapshot=await db.batch([
  db.prepare('SELECT revision FROM rbac_state WHERE id=1'),
  db.prepare(`SELECT ${roleColumns} FROM roles ORDER BY code LIMIT 201`),
  db.prepare('SELECT id,code,description FROM permissions ORDER BY code LIMIT 101'),
  db.prepare('SELECT role_id AS roleId,permission_id AS permissionId,granted_at AS grantedAt FROM role_permissions ORDER BY role_id,permission_id LIMIT 20001'),
  db.prepare(`SELECT 1 AS allowed FROM users u WHERE u.id=? AND ${administratorPredicate()}`).bind(userId),
  ...(includeMemberCounts?[db.prepare(`SELECT ur.role_id AS roleId,count(*) AS count FROM user_roles ur
   JOIN roles r ON r.id=ur.role_id JOIN users u ON u.id=ur.user_id
   WHERE r.is_active=1 AND ur.assigned_at<=unixepoch() AND u.status='active'
   AND u.email_verified_at IS NOT NULL AND u.updated_at<=unixepoch()
   AND NOT EXISTS(SELECT 1 FROM account_lifecycle al WHERE al.user_id=u.id)
   GROUP BY ur.role_id`)]:[]),
 ]);
 const roles=snapshot[1].results as unknown as RoleRow[];
 if(roles.length>200)throw Error('Role catalogue exceeds bound');
 const permissions=snapshot[2].results as unknown as {id:string;code:string;description:string}[];
 if(permissions.length>100||snapshot[3].results.length>20000)throw Error('Permission catalogue exceeds bound');
 const revision=(snapshot[0].results[0] as {revision?:unknown}|undefined)?.revision;
 const memberCounts=includeMemberCounts?snapshot[5].results as unknown as {roleId:string;count:number}[]:[];
 if(typeof revision!=='number'||!Number.isSafeInteger(revision))throw Error('Role revision unavailable');
 return {revision,administrator:snapshot[4].results.length===1,deletionAvailable:await roleDeletionReady(db),
  roles:includeMemberCounts?roles.map(role=>({...role,assignedMemberCount:Number(memberCounts.find(row=>row.roleId===role.id)?.count??0)})):roles,
  mappings:snapshot[3].results as unknown as {roleId:string;permissionId:string;grantedAt:number}[],permissions:permissions.map(p=>({...p,protected:PROTECTED_PERMISSIONS.includes(p.code as typeof PROTECTED_PERMISSIONS[number])}))};
}
export async function roleActivity(db:D1Database,before:string|null,filters:{date?:string;operation?:string;search?:string;includeNames?:boolean}={}) {
 if(before!==null && (!/^[1-9][0-9]{0,18}$/.test(before)||BigInt(before)>9223372036854775807n))throw new RoleInvalid();
 const date=filters.date??'',operation=filters.operation??'',search=filters.search??'';
 if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date))throw new RoleInvalid();
 if(operation&&!['role.create','role.update','role.delete','membership.add','membership.remove'].includes(operation)||search.length>80||/[\u0000-\u001f\u007f]/.test(search))throw new RoleInvalid();
 const start=date?Math.floor(Date.parse(date+'T00:00:00Z')/1000):0;
 const names=filters.includeNames===true;
 const rows=(await db.prepare(`SELECT CAST(a.sequence AS TEXT) AS sequence,a.operation_id AS operationId,a.occurred_at AS occurredAt,
 a.actor_id AS actorId,a.operation,a.role_id AS roleId,a.account_id AS accountId,a.delta,
 ${names?'an.nickname':'NULL'} AS actorName,${names?'tn.nickname':'NULL'} AS accountName,r.name AS roleName
 FROM role_activity a LEFT JOIN roles r ON r.id=a.role_id
 ${names?`LEFT JOIN users au ON au.id=a.actor_id AND au.status='active' AND NOT EXISTS(SELECT 1 FROM account_lifecycle WHERE user_id=au.id)
 LEFT JOIN user_nicknames an ON an.user_id=au.id
 LEFT JOIN users tu ON tu.id=a.account_id AND tu.status='active' AND NOT EXISTS(SELECT 1 FROM account_lifecycle WHERE user_id=tu.id)
 LEFT JOIN user_nicknames tn ON tn.user_id=tu.id`:''}
 WHERE a.sequence<CAST(? AS INTEGER) AND (?='' OR a.operation=?) AND (?='' OR a.occurred_at>=? AND a.occurred_at<?)
 AND (?='' OR instr(lower(a.operation_id||' '||a.actor_id||' '||a.role_id||' '||coalesce(a.account_id,'')||' '||coalesce(r.name,'')${names?"||' '||coalesce(an.nickname,'')||' '||coalesce(tn.nickname,'')":''}),lower(?))>0)
 ORDER BY a.sequence DESC LIMIT 21`).bind(before??'9223372036854775807',operation,operation,date,start,start+86400,search,search).all()).results;
 const permissions=(await db.prepare('SELECT id,code FROM permissions ORDER BY code LIMIT 101').all()).results;
 if(permissions.length>100)throw Error('Permission catalogue exceeds bound');
 return {entries:rows.slice(0,20),nextBefore:rows.length>20?String(rows[19].sequence):null,permissions};
}
function input(value:unknown):Record<string,unknown> {
 if(!value || typeof value!=='object' || Array.isArray(value))throw new RoleInvalid();
 return value as Record<string,unknown>;
}
function text(value:unknown,max:number,empty=false) {
 if(typeof value!=='string' || value!==value.trim() || (!empty&&!value) || value.length>max || /[\u0000-\u001f\u007f]/.test(value))throw new RoleInvalid();
 return value;
}
export async function mutateRole(db:D1Database,userId:string,digest:string,raw:unknown) {
 const body=input(raw),action=body.action;
 if(!['create','update','delete','assign','remove'].includes(String(action)) || !Number.isSafeInteger(body.revision) || Number(body.revision)<0 || !UUID.test(String(body.operationId)))throw new RoleInvalid();
 const allowed=['action','revision','operationId','roleId',...(action==='delete'?['confirmed']:['assign','remove'].includes(String(action))?['accountId']:['code','name','description','active','protected','permissionIds'])];
 if(Object.keys(body).some(k=>!allowed.includes(k)))throw new RoleInvalid();
 const admin=await isAdministrator(db,userId),id=action==='create'?crypto.randomUUID():String(body.roleId);
 if(!UUID.test(id))throw new RoleInvalid();
 if(action==='create' && body.roleId!==undefined)throw new RoleInvalid();
 const catalogue=await roleCatalogue(db,userId);
 if(catalogue.revision!==body.revision)throw new RoleConflict();
 const old=action==='create'?null:catalogue.roles.find(r=>r.id===id);
 if(action!=='create' && !old)throw new RoleConflict();
 const protectedIds=new Set(catalogue.permissions.filter(p=>p.protected).map(p=>p.id));
 const previous=catalogue.mappings.filter(m=>m.roleId===id).map(m=>m.permissionId).sort();
 const privileged=old?.isProtected===1 || id===ADMIN_ROLE_ID || previous.some(p=>protectedIds.has(p));
 if(!admin && privileged)throw new RoleDenied();
 const statements:D1PreparedStatement[]=[];
 let delta:object={},accountId:string|null=null,operation:string;
 if(action==='delete') {
  if(body.confirmed!==true)throw new RoleInvalid();
  if(!catalogue.deletionAvailable)throw new RoleConflict();
  if(id===USER_ROLE_ID||privileged)throw new RoleDenied();
  if(await db.prepare('SELECT 1 FROM user_roles WHERE role_id=? LIMIT 1').bind(id).first())throw new RoleAssigned();
  // Count every assignment, not just effective active members. The final DELETE
  // repeats this predicate inside the revision/session/audit transaction.
  statements.push(db.prepare('DELETE FROM role_permissions WHERE role_id=?').bind(id),
   db.prepare('DELETE FROM roles WHERE id=? AND is_protected=0 AND NOT EXISTS(SELECT 1 FROM user_roles WHERE role_id=roles.id)').bind(id),assertOne(db));
  delta={deleted:{before:false,after:true},permissions:{before:previous,after:[]}};operation='role.delete';
 } else if(action==='assign'||action==='remove') {
  accountId=String(body.accountId);
  if(!UUID.test(accountId))throw new RoleInvalid();
  // No self-role changes, including ordinary roles; no reactivation via roles.
  if(accountId===userId)throw new RoleDenied();
  const target=await db.prepare("SELECT id FROM users WHERE id=?"+(action==='assign'?" AND status='active' AND email_verified_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM account_lifecycle WHERE user_id=users.id)":"")).bind(accountId).first();
  if(!target || action==='assign'&&!old?.isActive)throw new RoleConflict();
  const present=!!await db.prepare('SELECT 1 FROM user_roles WHERE user_id=? AND role_id=?').bind(accountId,id).first();
  if(present===(action==='assign'))throw new RoleConflict();
  const targetGuard=`EXISTS(SELECT 1 FROM users t WHERE t.id=? ${action==='assign'?"AND t.status='active' AND t.email_verified_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM account_lifecycle al WHERE al.user_id=t.id)":""})`;
  if(action==='assign')statements.push(db.prepare(`INSERT INTO user_roles(user_id,role_id,assigned_at,assigned_by_user_id) SELECT ?,?,unixepoch(),? WHERE ${targetGuard}`).bind(accountId,id,userId,accountId));
  else statements.push(db.prepare(`DELETE FROM user_roles WHERE user_id=? AND role_id=? AND ${targetGuard}
   AND (?<>'${ADMIN_ROLE_ID}' OR EXISTS(SELECT 1 FROM users u WHERE u.id<>? AND ${administratorPredicate()}))`).bind(accountId,id,accountId,id,accountId));
  statements.push(assertOne(db));delta={assigned:{before:present,after:!present}};operation=action==='assign'?'membership.add':'membership.remove';
 } else {
  if(id===ADMIN_ROLE_ID || id===USER_ROLE_ID)throw new RoleDenied();
  const name=text(body.name,80),description=text(body.description,400,true);
  if(typeof body.active!=='boolean' || typeof body.protected!=='boolean' || !Array.isArray(body.permissionIds)
   || body.permissionIds.length>100 || new Set(body.permissionIds).size!==body.permissionIds.length
   || body.permissionIds.some(p=>typeof p!=='string'||!catalogue.permissions.some(x=>x.id===p)))throw new RoleInvalid();
  const next=(body.permissionIds as string[]).slice().sort();
  if(!admin && (body.protected || old?.isProtected!==undefined && body.protected!==!!old.isProtected || next.some(p=>protectedIds.has(p))))throw new RoleDenied();
  const securityChange=!old || old.isActive!==Number(body.active)||old.isProtected!==Number(body.protected)||JSON.stringify(previous)!==JSON.stringify(next);
  if(old && securityChange && await db.prepare('SELECT 1 FROM user_roles WHERE user_id=? AND role_id=?').bind(userId,id).first())throw new RoleDenied();
  if(action==='create') {
   const code=text(body.code,40);if(!/^[a-z][a-z0-9_]*[a-z0-9]$/.test(code)||['admin','user'].includes(code))throw new RoleInvalid();
   if(catalogue.roles.length>=200)throw new RoleConflict();
   statements.push(db.prepare('INSERT INTO roles(id,code,name,description,is_active,is_protected,created_at,updated_at) VALUES(?,?,?,?,?,?,unixepoch(),unixepoch())').bind(id,code,name,description,Number(body.active),Number(body.protected)));
  } else {
   if(body.code!==old!.code)throw new RoleInvalid();
   statements.push(db.prepare('UPDATE roles SET name=?,description=?,is_active=?,is_protected=?,updated_at=max(updated_at,unixepoch()) WHERE id=?').bind(name,description,Number(body.active),Number(body.protected),id));
  }
  statements.push(assertOne(db));
  for(const permission of previous.filter(p=>!next.includes(p)))statements.push(db.prepare('DELETE FROM role_permissions WHERE role_id=? AND permission_id=?').bind(id,permission));
  for(const permission of next.filter(p=>!previous.includes(p)))statements.push(db.prepare('INSERT INTO role_permissions(role_id,permission_id,granted_at) VALUES(?,?,unixepoch())').bind(id,permission));
  // Metadata content can contain names; audit only records which fields changed.
  delta={fields:old?['name','description'].filter(k=>old[k as 'name'|'description']!==({name,description})[k as 'name'|'description']):['code','name','description'],
   active:{before:old?.isActive??null,after:Number(body.active)},protected:{before:old?.isProtected??null,after:Number(body.protected)},permissions:{before:previous,after:next}};
  operation=action==='create'?'role.create':'role.update';
 }
 // Revision excludes stale RBAC snapshots; the SQL gate also rechecks sessions,
 // current role assignments, genuine admin authority and MFA session validity.
 const gate=actorSql+(admin?` AND EXISTS(SELECT 1 FROM users u WHERE u.id=? AND ${administratorPredicate()})`:'');
 try {
  await db.batch([
   db.prepare(`UPDATE rbac_state SET revision=revision+1 WHERE id=1 AND revision=? AND ${gate}`).bind(body.revision as number,userId,digest,...(admin?[userId]:[])),assertOne(db),
   ...statements,
   db.prepare('INSERT INTO role_activity(operation_id,occurred_at,actor_id,operation,role_id,account_id,delta,revision) SELECT ?,unixepoch(),?,?,?,?,?,revision FROM rbac_state WHERE id=1')
    .bind(body.operationId as string,userId,operation,id,accountId,JSON.stringify(delta)),
  ]);
 } catch {throw new RoleConflict();}
 return {roleId:id,revision:Number(body.revision)+1,operationId:body.operationId};
}
