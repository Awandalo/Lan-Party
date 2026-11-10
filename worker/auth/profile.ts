import type {AuthenticationEnvironment} from './http';
import {authOrigin,authRouteEnabled,validAuthMutation} from './environment';
import {readSessionCookie} from './cookies';
import {resolveSession} from './sessions';
import {digestToken} from './tokens';
import {sessionCsrfToken} from './csrf';
import {fromHex} from './encoding';
import {readInput} from './registration';
import {privateName} from './accounts';
import {validateNickname} from './nicknames';
import {mfaSessionCondition} from './mfa-session';
import {AUTH_POLICY} from './config';
import {NAME_PREFIXES} from '../../src/lib/name-prefixes';

const reply=(status:number,body:object)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie, X-LAN-Session-Proof','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
interface ProfileRow {nickname:string;firstName:string;lastName:string;prefixId:string|null;userUpdatedAt:number;nicknameUpdatedAt:number;nicknameChangedAt:number|null;now:number}
async function read(db:D1Database,id:string,digest:string,authVersion:number){return db.prepare(`SELECT n.nickname,u.first_name AS firstName,u.last_name AS lastName,u.name_prefix_id AS prefixId,u.updated_at AS userUpdatedAt,n.updated_at AS nicknameUpdatedAt,n.nickname_changed_at AS nicknameChangedAt,unixepoch() AS now FROM users u JOIN user_nicknames n ON n.user_id=u.id JOIN auth_sessions s ON s.user_id=u.id WHERE u.id=? AND u.status='active' AND u.auth_version=? AND s.token_digest=? AND s.auth_version=u.auth_version AND s.revoked_at IS NULL AND s.created_at<=unixepoch() AND s.expires_at>unixepoch() AND u.updated_at<=unixepoch() AND NOT EXISTS(SELECT 1 FROM account_lifecycle l WHERE l.user_id=u.id) AND ${mfaSessionCondition}`).bind(id,authVersion,digest).first<ProfileRow>();}
async function revision(row:ProfileRow){const {now:_,...fields}=row;const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(fields)));return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');}
async function view(db:D1Database,row:ProfileRow){
 const rows=(await db.prepare('SELECT id,label,is_active AS active FROM name_prefixes ORDER BY sort_order,id').all<{id:string;label:string;active:number}>()).results;
 const available=rows.filter(p=>NAME_PREFIXES.some(n=>n.id===p.id));
 if(available.length!==NAME_PREFIXES.length)return null;
 const choices=rows.filter(p=>available.includes(p)||p.id===row.prefixId);
 return {profile:{nickname:row.nickname,firstName:row.firstName,lastName:row.lastName,prefixId:row.prefixId},revision:await revision(row),nicknameAvailableAt:row.nicknameChangedAt===null?null:row.nicknameChangedAt+AUTH_POLICY.nicknameCooldownSeconds,canChangeNickname:row.nicknameChangedAt===null||row.nicknameChangedAt<=row.now-AUTH_POLICY.nicknameCooldownSeconds,prefixes:choices.filter(p=>p.active===1||p.id===row.prefixId).map(p=>({id:p.id,label:p.label,active:available.includes(p)&&p.active===1}))};
}
export async function accountProfile(request:Request,env:AuthenticationEnvironment):Promise<Response>{
 const url=new URL(request.url);
 if(!authRouteEnabled(request,env,env.AUTH_SESSION_MODE))return reply(404,{error:'Not found'});
 if(!['GET','POST'].includes(request.method))return reply(405,{error:'Method not allowed'});
 try{
  const origin=authOrigin(request,env);
  if(url.search||request.headers.has('Content-Encoding')||request.headers.get('X-LAN-Request')!=='1'||request.headers.has('Origin')&&request.headers.get('Origin')!==origin.origin||request.headers.has('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin')return reply(403,{error:'Request rejected'});
  const token=readSessionCookie(request),account=token?await resolveSession(env.DB,token,Math.floor(Date.now()/1000)):null;
  if(!token||!account)return reply(401,{error:'Sign in again.'});
  if(!env.AUTH_RATE_LIMIT_SECRET)return reply(503,{error:'Profile unavailable.'});
  const digest=await digestToken(token,'session'),proof=await sessionCsrfToken(digest,env.AUTH_RATE_LIMIT_SECRET);
  const supplied=fromHex(request.headers.get('X-LAN-Session-Proof')??'',32),expected=fromHex(proof,32)!;
  if(!supplied||!crypto.subtle.timingSafeEqual(supplied,expected))return reply(403,{error:'Reload to check your session.'});
  const current=await read(env.DB,account.userId,digest,account.authVersion);if(!current)return reply(409,{error:'Profile unavailable. Reload before trying again.'});
  const result=await view(env.DB,current);if(!result)return reply(503,{error:'Profile prefix catalogue is awaiting migration 0037.'});
  if(request.method==='GET')return reply(200,result);
  if(!await validAuthMutation(request,origin.origin,digest,env.AUTH_RATE_LIMIT_SECRET))return reply(403,{error:'Request rejected'});
  let input:Record<string,unknown>,nickname:string,firstName:string,lastName:string,prefixId:string|null;
  try{
   input=await readInput(request) as Record<string,unknown>;
   if(!input||Array.isArray(input)||Object.keys(input).sort().join(',')!=='firstName,lastName,nickname,prefixId,revision'||typeof input.revision!=='string'||!/^[a-f0-9]{64}$/.test(input.revision))throw Error();
   nickname=validateNickname(input.nickname).display;firstName=privateName(input.firstName);lastName=privateName(input.lastName);
   if(input.prefixId!==null&&(typeof input.prefixId!=='string'||input.prefixId!==current.prefixId&&!NAME_PREFIXES.some(p=>p.id===input.prefixId)))throw Error();
   prefixId=input.prefixId as string|null;
  }catch{return reply(400,{error:'Check your display name, first and last names, and chosen prefix.'});}
  if(input.revision!==result.revision)return reply(409,{error:'Your profile changed elsewhere. Reload before saving.'});
  if(nickname!==current.nickname&&!result.canChangeNickname)return reply(409,{error:'Your display name can be changed once every 14 days. Other profile details can still be updated.'});
  if(prefixId!==null&&prefixId!==current.prefixId&&!result.prefixes.some(p=>p.id===prefixId&&p.active))return reply(400,{error:'Choose an available prefix.'});
  // Recheck live session, MFA, original values and nickname cooldown inside the
  // atomic batch. A uniqueness conflict or concurrent account change rolls back
  // both names and nickname; IDs and privilege/security settings never change.
  const live=`EXISTS(SELECT 1 FROM users u JOIN auth_sessions s ON s.user_id=u.id WHERE u.id=? AND u.status='active' AND u.auth_version=? AND s.token_digest=? AND s.auth_version=u.auth_version AND s.revoked_at IS NULL AND s.created_at<=unixepoch() AND s.expires_at>unixepoch() AND u.updated_at<=unixepoch() AND NOT EXISTS(SELECT 1 FROM account_lifecycle l WHERE l.user_id=u.id) AND ${mfaSessionCondition})`;
  const owner=[account.userId,account.authVersion,digest];
  const guard=()=>env.DB.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('profile guard failed') END");
  await env.DB.batch([
   env.DB.prepare(`UPDATE user_nicknames SET nickname=?,nickname_changed_at=CASE WHEN nickname=? THEN nickname_changed_at ELSE unixepoch() END,updated_at=CASE WHEN nickname=? THEN updated_at ELSE unixepoch() END WHERE user_id=? AND nickname=? AND updated_at=? AND (nickname=? OR nickname_changed_at IS NULL OR nickname_changed_at<=unixepoch()-?) AND ${live} AND EXISTS(SELECT 1 FROM users WHERE id=? AND first_name=? AND last_name=? AND name_prefix_id IS ? AND updated_at=?)`).bind(nickname,nickname,nickname,account.userId,current.nickname,current.nicknameUpdatedAt,nickname,AUTH_POLICY.nicknameCooldownSeconds,...owner,account.userId,current.firstName,current.lastName,current.prefixId,current.userUpdatedAt),guard(),
   env.DB.prepare(`UPDATE users SET first_name=?,last_name=?,name_prefix_id=?,updated_at=CASE WHEN first_name=? AND last_name=? AND name_prefix_id IS ? THEN updated_at ELSE unixepoch() END WHERE id=? AND first_name=? AND last_name=? AND name_prefix_id IS ? AND updated_at=? AND ${live} AND (? IS NULL OR name_prefix_id IS ? OR EXISTS(SELECT 1 FROM name_prefixes p WHERE p.id=? AND p.is_active=1))`).bind(firstName,lastName,prefixId,firstName,lastName,prefixId,account.userId,current.firstName,current.lastName,current.prefixId,current.userUpdatedAt,...owner,prefixId,prefixId,prefixId),guard(),
  ]);
  const saved=await read(env.DB,account.userId,digest,account.authVersion);if(!saved)return reply(409,{error:'Reload to check your saved profile.'});
  return reply(200,(await view(env.DB,saved))!);
 }catch(error){
  if(/UNIQUE constraint failed.*user_nicknames/i.test(String(error)))return reply(409,{error:'That display name is unavailable. Choose another.'});
  if(/malformed JSON|profile guard failed/i.test(String(error)))return reply(409,{error:'Your profile or session changed. Reload before trying again.'});
  return reply(503,{error:'Profile could not be confirmed. Reload before trying again.'});
 }
}
