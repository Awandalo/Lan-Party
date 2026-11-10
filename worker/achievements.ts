import type {AuthenticationEnvironment} from './auth/http';
import {authOrigin,authRouteEnabled,validAuthMutation} from './auth/environment';
import {readSessionCookie} from './auth/cookies';
import {resolveSession} from './auth/sessions';
import {digestToken} from './auth/tokens';
import {sessionCsrfToken} from './auth/csrf';
import {fromHex} from './auth/encoding';
import {readInput} from './auth/registration';
import {memberActor} from './event-registration-data';
import {achievementsReady,memberAchievements} from './achievement-data';
import {ACHIEVEMENTS} from '../src/lib/achievements';
const reply=(status:number,body:unknown)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie, X-LAN-Session-Proof','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
export async function displayCase(request:Request,env:AuthenticationEnvironment){
 if(!authRouteEnabled(request,env,env.AUTH_SESSION_MODE))return reply(404,{error:'Not found'});
 if(!['GET','POST'].includes(request.method))return reply(405,{error:'Method not allowed'});
 try{
  const url=new URL(request.url),origin=authOrigin(request,env);
  if(url.search||request.headers.has('Content-Encoding')||request.headers.get('X-LAN-Request')!=='1'||request.headers.has('Origin')&&request.headers.get('Origin')!==origin.origin||request.headers.has('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin')return reply(403,{error:'Request rejected'});
  const token=readSessionCookie(request),account=token?await resolveSession(env.DB,token,Math.floor(Date.now()/1000)):null;
  if(!token||!account)return reply(401,{error:'Please sign in again.'});
  if(account.emailVerifiedAt===null)return reply(403,{error:'Verify your email to use your Display case.'});
  if(!env.AUTH_RATE_LIMIT_SECRET)return reply(503,{error:'Display case unavailable.'});
  const digest=await digestToken(token,'session'),proof=fromHex(request.headers.get('X-LAN-Session-Proof')??'',32),expected=fromHex(await sessionCsrfToken(digest,env.AUTH_RATE_LIMIT_SECRET),32)!;
  if(!proof||!crypto.subtle.timingSafeEqual(proof,expected))return reply(403,{error:'Reload to check your session.'});
  if(!await achievementsReady(env.DB))return reply(503,{error:'Display case is awaiting its database migration.'});
  const awards=await memberAchievements(env.DB,account.userId),current=await env.DB.prepare('SELECT selected_code AS selectedCode,revision FROM member_achievement_showcase WHERE user_id=?').bind(account.userId).first<{selectedCode:string|null;revision:number}>();
  if(!await env.DB.prepare('SELECT 1 WHERE '+memberActor).bind(account.userId,digest).first())return reply(409,{error:'Your session changed. Reload before continuing.'});
  if(request.method==='GET')return reply(200,{awards,selectedCode:awards.some(a=>a.code===current?.selectedCode&&a.unlocked)?current!.selectedCode:null,revision:current?.revision??0});
  if(!await validAuthMutation(request,origin.origin,digest,env.AUTH_RATE_LIMIT_SECRET))return reply(403,{error:'Request rejected'});
  let raw:Record<string,unknown>;try{raw=await readInput(request) as Record<string,unknown>;}catch{return reply(400,{error:'Check your showcase choice.'});}
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join(',')!=='revision,selectedCode'||!Number.isSafeInteger(raw.revision)||Number(raw.revision)<0||raw.selectedCode!==null&&!ACHIEVEMENTS.some(a=>a.code===raw.selectedCode))return reply(400,{error:'Choose an available achievement.'});
  if(raw.selectedCode!==null&&!awards.some(a=>a.code===raw.selectedCode&&a.unlocked))return reply(400,{error:'Unlock this achievement before showcasing it.'});
  if(raw.revision!==(current?.revision??0))return reply(409,{error:'Your showcase changed elsewhere. Reload before saving.'});
  await env.DB.batch([
   env.DB.prepare(`INSERT INTO member_achievement_showcase(user_id,selected_code,revision,updated_at) SELECT ?,?,1,unixepoch() WHERE ${memberActor} ON CONFLICT(user_id) DO UPDATE SET selected_code=excluded.selected_code,revision=member_achievement_showcase.revision+1,updated_at=unixepoch() WHERE member_achievement_showcase.revision=? AND ${memberActor}`).bind(account.userId,raw.selectedCode,account.userId,digest,raw.revision,account.userId,digest),
   env.DB.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('showcase conflict') END"),
  ]);
  return reply(200,{awards,selectedCode:raw.selectedCode,revision:Number(raw.revision)+1});
 }catch(e){return /malformed JSON|showcase conflict/i.test(String(e))?reply(409,{error:'Your showcase or session changed. Reload before saving.'}):reply(503,{error:'Display case could not be confirmed. Reload before trying again.'});}
}
