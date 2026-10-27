import type {MfaKeys} from './mfa-crypto';
import {mfaDigest,generateTotpSecret,encryptTotpSecret} from './mfa-crypto';
import {assertOne,RecoveryPrimaryRequired} from './mfa-recovery';
import type {RecoveryContext} from './mfa-recovery';
export class RecoveryMfaRequired extends Error {}
// A purpose-limited, one-use handoff of actual fresh session proof; no code is accepted again.
export async function startSessionRecovery(db:D1Database,c:RecoveryContext,user:string,version:number,session:string,keys:MfaKeys,environment:'local'|'dev'){
 const now=c.now;
 const row=await db.prepare(`SELECT f.factor_id,f.recovery_set_id,r.method,r.authenticated_at,m.method AS mfa_method,m.verified_at,
 (r.method='password') AS trusted_primary
 FROM users u JOIN auth_sessions s ON s.user_id=u.id JOIN auth_totp_factors f ON f.user_id=u.id
 JOIN auth_session_mfa m ON m.session_digest=s.token_digest
 LEFT JOIN auth_recent_authentication r ON r.session_digest=s.token_digest AND r.user_id=u.id AND r.auth_version=u.auth_version
 WHERE u.id=? AND u.auth_version=? AND u.status='active' AND u.email_verified_at IS NOT NULL
 AND s.token_digest=? AND s.auth_version=u.auth_version AND s.revoked_at IS NULL AND s.created_at<=? AND s.expires_at>?
 AND m.user_id=u.id AND m.auth_version=u.auth_version AND m.factor_id=f.factor_id AND m.verified_at<=?`)
 .bind(user,version,session,now,now,now).first<{factor_id:string;recovery_set_id:string;method:'password'|null;authenticated_at:number|null;mfa_method:'totp'|'recovery';verified_at:number;trusted_primary:number}>();
 if(!row||row.verified_at<=now-120)throw new RecoveryMfaRequired();
 if(!row.trusted_primary||!row.method||row.authenticated_at===null||row.authenticated_at<=now-120||row.authenticated_at>now)throw new RecoveryPrimaryRequired();
 const tokenDigest=await mfaDigest('transaction',c.token),id=await mfaDigest('recovery-operation',tokenDigest),browser=await mfaDigest('browser',c.browser);
 const factor=crypto.randomUUID(),set=crypto.randomUUID(),secret=generateTotpSecret();
 const sealed=await encryptTotpSecret(secret,keys,{environment,userId:user,id:factor,purpose:'pending'});
 await db.batch([
 db.prepare(`INSERT INTO auth_mfa_recovery_operations(operation_digest,user_id,source_digest,browser_digest,auth_version,old_factor_id,old_set_id,
 new_factor_id,new_set_id,primary_method,primary_authenticated_at,phase,secret_ciphertext,secret_nonce,key_id,created_at,expires_at)
 SELECT ?,u.id,?,?,u.auth_version,f.factor_id,f.recovery_set_id,?,?,?,?,'pending',?,?,?,?,?
 FROM users u JOIN auth_sessions s ON s.user_id=u.id JOIN auth_totp_factors f ON f.user_id=u.id
 JOIN auth_session_mfa m ON m.session_digest=s.token_digest JOIN auth_recent_authentication r ON r.session_digest=s.token_digest
 WHERE u.id=? AND u.auth_version=? AND u.status='active' AND u.email_verified_at IS NOT NULL
 AND s.token_digest=? AND s.auth_version=u.auth_version AND s.revoked_at IS NULL AND s.created_at<=unixepoch() AND s.expires_at>unixepoch()
 AND f.factor_id=? AND f.recovery_set_id=? AND m.user_id=u.id AND m.auth_version=u.auth_version AND m.factor_id=f.factor_id
 AND m.verified_at<=s.created_at AND m.method=? AND m.verified_at=? AND m.verified_at>unixepoch()-120 AND m.verified_at<=unixepoch()
 AND r.user_id=u.id AND r.auth_version=u.auth_version AND r.method=? AND r.authenticated_at=?
 AND r.authenticated_at>unixepoch()-120 AND r.authenticated_at<=unixepoch() AND r.expires_at>unixepoch()
 AND (r.method='password')`)
 .bind(id,session,browser,factor,set,row.method,row.authenticated_at,sealed.ciphertext,sealed.nonce,sealed.keyId,now,now+300,
 user,version,session,row.factor_id,row.recovery_set_id,row.mfa_method,row.verified_at,row.method,row.authenticated_at),assertOne(db),
 db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE token_digest=? AND user_id=? AND auth_version=? AND revoked_at IS NULL')
 .bind(now,session,user,version),assertOne(db),
 ]);
}
