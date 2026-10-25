import type {AuthenticationEnvironment} from './http';
import type {MfaKeys} from './mfa-crypto';
import {mfaDigest} from './mfa-crypto';
import {authClientIP,authOrigin,authRouteEnabled,loopback,validAuthMutation} from './environment';
import {clearSessionCookie,readSessionCookie,sessionCookie} from './cookies';
import {sessionCsrfToken} from './csrf';
import {readInput} from './registration';
import {digestToken,generateToken} from './tokens';
import {resolveSession} from './sessions';
import {validateNickname} from './nicknames';
import {completeMfa,pendingLogin,sessionCompletion} from './mfa-login';
import {beginEnrollment,verifyEnrollment,cancelEnrollment,prepareEnrollmentActivation} from './mfa-enrollment';
import {LoginBusy,LoginLimited,LoginLimiter} from './login-limits';
import {LoginChallenge,verifyLoginChallenge} from './turnstile';
import {beginManagement,cancelManagement,finishManagement,proveManagement,MfaPrimaryRequired} from './mfa-management';
import {passwordNotice} from './password-notification';
import {recoveryAuthentication} from './mfa-recovery-http';
import {stepUp} from './mfa-assurance';
import {mfaManagementEnvironment} from './mfa-environment';
import {startRegeneration,isRegeneration,regenerationStatus,proveRegeneration,revealRegeneration,cancelRegeneration,finishRegeneration,RegenerationProofRequired,RegenerationUnavailable} from './mfa-regeneration';

function name(request:Request,kind:string){return (loopback(new URL(request.url))?'lan_mfa_local_':'__Host-lan_mfa_')+kind;}
export function mfaCookie(request:Request,kind:string,value:string,maxAge=300){
  return `${name(request,kind)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${loopback(new URL(request.url))?'':'; Secure'}`;
}
function read(request:Request,kind:string){
  const values=(request.headers.get('Cookie')??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(name(request,kind)+'='));
  return values.length===1?values[0].slice(name(request,kind).length+1):'';
}
export async function supersedePending(request:Request,db:D1Database){
  const token=read(request,'pending'),browser=read(request,'browser');
  if(!/^[a-f0-9]{64}$/.test(token)||!/^[a-f0-9]{64}$/.test(browser))return;
  await db.prepare(`UPDATE auth_mfa_transactions SET phase='cancelled' WHERE token_digest=? AND browser_digest=?
    AND purpose='login' AND phase='pending'`).bind(await mfaDigest('transaction',token),await mfaDigest('browser',browser)).run();
}
export function primaryResponse(request:Request,result:{kind:string;token:string;browser?:string},redirect=false,next='/account'){
  const pending=result.kind==='pending',path=pending?'/mfa':next;
  const response=redirect?new Response(null,{status:303,headers:{Location:path}}):Response.json({next:path,message:pending?'Complete two-factor authentication.':'Logged in.'});
  response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');
  response.headers.append('Set-Cookie',pending?clearSessionCookie():sessionCookie(result.token));
  response.headers.append('Set-Cookie',mfaCookie(request,'pending',pending?result.token:'',pending?300:0));
  response.headers.append('Set-Cookie',mfaCookie(request,'browser',pending?result.browser!:'',pending?300:0));
  return response;
}
const reply=(status:number,body:object)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
export async function mfaAuthentication(request:Request,env:AuthenticationEnvironment&MfaKeys){
  if(!authRouteEnabled(request,env,env.AUTH_SESSION_MODE))return reply(404,{error:'Not found'});
  if(new URL(request.url).pathname.startsWith('/api/auth/mfa/recovery/'))return recoveryAuthentication(request,env);
  const url=new URL(request.url),enrolling=url.pathname.includes('/enroll/'),action=url.pathname.split('/').pop();
  const managing=url.pathname.includes('/manage/');
  const routes=['challenge','status','complete','cancel','step-up','enroll/start','enroll/verify','enroll/cancel','enroll/activate','manage/start','manage/verify','manage/finish','manage/cancel','manage/reveal','manage/check'];
  if(!routes.some(route=>url.pathname==='/api/auth/mfa/'+route))return reply(404,{error:'Not found'});
  // This gate never applies to login challenge/completion: an enrolled account
  // must still satisfy MFA even when management configuration is unavailable.
  const managementEnvironment=mfaManagementEnvironment(request,env);
  if((enrolling||managing||action==='step-up')&&!managementEnvironment)return reply(404,{error:'Not found'});
  const get=!enrolling&&['challenge','status'].includes(action??'');
  if(request.method!==(get?'GET':'POST'))return reply(405,{error:'Method not allowed'});
  try{
    const origin=authOrigin(request,env),secret=env.AUTH_RATE_LIMIT_SECRET;
    if(!secret||url.search||request.headers.get('X-LAN-Request')!=='1'||request.headers.has('Content-Encoding')
      ||request.headers.has('Origin')&&request.headers.get('Origin')!==origin.origin
      ||request.headers.has('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin')return reply(403,{error:'Request rejected'});
    const now=Math.floor(Date.now()/1000);
    if(action==='step-up'){
      const token=readSessionCookie(request),account=token?await resolveSession(env.DB,token,now):null;
      if(!account||!token||account.emailVerifiedAt===null)return reply(401,{code:'session_required',error:'Sign in again.'});
      const digest=await digestToken(token,'session');
      if(!await validAuthMutation(request,origin.origin,digest,secret))return reply(403,{error:'Request rejected'});
      const input=await readInput(request) as Record<string,unknown>;
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['method','code','turnstileToken'].includes(k))
        ||!['totp','recovery'].includes(input.method as string)||typeof input.code!=='string'||input.code.length>40)return reply(400,{error:'Invalid request'});
      const limiter=await LoginLimiter.create(env.DB,secret,authClientIP(request,env).toLowerCase());
      if(await limiter.observe()||input.turnstileToken!==undefined)await verifyLoginChallenge(env.DB,env,input.turnstileToken,origin.hostname);
      const held=await limiter.reserveMfa(account.userId,await mfaDigest('step-up',digest));let done=false;
      try{
        const result=await stepUp(env.DB,account,digest,input.code,input.method as 'totp'|'recovery',env,now,held,managementEnvironment!);
        if(!await held.finish(!result))throw Error('Check expired');done=true;
        return result?primaryResponse(request,result,false,'/account/security'):reply(401,{error:'Code not accepted. Check it or use an unused recovery code.'});
      }finally{if(!done)await held.finish(false);}
    }
    if(managing){
      const token=readSessionCookie(request),account=token?await resolveSession(env.DB,token,now):null;
      if(!account||!token||account.emailVerifiedAt===null)return reply(401,{code:'session_required',error:'Sign in again.'});
      const digest=await digestToken(token,'session');
      if(!await validAuthMutation(request,origin.origin,digest,secret))return reply(403,{error:'Request rejected'});
      const input=await readInput(request) as Record<string,unknown>;
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['purpose','token','method','code','acknowledgment','confirmed','turnstileToken','regeneration'].includes(k)))return reply(400,{error:'Invalid request'});
      const c={userId:account.userId,authVersion:account.authVersion,sessionDigest:digest,browserDigest:await mfaDigest('management-browser',digest),now};
      if(action==='start'&&input.purpose==='regenerate'){if(Object.keys(input).some(k=>k!=='purpose'))return reply(400,{error:'Invalid request'});return reply(200,{...await startRegeneration(env.DB,c),regeneration:true});}
      if(input.regeneration!==undefined&&input.regeneration!==true)return reply(400,{error:'Invalid request'});
      if(typeof input.token==='string'&&(input.regeneration===true||await isRegeneration(env.DB,input.token))){
        const allowed=action==='verify'?['token','method','code','turnstileToken']:action==='finish'?['token','acknowledgment','confirmed']:['token'];
        if(Object.keys(input).some(k=>k!=='regeneration'&&!allowed.includes(k)))return reply(400,{error:'Invalid request'});
        if(action==='check')return reply(200,await regenerationStatus(env.DB,c,input.token));
        if(action==='cancel'){await cancelRegeneration(env.DB,c,input.token);return reply(200,{message:'Changes cancelled. Previous codes remain active.'});}
        if(action==='reveal')return reply(200,await revealRegeneration(env.DB,c,input.token,env,managementEnvironment!));
        if(action==='verify'&&['totp','recovery'].includes(input.method as string)&&typeof input.code==='string'&&input.code.length<=40){
          const limiter=await LoginLimiter.create(env.DB,secret,authClientIP(request,env).toLowerCase());
          if(await limiter.observe()||input.turnstileToken!==undefined)await verifyLoginChallenge(env.DB,env,input.turnstileToken,origin.hostname);
          const held=await limiter.reserveMfa(account.userId,await mfaDigest('regeneration',input.token));let done=false;
          try{
            const result=await proveRegeneration(env.DB,c,input.token,input.code,input.method as 'totp'|'recovery',env,managementEnvironment!,held);
            if(!await held.finish(!result))throw Error('Check expired');done=true;
            return result?reply(200,result):reply(401,{error:'Code not accepted. Check it or use an unused recovery code.'});
          }finally{if(!done)await held.finish(false);}
        }
        if(action==='finish'&&input.confirmed===true&&typeof input.acknowledgment==='string'&&/^[a-f0-9]{64}$/.test(input.acknowledgment)){
          const result=await finishRegeneration(env.DB,c,input.token,input.acknowledgment,env,managementEnvironment!);
          const notification=await passwordNotice(request,env,account,'mfa-regenerated');
          const response=primaryResponse(request,{kind:'session',token:result.token},false,'/account/security');
          return new Response(JSON.stringify({next:'/account/security',notification}),{status:200,headers:response.headers});
        }
        return reply(400,{error:'Invalid request'});
      }
      // Old timed regeneration receipts cannot reveal or activate through this API.
      if(typeof input.token==='string'&&await env.DB.prepare("SELECT 1 FROM auth_mfa_transactions WHERE token_digest=? AND purpose='regenerate'")
        .bind(await mfaDigest('transaction',input.token)).first())return reply(409,{error:'Start a new regeneration. Previous codes remain active.'});
      if(action==='start'&&['disable'].includes(input.purpose as string))return reply(200,await beginManagement(env.DB,c,input.purpose as 'disable'|'regenerate',env,managementEnvironment!));
      if(typeof input.token!=='string'||!/^[a-f0-9]{64}$/.test(input.token))return reply(400,{error:'Invalid request'});
      if(action==='cancel'){await cancelManagement(env.DB,c,input.token);return reply(200,{message:'Changes cancelled.'});}
      if(action==='verify'&&['totp','recovery'].includes(input.method as string)&&typeof input.code==='string'&&input.code.length<=40){
        const limiter=await LoginLimiter.create(env.DB,secret,authClientIP(request,env).toLowerCase());
        if(await limiter.observe()||input.turnstileToken!==undefined)await verifyLoginChallenge(env.DB,env,input.turnstileToken,origin.hostname);
        const held=await limiter.reserveMfa(account.userId,await mfaDigest('transaction',input.token));let done=false;
        try{
          const result=await proveManagement(env.DB,c,input.token,input.code,input.method as 'totp'|'recovery',env,managementEnvironment!,held);
          if(!await held.finish(!result))throw Error('Check expired');done=true;
          return result?reply(200,result):reply(401,{error:'Code not accepted. Check it or use an unused recovery code.'});
        }finally{if(!done)await held.finish(false);}
      }
      if(action==='finish'&&input.confirmed===true&&typeof input.acknowledgment==='string'&&/^[a-f0-9]{64}$/.test(input.acknowledgment)){
        const result=await finishManagement(env.DB,c,input.token,input.acknowledgment,env,managementEnvironment!);
        const notification=await passwordNotice(request,env,account,result.purpose==='disable'?'mfa-disabled':'mfa-regenerated');
        const response=primaryResponse(request,{kind:'session',token:result.token},false,'/account/security');
        return new Response(JSON.stringify({next:'/account/security',notification}),{status:200,headers:response.headers});
      }
      return reply(400,{error:'Invalid request'});
    }
    if(action==='status'){
      const token=readSessionCookie(request),account=token?await resolveSession(env.DB,token,now):null;
      if(!account)return reply(401,{error:'Sign in again.'});
      const enabled=!!await env.DB.prepare('SELECT user_id FROM auth_totp_factors WHERE user_id=?').bind(account.userId).first();
      const unfinished=!enabled&&managementEnvironment?await env.DB.prepare("SELECT expires_at FROM auth_mfa_transactions WHERE user_id=? AND purpose='enroll' AND phase IN ('pending','verified') AND expires_at>? LIMIT 1")
        .bind(account.userId,now).first<{expires_at:number}>():null;
      return reply(200,{enabled,enrollmentAvailable:managementEnvironment!==null,...(unfinished?{pendingEnrollment:{expiresAt:unfinished.expires_at}}:{})});
    }
    if(enrolling){
      const token=readSessionCookie(request),account=token?await resolveSession(env.DB,token,now):null;
      if(!account||!token||account.emailVerifiedAt===null)return reply(401,{error:'Sign in again.'});
      const digest=await digestToken(token,'session');
      if(!await validAuthMutation(request,origin.origin,digest,secret))return reply(403,{error:'Request rejected'});
      const input=await readInput(request) as Record<string,unknown>;
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!(action==='start'?['restart','confirmed']:['token','code','acknowledgment']).includes(k)))return reply(400,{error:'Invalid request'});
      const c={userId:account.userId,authVersion:account.authVersion,sessionDigest:digest,browserDigest:await mfaDigest('enrollment-browser',digest),now};
      if(action==='start'){
        const restart=input.restart===true&&input.confirmed===true;
        if(Object.keys(input).length&&!restart)return reply(400,{error:'Explicit restart confirmation required.'});
        if(await env.DB.prepare('SELECT 1 FROM auth_totp_factors WHERE user_id=?').bind(account.userId).first())return reply(409,{code:'mfa_enabled',error:'MFA is already enabled. Reload Account Security.'});
        // This refusal is before any enrollment write; keep beginEnrollment's own guards too.
        const primary=await env.DB.prepare("SELECT 1 FROM auth_recent_authentication WHERE method='password' AND user_id=? AND session_digest=? AND auth_version=? AND authenticated_at>? AND authenticated_at<=? AND expires_at>?")
          .bind(account.userId,digest,account.authVersion,now-120,now,now).first();
        if(!primary)throw new MfaPrimaryRequired();
        if(!restart&&await env.DB.prepare("SELECT 1 FROM auth_mfa_transactions WHERE user_id=? AND purpose='enroll' AND phase IN ('pending','verified') AND expires_at>? LIMIT 1").bind(account.userId,now).first())
          return reply(409,{code:'enrollment_pending',error:'An unfinished setup exists. Explicitly restart it after confirming your identity.'});
        const nickname=await env.DB.prepare('SELECT nickname FROM user_nicknames WHERE user_id=?').bind(account.userId).first<string>('nickname');
        if(!nickname)throw Error('Account nickname unavailable');
        return reply(200,await beginEnrollment(env.DB,c,env,managementEnvironment!,validateNickname(nickname).display,restart));
      }
      if(typeof input.token!=='string'||!/^[a-f0-9]{64}$/.test(input.token))return reply(400,{error:'Invalid request'});
      if(action==='verify'&&typeof input.code==='string'&&/^[0-9]{6}$/.test(input.code))return reply(200,await verifyEnrollment(env.DB,c,input.token,input.code,env,managementEnvironment!,secret));
      if(action==='cancel'){const cancelled=await cancelEnrollment(env.DB,c,input.token);return cancelled?reply(200,{message:'Setup cancelled.'}):reply(409,{code:'enrollment_ended',error:'Setup is no longer pending. Check current MFA status.'});}
      if(action==='activate'&&typeof input.acknowledgment==='string'&&/^[a-f0-9]{64}$/.test(input.acknowledgment)){
        const statements=await prepareEnrollmentActivation(env.DB,c,input.token,input.acknowledgment,env,managementEnvironment!);
        const row=await env.DB.prepare(`SELECT * FROM auth_mfa_transactions WHERE token_digest=? AND phase='verified'`).bind(await mfaDigest('transaction',input.token)).first<{
          user_id:string;auth_version:number;factor_id:string;primary_method:string;primary_authenticated_at:number;verified_at:number}>();
        if(!row)throw Error('Setup unavailable');
        const replacement=generateToken();
        const results=await env.DB.batch([...statements,...sessionCompletion(env.DB,{...row,auth_version:row.auth_version+1},await digestToken(replacement,'session'),now,'totp',row.verified_at)]);
        if(results.at(-1)?.results.length!==1)throw Error('Setup unavailable');
        await passwordNotice(request,env,account,'mfa-enabled');
        return primaryResponse(request,{kind:'session',token:replacement},false,'/account/security');
      }
      return reply(400,{error:'Invalid request'});
    }
    const row=await pendingLogin(env.DB,read(request,'pending'),read(request,'browser'),now);
    if(!row)return reply(401,{error:'This sign-in challenge is unavailable or expired. Log in again.'});
    const csrfDigest=await mfaDigest('csrf',row.token_digest);
    if(get)return reply(200,{expiresAt:row.expires_at,csrfToken:await sessionCsrfToken(csrfDigest,secret),
      recoveryAvailable:managementEnvironment!==null});
    if(!await validAuthMutation(request,origin.origin,csrfDigest,secret))return reply(403,{error:'Request rejected'});
    const input=await readInput(request) as Record<string,unknown>;
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['method','code','turnstileToken'].includes(k)))return reply(400,{error:'Invalid request'});
    if(action==='cancel'){
      await env.DB.prepare(`UPDATE auth_mfa_transactions SET phase='cancelled' WHERE token_digest=? AND phase='pending'`).bind(row.token_digest).run();
      const response=reply(200,{next:'/login'});for(const kind of ['pending','browser'])response.headers.append('Set-Cookie',mfaCookie(request,kind,'',0));return response;
    }
    if(action!=='complete'||!['totp','recovery'].includes(input.method as string)||typeof input.code!=='string'||input.code.length>40)return reply(400,{error:'Invalid request'});
    const limiter=await LoginLimiter.create(env.DB,secret,authClientIP(request,env).toLowerCase());
    if(await limiter.observe()||input.turnstileToken!==undefined)await verifyLoginChallenge(env.DB,env,input.turnstileToken,origin.hostname);
    const held=await limiter.reserveMfa(row.user_id,row.token_digest);let finalized=false;
    try{
      const result=await completeMfa(env.DB,row,input.code,input.method as 'totp'|'recovery',env,loopback(url)?'local':'dev',Math.floor(Date.now()/1000),held);
      if(!await held.finish(!result))throw Error('Check expired');finalized=true;
      if(!result)return reply(401,{error:'Code not accepted. Check the code or use a recovery code.'});
      return primaryResponse(request,{kind:'session',token:result.token});
    }finally{if(!finalized)await held.finish(false);}
  }catch(error){
    if(error instanceof RegenerationUnavailable)return reply(410,{code:'regeneration_ended',error:'This regeneration is no longer available. Check your current account settings.'});
    if(error instanceof RegenerationProofRequired)return reply(428,{code:'reauth_required',primaryRequired:error.primary,error:error.primary?'Confirm your sign-in method, then verify your authenticator.':'Confirm your authenticator to continue. Your pending codes are unchanged.'});
    if(error instanceof MfaPrimaryRequired)return reply(428,{code:'reauth_required',error:'Confirm your sign-in method, then select the MFA action again.'});
    if(error instanceof LoginLimited){const response=reply(429,{error:'Too many attempts. Wait before trying again.'});response.headers.set('Retry-After',String(error.retryAfter));return response;}
    if(error instanceof LoginChallenge)return reply(403,{code:'challenge_required',siteKey:error.siteKey,error:'Complete the security check.'});
    if(error instanceof LoginBusy)return reply(503,{error:'Another check is pending. Try again shortly.'});
    return reply(503,{error:'Two-factor authentication is unavailable. No automatic retry was made.'});
  }
}
