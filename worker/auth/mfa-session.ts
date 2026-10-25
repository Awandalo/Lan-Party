// No cached schema decision: migrations may change between invocations. A wholly
// pre-0013 database has no possible factor; partial MFA schemas always fail closed.
export async function mfaSchemaReady(db:D1Database){
  const count=await db.prepare(`SELECT count(*) AS n FROM sqlite_schema WHERE type='table'
    AND name IN ('auth_totp_factors','auth_mfa_transactions','auth_mfa_recovery_codes','auth_session_mfa')`).first<number>('n');
  if(count!==0&&count!==4)throw Error('MFA schema unavailable');
  return count===4;
}
// Shared by session resolution and repository reads, never by provider-specific UI.
export const mfaSessionCondition=`(NOT EXISTS(SELECT 1 FROM auth_totp_factors f WHERE f.user_id=u.id)
  OR EXISTS(SELECT 1 FROM auth_session_mfa m JOIN auth_totp_factors f ON f.user_id=m.user_id
    WHERE m.session_digest=s.token_digest AND m.user_id=u.id AND m.auth_version=u.auth_version
      AND m.factor_id=f.factor_id AND m.verified_at<=s.created_at AND m.verified_at<s.expires_at
      AND m.verified_at<=unixepoch()))`;

// Shared primary -> restricted pending -> MFA session transition is implemented.
// Management/recovery eligibility is independently gated to local or canonical DEV.
export const MFA_LOGIN_INTEGRATION_READY=true;
export interface PendingMfaAuthentication {
  userId:string;authVersion:number;factorId:string;browserDigest:string;
  primaryMethod:'password';primaryAuthenticatedAt:number;expiresAt:number;
}
