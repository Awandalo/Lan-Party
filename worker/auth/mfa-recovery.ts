import type {MfaKeys} from './mfa-crypto';
import {mfaDigest,generateTotpSecret,encryptTotpSecret,decryptTotpSecret,generateRecoveryCodes,recoveryVerifier,
  verifyTotp,provisioningUri,sealRecoveryDisplay,openRecoveryDisplay} from './mfa-crypto';
import type {MfaChallenge} from './mfa-login';
import type {LoginReservation} from './login-limits';

export interface RecoveryContext {token:string;browser:string;now:number}
export interface RecoveryOperation {
 operation_digest:string;user_id:string;source_digest:string;browser_digest:string;auth_version:number;
 old_factor_id:string;old_set_id:string;new_factor_id:string;new_set_id:string;primary_method:'password'|'google';
 primary_authenticated_at:number;phase:string;secret_ciphertext:string;secret_nonce:string;key_id:string;
 display_ciphertext:string;display_nonce:string;display_key_id:string;created_at:number;expires_at:number;
 committed_at:number|null;display_expires_at:number|null;oidc_state_digest:string|null;
}
export class RecoveryPrimaryRequired extends Error {}
const clear=`secret_ciphertext=NULL,secret_nonce=NULL,key_id=NULL,display_ciphertext=NULL,display_nonce=NULL,display_key_id=NULL,oidc_state_digest=NULL`;
// SQLite JSON errors are statement failures, unlike zero-row guarded writes.
// Each assertion executes INSIDE the same D1 batch, so failures roll back proofs.
export const assertOne=(db:D1Database)=>db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('recovery guard failed') END");
const source=(c:RecoveryContext)=>mfaDigest('transaction',c.token);
async function binding(c:RecoveryContext){
 if(!/^[a-f0-9]{64}$/.test(c.token)||!/^[a-f0-9]{64}$/.test(c.browser)||!Number.isSafeInteger(c.now)||c.now<0)throw Error('Recovery unavailable');
 const digest=await source(c);return [await mfaDigest('recovery-operation',digest),await mfaDigest('browser',c.browser)] as const;
}
function displayBinding(r:RecoveryOperation,environment:'local'|'dev'){
 return JSON.stringify([environment,r.user_id,r.operation_digest,r.new_factor_id,r.new_set_id,r.auth_version+1,r.browser_digest,r.source_digest,r.display_expires_at]);
}
function fresh(r:RecoveryOperation,now:number){if(r.primary_authenticated_at<=now-120||r.primary_authenticated_at>now)throw new RecoveryPrimaryRequired();}
export async function recoveryOperation(db:D1Database,c:RecoveryContext){
 const [id,browser]=await binding(c);
 return db.prepare(`SELECT o.* FROM auth_mfa_recovery_operations o JOIN users u ON u.id=o.user_id
  WHERE o.operation_digest=? AND o.browser_digest=? AND o.created_at<=? AND u.status='active' AND u.email_verified_at IS NOT NULL
  AND ((o.phase='pending' AND o.expires_at>? AND u.auth_version=o.auth_version AND EXISTS
    (SELECT 1 FROM auth_totp_factors f WHERE f.user_id=o.user_id AND f.factor_id=o.old_factor_id AND f.recovery_set_id=o.old_set_id))
   OR (o.phase IN ('committed','acknowledged') AND o.display_expires_at>? AND u.auth_version=o.auth_version+1 AND EXISTS
    (SELECT 1 FROM auth_totp_factors f WHERE f.user_id=o.user_id AND f.factor_id=o.new_factor_id AND f.recovery_set_id=o.new_set_id)))`)
  .bind(id,browser,c.now,c.now,c.now).first<RecoveryOperation>();
}
export async function cleanupRecovery(db:D1Database,now:number){
 await db.prepare(`UPDATE auth_mfa_recovery_operations SET phase='cancelled',${clear} WHERE operation_digest IN
  (SELECT operation_digest FROM auth_mfa_recovery_operations WHERE (phase='pending' AND expires_at<=?)
    OR (phase='committed' AND display_expires_at<=?) LIMIT 25)`).bind(now,now).run();
}
export async function startRecovery(db:D1Database,c:RecoveryContext,pending:MfaChallenge,code:string,keys:MfaKeys,environment:'local'|'dev',held:LoginReservation){
 const existing=await recoveryOperation(db,c);if(existing)return {resumed:true};
 if(pending.primary_authenticated_at<=c.now-120||pending.primary_authenticated_at>c.now)throw new RecoveryPrimaryRequired();
 const [id,browser]=await binding(c);
 if(pending.token_digest!==await source(c))throw Error('Recovery unavailable');
 const verifier=await recoveryVerifier(pending.user_id,pending.recovery_set_id,code);
 if(!verifier||!await db.prepare('SELECT verifier FROM auth_mfa_recovery_codes WHERE user_id=? AND set_id=? AND verifier=? AND consumed_at IS NULL')
  .bind(pending.user_id,pending.recovery_set_id,verifier).first())return null;
 const secret=generateTotpSecret(),newFactor=crypto.randomUUID(),newSet=crypto.randomUUID();
 const sealed=await encryptTotpSecret(secret,keys,{environment,userId:pending.user_id,id:newFactor,purpose:'pending'});
 const lease=held.activeCondition();
 await db.batch([
  db.prepare(`UPDATE auth_mfa_recovery_codes SET consumed_at=? WHERE user_id=? AND set_id=? AND verifier=? AND consumed_at IS NULL
   AND ${lease.sql} AND EXISTS(SELECT 1 FROM auth_mfa_transactions t JOIN users u ON u.id=t.user_id
    JOIN auth_totp_factors f ON f.user_id=u.id WHERE t.token_digest=? AND t.browser_digest=? AND t.phase='pending' AND t.purpose='login'
    AND t.user_id=auth_mfa_recovery_codes.user_id AND t.auth_version=? AND u.auth_version=t.auth_version AND u.status='active' AND u.email_verified_at IS NOT NULL
    AND t.created_at<=? AND t.expires_at>? AND t.expires_at>unixepoch() AND t.primary_authenticated_at>? AND t.primary_authenticated_at<=?
    AND f.factor_id=? AND f.recovery_set_id=auth_mfa_recovery_codes.set_id)`)
   .bind(c.now,pending.user_id,pending.recovery_set_id,verifier??'',...lease.values,pending.token_digest,browser,pending.auth_version,c.now,c.now,c.now-120,c.now,pending.factor_id),
  assertOne(db),
  db.prepare(`INSERT INTO auth_mfa_recovery_operations(operation_digest,user_id,source_digest,browser_digest,auth_version,old_factor_id,
   old_set_id,new_factor_id,new_set_id,primary_method,primary_authenticated_at,phase,secret_ciphertext,secret_nonce,key_id,created_at,expires_at)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?,?,?)`).bind(id,pending.user_id,pending.token_digest,browser,pending.auth_version,pending.factor_id,
    pending.recovery_set_id,newFactor,newSet,pending.primary_method,pending.primary_authenticated_at,sealed.ciphertext,sealed.nonce,sealed.keyId,c.now,c.now+300),
  db.prepare("UPDATE auth_mfa_transactions SET phase='verified',verified_at=? WHERE token_digest=? AND phase='pending'").bind(c.now,pending.token_digest),assertOne(db),
  db.prepare("UPDATE auth_mfa_transactions SET phase='consumed',consumed_at=? WHERE token_digest=? AND phase='verified'").bind(c.now,pending.token_digest),assertOne(db),
 ]);
 return {resumed:false};
}
export async function recoverySetup(db:D1Database,c:RecoveryContext,keys:MfaKeys,environment:'local'|'dev'){
 const r=await recoveryOperation(db,c);if(!r||r.phase!=='pending')throw Error('Recovery unavailable');
 const secret=await decryptTotpSecret({ciphertext:r.secret_ciphertext,nonce:r.secret_nonce,keyId:r.key_id},keys,
  {environment,userId:r.user_id,id:r.new_factor_id,purpose:'pending'});
 return {secret,uri:provisioningUri(secret,'LAN Party recovery'),expiresAt:r.expires_at};
}
export async function grantRecoveryPrimary(db:D1Database,c:RecoveryContext,method:'password'|'google',at:number,expectedVersion:number){
 const r=await recoveryOperation(db,c);if(!r||at>c.now||at<=c.now-120)throw Error('Recovery unavailable');
 const result=await db.prepare(`UPDATE auth_mfa_recovery_operations SET primary_method=?,primary_authenticated_at=?
  WHERE operation_digest=? AND browser_digest=? AND phase=?
  AND ((phase='pending' AND expires_at>unixepoch()) OR (phase='committed' AND display_expires_at>unixepoch()))
  AND EXISTS(SELECT 1 FROM users WHERE id=? AND auth_version=? AND status='active')`)
  .bind(method,at,r.operation_digest,r.browser_digest,r.phase,r.user_id,expectedVersion).run();
 if(result.meta.changes!==1)throw Error('Recovery unavailable');
}
export async function commitRecovery(db:D1Database,c:RecoveryContext,code:string,keys:MfaKeys,environment:'local'|'dev',held:LoginReservation){
 const r=await recoveryOperation(db,c);if(!r||r.phase!=='pending')throw Error('Recovery unavailable');fresh(r,c.now);
 const secret=await decryptTotpSecret({ciphertext:r.secret_ciphertext,nonce:r.secret_nonce,keyId:r.key_id},keys,
  {environment,userId:r.user_id,id:r.new_factor_id,purpose:'pending'});
 const step=await verifyTotp(secret,code,c.now);if(step===null)return null;
 const active=await encryptTotpSecret(secret,keys,{environment,userId:r.user_id,id:r.new_factor_id,purpose:'active'});
 const recovery=await generateRecoveryCodes(r.user_id,r.new_set_id);
 const display=await sealRecoveryDisplay(recovery.codes,keys,displayBinding({...r,display_expires_at:c.now+300},environment));
 const lease=held.activeCondition();
 await db.batch([
  db.prepare(`UPDATE auth_mfa_recovery_operations SET phase='switching' WHERE operation_digest=? AND browser_digest=? AND phase='pending'
   AND expires_at>? AND expires_at>unixepoch() AND primary_authenticated_at>? AND primary_authenticated_at>unixepoch()-120 AND primary_authenticated_at<=? AND ${lease.sql}
   AND EXISTS(SELECT 1 FROM users u JOIN auth_totp_factors f ON f.user_id=u.id WHERE u.id=? AND u.auth_version=? AND u.status='active'
    AND u.email_verified_at IS NOT NULL AND f.factor_id=? AND f.recovery_set_id=?)`)
   .bind(r.operation_digest,r.browser_digest,c.now,c.now-120,c.now,...lease.values,r.user_id,r.auth_version,r.old_factor_id,r.old_set_id),assertOne(db),
  db.prepare('DELETE FROM auth_session_mfa WHERE user_id=?').bind(r.user_id),
  db.prepare('DELETE FROM auth_totp_factors WHERE user_id=? AND factor_id=? AND recovery_set_id=?').bind(r.user_id,r.old_factor_id,r.old_set_id),assertOne(db),
  db.prepare(`INSERT INTO auth_totp_factors(user_id,factor_id,secret_ciphertext,secret_nonce,key_id,last_step,recovery_set_id,enabled_at)
   VALUES(?,?,?,?,?,?,?,?)`).bind(r.user_id,r.new_factor_id,active.ciphertext,active.nonce,active.keyId,step,r.new_set_id,c.now),
  db.prepare('DELETE FROM auth_mfa_recovery_codes WHERE user_id=?').bind(r.user_id),
  ...recovery.verifiers.map(v=>db.prepare('INSERT INTO auth_mfa_recovery_codes(user_id,set_id,verifier,created_at) VALUES(?,?,?,?)').bind(r.user_id,r.new_set_id,v,c.now)),
  db.prepare('UPDATE users SET auth_version=auth_version+1,updated_at=? WHERE id=? AND auth_version=? AND status=\'active\'').bind(c.now,r.user_id,r.auth_version),assertOne(db),
  db.prepare(`UPDATE auth_mfa_recovery_operations SET phase='committed',secret_ciphertext=NULL,secret_nonce=NULL,key_id=NULL,
   committed_at=?,display_expires_at=?,display_ciphertext=?,display_nonce=?,display_key_id=?,oidc_state_digest=NULL
   WHERE operation_digest=? AND phase='switching' AND EXISTS(SELECT 1 FROM users WHERE id=? AND auth_version=?)
   AND (SELECT count(*) FROM auth_mfa_recovery_codes WHERE user_id=? AND set_id=? AND consumed_at IS NULL)=10`)
   .bind(c.now,c.now+300,display.ciphertext,display.nonce,display.keyId,r.operation_digest,r.user_id,r.auth_version+1,r.user_id,r.new_set_id),assertOne(db),
 ]);
 // The switch response contains no codes: reveal always requires a fresh new TOTP.
 return {userId:r.user_id,authVersion:r.auth_version,displayExpiresAt:c.now+300};
}
export async function revealRecovery(db:D1Database,c:RecoveryContext,code:string,keys:MfaKeys,environment:'local'|'dev',held:LoginReservation){
 const r=await recoveryOperation(db,c);if(!r||r.phase!=='committed')throw Error('Recovery unavailable');fresh(r,c.now);
 const factor=await db.prepare('SELECT * FROM auth_totp_factors WHERE user_id=? AND factor_id=? AND recovery_set_id=?')
  .bind(r.user_id,r.new_factor_id,r.new_set_id).first<{secret_ciphertext:string;secret_nonce:string;key_id:string;last_step:number}>();
 if(!factor)throw Error('Recovery unavailable');
 const secret=await decryptTotpSecret({ciphertext:factor.secret_ciphertext,nonce:factor.secret_nonce,keyId:factor.key_id},keys,
  {environment,userId:r.user_id,id:r.new_factor_id,purpose:'active'});
 const step=await verifyTotp(secret,code,c.now,factor.last_step);if(step===null)return null;
 const codes=await openRecoveryDisplay({ciphertext:r.display_ciphertext,nonce:r.display_nonce,keyId:r.display_key_id},keys,displayBinding(r,environment));
 const lease=held.activeCondition();
 await db.batch([db.prepare(`UPDATE auth_totp_factors SET last_step=? WHERE user_id=? AND factor_id=? AND last_step=? AND ${lease.sql}
   AND EXISTS(SELECT 1 FROM auth_mfa_recovery_operations o JOIN users u ON u.id=o.user_id WHERE operation_digest=? AND browser_digest=?
    AND o.phase='committed' AND o.display_expires_at>? AND o.display_expires_at>unixepoch() AND o.primary_authenticated_at>? AND o.primary_authenticated_at>unixepoch()-120 AND o.primary_authenticated_at<=?
    AND u.auth_version=o.auth_version+1 AND u.status='active')`)
  .bind(step,r.user_id,r.new_factor_id,factor.last_step,...lease.values,r.operation_digest,r.browser_digest,c.now,c.now-120,c.now),assertOne(db)]);
 return {codes,expiresAt:r.display_expires_at};
}
export async function closeRecovery(db:D1Database,c:RecoveryContext,acknowledge:boolean){
 const r=await recoveryOperation(db,c);if(!r)throw Error('Recovery unavailable');
 if(r.phase==='acknowledged')return;
 if(acknowledge&&r.phase!=='committed')throw Error('Recovery unavailable');
 await db.prepare(`UPDATE auth_mfa_recovery_operations SET phase=?,acknowledged_at=?,${clear} WHERE operation_digest=? AND browser_digest=? AND phase=?`)
  .bind(acknowledge?'acknowledged':'cancelled',acknowledge?c.now:null,r.operation_digest,r.browser_digest,r.phase).run();
}
