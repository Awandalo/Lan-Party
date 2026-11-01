import {mfaMutationGuard} from './mfa-assurance';
import {mfaSchemaReady} from './mfa-session';
import {administratorPredicate} from '../rbac-authority';

export class LifecycleDenied extends Error {}
export class LifecycleProofRequired extends Error {}
export class LifecycleStateConflict extends Error {}
export class LastAdministrator extends Error {}
export const LIVE_DELETION_ENABLED=true; // Owner-approved local/DEV flow; existing environment gate excludes PROD.

// Missing OR partial schema never enables a lifecycle operation.
export async function lifecycleReady(db:D1Database){
 const rows=await db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name IN ('account_lifecycle','account_reactivation')").all<{name:string}>();
 if(rows.results.length===0)return false;
 if(rows.results.length!==2)throw new LifecycleDenied();
 const guards=await db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name IN ('account_reactivation_identity','account_reactivation_phase','account_reactivation_open_idx')").first<number>('n');
 if(guards!==3||!await mfaSchemaReady(db))throw new LifecycleDenied();
 return true;
}
export const administratorSql=`(${administratorPredicate()})`;
export const lastAdministratorSql=`NOT (${administratorSql} AND NOT EXISTS(
 SELECT 1 FROM users other WHERE other.id<>u.id AND ${administratorPredicate('other')}))`;
export const assertChanged=(db:D1Database)=>db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('lifecycle guard failed') END");
export async function lifecycleGuard(db:D1Database,userId:string,version:number,digest:string,admin=false){
 const mfa=await mfaMutationGuard(db,{userId,status:'active',authVersion:version,emailVerifiedAt:0},digest);
 return {sql:`EXISTS(SELECT 1 FROM users u JOIN auth_sessions s ON s.user_id=u.id
 JOIN auth_recent_authentication a ON a.session_digest=s.token_digest AND a.user_id=u.id
 WHERE u.id=? AND u.status='active' AND u.email_verified_at IS NOT NULL AND u.auth_version=?
 AND s.token_digest=? AND s.auth_version=u.auth_version AND s.revoked_at IS NULL AND s.created_at<=unixepoch() AND s.expires_at>unixepoch()
 AND a.auth_version=u.auth_version AND a.method='password' AND a.authenticated_at<=unixepoch()
 AND a.authenticated_at>unixepoch()-120 AND a.expires_at>unixepoch() ${admin?'AND '+administratorSql:''})
 AND ${mfa.sql}`,values:[userId,version,digest,...mfa.values]};
}
export async function requireLifecycleProof(db:D1Database,userId:string,version:number,digest:string,admin=false){
 const guard=await lifecycleGuard(db,userId,version,digest,admin);
 if(!await db.prepare('SELECT 1 WHERE '+guard.sql).bind(...guard.values).first())throw new LifecycleProofRequired();
 return guard;
}
export function eraseLifecycleOperations(db:D1Database,userId:string){
 return [
 db.prepare("DELETE FROM account_reactivation WHERE user_id=?").bind(userId),
 db.prepare("DELETE FROM auth_mfa_recovery_operations WHERE user_id=?").bind(userId),
 db.prepare("DELETE FROM auth_mfa_regeneration_operations WHERE user_id=?").bind(userId),
 db.prepare("DELETE FROM auth_mfa_transactions WHERE user_id=?").bind(userId),
 db.prepare("DELETE FROM auth_recent_authentication WHERE user_id=?").bind(userId),
 ];
}
export async function deactivateAccount(db:D1Database,userId:string,version:number,digest:string){
 const guard=await requireLifecycleProof(db,userId,version,digest);
 if(await db.prepare('SELECT 1 FROM account_lifecycle WHERE user_id=?').bind(userId).first())throw new LifecycleStateConflict();
 if(!await db.prepare(`SELECT 1 FROM users u WHERE u.id=? AND ${lastAdministratorSql}`).bind(userId).first())throw new LastAdministrator();
 await db.batch([
 db.prepare(`INSERT INTO account_lifecycle(user_id,state,deactivated_at)
 SELECT u.id,'deactivated',unixepoch() FROM users u WHERE u.id=? AND ${lastAdministratorSql} AND ${guard.sql}`)
 .bind(userId,...guard.values),assertChanged(db),
 db.prepare("UPDATE users SET status='disabled',first_name='Deactivated',last_name='User',name_prefix_id=NULL,updated_at=max(updated_at,unixepoch()) WHERE id=? AND status='active'").bind(userId),assertChanged(db),
 ...eraseLifecycleOperations(db,userId),
 ]);
}
export function lifecycleDisplay(status:string,nickname:string,admin=false){return status==='active'||admin?nickname:'Deactivated user';}
