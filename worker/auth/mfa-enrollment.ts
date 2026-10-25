import type { MfaKeys, EncryptedMfaSecret } from './mfa-crypto';
import { decryptTotpSecret, encryptTotpSecret, generateTotpSecret, generateRecoveryCodes, mfaDigest, randomMfaToken, provisioningUri, verifyTotp, recoveryVerifier } from './mfa-crypto';
import { accountId, serverTime, tokenDigest } from './database';
import { LoginLimiter } from './login-limits';
import { MFA_LOGIN_INTEGRATION_READY } from './mfa-session';

export interface EnrollmentContext {userId:string;authVersion:number;sessionDigest:string;browserDigest:string;now:number}
interface Pending {transaction_id:string;factor_id:string;recovery_set_id:string|null;secret_ciphertext:string;secret_nonce:string;key_id:string;last_step:number}
function context(c:EnrollmentContext){
  accountId(c.userId);serverTime(c.now);tokenDigest(c.sessionDigest);tokenDigest(c.browserDigest);
  if(!Number.isSafeInteger(c.authVersion)||c.authVersion<0)throw Error('MFA context unavailable');
}
const live=`EXISTS(SELECT 1 FROM users u JOIN auth_sessions s ON s.user_id=u.id
  WHERE u.id=t.user_id AND u.status='active' AND u.email_verified_at IS NOT NULL
    AND u.auth_version=t.auth_version AND s.auth_version=u.auth_version AND s.token_digest=t.session_digest
    AND s.revoked_at IS NULL AND s.created_at<=? AND s.expires_at>?)`;
const fresh=`EXISTS(SELECT 1 FROM auth_recent_authentication r WHERE r.user_id=t.user_id
  AND r.session_digest=t.session_digest AND r.auth_version=t.auth_version AND r.expires_at>?
  AND r.authenticated_at>? AND r.authenticated_at<=?)`;
const bound=`t.token_digest=? AND t.user_id=? AND t.auth_version=? AND t.session_digest=? AND t.browser_digest=?
  AND t.purpose='enroll' AND t.created_at<=? AND t.expires_at>?`;
const values=(digest:string,c:EnrollmentContext)=>[digest,c.userId,c.authVersion,c.sessionDigest,c.browserDigest,c.now,c.now];
const guards=(c:EnrollmentContext)=>[c.now,c.now,c.now,c.now-120,c.now];
function sealed(row:Pending):EncryptedMfaSecret{return {ciphertext:row.secret_ciphertext,nonce:row.secret_nonce,keyId:row.key_id};}
function cryptoContext(c:EnrollmentContext,id:string,purpose:'active'|'pending',environment:'local'|'dev'){
  return {userId:c.userId,id,purpose,environment};
}
async function pending(db:D1Database,c:EnrollmentContext,token:string,phase:'pending'|'verified'){
  context(c);if(!/^[a-f0-9]{64}$/.test(token))throw Error('Enrollment unavailable');
  const row=await db.prepare(`SELECT t.* FROM auth_mfa_transactions t WHERE ${bound} AND t.phase=? AND ${live} AND ${fresh}`)
    .bind(...values(await mfaDigest('transaction',token),c),phase,...guards(c)).first<Pending>();
  if(!row)throw Error('Enrollment unavailable');return row;
}
export async function beginEnrollment(db:D1Database,c:EnrollmentContext,config:MfaKeys,environment:'local'|'dev',label:string,restart=false){
  context(c);
  const primary=await db.prepare(`SELECT r.method,r.authenticated_at FROM auth_recent_authentication r
    JOIN auth_sessions s ON s.token_digest=r.session_digest JOIN users u ON u.id=r.user_id
    WHERE u.id=? AND u.auth_version=? AND u.status='active' AND u.email_verified_at IS NOT NULL
      AND s.user_id=u.id AND s.auth_version=u.auth_version AND s.token_digest=? AND s.revoked_at IS NULL
      AND s.created_at<=? AND s.expires_at>? AND r.auth_version=u.auth_version
      AND r.authenticated_at>? AND r.authenticated_at<=? AND r.expires_at>?
      AND NOT EXISTS(SELECT 1 FROM auth_totp_factors WHERE user_id=u.id)`)
    .bind(c.userId,c.authVersion,c.sessionDigest,c.now,c.now,c.now-120,c.now,c.now).first<{method:string;authenticated_at:number}>();
  if(!primary)throw Error('Recent primary authentication required');
  const token=randomMfaToken(),digest=await mfaDigest('transaction',token),id=crypto.randomUUID(),factorId=crypto.randomUUID(),secret=generateTotpSecret();
  const encrypted=await encryptTotpSecret(secret,config,cryptoContext(c,id,'pending',environment));
  const uri=provisioningUri(secret,label);
  // An explicitly confirmed restart retires only unfinished enrollment. The final
  // INSERT assertion rolls the whole batch back if session/proof/factor guards lose.
  await db.batch([
    ...(restart?[
      db.prepare(`DELETE FROM auth_mfa_recovery_codes WHERE user_id=? AND set_id IN
        (SELECT recovery_set_id FROM auth_mfa_transactions WHERE user_id=? AND purpose='enroll' AND phase IN ('pending','verified'))
        AND NOT EXISTS(SELECT 1 FROM auth_totp_factors WHERE user_id=?)`).bind(c.userId,c.userId,c.userId),
      db.prepare(`UPDATE auth_mfa_transactions SET phase='cancelled',secret_ciphertext=NULL,secret_nonce=NULL,key_id=NULL,ack_digest=NULL
        WHERE user_id=? AND purpose='enroll' AND phase IN ('pending','verified')
        AND NOT EXISTS(SELECT 1 FROM auth_totp_factors WHERE user_id=?)`).bind(c.userId,c.userId),
    ]:[]),
    db.prepare(`DELETE FROM auth_mfa_recovery_codes WHERE user_id=? AND set_id IN
      (SELECT recovery_set_id FROM auth_mfa_transactions WHERE user_id=? AND purpose='enroll' AND expires_at<=?)
      AND NOT EXISTS(SELECT 1 FROM auth_totp_factors f WHERE f.user_id=auth_mfa_recovery_codes.user_id AND f.recovery_set_id=auth_mfa_recovery_codes.set_id)`)
      .bind(c.userId,c.userId,c.now),
    db.prepare(`UPDATE auth_mfa_transactions SET phase='cancelled',secret_ciphertext=NULL,secret_nonce=NULL,key_id=NULL,ack_digest=NULL
      WHERE user_id=? AND purpose='enroll' AND phase IN ('pending','verified') AND expires_at<=?`).bind(c.userId,c.now),
    db.prepare(`INSERT INTO auth_mfa_transactions(token_digest,transaction_id,user_id,auth_version,session_digest,browser_digest,
      purpose,phase,factor_id,primary_method,primary_authenticated_at,secret_ciphertext,secret_nonce,key_id,created_at,expires_at)
      SELECT ?,?,?,?,?,?,'enroll','pending',?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users u JOIN auth_sessions s ON s.user_id=u.id
        JOIN auth_recent_authentication r ON r.session_digest=s.token_digest WHERE u.id=? AND u.auth_version=? AND u.status='active'
          AND u.email_verified_at IS NOT NULL AND s.token_digest=? AND s.auth_version=u.auth_version AND s.revoked_at IS NULL
          AND s.created_at<=? AND s.expires_at>? AND r.user_id=u.id AND r.auth_version=u.auth_version AND r.expires_at>?
          AND r.authenticated_at>? AND r.authenticated_at<=?)
        AND NOT EXISTS(SELECT 1 FROM auth_totp_factors WHERE user_id=?) RETURNING transaction_id`)
      .bind(digest,id,c.userId,c.authVersion,c.sessionDigest,c.browserDigest,factorId,primary.method,primary.authenticated_at,
        encrypted.ciphertext,encrypted.nonce,encrypted.keyId,c.now,c.now+600,c.userId,c.authVersion,c.sessionDigest,
        c.now,c.now,c.now,c.now-120,c.now,c.userId),
    db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('Enrollment guard failed') END"),
  ]).then(results=>{if(results.at(-2)?.results.length!==1)throw Error('Enrollment unavailable');});
  return {token,secret,uri,expiresAt:c.now+600}; // Only the initiating no-store response; never log.
}
export async function verifyEnrollment(db:D1Database,c:EnrollmentContext,token:string,code:string,config:MfaKeys,environment:'local'|'dev',rateSecret:string){
  const row=await pending(db,c,token,'pending');
  // The existing expiring atomic lease serializes this account's enrollment checks.
  // Separate synthetic identities isolate its five confirmed failures from login.
  const limiter=await LoginLimiter.create(db,rateSecret,'mfa-enrollment',()=>c.now);
  const held=await limiter.reserve('mfa-enroll:'+c.userId);let finalized=false;
  try{
    const secret=await decryptTotpSecret(sealed(row),config,cryptoContext(c,row.transaction_id,'pending',environment));
    const step=await verifyTotp(secret,code,c.now,row.last_step);
    if(step===null){if(!await held.finish(true))throw Error('Enrollment unavailable');finalized=true;throw Error('Authenticator code not accepted');}
    const setId=crypto.randomUUID(),recovery=await generateRecoveryCodes(c.userId,setId),ack=randomMfaToken(),ackDigest=await mfaDigest('acknowledgment',ack);
    const digest=await mfaDigest('transaction',token);
    const result=await db.batch([
      db.prepare(`UPDATE auth_mfa_transactions AS t SET phase='verified',last_step=?,verified_at=?,recovery_set_id=?,ack_digest=?
        WHERE ${bound} AND t.phase='pending' AND t.last_step<? AND ${live} AND ${fresh}
        AND NOT EXISTS(SELECT 1 FROM auth_totp_factors WHERE user_id=t.user_id) RETURNING transaction_id`)
        .bind(step,c.now,setId,ackDigest,...values(digest,c),step,...guards(c)),
      ...recovery.verifiers.map(verifier=>db.prepare(`INSERT INTO auth_mfa_recovery_codes(user_id,set_id,verifier,created_at)
        SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM auth_mfa_transactions WHERE token_digest=? AND phase='verified' AND ack_digest=? AND recovery_set_id=?)`)
        .bind(c.userId,setId,verifier,c.now,digest,ackDigest,setId)),
    ]);
    if(!await held.finish(false))throw Error('Enrollment unavailable');finalized=true;
    if(result[0].results.length!==1)throw Error('Enrollment unavailable');
    return {codes:recovery.codes,acknowledgment:ack}; // Returned once; lost response requires cancel/restart.
  }finally{if(!finalized)await held.finish(false);}
}
export async function cancelEnrollment(db:D1Database,c:EnrollmentContext,token:string){
  context(c);const digest=await mfaDigest('transaction',token);
  const results=await db.batch([
    db.prepare(`DELETE FROM auth_mfa_recovery_codes WHERE user_id=? AND set_id IN
      (SELECT t.recovery_set_id FROM auth_mfa_transactions t WHERE ${bound} AND t.phase IN ('pending','verified') AND ${live})
      AND NOT EXISTS(SELECT 1 FROM auth_totp_factors f WHERE f.user_id=auth_mfa_recovery_codes.user_id AND f.recovery_set_id=auth_mfa_recovery_codes.set_id)`)
      .bind(c.userId,...values(digest,c),c.now,c.now),
    db.prepare(`UPDATE auth_mfa_transactions AS t SET phase='cancelled',secret_ciphertext=NULL,secret_nonce=NULL,key_id=NULL,ack_digest=NULL
      WHERE ${bound} AND t.phase IN ('pending','verified') AND ${live} RETURNING transaction_id`).bind(...values(digest,c),c.now,c.now),
  ]);return results[1].results.length===1;
}
// The local-only enrollment handler appends session + assurance creation to this
// same batch. Never execute activation and session replacement independently.
export async function prepareEnrollmentActivation(db:D1Database,c:EnrollmentContext,token:string,ack:string,config:MfaKeys,environment:'local'|'dev'){
  const row=await pending(db,c,token,'verified'),digest=await mfaDigest('transaction',token),ackDigest=await mfaDigest('acknowledgment',ack);
  const secret=await decryptTotpSecret(sealed(row),config,cryptoContext(c,row.transaction_id,'pending',environment));
  const active=await encryptTotpSecret(secret,config,cryptoContext(c,row.factor_id,'active',environment));
  return [
    db.prepare(`UPDATE auth_mfa_transactions AS t SET phase='consumed',consumed_at=?,secret_ciphertext=NULL,secret_nonce=NULL,key_id=NULL,ack_digest=NULL
      WHERE ${bound} AND t.phase='verified' AND t.ack_digest=? AND ${live} AND ${fresh}
      AND NOT EXISTS(SELECT 1 FROM auth_totp_factors WHERE user_id=t.user_id)
      AND (SELECT count(*) FROM auth_mfa_recovery_codes WHERE user_id=t.user_id AND set_id=t.recovery_set_id AND consumed_at IS NULL)=10 RETURNING transaction_id`)
      .bind(c.now,...values(digest,c),ackDigest,...guards(c)),
    db.prepare(`INSERT INTO auth_totp_factors(user_id,factor_id,secret_ciphertext,secret_nonce,key_id,last_step,recovery_set_id,enabled_at)
      SELECT ?,?,?,?,?,?,?,? WHERE changes()=1`).bind(c.userId,row.factor_id,active.ciphertext,active.nonce,active.keyId,row.last_step,row.recovery_set_id,c.now),
    db.prepare('UPDATE users SET auth_version=auth_version+1,updated_at=? WHERE id=? AND auth_version=? AND changes()=1 RETURNING id').bind(c.now,c.userId,c.authVersion),
  ];
}
export function requireEnrollmentActivation(){
  if(!MFA_LOGIN_INTEGRATION_READY)throw Error('Enrollment activation unavailable until shared MFA login enforcement is complete');
  return true;
}
// These are mutation statements, not authentication completion. Future login must
// combine them with transaction consumption and session creation in one D1 batch.
export async function prepareRecoveryRedemption(db:D1Database,userId:string,authVersion:number,factorId:string,code:string,now:number){
  accountId(userId);accountId(factorId);serverTime(now);serverTime(authVersion);
  const factor=await db.prepare('SELECT recovery_set_id FROM auth_totp_factors WHERE user_id=? AND factor_id=?').bind(userId,factorId).first<string>('recovery_set_id');
  const verifier=factor?await recoveryVerifier(userId,factor,code):null;
  return db.prepare(`UPDATE auth_mfa_recovery_codes SET consumed_at=? WHERE user_id=? AND set_id=? AND verifier=? AND consumed_at IS NULL AND created_at<=?
    AND EXISTS(SELECT 1 FROM users u JOIN auth_totp_factors f ON f.user_id=u.id WHERE u.id=? AND u.auth_version=? AND u.status='active' AND f.factor_id=? AND f.recovery_set_id=auth_mfa_recovery_codes.set_id)
    RETURNING verifier`).bind(now,userId,factor??'',verifier??'',now,userId,authVersion,factorId);
}
export function prepareTotpReplayUpdate(db:D1Database,userId:string,authVersion:number,factorId:string,expectedStep:number,matchedStep:number,now:number){
  accountId(userId);accountId(factorId);serverTime(now);serverTime(authVersion);serverTime(expectedStep);serverTime(matchedStep);
  return db.prepare(`UPDATE auth_totp_factors SET last_step=? WHERE user_id=? AND factor_id=? AND last_step=? AND last_step<?
    AND EXISTS(SELECT 1 FROM users WHERE id=? AND auth_version=? AND status='active') RETURNING factor_id`)
    .bind(matchedStep,userId,factorId,expectedStep,matchedStep,userId,authVersion);
}
