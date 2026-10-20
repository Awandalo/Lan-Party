import type {AccountIdentity} from './contracts';
import type {MfaKeys} from './mfa-crypto';
import {decryptTotpSecret,mfaDigest,randomMfaToken,recoveryVerifier,verifyTotp} from './mfa-crypto';
import {mfaSchemaReady} from './mfa-session';
import {D1SessionStore,issueSession} from './sessions';
import {digestToken,generateToken} from './tokens';
import {AUTH_POLICY} from './config';
import type {LoginReservation} from './login-limits';

export interface MfaChallenge {
  token_digest:string;transaction_id:string;user_id:string;auth_version:number;factor_id:string;
  primary_method:'password'|'google';primary_authenticated_at:number;expires_at:number;
  secret_ciphertext:string;secret_nonce:string;key_id:string;last_step:number;recovery_set_id:string;
}
// All providers and replacement sessions enter here. The ordinary session store
// independently rejects enabled factors; forgetting this boundary cannot bypass MFA.
export async function completePrimary(db:D1Database,account:AccountIdentity,method:'password'|'google',now:number,primaryAt=now){
  if(!Number.isSafeInteger(primaryAt)||primaryAt<0||primaryAt>now)throw Error('Primary authentication unavailable');
  const factor=await mfaSchemaReady(db)?await db.prepare('SELECT factor_id FROM auth_totp_factors WHERE user_id=?')
    .bind(account.userId).first<{factor_id:string}>():null;
  if(!factor){
    const session=await issueSession(new D1SessionStore(db),account,now);
    if(await mfaSchemaReady(db))await db.prepare(`INSERT INTO auth_recent_authentication(session_digest,user_id,auth_version,method,authenticated_at,expires_at)
      SELECT ?,id,auth_version,?,?,? FROM users WHERE id=? AND auth_version=? AND status='active'`)
      .bind(await digestToken(session.token,'session'),method,primaryAt,primaryAt+300,account.userId,account.authVersion).run();
    return {kind:'session' as const,...session};
  }
  const token=randomMfaToken(),browser=randomMfaToken(),digest=await mfaDigest('transaction',token);
  await db.prepare(`DELETE FROM auth_mfa_transactions WHERE token_digest IN
    (SELECT token_digest FROM auth_mfa_transactions WHERE purpose='login' AND expires_at<=? LIMIT 50)`).bind(now).run();
  const created=await db.prepare(`INSERT INTO auth_mfa_transactions(token_digest,transaction_id,user_id,auth_version,
    browser_digest,purpose,phase,factor_id,primary_method,primary_authenticated_at,created_at,expires_at)
    SELECT ?,?,id,auth_version,?,'login','pending',?,?,?,?,? FROM users
    WHERE id=? AND auth_version=? AND status='active' AND email_verified_at IS NOT NULL AND updated_at<=?
      AND EXISTS(SELECT 1 FROM auth_totp_factors WHERE user_id=users.id AND factor_id=?) RETURNING token_digest`)
    .bind(digest,crypto.randomUUID(),await mfaDigest('browser',browser),factor.factor_id,method,primaryAt,now,now+300,
      account.userId,account.authVersion,now,factor.factor_id).first();
  if(!created)throw Error('Authentication changed');
  return {kind:'pending' as const,token,browser,expiresAt:now+300};
}
export async function pendingLogin(db:D1Database,token:string,browser:string,now:number){
  if(!/^[a-f0-9]{64}$/.test(token)||!/^[a-f0-9]{64}$/.test(browser))return null;
  return db.prepare(`SELECT t.*,f.secret_ciphertext,f.secret_nonce,f.key_id,f.last_step,f.recovery_set_id
    FROM auth_mfa_transactions t JOIN users u ON u.id=t.user_id JOIN auth_totp_factors f ON f.user_id=u.id
    WHERE t.token_digest=? AND t.browser_digest=? AND t.purpose='login' AND t.phase='pending'
      AND t.created_at<=? AND t.expires_at>? AND u.auth_version=t.auth_version AND u.status='active'
      AND u.email_verified_at IS NOT NULL AND f.factor_id=t.factor_id`)
    .bind(await mfaDigest('transaction',token),await mfaDigest('browser',browser),now,now).first<MfaChallenge>();
}

// Statements follow a successful guarded mutation in the SAME batch. No caller
// may hand out the raw token before the final consumption succeeds.
export function sessionCompletion(db:D1Database,row:{user_id:string;auth_version:number;factor_id:string;primary_method:string;primary_authenticated_at:number},
  digest:string,now:number,method:'totp'|'recovery'){
  return [
    db.prepare(`INSERT INTO auth_sessions(id,user_id,token_digest,auth_version,created_at,expires_at)
      SELECT ?,id,?,auth_version,?,? FROM users WHERE id=? AND auth_version=? AND status='active' AND changes()=1 RETURNING id`)
      .bind(crypto.randomUUID(),digest,now,now+AUTH_POLICY.sessionLifetimeSeconds,row.user_id,row.auth_version),
    db.prepare(`INSERT INTO auth_session_mfa(session_digest,user_id,auth_version,factor_id,method,verified_at,primary_method,primary_authenticated_at)
      SELECT ?,?,?,?,?,?,?,? WHERE changes()=1 RETURNING session_digest`)
      .bind(digest,row.user_id,row.auth_version,row.factor_id,method,now,row.primary_method,row.primary_authenticated_at),
    db.prepare(`INSERT INTO auth_recent_authentication(session_digest,user_id,auth_version,method,authenticated_at,expires_at)
      SELECT ?,?,?,?,?,? WHERE changes()=1 RETURNING session_digest`)
      .bind(digest,row.user_id,row.auth_version,row.primary_method,row.primary_authenticated_at,row.primary_authenticated_at+300),
  ];
}
export async function completeMfa(db:D1Database,row:MfaChallenge,code:string,method:'totp'|'recovery',keys:MfaKeys,environment:'local'|'dev',now:number,reservation:LoginReservation){
  let step:number|null=null,verifier:string|null=null;
  const secret=await decryptTotpSecret({ciphertext:row.secret_ciphertext,nonce:row.secret_nonce,keyId:row.key_id},keys,
    {environment,userId:row.user_id,id:row.factor_id,purpose:'active'});
  if(method==='totp'){
    step=await verifyTotp(secret,code,now,row.last_step);
    if(step===null)return null;
  }else{
    verifier=await recoveryVerifier(row.user_id,row.recovery_set_id,code);
    if(!verifier)return null;
  }
  const lease=reservation.activeCondition();
  const live=`${lease.sql} AND EXISTS(SELECT 1 FROM auth_mfa_transactions t JOIN users u ON u.id=t.user_id
    WHERE t.token_digest=? AND t.phase='pending' AND t.purpose='login' AND t.user_id=? AND t.auth_version=?
      AND t.factor_id=? AND t.created_at<=? AND t.expires_at>? AND t.expires_at>unixepoch() AND u.auth_version=t.auth_version
      AND u.status='active' AND u.email_verified_at IS NOT NULL)`;
  const args=[...lease.values,row.token_digest,row.user_id,row.auth_version,row.factor_id,now,now];
  const proof=method==='totp'?db.prepare(`UPDATE auth_totp_factors SET last_step=? WHERE user_id=? AND factor_id=?
    AND last_step=? AND last_step<? AND ${live} RETURNING factor_id`)
    .bind(step,row.user_id,row.factor_id,row.last_step,step,...args):
    db.prepare(`UPDATE auth_mfa_recovery_codes SET consumed_at=? WHERE user_id=? AND set_id=? AND verifier=?
      AND consumed_at IS NULL AND created_at<=? AND ${live}
      AND EXISTS(SELECT 1 FROM auth_totp_factors WHERE user_id=? AND factor_id=? AND recovery_set_id=?) RETURNING verifier`)
      .bind(now,row.user_id,row.recovery_set_id,verifier,now,...args,row.user_id,row.factor_id,row.recovery_set_id);
  const token=generateToken(),digest=await digestToken(token,'session');
  const result=await db.batch([proof,
    db.prepare(`UPDATE auth_mfa_transactions SET phase='verified',verified_at=?,proof_method=?
      WHERE token_digest=? AND phase='pending' AND changes()=1 RETURNING transaction_id`).bind(now,method,row.token_digest),
    ...sessionCompletion(db,row,digest,now,method),
    db.prepare(`UPDATE auth_mfa_transactions SET phase='consumed',consumed_at=? WHERE token_digest=? AND phase='verified'
      AND changes()=1 RETURNING transaction_id`).bind(now,row.token_digest),
  ]);
  return result.at(-1)?.results.length===1?{token}:null;
}
