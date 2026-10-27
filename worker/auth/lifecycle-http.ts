import type {AuthenticationEnvironment} from './http';
import type {MfaKeys} from './mfa-crypto';
import {authRouteEnabled,authOrigin,authClientIP,validAuthMutation,emailTransport,recipientAllowed,loopback} from './environment';
import {mfaManagementEnvironment} from './mfa-environment';
import {readSessionCookie,clearSessionCookie,sessionCookie} from './cookies';
import {resolveSession} from './sessions';
import {digestToken,isValidToken} from './tokens';
import {sessionCsrfToken} from './csrf';
import {readInput} from './registration';
import {LoginLimiter,LoginLimited,LoginBusy} from './login-limits';
import {LoginChallenge,verifyLoginChallenge} from './turnstile';
import {registrationLimiter,RegistrationRateLimit} from './registration-limits';
import {requireRecentMfa,RecentMfaRequired} from './mfa-assurance';
import {lifecycleReady,administratorSql,requireLifecycleProof,deactivateAccount,LifecycleProofRequired,LastAdministrator,LifecycleStateConflict} from './account-lifecycle';
import {initiateReactivation,cancelInvitation,claimReactivation,reactivationContext,verifyReactivationPassword,finishReactivation} from './account-reactivation';

const reply=(status:number,data:object,headers:Record<string,string>={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer',...headers}});
const cookieName=(request:Request)=>loopback(new URL(request.url))?'lan_reactivation_local':'__Host-lan_reactivation';
function readContext(request:Request){
 const values=(request.headers.get('Cookie')??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(cookieName(request)+'='));
 const token=values.length===1?values[0].slice(cookieName(request).length+1):'';
 return isValidToken(token)?token:'';
}
function contextCookie(request:Request,token:string){
 return cookieName(request)+'='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+(token?'300':'0')+(loopback(new URL(request.url))?'':'; Secure');
}
export async function lifecycleHttp(request:Request,env:AuthenticationEnvironment&MfaKeys){
 const url=new URL(request.url),path=url.pathname.replace('/api/auth/lifecycle/','');
 const routes=['status','deactivate','users','invite','reactivation/claim','reactivation/status','reactivation/complete','reactivation/cancel'];
 if(!routes.includes(path)||!authRouteEnabled(request,env,env.AUTH_SESSION_MODE))return reply(404,{error:'Not found'});
 const environment=mfaManagementEnvironment(request,env);
 if(!environment)return reply(404,{error:'Not found'});
 const get=path==='status'||path==='reactivation/status';
 if(request.method!==(get?'GET':'POST'))return reply(405,{error:'Method not allowed'});
 try{
 const origin=authOrigin(request,env),secret=env.AUTH_RATE_LIMIT_SECRET;
 if(!secret||url.search||request.headers.has('Content-Encoding')||request.headers.get('X-LAN-Request')!=='1'
 ||request.headers.has('Origin')&&request.headers.get('Origin')!==origin.origin
 ||request.headers.has('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin')return reply(403,{error:'Request rejected'});
 if(!await lifecycleReady(env.DB))return get?reply(200,{available:false}):reply(503,{error:'Account lifecycle is not available yet.'});
 const time=Math.floor(Date.now()/1000);
 if(path.startsWith('reactivation/')){
 if(path==='reactivation/claim'){
 if(request.headers.get('Origin')!==origin.origin||request.headers.get('Content-Type')!=='application/json')return reply(403,{error:'Request rejected'});
 const body=await readInput(request) as Record<string,unknown>;
 if(!body||Object.keys(body).some(k=>k!=='token')||typeof body.token!=='string')return reply(400,{error:'Invalid request'});
 const result=await claimReactivation(env.DB,body.token);
 if(!result)return reply(409,{error:'Invitation unavailable. Ask the administrator for a new invitation.'});
 return reply(200,{csrfToken:await sessionCsrfToken(result.digest,secret)},{'Set-Cookie':contextCookie(request,result.context)});
 }
 const context=readContext(request),row=context?await reactivationContext(env.DB,context):null;
 if(!row)return reply(401,{error:'Reactivation unavailable. Ask the administrator for a new invitation.'});
 if(get)return reply(200,{available:true,mfa:!!row.factor_id,csrfToken:await sessionCsrfToken(row.context_digest,secret)});
 if(!await validAuthMutation(request,origin.origin,row.context_digest,secret))return reply(403,{error:'Request rejected'});
 const body=await readInput(request) as Record<string,unknown>;
 if(path==='reactivation/cancel'){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length)return reply(400,{error:'Invalid request'});
 await env.DB.prepare("UPDATE account_reactivation SET phase='cancelled' WHERE context_digest=? AND phase='claimed'").bind(row.context_digest).run();
 return reply(200,{message:'Reactivation cancelled. Your account remains deactivated.'},{'Set-Cookie':contextCookie(request,'')});
 }
 if(!body||Object.keys(body).some(k=>!['password','firstName','lastName','code','method','turnstileToken'].includes(k))
 ||typeof body.password!=='string'||typeof body.code!=='string'||body.code.length>64
 ||!['totp','recovery'].includes(String(body.method)))return reply(400,{error:'Invalid request'});
 const limiter=await LoginLimiter.create(env.DB,secret,authClientIP(request,env).toLowerCase());
 if(await limiter.observe()||body.turnstileToken!==undefined)await verifyLoginChallenge(env.DB,env,body.turnstileToken,origin.hostname);
 const passwordLease=await limiter.reserve(row.email_normalized);
 let passwordOk=false;
 try{passwordOk=await verifyReactivationPassword(row,body.password,env.PASSWORD_PEPPER);if(!await passwordLease.finish(!passwordOk))throw Error('Expired proof');}
 finally{body.password='';await passwordLease.finish(false);}
 if(!passwordOk)return reply(401,{error:'Authentication could not be confirmed.'});
 const held=await limiter.reserveMfa(row.user_id,row.context_digest);let done=false;
 try{
 const ok=await finishReactivation(env.DB,row,{firstName:body.firstName,lastName:body.lastName,code:body.code,method:body.method as 'totp'|'recovery'},env,environment,held,time);
 if(!ok){await held.finish(true);done=true;return reply(401,{error:'Authentication could not be confirmed.'});}
 await held.finish(false);done=true;
 // A NEW fully verified session is issued in the completion batch, never by promoting the context.
 const response=reply(200,{next:'/account/security',message:'Account reactivated. Your password and two-factor protection have been verified.'},{'Set-Cookie':sessionCookie(ok.token)});
 response.headers.append('Set-Cookie',contextCookie(request,''));return response;
 }finally{body.code='';if(!done)await held.finish(false);}
 }
 const token=readSessionCookie(request),account=token?await resolveSession(env.DB,token,time):null;
 if(!token||!account||account.emailVerifiedAt===null)return reply(401,{error:'Sign in again.'});
 const digest=await digestToken(token,'session');
 const admin=!!await env.DB.prepare(`SELECT 1 FROM users u WHERE u.id=? AND ${administratorSql}`).bind(account.userId).first();
 if(get)return reply(200,{available:true,administrator:admin,deletionAvailable:false});
 if(!await validAuthMutation(request,origin.origin,digest,secret))return reply(403,{error:'Request rejected'});
 const body=await readInput(request) as Record<string,unknown>;
 if(!body||typeof body!=='object'||Array.isArray(body))return reply(400,{error:'Invalid request'});
 if(path!=='deactivate'&&!admin)return reply(403,{error:'Request rejected'});
 await requireRecentMfa(env.DB,account,digest);
 await requireLifecycleProof(env.DB,account.userId,account.authVersion,digest,path!=='deactivate');
 if(path==='deactivate'){
 if(Object.keys(body).length!==1||body.confirm!=='DEACTIVATE')return reply(400,{error:'Explicit confirmation required.'});
 await deactivateAccount(env.DB,account.userId,account.authVersion,digest);
 return reply(200,{next:'/login',message:'Account deactivated. Contact an administrator to reactivate it.'},{'Set-Cookie':clearSessionCookie()});
 }
 if(path==='users'){
 if(Object.keys(body).length!==1||typeof body.query!=='string'||body.query.length<3||body.query.length>254)return reply(400,{error:'Enter an exact email or nickname.'});
 const result=await env.DB.prepare(`SELECT u.id AS userId,n.nickname,u.email,CAST(m.member_number AS TEXT) AS memberNumber
 FROM users u JOIN account_lifecycle l ON l.user_id=u.id JOIN user_nicknames n ON n.user_id=u.id
 JOIN member_numbers m ON m.user_id=u.id WHERE u.status='disabled' AND l.state='deactivated'
 AND (u.email_normalized=? OR n.nickname_key=?) LIMIT 20`).bind(body.query.toLowerCase(),body.query.toLowerCase()).all();
 return reply(200,{users:result.results});
 }
 if(Object.keys(body).length!==1||typeof body.userId!=='string'||!/^[0-9a-f-]{36}$/.test(body.userId))return reply(400,{error:'Invalid request'});
 const recipient=await env.DB.prepare("SELECT email FROM users WHERE id=? AND status='disabled'").bind(body.userId).first<string>('email');
 if(!recipient||!recipientAllowed(request,env,recipient))return reply(409,{error:'Invitation could not be prepared.'});
 const limit=await registrationLimiter(env.DB,secret,time,'lifecycle-invite');
 await limit('account',account.userId);await limit('account',body.userId);await limit('ip',authClientIP(request,env));
 const invitation=await initiateReactivation(env.DB,account.userId,account.authVersion,digest,body.userId);
 try{
 await emailTransport(request,env).send({to:invitation.email,url:origin.origin+'/reactivate#'+invitation.token,
 expiresAt:invitation.expiresAt,idempotencyKey:'reactivate-'+invitation.digest,purpose:'account-reactivation'});
 }catch{
 await cancelInvitation(env.DB,invitation.digest);
 return reply(503,{error:'Invitation delivery was not confirmed. No automatic retry was made; explicitly issue a new invitation later.'});
 }
 return reply(200,{message:'Reactivation invitation requested. It expires after 30 minutes.'});
 }catch(error){
 if(error instanceof LifecycleStateConflict)return reply(409,{code:'lifecycle_state_conflict',error:'Your account lifecycle state needs administrator assistance. Deactivation was not started. Do not repeat this action.'});
 if(error instanceof LastAdministrator)return reply(409,{error:'Another active administrator must be available before you deactivate or delete your account.'});
 if(error instanceof RecentMfaRequired)return reply(428,{code:'mfa_required',error:'Confirm two-factor authentication before continuing.'});
 if(error instanceof LifecycleProofRequired)return reply(428,{code:'primary_required',error:'Confirm your password again before continuing.'});
 if(error instanceof LoginChallenge)return reply(403,{code:error.invalid?'challenge_failed':'challenge_required',siteKey:error.siteKey,error:'Complete the security check.'});
 if(error instanceof LoginLimited)return reply(429,{error:'Try again later.'},{'Retry-After':String(error.retryAfter)});
 if(error instanceof LoginBusy)return reply(503,{error:'Another check is pending.'},{'Retry-After':'1'});
 if(error instanceof RegistrationRateLimit)return reply(429,{error:'Try again later.'});
 return reply(503,{error:'The lifecycle result could not be confirmed. No automatic retry was made. Check your account status before trying again.'});
 }
}
