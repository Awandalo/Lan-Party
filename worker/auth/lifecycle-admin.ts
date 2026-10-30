import {administratorPredicate} from '../rbac-authority';
import {mfaSessionCondition} from './mfa-session';
import {assertChanged,eraseLifecycleOperations,lastAdministratorSql,LastAdministrator} from './account-lifecycle';
import {userActivityReady,userEvent} from './user-activity';

export class LifecycleConflict extends Error {}
export class LifecycleForbidden extends Error {}
export const commandUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export interface LifecycleCommand {operationId:string;userId:string;action:'invite'|'disable'|'cancel';version:number;issuedAt:number;invitationId:string|null}
export function adminGuard(actor:string,version:number,digest:string) {
 // Full enrolled-MFA session validity is retained, without fresh step-up.
 return {sql:`EXISTS(SELECT 1 FROM users u JOIN auth_sessions s ON s.user_id=u.id WHERE u.id=? AND u.auth_version=? AND s.token_digest=?
 AND s.auth_version=u.auth_version AND s.revoked_at IS NULL AND s.created_at<=unixepoch() AND s.expires_at>unixepoch()
 AND u.updated_at<=unixepoch() AND ${administratorPredicate()} AND ${mfaSessionCondition})`,values:[actor,version,digest]};
}
export async function requireAdmin(db:D1Database,actor:string,version:number,digest:string) {
 const guard=adminGuard(actor,version,digest);
 if(!await db.prepare('SELECT 1 WHERE '+guard.sql).bind(...guard.values).first())throw new LifecycleForbidden();
 return guard;
}
export async function commandReplay(db:D1Database,actor:string,c:LifecycleCommand) {
 const row=await db.prepare('SELECT * FROM lifecycle_commands WHERE operation_id=?').bind(c.operationId).first<{actor_id:string;target_id:string;action:string;target_version:number;issued_at:number;invitation_id:string|null;outcome:string}>();
 if(!row)return null;
 if(row.actor_id!==actor||row.target_id!==c.userId||row.action!==c.action||row.target_version!==c.version||row.issued_at!==c.issuedAt||row.invitation_id!==c.invitationId)throw new LifecycleConflict();
 return {outcome:row.outcome,replayed:true};
}
export function commandReceipt(db:D1Database,actor:string,c:LifecycleCommand,outcome:string) {
 return db.prepare('INSERT INTO lifecycle_commands(operation_id,actor_id,target_id,action,target_version,issued_at,invitation_id,outcome) VALUES (?,?,?,?,?,?,?,?)').bind(c.operationId,actor,c.userId,c.action,c.version,c.issuedAt,c.invitationId,outcome);
}
export async function memberLifecycle(db:D1Database,userId:string) {
 if(!await userActivityReady(db))throw new LifecycleConflict();
 return db.prepare(`SELECT u.auth_version AS version,unixepoch() AS issuedAt,u.status,l.origin,
 (SELECT operation_id FROM account_reactivation r WHERE r.user_id=u.id AND r.phase IN ('invited','claimed') AND r.expires_at>unixepoch()) AS invitationId,
 (u.status='disabled' AND l.state='deactivated' AND u.email_verified_at IS NOT NULL AND EXISTS(SELECT 1 FROM user_password_credentials WHERE user_id=u.id)) AS eligible
 FROM users u LEFT JOIN account_lifecycle l ON l.user_id=u.id WHERE u.id=?`).bind(userId).first();
}
export async function changeAccountState(db:D1Database,actor:string,version:number,digest:string,c:LifecycleCommand) {
 if(actor===c.userId)throw new LifecycleForbidden();
 const guard=await requireAdmin(db,actor,version,digest),replay=await commandReplay(db,actor,c);if(replay)return replay;
 const target=await db.prepare('SELECT status FROM users WHERE id=? AND auth_version=?').bind(c.userId,c.version).first<{status:string}>();
 if(!target)throw new LifecycleConflict();
 if(c.action==='disable'&&await db.prepare(`SELECT 1 FROM users u WHERE u.id=? AND NOT (${lastAdministratorSql})`).bind(c.userId).first())throw new LastAdministrator();
 const time='?<=unixepoch() AND ?>unixepoch()-86400';
 try {
 if(c.action==='disable') {
  if(target.status!=='active')throw new LifecycleConflict();
  await db.batch([
   db.prepare(`INSERT INTO account_lifecycle(user_id,state,deactivated_at,origin,disabled_by) SELECT u.id,'deactivated',unixepoch(),'administrator',? FROM users u WHERE u.id=? AND u.status='active' AND u.auth_version=? AND ${lastAdministratorSql} AND ${guard.sql} AND ${time}`).bind(actor,c.userId,c.version,...guard.values,c.issuedAt,c.issuedAt),assertChanged(db),
   db.prepare("UPDATE users SET status='disabled',updated_at=max(updated_at,unixepoch()) WHERE id=? AND status='active'").bind(c.userId),assertChanged(db),
   ...eraseLifecycleOperations(db,c.userId),commandReceipt(db,actor,c,'disabled'),
  ]);
 } else {
  if(target.status!=='disabled'||!c.invitationId)throw new LifecycleConflict();
  await db.batch([
   db.prepare(`UPDATE account_reactivation SET phase='cancelled' WHERE user_id=? AND operation_id=? AND auth_version=? AND phase IN ('invited','claimed') AND EXISTS(SELECT 1 FROM users u JOIN account_lifecycle l ON l.user_id=u.id WHERE u.id=? AND u.status='disabled' AND u.auth_version=? AND l.state='deactivated') AND ${guard.sql} AND ${time}`).bind(c.userId,c.invitationId,c.version,c.userId,c.version,...guard.values,c.issuedAt,c.issuedAt),assertChanged(db),
   db.prepare("UPDATE lifecycle_commands SET outcome='cancelled' WHERE operation_id=?").bind(c.invitationId),
   commandReceipt(db,actor,c,'cancelled'),userEvent(db,'invitation.cancelled',actor,c.userId,c.operationId),
  ]);
 }
 }catch {const replay=await commandReplay(db,actor,c);if(replay)return replay;throw new LifecycleConflict();}
 return {outcome:c.action==='disable'?'disabled':'cancelled',replayed:false};
}
