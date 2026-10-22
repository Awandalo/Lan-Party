import type {AccountIdentity} from './contracts';
import type {MfaKeys} from './mfa-crypto';
import type {LoginReservation} from './login-limits';
import {decryptTotpSecret,recoveryVerifier,verifyTotp} from './mfa-crypto';
import {mfaSchemaReady} from './mfa-session';
import {sessionCompletion} from './mfa-login';
import {digestToken,generateToken} from './tokens';

export class RecentMfaRequired extends Error {}

// Use the database clock INSIDE the write, including after password hashing or
// an OAuth exchange. An earlier application-clock check is only a UX precheck.
export async function mfaMutationGuard(db:D1Database,account:AccountIdentity,digest:string){
  if(!await mfaSchemaReady(db))return {sql:'1',values:[] as (string|number)[]};
  return {sql:`(NOT EXISTS(SELECT 1 FROM auth_totp_factors WHERE user_id=?) OR EXISTS(
    SELECT 1 FROM auth_session_mfa m JOIN auth_sessions s ON s.token_digest=m.session_digest
    JOIN users u ON u.id=s.user_id JOIN auth_totp_factors f ON f.user_id=u.id
    WHERE u.id=? AND u.auth_version=? AND u.status='active' AND u.email_verified_at IS NOT NULL
      AND s.token_digest=? AND s.auth_version=u.auth_version AND s.revoked_at IS NULL AND s.expires_at>unixepoch()
      AND m.user_id=u.id AND m.auth_version=u.auth_version AND m.factor_id=f.factor_id
      AND m.verified_at<=s.created_at AND m.verified_at<=unixepoch() AND m.verified_at>unixepoch()-120))`,
    values:[account.userId,account.userId,account.authVersion,digest]};
}
export async function requireRecentMfa(db:D1Database,account:AccountIdentity,digest:string){
  const guard=await mfaMutationGuard(db,account,digest);
  if(!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())throw new RecentMfaRequired();
  return guard;
}

// Step-up rotates the current session instead of changing its assurance in
// place (verified_at must never be later than that session's creation time).
// Primary authentication keeps its original timestamp; MFA is not primary proof.
export async function stepUp(db:D1Database,account:AccountIdentity,source:string,code:string,method:'totp'|'recovery',
  keys:MfaKeys,now:number,reservation:LoginReservation){
  const row=await db.prepare(`SELECT f.*,m.primary_method,m.primary_authenticated_at,
    r.method AS recent_method,r.authenticated_at AS recent_at
    FROM auth_totp_factors f JOIN auth_session_mfa m ON m.factor_id=f.factor_id AND m.user_id=f.user_id
    JOIN auth_sessions s ON s.token_digest=m.session_digest JOIN users u ON u.id=s.user_id
    LEFT JOIN auth_recent_authentication r ON r.session_digest=s.token_digest AND r.user_id=u.id AND r.auth_version=u.auth_version
    WHERE u.id=? AND u.auth_version=? AND u.status='active' AND u.email_verified_at IS NOT NULL
      AND m.session_digest=? AND m.user_id=u.id AND m.auth_version=u.auth_version AND s.auth_version=u.auth_version
      AND s.revoked_at IS NULL AND s.expires_at>unixepoch() AND m.verified_at<=s.created_at`)
    .bind(account.userId,account.authVersion,source).first<{factor_id:string;secret_ciphertext:string;secret_nonce:string;key_id:string;
      last_step:number;recovery_set_id:string;primary_method:string;primary_authenticated_at:number;recent_method:string|null;recent_at:number|null}>();
  if(!row)return null;
  const secret=await decryptTotpSecret({ciphertext:row.secret_ciphertext,nonce:row.secret_nonce,keyId:row.key_id},keys,
    {environment:'local',userId:account.userId,id:row.factor_id,purpose:'active'});
  let step:number|null=null,verifier:string|null=null;
  if(method==='totp'){
    step=await verifyTotp(secret,code,now,row.last_step);if(step===null)return null;
  }else{verifier=await recoveryVerifier(account.userId,row.recovery_set_id,code);if(!verifier)return null;}
  const lease=reservation.activeCondition();
  const live=`${lease.sql} AND EXISTS(SELECT 1 FROM users u JOIN auth_sessions s ON s.user_id=u.id
    JOIN auth_session_mfa m ON m.session_digest=s.token_digest WHERE u.id=? AND u.auth_version=?
      AND u.status='active' AND u.email_verified_at IS NOT NULL AND s.token_digest=? AND s.auth_version=u.auth_version
      AND s.revoked_at IS NULL AND s.expires_at>unixepoch() AND m.user_id=u.id AND m.auth_version=u.auth_version AND m.factor_id=?)`;
  const values=[...lease.values,account.userId,account.authVersion,source,row.factor_id];
  const proof=method==='totp'?db.prepare(`UPDATE auth_totp_factors SET last_step=? WHERE user_id=? AND factor_id=? AND last_step=? AND ${live} RETURNING factor_id`)
    .bind(step,account.userId,row.factor_id,row.last_step,...values):
    db.prepare(`UPDATE auth_mfa_recovery_codes SET consumed_at=? WHERE user_id=? AND set_id=? AND verifier=?
      AND consumed_at IS NULL AND created_at<=? AND ${live}
      AND EXISTS(SELECT 1 FROM auth_totp_factors WHERE user_id=? AND factor_id=? AND recovery_set_id=?) RETURNING verifier`)
      .bind(now,account.userId,row.recovery_set_id,verifier,now,...values,account.userId,row.factor_id,row.recovery_set_id);
  const token=generateToken(),digest=await digestToken(token,'session');
  const assurance={user_id:account.userId,auth_version:account.authVersion,factor_id:row.factor_id,
    primary_method:row.recent_method??row.primary_method,primary_authenticated_at:row.recent_at??row.primary_authenticated_at};
  const assertOne=()=>db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('step-up guard failed') END");
  try{
    await db.batch([proof,assertOne(),
      db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE token_digest=? AND revoked_at IS NULL RETURNING id').bind(now,source),assertOne(),
      ...sessionCompletion(db,assurance,digest,now,method).flatMap(statement=>[statement,assertOne()]),
    ]);
    return {kind:'session' as const,token};
  }catch{return null;}
}
