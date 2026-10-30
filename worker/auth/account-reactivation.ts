import {sessionCompletion} from './mfa-login';
import {AUTH_POLICY} from './config';
import {generateToken,isValidToken,digestToken} from './tokens';
import {mfaDigest,decryptTotpSecret,verifyTotp,recoveryVerifier} from './mfa-crypto';
import type {MfaKeys} from './mfa-crypto';
import {privateName} from './accounts';
import {verifyPassword} from './passwords';
import {assertChanged,LifecycleDenied} from './account-lifecycle';
import type {LoginReservation} from './login-limits';
import {requireAdmin,commandReplay,commandReceipt,LifecycleConflict} from './lifecycle-admin';
import type {LifecycleCommand} from './lifecycle-admin';
import {userActivityReady,userEvent} from './user-activity';

export async function initiateReactivation(db:D1Database,actor:string,version:number,session:string,userId:string,command?:LifecycleCommand){
 const guard=await requireAdmin(db,actor,version,session);
 const audited=await userActivityReady(db);
 const snapshot=await db.prepare(`SELECT auth_version version,unixepoch() issuedAt${audited?",(SELECT operation_id FROM account_reactivation WHERE user_id=users.id AND phase IN ('invited','claimed') AND expires_at>unixepoch()) invitationId":''} FROM users WHERE id=?`).bind(userId).first<{version:number;issuedAt:number;invitationId?:string|null}>();
 if(!snapshot)throw new LifecycleConflict();
 const c=command??{operationId:crypto.randomUUID(),userId,action:'invite',version:snapshot.version,issuedAt:snapshot.issuedAt,invitationId:snapshot.invitationId??null};
 if(audited){const replay=await commandReplay(db,actor,c);if(replay)return replay;}
 const token=generateToken(),digest=await mfaDigest('reactivation-invitation',token);
 // Recheck actor and target in each mutation. A failed replacement cannot revoke a valid invite.
 const eligible=`EXISTS(SELECT 1 FROM users u JOIN account_lifecycle l ON l.user_id=u.id
 WHERE u.id=? AND u.status='disabled' AND l.state='deactivated' AND u.email_verified_at IS NOT NULL
 AND u.auth_version=? AND ?<=unixepoch() AND ?>unixepoch()-86400
 AND EXISTS(SELECT 1 FROM user_password_credentials c WHERE c.user_id=u.id)) AND ${guard.sql}`;
 const results=await db.batch([
 ...(audited?[
 db.prepare(`UPDATE users SET updated_at=updated_at WHERE id=? AND ${eligible} AND COALESCE((SELECT operation_id FROM account_reactivation WHERE user_id=? AND phase IN ('invited','claimed') AND expires_at>unixepoch()),'')=COALESCE(?,'')`).bind(userId,userId,c.version,c.issuedAt,c.issuedAt,...guard.values,userId,c.invitationId),assertChanged(db),
 ]:[]),
 db.prepare(`UPDATE account_reactivation SET phase='cancelled' WHERE user_id=? AND phase IN ('invited','claimed') AND ${eligible}`).bind(userId,userId,c.version,c.issuedAt,c.issuedAt,...guard.values),
 ...(audited?[db.prepare("UPDATE lifecycle_commands SET outcome='superseded' WHERE operation_id=? AND outcome IN ('pending','accepted')").bind(c.invitationId)]:[]),
 db.prepare(`INSERT INTO account_reactivation(invitation_digest,user_id,auth_version,email_normalized,phase,created_at,expires_at${audited?',operation_id':''})
 SELECT ?,u.id,u.auth_version,u.email_normalized,'invited',unixepoch(),unixepoch()+1800${audited?',?':''} FROM users u WHERE u.id=? AND ${eligible}
 RETURNING email_normalized,expires_at`).bind(digest,...(audited?[c.operationId]:[]),userId,userId,c.version,c.issuedAt,c.issuedAt,...guard.values),assertChanged(db),
 ...(audited?[commandReceipt(db,actor,c,'pending'),userEvent(db,'invitation.prepared',actor,userId,c.operationId)]:[]),
 ]);
 const row=results.flatMap(r=>r.results as {email_normalized?:string;expires_at?:number}[]).find(r=>typeof r.email_normalized==='string') as {email_normalized:string;expires_at:number}|undefined;
 if(!row)throw new LifecycleDenied();
 return {token,digest,email:row.email_normalized,expiresAt:row.expires_at,operationId:c.operationId};
}
export async function cancelInvitation(db:D1Database,digest:string){
 const audited=await userActivityReady(db);
 await db.batch([
 db.prepare("UPDATE account_reactivation SET phase='cancelled' WHERE invitation_digest=? AND phase IN ('invited','claimed')").bind(digest),
 ...(audited?[
 db.prepare("UPDATE lifecycle_commands SET outcome='unconfirmed' WHERE operation_id IN (SELECT operation_id FROM account_reactivation WHERE invitation_digest=? AND phase='cancelled') AND outcome='pending'").bind(digest),
 db.prepare("INSERT INTO user_activity(event,actor_kind,target_id,operation_id) SELECT 'invitation.unconfirmed','system',user_id,operation_id FROM account_reactivation WHERE invitation_digest=? AND phase='cancelled' AND NOT EXISTS(SELECT 1 FROM user_activity a WHERE a.operation_id=account_reactivation.operation_id AND a.event='invitation.unconfirmed')").bind(digest),
 ]:[]),
 ]);
}
export async function acceptInvitationDelivery(db:D1Database,operationId:string){
 await db.batch([
 db.prepare("UPDATE lifecycle_commands SET outcome='accepted' WHERE operation_id=? AND outcome='pending'").bind(operationId),
 db.prepare("INSERT INTO user_activity(event,actor_kind,target_id,operation_id) SELECT 'invitation.accepted','system',target_id,operation_id FROM lifecycle_commands WHERE operation_id=? AND NOT EXISTS(SELECT 1 FROM user_activity WHERE operation_id=? AND event='invitation.accepted')").bind(operationId,operationId),
 ]);
}
export async function claimReactivation(db:D1Database,token:string){
 if(!isValidToken(token))return null;
 const context=generateToken(),digest=await mfaDigest('reactivation-context',context);
 const result=await db.prepare(`UPDATE account_reactivation SET phase='claimed',context_digest=?,claimed_at=unixepoch()
 WHERE invitation_digest=? AND phase='invited' AND created_at<=unixepoch() AND expires_at>unixepoch()
 AND EXISTS(SELECT 1 FROM users u JOIN account_lifecycle l ON l.user_id=u.id WHERE u.id=account_reactivation.user_id
 AND u.status='disabled' AND u.auth_version=account_reactivation.auth_version
 AND u.email_normalized=account_reactivation.email_normalized AND l.state='deactivated')
 RETURNING user_id`).bind(digest,await mfaDigest('reactivation-invitation',token)).first();
 return result?{context,digest}:null;
}
export const liveReactivation=`r.phase='claimed' AND r.created_at<=unixepoch() AND r.claimed_at<=unixepoch()
 AND r.expires_at>unixepoch() AND r.claimed_at>unixepoch()-300
 AND u.status='disabled' AND u.email_verified_at IS NOT NULL AND u.auth_version=r.auth_version
 AND u.email_normalized=r.email_normalized AND l.state='deactivated'`;
export async function reactivationContext(db:D1Database,context:string){
 if(!isValidToken(context))return null;
 return db.prepare(`SELECT r.user_id,r.auth_version,r.context_digest,r.email_normalized,
 c.password_hash,f.factor_id,f.secret_ciphertext,f.secret_nonce,f.key_id,f.last_step,f.recovery_set_id
 FROM account_reactivation r JOIN users u ON u.id=r.user_id JOIN account_lifecycle l ON l.user_id=u.id
 JOIN user_password_credentials c ON c.user_id=u.id LEFT JOIN auth_totp_factors f ON f.user_id=u.id
 WHERE r.context_digest=? AND ${liveReactivation}`).bind(await mfaDigest('reactivation-context',context)).first<{
 user_id:string;auth_version:number;context_digest:string;email_normalized:string;password_hash:string;
 factor_id:string|null;secret_ciphertext:string;secret_nonce:string;key_id:string;last_step:number;recovery_set_id:string}>();
}
export async function verifyReactivationPassword(row:NonNullable<Awaited<ReturnType<typeof reactivationContext>>>,password:string,pepper?:string){
 return typeof password==='string'&&password.length<=128&&await verifyPassword(password,row.password_hash,pepper);
}
export async function finishReactivation(db:D1Database,row:NonNullable<Awaited<ReturnType<typeof reactivationContext>>>,
 input:{firstName:unknown;lastName:unknown;code:string;method:'totp'|'recovery'},keys:MfaKeys,environment:'local'|'dev'|'prod',
 held:LoginReservation,verifiedAt:number){
 const first=privateName(input.firstName),last=privateName(input.lastName);
 const lease=held.activeCondition(),factor=row.factor_id;
 const guard=`EXISTS(SELECT 1 FROM account_reactivation r JOIN users u ON u.id=r.user_id
 JOIN account_lifecycle l ON l.user_id=u.id JOIN user_password_credentials c ON c.user_id=u.id
 WHERE r.context_digest=? AND r.user_id=? AND r.auth_version=? AND c.password_hash=?
 AND ${liveReactivation} AND unixepoch()>=? AND unixepoch()<?)
 AND ${lease.sql} AND ${factor?'EXISTS(SELECT 1 FROM auth_totp_factors WHERE user_id=? AND factor_id=? AND recovery_set_id=?)':'NOT EXISTS(SELECT 1 FROM auth_totp_factors WHERE user_id=?)'}`;
 const values=[row.context_digest,row.user_id,row.auth_version,row.password_hash,verifiedAt,verifiedAt+120,...lease.values,
 ...(factor?[row.user_id,factor,row.recovery_set_id]:[row.user_id])];
 const token=generateToken(),sessionDigest=await digestToken(token,'session');
 const statements:D1PreparedStatement[]=[];
 if(factor){
 if(input.method==='totp'){
 const secret=await decryptTotpSecret({ciphertext:row.secret_ciphertext,nonce:row.secret_nonce,keyId:row.key_id},keys,
 {environment,userId:row.user_id,id:factor,purpose:'active'});
 const step=await verifyTotp(secret,input.code,verifiedAt,row.last_step);if(step===null)return false;
 statements.push(db.prepare(`UPDATE auth_totp_factors SET last_step=? WHERE user_id=? AND factor_id=? AND last_step=? AND ${guard}`)
 .bind(step,row.user_id,factor,row.last_step,...values),assertChanged(db));
 }else{
 const verifier=await recoveryVerifier(row.user_id,row.recovery_set_id,input.code);if(!verifier)return false;
 if(!await db.prepare("SELECT 1 FROM auth_mfa_recovery_codes WHERE user_id=? AND set_id=? AND verifier=? AND consumed_at IS NULL AND created_at<=unixepoch()").bind(row.user_id,row.recovery_set_id,verifier).first())return false;
 statements.push(db.prepare(`UPDATE auth_mfa_recovery_codes SET consumed_at=unixepoch()
 WHERE user_id=? AND set_id=? AND verifier=? AND consumed_at IS NULL AND created_at<=unixepoch() AND ${guard}`)
 .bind(row.user_id,row.recovery_set_id,verifier,...values),assertChanged(db));
 }}
 statements.push(
 db.prepare(`UPDATE account_reactivation SET phase='complete' WHERE context_digest=? AND ${guard}`).bind(row.context_digest,...values),assertChanged(db),
 // The operation's completed phase is a transaction-local authorization ticket, never a session.
 db.prepare(`UPDATE users SET status='active',first_name=?,last_name=?,updated_at=max(updated_at,unixepoch())
 WHERE id=? AND status='disabled' AND auth_version=? AND EXISTS(SELECT 1 FROM account_reactivation
 WHERE context_digest=? AND phase='complete' AND user_id=users.id AND auth_version=users.auth_version)`)
 .bind(first,last,row.user_id,row.auth_version,row.context_digest),assertChanged(db),
 ...(factor?sessionCompletion(db,{user_id:row.user_id,auth_version:row.auth_version+1,factor_id:factor,primary_method:'password',primary_authenticated_at:verifiedAt},
 sessionDigest,verifiedAt,input.method).flatMap(statement=>[statement,assertChanged(db)]):[
 db.prepare("INSERT INTO auth_sessions(id,user_id,token_digest,auth_version,created_at,expires_at) SELECT ?,id,?,auth_version,?,? FROM users WHERE id=? AND status='active' AND auth_version=? AND changes()=1")
 .bind(crypto.randomUUID(),sessionDigest,verifiedAt,verifiedAt+AUTH_POLICY.sessionLifetimeSeconds,row.user_id,row.auth_version+1),assertChanged(db),
 db.prepare("INSERT INTO auth_recent_authentication(session_digest,user_id,auth_version,method,authenticated_at,expires_at) SELECT ?,id,auth_version,'password',?,? FROM users WHERE id=? AND auth_version=? AND status='active' AND changes()=1")
 .bind(sessionDigest,verifiedAt,verifiedAt+300,row.user_id,row.auth_version+1),assertChanged(db),
 ]),
 db.prepare("DELETE FROM account_lifecycle WHERE user_id=?").bind(row.user_id),assertChanged(db),
 db.prepare("DELETE FROM account_reactivation WHERE user_id=?").bind(row.user_id));
 await db.batch(statements);return {token};
}
