import type {EnrollmentContext} from './mfa-enrollment';
import type {MfaKeys} from './mfa-crypto';
import type {LoginReservation} from './login-limits';
import {decryptTotpSecret,generateRecoveryCodes,mfaDigest,randomMfaToken,recoveryVerifier,verifyTotp} from './mfa-crypto';
import {digestToken,generateToken} from './tokens';
import {sessionCompletion} from './mfa-login';

export class RegenerationUnavailable extends Error {}
export class RegenerationProofRequired extends Error {
  constructor(public readonly primary:boolean){super('Confirm your identity before continuing.');}
}
interface Primary {method:'password';authenticated_at:number}
interface Operation {
 operation_digest:string;user_id:string;session_digest:string;auth_version:number;factor_id:string;
 old_set_id:string;new_set_id:string|null;phase:'prepared'|'revealed'|'activated'|'cancelled';created_at:number;
 proof_method:'totp'|'recovery'|null;proof_verified_at:number|null;proof_primary_method:'password'|null;
 proof_primary_at:number|null;secret_ciphertext:string;secret_nonce:string;key_id:string;last_step:number;
}
const table='auth_mfa_regeneration_operations';
// Assertions execute inside the same D1 batch: a lost claim must roll back writes.
const one=(db:D1Database)=>db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('regeneration guard failed') END");
function binding(c:EnrollmentContext,digest:string){
 return {sql:`EXISTS(SELECT 1 FROM ${table} o JOIN users u ON u.id=o.user_id
 JOIN auth_sessions s ON s.token_digest=o.session_digest JOIN auth_totp_factors f ON f.user_id=u.id
 JOIN auth_session_mfa m ON m.session_digest=s.token_digest
 WHERE o.operation_digest=? AND o.user_id=? AND o.auth_version=? AND o.session_digest=?
 AND o.phase IN ('prepared','revealed') AND u.status='active' AND u.email_verified_at IS NOT NULL
 AND u.auth_version=o.auth_version AND s.user_id=u.id AND s.auth_version=u.auth_version AND s.revoked_at IS NULL
 AND s.created_at<=? AND s.expires_at>? AND s.expires_at>unixepoch() AND o.created_at<=?
 AND f.factor_id=o.factor_id AND f.recovery_set_id=o.old_set_id
 AND m.user_id=u.id AND m.auth_version=u.auth_version AND m.factor_id=f.factor_id
 AND m.verified_at<=s.created_at AND m.verified_at<=unixepoch())`,
 values:[digest,c.userId,c.authVersion,c.sessionDigest,c.now,c.now,c.now]};
}
function fresh(c:EnrollmentContext,digest:string){
 return {sql:`EXISTS(SELECT 1 FROM ${table} p JOIN auth_recent_authentication r ON r.session_digest=p.session_digest
 WHERE p.operation_digest=? AND r.user_id=p.user_id AND r.method='password' AND r.auth_version=p.auth_version
 AND r.method=p.proof_primary_method AND r.authenticated_at=p.proof_primary_at
 AND r.authenticated_at>? AND r.authenticated_at>unixepoch()-120 AND r.authenticated_at<=? AND r.authenticated_at<=unixepoch()
 AND r.expires_at>? AND r.expires_at>unixepoch()
 AND p.proof_verified_at>? AND p.proof_verified_at>unixepoch()-120 AND p.proof_verified_at<=? AND p.proof_verified_at<=unixepoch())`,
 values:[digest,c.now-120,c.now,c.now,c.now-120,c.now]};
}
async function primary(db:D1Database,c:EnrollmentContext){
 return db.prepare(`SELECT r.method,r.authenticated_at FROM auth_recent_authentication r JOIN auth_sessions s ON s.token_digest=r.session_digest
 JOIN users u ON u.id=s.user_id WHERE r.user_id=? AND r.method='password' AND r.auth_version=? AND r.session_digest=?
 AND u.id=r.user_id AND u.auth_version=r.auth_version AND u.status='active' AND u.email_verified_at IS NOT NULL
 AND s.revoked_at IS NULL AND s.expires_at>? AND s.expires_at>unixepoch()
 AND r.authenticated_at>? AND r.authenticated_at>unixepoch()-120 AND r.authenticated_at<=? AND r.authenticated_at<=unixepoch()
 AND r.expires_at>? AND r.expires_at>unixepoch()`)
 .bind(c.userId,c.authVersion,c.sessionDigest,c.now,c.now-120,c.now,c.now).first<Primary>();
}
async function load(db:D1Database,c:EnrollmentContext,token:string){
 if(!/^[a-f0-9]{64}$/.test(token))throw Error('Regeneration unavailable');
 const digest=await mfaDigest('regeneration',token),gate=binding(c,digest);
 const row=await db.prepare(`SELECT o.*,f.secret_ciphertext,f.secret_nonce,f.key_id,f.last_step FROM ${table} o
 JOIN auth_totp_factors f ON f.user_id=o.user_id WHERE o.operation_digest=? AND ${gate.sql}`)
 .bind(digest,...gate.values).first<Operation>();
 if(!row)throw new RegenerationUnavailable('This regeneration is no longer available. Check your current account settings.');return row;
}
async function ready(db:D1Database,c:EnrollmentContext,row:Operation){
 if(!await primary(db,c))throw new RegenerationProofRequired(true);
 const proof=fresh(c,row.operation_digest);
 if(!await db.prepare(`SELECT 1 WHERE ${proof.sql}`).bind(...proof.values).first())throw new RegenerationProofRequired(false);
}
export async function regenerationReady(db:D1Database){
 return !!await db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name=?").bind(table).first();
}
export async function isRegeneration(db:D1Database,token:string){
 return /^[a-f0-9]{64}$/.test(token)&&await regenerationReady(db)&&!!await db.prepare(`SELECT 1 FROM ${table} WHERE operation_digest=?`)
 .bind(await mfaDigest('regeneration',token)).first();
}
export async function startRegeneration(db:D1Database,c:EnrollmentContext){
 if(!await regenerationReady(db))throw Error('Regeneration migration unavailable');
 const proof=await primary(db,c);if(!proof)throw new RegenerationProofRequired(true);
 const token=randomMfaToken(),digest=await mfaDigest('regeneration',token);
 await db.batch([
 db.prepare(`UPDATE ${table} SET phase='cancelled',acknowledgment_digest=NULL WHERE user_id=? AND phase IN ('prepared','revealed')`).bind(c.userId),
 db.prepare(`DELETE FROM ${table} WHERE operation_digest IN (SELECT operation_digest FROM ${table} WHERE user_id=? AND phase IN ('cancelled','activated') LIMIT 50)`).bind(c.userId),
 db.prepare(`INSERT INTO ${table}(operation_digest,user_id,session_digest,auth_version,factor_id,old_set_id,phase,created_at,primary_method,primary_authenticated_at)
 SELECT ?,u.id,s.token_digest,u.auth_version,f.factor_id,f.recovery_set_id,'prepared',?,?,? FROM users u
 JOIN auth_sessions s ON s.user_id=u.id JOIN auth_totp_factors f ON f.user_id=u.id JOIN auth_session_mfa m ON m.session_digest=s.token_digest
 JOIN auth_recent_authentication r ON r.session_digest=s.token_digest
 WHERE u.id=? AND u.auth_version=? AND u.status='active' AND u.email_verified_at IS NOT NULL AND s.token_digest=?
 AND s.auth_version=u.auth_version AND s.revoked_at IS NULL AND s.created_at<=? AND s.expires_at>? AND s.expires_at>unixepoch()
 AND m.user_id=u.id AND m.auth_version=u.auth_version AND m.factor_id=f.factor_id AND m.verified_at<=s.created_at AND m.verified_at<=unixepoch()
 AND r.user_id=u.id AND r.method='password' AND r.auth_version=u.auth_version AND r.method=? AND r.authenticated_at=?
 AND r.authenticated_at>unixepoch()-120 AND r.authenticated_at<=unixepoch() AND r.expires_at>unixepoch()
 AND NOT EXISTS(SELECT 1 FROM auth_mfa_transactions t WHERE t.user_id=u.id AND t.purpose IN ('enroll','disable','regenerate') AND t.phase IN ('pending','verified') AND t.expires_at>unixepoch())
 AND NOT EXISTS(SELECT 1 FROM auth_mfa_recovery_operations z WHERE z.user_id=u.id AND ((z.phase IN ('pending','switching') AND z.expires_at>unixepoch()) OR (z.phase='committed' AND z.display_expires_at>unixepoch())))`)
 .bind(digest,c.now,proof.method,proof.authenticated_at,c.userId,c.authVersion,c.sessionDigest,c.now,c.now,proof.method,proof.authenticated_at),one(db),
 ]);
 return {token};
}
export async function regenerationStatus(db:D1Database,c:EnrollmentContext,token:string){
 if(/^[a-f0-9]{64}$/.test(token)){
  const activated=await db.prepare(`SELECT 1 FROM ${table} o JOIN auth_totp_factors f ON f.user_id=o.user_id
   WHERE o.operation_digest=? AND o.user_id=? AND o.phase='activated' AND o.auth_version+1=?
   AND f.factor_id=o.factor_id AND f.recovery_set_id=o.new_set_id`)
   .bind(await mfaDigest('regeneration',token),c.userId,c.authVersion).first();
  if(activated)return {phase:'activated',seen:true,primaryRequired:false,mfaRequired:false};
 }
 const row=await load(db,c,token),p=await primary(db,c),proof=fresh(c,row.operation_digest);
 return {phase:row.phase,seen:row.phase==='revealed',primaryRequired:!p,mfaRequired:!await db.prepare(`SELECT 1 WHERE ${proof.sql}`).bind(...proof.values).first()};
}
export async function proveRegeneration(db:D1Database,c:EnrollmentContext,token:string,code:string,method:'totp'|'recovery',keys:MfaKeys,environment:'local'|'dev',held:LoginReservation){
 const row=await load(db,c,token),p=await primary(db,c);if(!p)throw new RegenerationProofRequired(true);
 const secret=await decryptTotpSecret({ciphertext:row.secret_ciphertext,nonce:row.secret_nonce,keyId:row.key_id},keys,{environment,userId:row.user_id,id:row.factor_id,purpose:'active'});
 const step=method==='totp'?await verifyTotp(secret,code,c.now,row.last_step):null;
 const verifier=method==='recovery'?await recoveryVerifier(c.userId,row.old_set_id,code):null;
 if(method==='totp'?step===null:!verifier)return null;
 if(method==='recovery'&&!await db.prepare('SELECT 1 FROM auth_mfa_recovery_codes WHERE user_id=? AND set_id=? AND verifier=? AND consumed_at IS NULL').bind(c.userId,row.old_set_id,verifier).first())return null;
 const gate=binding(c,row.operation_digest),lease=held.activeCondition();
 const sql=`${gate.sql} AND ${lease.sql} AND EXISTS(SELECT 1 FROM auth_recent_authentication r WHERE r.session_digest=? AND r.user_id=? AND r.method='password' AND r.auth_version=? AND r.method=? AND r.authenticated_at=? AND r.authenticated_at>unixepoch()-120 AND r.authenticated_at<=unixepoch() AND r.expires_at>unixepoch())`;
 const args=[...gate.values,...lease.values,c.sessionDigest,c.userId,c.authVersion,p.method,p.authenticated_at];
 const check=method==='totp'?db.prepare(`UPDATE auth_totp_factors SET last_step=? WHERE user_id=? AND factor_id=? AND last_step=? AND last_step<? AND ${sql}`)
 .bind(step,c.userId,row.factor_id,row.last_step,step,...args):db.prepare(`UPDATE auth_mfa_recovery_codes SET consumed_at=? WHERE user_id=? AND set_id=? AND verifier=? AND consumed_at IS NULL AND ${sql}`)
 .bind(c.now,c.userId,row.old_set_id,verifier,...args);
 await db.batch([check,one(db),db.prepare(`UPDATE ${table} SET proof_method=?,proof_verified_at=?,proof_primary_method=?,proof_primary_at=? WHERE operation_digest=? AND ${gate.sql}`)
 .bind(method,c.now,p.method,p.authenticated_at,row.operation_digest,...gate.values),one(db)]);
 return {verified:true};
}
export async function revealRegeneration(db:D1Database,c:EnrollmentContext,token:string,keys:MfaKeys,environment:'local'|'dev'){
 const row=await load(db,c,token);await ready(db,c,row);
 await decryptTotpSecret({ciphertext:row.secret_ciphertext,nonce:row.secret_nonce,keyId:row.key_id},keys,{environment,userId:row.user_id,id:row.factor_id,purpose:'active'});
 const set=crypto.randomUUID(),codes=await generateRecoveryCodes(c.userId,set),ack=randomMfaToken();
 const gate=binding(c,row.operation_digest),proof=fresh(c,row.operation_digest);
 await db.batch([
 db.prepare(`UPDATE ${table} SET phase='revealed',new_set_id=?,acknowledgment_digest=? WHERE operation_digest=? AND phase='prepared' AND ${gate.sql} AND ${proof.sql}`)
 .bind(set,await mfaDigest('regeneration-ack',ack),row.operation_digest,...gate.values,...proof.values),one(db),
 ...codes.verifiers.flatMap(verifier=>[db.prepare(`INSERT INTO auth_mfa_recovery_codes(user_id,set_id,verifier,created_at) VALUES(?,?,?,?)`).bind(c.userId,set,verifier,c.now),one(db)]),
 ]);
 return {codes:codes.codes,acknowledgment:ack};
}
export async function cancelRegeneration(db:D1Database,c:EnrollmentContext,token:string){
 if(!/^[a-f0-9]{64}$/.test(token))throw Error('Regeneration unavailable');
 await db.prepare(`UPDATE ${table} SET phase='cancelled',acknowledgment_digest=NULL WHERE operation_digest=? AND user_id=? AND session_digest=? AND auth_version=? AND phase IN ('prepared','revealed')`)
 .bind(await mfaDigest('regeneration',token),c.userId,c.sessionDigest,c.authVersion).run();
}
export async function finishRegeneration(db:D1Database,c:EnrollmentContext,token:string,ack:string,keys:MfaKeys,environment:'local'|'dev'){
 const row=await load(db,c,token);await ready(db,c,row);
 await decryptTotpSecret({ciphertext:row.secret_ciphertext,nonce:row.secret_nonce,keyId:row.key_id},keys,{environment,userId:row.user_id,id:row.factor_id,purpose:'active'});
 const gate=binding(c,row.operation_digest),proof=fresh(c,row.operation_digest),replacement=generateToken(),digest=await digestToken(replacement,'session');
 const result=await db.batch([
 db.prepare(`UPDATE ${table} SET phase='activated',activated_at=?,acknowledgment_digest=NULL WHERE operation_digest=? AND phase='revealed' AND acknowledgment_digest=? AND ${gate.sql} AND ${proof.sql}
 AND (SELECT count(*) FROM auth_mfa_recovery_codes WHERE user_id=? AND set_id=? AND consumed_at IS NULL)=10`)
 .bind(c.now,row.operation_digest,await mfaDigest('regeneration-ack',ack),...gate.values,...proof.values,c.userId,row.new_set_id),one(db),
 db.prepare('UPDATE auth_totp_factors SET recovery_set_id=? WHERE user_id=? AND factor_id=? AND recovery_set_id=?').bind(row.new_set_id,c.userId,row.factor_id,row.old_set_id),one(db),
 db.prepare('UPDATE users SET auth_version=auth_version+1,updated_at=? WHERE id=? AND auth_version=?').bind(c.now,c.userId,c.authVersion),one(db),
 ...sessionCompletion(db,{user_id:c.userId,auth_version:c.authVersion+1,factor_id:row.factor_id,primary_method:row.proof_primary_method!,primary_authenticated_at:row.proof_primary_at!},digest,c.now,row.proof_method!,row.proof_verified_at!).flatMap(statement=>[statement,one(db)]),
 db.prepare('DELETE FROM auth_mfa_recovery_codes WHERE user_id=? AND set_id<>?').bind(c.userId,row.new_set_id),
 db.prepare('SELECT token_digest FROM auth_sessions WHERE token_digest=?').bind(digest),
 ]);
 if(result.at(-1)?.results.length!==1)throw Error('Regeneration unavailable');
 return {token:replacement,purpose:'regenerate' as const};
}
