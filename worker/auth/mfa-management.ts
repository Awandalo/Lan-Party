import type {MfaKeys} from './mfa-crypto';
import {decryptTotpSecret,generateRecoveryCodes,mfaDigest,randomMfaToken,recoveryVerifier,verifyTotp} from './mfa-crypto';
import type {EnrollmentContext} from './mfa-enrollment';
import type {LoginReservation} from './login-limits';
import {sessionCompletion} from './mfa-login';
import {digestToken,generateToken} from './tokens';
import {AUTH_POLICY} from './config';

export class MfaPrimaryRequired extends Error {}
export type ManagementPurpose='disable'|'regenerate';
interface Management {
 token_digest:string;user_id:string;auth_version:number;factor_id:string;purpose:ManagementPurpose;phase:string;
 secret_ciphertext:string;secret_nonce:string;key_id:string;last_step:number;active_set:string;
 recovery_set_id:string|null;primary_method:'password';primary_authenticated_at:number;
 verified_at:number;proof_method:'totp'|'recovery';expires_at:number;
}
const live=`EXISTS(SELECT 1 FROM users u JOIN auth_sessions s ON s.user_id=u.id
 JOIN auth_session_mfa m ON m.session_digest=s.token_digest JOIN auth_totp_factors f ON f.user_id=u.id
 JOIN auth_recent_authentication r ON r.session_digest=s.token_digest
 WHERE u.id=t.user_id AND u.status='active' AND u.email_verified_at IS NOT NULL AND u.auth_version=t.auth_version
 AND s.token_digest=t.session_digest AND s.auth_version=u.auth_version AND s.revoked_at IS NULL
 AND s.created_at<=? AND s.expires_at>? AND m.user_id=u.id AND m.auth_version=u.auth_version AND m.factor_id=f.factor_id
 AND f.factor_id=t.factor_id AND r.user_id=u.id AND r.method='password' AND r.auth_version=u.auth_version AND r.method=t.primary_method
 AND r.authenticated_at=t.primary_authenticated_at AND r.authenticated_at>? AND r.authenticated_at>unixepoch()-120
 AND r.authenticated_at<=? AND r.expires_at>?)`;
const bound=`t.token_digest=? AND t.user_id=? AND t.auth_version=? AND t.session_digest=? AND t.browser_digest=?
 AND t.purpose IN ('disable','regenerate') AND t.created_at<=? AND t.expires_at>? AND t.expires_at>unixepoch()`;
const values=(digest:string,c:EnrollmentContext)=>[digest,c.userId,c.authVersion,c.sessionDigest,c.browserDigest,c.now,c.now];
const fresh=(c:EnrollmentContext)=>[c.now,c.now,c.now-120,c.now,c.now];
async function transaction(db:D1Database,c:EnrollmentContext,token:string,phase:string){
 if(!/^[a-f0-9]{64}$/.test(token))throw Error('Management unavailable');
 const row=await db.prepare(`SELECT t.*,f.secret_ciphertext,f.secret_nonce,f.key_id,f.last_step,f.recovery_set_id AS active_set
 FROM auth_mfa_transactions t JOIN auth_totp_factors f ON f.user_id=t.user_id AND f.factor_id=t.factor_id
 WHERE ${bound} AND t.phase=? AND ${live}`).bind(...values(await mfaDigest('transaction',token),c),phase,...fresh(c)).first<Management>();
 if(!row)throw Error('Management unavailable');return row;
}
async function checkKey(row:Management,keys:MfaKeys,environment:'local'|'dev'){
 return decryptTotpSecret({ciphertext:row.secret_ciphertext,nonce:row.secret_nonce,keyId:row.key_id},keys,
  {environment,userId:row.user_id,id:row.factor_id,purpose:'active'});
}
export async function cancelManagement(db:D1Database,c:EnrollmentContext,token:string){
 const digest=await mfaDigest('transaction',token);
 await db.batch([
  db.prepare(`DELETE FROM auth_mfa_recovery_codes WHERE user_id=? AND set_id IN
   (SELECT t.recovery_set_id FROM auth_mfa_transactions t WHERE t.token_digest=? AND t.session_digest=? AND t.browser_digest=?
    AND t.purpose='regenerate' AND t.phase IN ('pending','verified'))
   AND NOT EXISTS(SELECT 1 FROM auth_totp_factors f WHERE f.user_id=auth_mfa_recovery_codes.user_id AND f.recovery_set_id=auth_mfa_recovery_codes.set_id)`)
   .bind(c.userId,digest,c.sessionDigest,c.browserDigest),
  db.prepare(`UPDATE auth_mfa_transactions SET phase='cancelled',ack_digest=NULL WHERE token_digest=? AND user_id=?
   AND session_digest=? AND browser_digest=? AND purpose IN ('disable','regenerate') AND phase IN ('pending','verified')`)
   .bind(digest,c.userId,c.sessionDigest,c.browserDigest),
 ]);
}
export async function beginManagement(db:D1Database,c:EnrollmentContext,purpose:ManagementPurpose,keys:MfaKeys,environment:'local'|'dev'){
 const primary=await db.prepare(`SELECT r.method,r.authenticated_at FROM auth_recent_authentication r
  JOIN auth_sessions s ON s.token_digest=r.session_digest JOIN users u ON u.id=r.user_id
  WHERE u.id=? AND u.auth_version=? AND u.status='active' AND u.email_verified_at IS NOT NULL
  AND s.token_digest=? AND s.user_id=u.id AND s.auth_version=u.auth_version AND s.revoked_at IS NULL AND s.expires_at>?
  AND r.method='password' AND r.auth_version=u.auth_version AND r.authenticated_at>? AND r.authenticated_at<=? AND r.expires_at>?`)
  .bind(c.userId,c.authVersion,c.sessionDigest,c.now,c.now-120,c.now,c.now).first<{method:string;authenticated_at:number}>();
 if(!primary)throw new MfaPrimaryRequired('Confirm your sign-in method before continuing.');
 const factor=await db.prepare('SELECT *,recovery_set_id AS active_set FROM auth_totp_factors WHERE user_id=?').bind(c.userId).first<Management>();
 if(!factor)throw Error('MFA unavailable');await checkKey(factor,keys,environment);
 const token=randomMfaToken(),digest=await mfaDigest('transaction',token),expiresAt=Math.min(c.now+120,primary.authenticated_at+120);
 await db.batch([
  db.prepare(`DELETE FROM auth_mfa_recovery_codes WHERE user_id=? AND set_id IN
   (SELECT recovery_set_id FROM auth_mfa_transactions WHERE user_id=? AND purpose='regenerate' AND expires_at<=?)
   AND NOT EXISTS(SELECT 1 FROM auth_totp_factors f WHERE f.user_id=auth_mfa_recovery_codes.user_id AND f.recovery_set_id=auth_mfa_recovery_codes.set_id)`)
   .bind(c.userId,c.userId,c.now),
  db.prepare(`UPDATE auth_mfa_transactions SET phase='cancelled',ack_digest=NULL WHERE user_id=? AND purpose IN ('disable','regenerate')
   AND phase IN ('pending','verified') AND expires_at<=?`).bind(c.userId,c.now),
  db.prepare(`INSERT INTO auth_mfa_transactions(token_digest,transaction_id,user_id,auth_version,session_digest,browser_digest,
   purpose,phase,factor_id,primary_method,primary_authenticated_at,created_at,expires_at)
   SELECT ?,?,?,?,?,?,?,'pending',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users u JOIN auth_sessions s ON s.user_id=u.id
    JOIN auth_session_mfa m ON m.session_digest=s.token_digest JOIN auth_totp_factors f ON f.user_id=u.id
    JOIN auth_recent_authentication r ON r.session_digest=s.token_digest WHERE u.id=? AND u.auth_version=? AND u.status='active'
    AND u.email_verified_at IS NOT NULL AND s.token_digest=? AND s.auth_version=u.auth_version AND s.revoked_at IS NULL AND s.expires_at>?
    AND m.user_id=u.id AND m.auth_version=u.auth_version AND m.factor_id=f.factor_id AND f.factor_id=?
    AND r.user_id=u.id AND r.method='password' AND r.auth_version=u.auth_version AND r.method=? AND r.authenticated_at=? AND r.authenticated_at>unixepoch()-120)
    RETURNING token_digest`)
   .bind(digest,crypto.randomUUID(),c.userId,c.authVersion,c.sessionDigest,c.browserDigest,purpose,factor.factor_id,primary.method,primary.authenticated_at,c.now,expiresAt,
     c.userId,c.authVersion,c.sessionDigest,c.now,factor.factor_id,primary.method,primary.authenticated_at),
 ]);
 // Recheck the account/session/factor after insertion; mutation guards repeat it.
 await transaction(db,c,token,'pending');return {token,expiresAt};
}
export async function proveManagement(db:D1Database,c:EnrollmentContext,token:string,code:string,method:'totp'|'recovery',keys:MfaKeys,environment:'local'|'dev',held:LoginReservation){
 const row=await transaction(db,c,token,'pending'),secret=await checkKey(row,keys,environment);
 const step=method==='totp'?await verifyTotp(secret,code,c.now,row.last_step):null;
 const verifier=method==='recovery'?await recoveryVerifier(c.userId,row.active_set,code):null;
 if(method==='totp'?step===null:!verifier)return null;
 const lease=held.activeCondition(),digest=row.token_digest;
 const guard=`${lease.sql} AND EXISTS(SELECT 1 FROM auth_mfa_transactions t WHERE ${bound} AND t.phase='pending' AND ${live})`;
 const args=[...lease.values,...values(digest,c),...fresh(c)];
 const proof=method==='totp'?db.prepare(`UPDATE auth_totp_factors SET last_step=? WHERE user_id=? AND factor_id=? AND last_step=? AND last_step<? AND ${guard} RETURNING factor_id`)
  .bind(step,c.userId,row.factor_id,row.last_step,step,...args):
  db.prepare(`UPDATE auth_mfa_recovery_codes SET consumed_at=? WHERE user_id=? AND set_id=? AND verifier=? AND consumed_at IS NULL AND ${guard} RETURNING verifier`)
   .bind(c.now,c.userId,row.active_set,verifier,...args);
 const set=crypto.randomUUID(),ack=randomMfaToken(),ackDigest=await mfaDigest('acknowledgment',ack),recovery=row.purpose==='regenerate'?await generateRecoveryCodes(c.userId,set):null;
 const result=await db.batch([proof,
  db.prepare(`UPDATE auth_mfa_transactions SET phase='verified',verified_at=?,proof_method=?,recovery_set_id=?,ack_digest=?
   WHERE token_digest=? AND phase='pending' AND changes()=1 RETURNING transaction_id`)
   .bind(c.now,method,recovery?set:null,ackDigest,digest),
  ...(recovery?recovery.verifiers.map(v=>db.prepare(`INSERT INTO auth_mfa_recovery_codes(user_id,set_id,verifier,created_at)
   SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM auth_mfa_transactions WHERE token_digest=? AND phase='verified' AND ack_digest=?)`)
   .bind(c.userId,set,v,c.now,digest,ackDigest)):[]),
 ]);
 if(result[1].results.length!==1)return null;
 return {acknowledgment:ack,...(recovery?{codes:recovery.codes}:{})};
}
export async function finishManagement(db:D1Database,c:EnrollmentContext,token:string,ack:string,keys:MfaKeys,environment:'local'|'dev'){
 const row=await transaction(db,c,token,'verified');await checkKey(row,keys,environment);
 const replacement=generateToken(),sessionDigest=await digestToken(replacement,'session');
 const claim=db.prepare(`UPDATE auth_mfa_transactions AS t SET phase='consumed',consumed_at=?,ack_digest=NULL
  WHERE ${bound} AND t.phase='verified' AND t.ack_digest=? AND t.verified_at>? AND t.verified_at>unixepoch()-120 AND t.verified_at<=? AND ${live}
  ${row.purpose==='regenerate'?`AND (SELECT count(*) FROM auth_mfa_recovery_codes WHERE user_id=t.user_id AND set_id=t.recovery_set_id AND consumed_at IS NULL)=10`:''}
  RETURNING transaction_id`).bind(c.now,...values(row.token_digest,c),await mfaDigest('acknowledgment',ack),c.now-120,c.now,...fresh(c));
 const generation=db.prepare(`UPDATE users SET auth_version=auth_version+1,updated_at=? WHERE id=? AND auth_version=? AND changes()=1 RETURNING id`)
  .bind(c.now,c.userId,c.authVersion);
 const change=row.purpose==='disable'?db.prepare('DELETE FROM auth_totp_factors WHERE user_id=? AND factor_id=? AND changes()=1 RETURNING factor_id').bind(c.userId,row.factor_id):
  db.prepare('UPDATE auth_totp_factors SET recovery_set_id=? WHERE user_id=? AND factor_id=? AND recovery_set_id=? AND changes()=1 RETURNING factor_id')
   .bind(row.recovery_set_id,c.userId,row.factor_id,row.active_set);
 const primary=db.prepare(`INSERT INTO auth_recent_authentication(session_digest,user_id,auth_version,method,authenticated_at,expires_at)
  SELECT ?,?,?,?,?,? WHERE changes()=1 RETURNING session_digest`).bind(sessionDigest,c.userId,c.authVersion+1,row.primary_method,row.primary_authenticated_at,row.primary_authenticated_at+300);
 const session=db.prepare(`INSERT INTO auth_sessions(id,user_id,token_digest,auth_version,created_at,expires_at)
  SELECT ?,id,?,auth_version,?,? FROM users WHERE id=? AND auth_version=? AND changes()=1 RETURNING id`)
  .bind(crypto.randomUUID(),sessionDigest,c.now,c.now+AUTH_POLICY.sessionLifetimeSeconds,c.userId,c.authVersion+1);
 const results=await db.batch([
  claim,...(row.purpose==='disable'?[generation,change,session,primary]:[change,generation,
   ...sessionCompletion(db,{...row,auth_version:c.authVersion+1},sessionDigest,c.now,row.proof_method,row.verified_at)]),
  db.prepare(`DELETE FROM auth_mfa_recovery_codes WHERE user_id=? ${row.purpose==='regenerate'?'AND set_id<>?':''}
   AND EXISTS(SELECT 1 FROM auth_sessions WHERE token_digest=?)`).bind(c.userId,...(row.purpose==='regenerate'?[row.recovery_set_id]:[]),sessionDigest),
  db.prepare('SELECT token_digest FROM auth_sessions WHERE token_digest=?').bind(sessionDigest),
 ]);
 if(results[0].results.length!==1||results.at(-1)?.results.length!==1)throw Error('Management unavailable');
 return {token:replacement,purpose:row.purpose};
}
