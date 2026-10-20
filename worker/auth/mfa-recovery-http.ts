import type {AuthenticationEnvironment} from './http';
import type {MfaKeys} from './mfa-crypto';
import type {RecoveryOperation} from './mfa-recovery';
import {mfaDigest} from './mfa-crypto';
import {pendingLogin} from './mfa-login';
import {recoveryOperation,startRecovery,recoverySetup,commitRecovery,revealRecovery,closeRecovery,cleanupRecovery,
 grantRecoveryPrimary,RecoveryPrimaryRequired} from './mfa-recovery';
import {authClientIP,authOrigin,loopback,validAuthMutation} from './environment';
import {sessionCsrfToken} from './csrf';
import {readInput} from './registration';
import {verifyPassword} from './passwords';
import {LoginLimiter,LoginBusy,LoginLimited} from './login-limits';
import {LoginChallenge,verifyLoginChallenge} from './turnstile';
import {passwordNotice} from './password-notification';

function cookie(request:Request,kind:string){
 const prefix=loopback(new URL(request.url))?'lan_mfa_local_':'__Host-lan_mfa_';
 const parts=(request.headers.get('Cookie')??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(prefix+kind+'='));
 return parts.length===1?parts[0].slice((prefix+kind+'=').length):'';
}
export function recoveryContext(request:Request){return {token:cookie(request,'recovery')||cookie(request,'pending'),
 browser:cookie(request,'recovery_browser')||cookie(request,'browser'),now:Math.floor(Date.now()/1000)};}
function recoveryCookies(response:Response,request:Request,c:ReturnType<typeof recoveryContext>,op:RecoveryOperation){
 if(!['pending','committed'].includes(op.phase))return;
 const now=Math.floor(Date.now()/1000),expires=op.phase==='pending'?op.expires_at:op.display_expires_at!;
 if(expires<=now)return;
 // Pending recovery may commit at its fixed deadline, then display for 300s.
 // Cookies carry only the existing binding; server deadlines remain authoritative.
 const deadline=op.phase==='pending'?expires+300:expires,maxAge=deadline-now;
 const local=loopback(new URL(request.url)),prefix=local?'lan_mfa_local_':'__Host-lan_mfa_';
 for(const [kind,value] of [['recovery',c.token],['recovery_browser',c.browser]])
  response.headers.append('Set-Cookie',`${prefix}${kind}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${local?'':'; Secure'}`);
}
const reply=(status:number,body:object)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
export async function recoveryAuthentication(request:Request,env:AuthenticationEnvironment&MfaKeys){
 const url=new URL(request.url),action=url.pathname.split('/').pop();
 // R1 is local-only. R3 hosted gating is a separate assignment.
 if(!loopback(url)||env.AUTH_SESSION_MODE!=='local-only'||env.AUTH_EMAIL_TRANSPORT!=='local')return reply(404,{error:'Not found'});
 if(!['status','start','setup','primary','commit','reveal','ack','cancel'].includes(action??''))return reply(404,{error:'Not found'});
 if(request.method!==(action==='status'?'GET':'POST'))return reply(405,{error:'Method not allowed'});
 try{
  const origin=authOrigin(request,env),secret=env.AUTH_RATE_LIMIT_SECRET,c=recoveryContext(request);
  if(!secret||url.search||request.headers.has('Content-Encoding')||request.headers.get('X-LAN-Request')!=='1'
   ||request.headers.has('Origin')&&request.headers.get('Origin')!==origin.origin
   ||request.headers.has('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin')return reply(403,{error:'Request rejected'});
  await cleanupRecovery(env.DB,c.now);
  const op=await recoveryOperation(env.DB,c),pending=op?null:await pendingLogin(env.DB,c.token,c.browser,c.now);
  if(!op&&!pending)return reply(401,{error:'Recovery unavailable or expired. Log in again.'});
  const source=op?.source_digest??pending!.token_digest,csrf=await mfaDigest('csrf',source);
  if(action==='status'){
   const user=op?.user_id??pending!.user_id;
   const password=!!await env.DB.prepare('SELECT user_id FROM user_password_credentials WHERE user_id=?').bind(user).first();
   const google=!!await env.DB.prepare("SELECT id FROM user_auth_providers WHERE user_id=? AND provider='google'").bind(user).first();
   const response=reply(200,{phase:op?.phase??'initial',expiresAt:op?.phase==='pending'?op.expires_at:op?.display_expires_at??pending!.expires_at,
    csrfToken:await sessionCsrfToken(csrf,secret),password,google});
   if(op)recoveryCookies(response,request,c,op);return response;
  }
  if(!await validAuthMutation(request,origin.origin,csrf,secret))return reply(403,{error:'Request rejected'});
  const input=await readInput(request) as Record<string,unknown>;
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['code','password','confirmed','turnstileToken'].includes(k)))return reply(400,{error:'Invalid request'});
  if(action==='setup')return reply(200,await recoverySetup(env.DB,c,env,'local'));
  if(action==='ack'||action==='cancel'){
   if(input.confirmed!==true)return reply(400,{error:'Explicit confirmation required'});
   await closeRecovery(env.DB,c,action==='ack');return reply(200,{next:'/login',message:'Return to login with your new authenticator if replacement completed.'});
  }
  if(action==='start'&&op){const response=reply(200,{resumed:true});recoveryCookies(response,request,c,op);return response;}
  if(action==='start'&&input.confirmed!==true)return reply(400,{error:'Explicit confirmation required'});
  const limiter=await LoginLimiter.create(env.DB,secret,authClientIP(request,env).toLowerCase());
  if(await limiter.observe()||input.turnstileToken!==undefined)await verifyLoginChallenge(env.DB,env,input.turnstileToken,origin.hostname);
  const held=await limiter.reserveMfa(op?.user_id??pending!.user_id,source);let done=false;
  try{
   let result:object|null;
   if(action==='start'&&pending&&typeof input.code==='string'&&input.code.length<=40){
    result=await startRecovery(env.DB,c,pending,input.code,env,'local',held);
   }else if(action==='primary'&&op&&typeof input.password==='string'&&input.password.length<=256){
    const record=await env.DB.prepare('SELECT password_hash FROM user_password_credentials WHERE user_id=?').bind(op.user_id).first<string>('password_hash');
    const valid=record?await verifyPassword(input.password,record,env.PASSWORD_PEPPER):false;
    if(valid){await grantRecoveryPrimary(env.DB,c,'password',c.now,op.auth_version+(op.phase==='pending'?0:1));result={message:'Identity confirmed.'};}else result=null;
   }else if(action==='commit'&&typeof input.code==='string')result=await commitRecovery(env.DB,c,input.code,env,'local',held);
   else if(action==='reveal'&&typeof input.code==='string')result=await revealRecovery(env.DB,c,input.code,env,'local',held);
   else return reply(400,{error:'Invalid request'});
   if(!await held.finish(!result))throw Error('Check expired');done=true;
   if(!result)return reply(401,{error:'Proof not accepted.'});
   if(action==='commit'){
    const switched=result as {userId:string;authVersion:number};
    await passwordNotice(request,env,{...switched,status:'active',emailVerifiedAt:c.now},'mfa-replaced');
   }
   const response=reply(200,result);
   if(action==='start'){const created=await recoveryOperation(env.DB,c);if(created)recoveryCookies(response,request,c,created);}
   return response;
  }finally{if(!done)await held.finish(false);}
 }catch(error){
  if(error instanceof RecoveryPrimaryRequired)return reply(428,{code:'reauth_required',error:'Confirm your sign-in method again. The recovery deadline is unchanged.'});
  if(error instanceof LoginLimited){const r=reply(429,{error:'Too many attempts. Wait before trying again.'});r.headers.set('Retry-After',String(error.retryAfter));return r;}
  if(error instanceof LoginChallenge)return reply(403,{code:'challenge_required',siteKey:error.siteKey,error:'Complete the security check.'});
  if(error instanceof LoginBusy)return reply(503,{error:'Another check is pending. Try again shortly.'});
  return reply(503,{error:'Recovery could not be confirmed. No automatic retry was made. Check status before continuing.'});
 }
}
