import {deleteAccount,prepareAccountDeletion,deletionSchemaReady} from './account-deletion';
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
import {lifecycleReady,administratorSql,requireLifecycleProof,deactivateAccount,LifecycleProofRequired,LastAdministrator,LifecycleStateConflict,LIVE_DELETION_ENABLED,assertChanged} from './account-lifecycle';
import {initiateReactivation,cancelInvitation,acceptInvitationDelivery,inspectReactivation,claimReactivation,reactivationContext,verifyReactivationPassword,finishReactivation} from './account-reactivation';
import {commandUuid,memberLifecycle,changeAccountState,requireAdmin,commandReplay,LifecycleConflict,LifecycleForbidden} from './lifecycle-admin';
import type {LifecycleCommand} from './lifecycle-admin';
import {userActivityReady} from './user-activity';

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
 const routes=['status','member','command','deactivate','delete/prepare','delete','users','invite','reactivation/inspect','reactivation/claim','reactivation/status','reactivation/complete','reactivation/cancel'];
 if(!routes.includes(path)||!authRouteEnabled(request,env,env.AUTH_SESSION_MODE))return reply(404,{error:'Not found'});
 const environment=mfaManagementEnvironment(request,env);
 if(!environment)return reply(404,{error:'Not found'});
 if(environment==='prod'&&env.AUTH_LIFECYCLE_ADMIN_MODE!=='enabled'&&['member','command','invite','users'].includes(path))return reply(404,{error:'Not found'});
 const get=path==='status'||path==='reactivation/status';
 if(request.method!==(get?'GET':'POST'))return reply(405,{error:'Method not allowed'});
 try{
 const origin=authOrigin(request,env),secret=env.AUTH_RATE_LIMIT_SECRET;
 if(!secret||url.search||request.headers.has('Content-Encoding')||request.headers.get('X-LAN-Request')!=='1'
 ||request.headers.has('Origin')&&request.headers.get('Origin')!==origin.origin
 ||request.headers.has('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin')return reply(403,{error:'Request rejected'});
 if(!await lifecycleReady(env.DB))return get?reply(200,{available:false}):reply(503,{error:'Account lifecycle is not available yet.'});
 if(env.AUTH_LIFECYCLE_ADMIN_MODE==='enabled'&&!await userActivityReady(env.DB))return reply(503,{error:'Lifecycle log migration unavailable.'});
 const time=Math.floor(Date.now()/1000);
 if(path.startsWith('reactivation/')){
 if(path==='reactivation/inspect'){
 if(request.headers.get('Origin')!==origin.origin||request.headers.get('Content-Type')!=='application/json')return reply(403,{error:'Request rejected'});
 const body=await readInput(request) as Record<string,unknown>;
 if(!body||Array.isArray(body)||Object.keys(body).length!==1||typeof body.token!=='string')return reply(400,{error:'Invalid request'});
 const checked=await inspectReactivation(env.DB,body.token,readContext(request));
 if(!checked)return reply(200,{available:false});
 return reply(200,{available:true,claimed:checked.claimed,origin:checked.origin,...(checked.claimed&&'contextDigest' in checked?{mfa:checked.mfa,csrfToken:await sessionCsrfToken(checked.contextDigest!,secret)}:{})});
 }
 if(path==='reactivation/claim'){
 if(request.headers.get('Origin')!==origin.origin||request.headers.get('Content-Type')!=='application/json')return reply(403,{error:'Request rejected'});
 const body=await readInput(request) as Record<string,unknown>;
 if(!body||Object.keys(body).some(k=>k!=='token')||typeof body.token!=='string')return reply(400,{error:'Invalid request'});
 const result=await claimReactivation(env.DB,body.token);
 if(!result)return reply(409,{error:'Invitation unavailable. Ask the administrator for a new invitation.'});
 return reply(200,{csrfToken:await sessionCsrfToken(result.digest,secret)},{'Set-Cookie':contextCookie(request,result.context)});
 }
 const context=readContext(request),row=context?await reactivationContext(env.DB,context):null;
 if(!row)return reply(401,{code:'reactivation_unavailable',error:'Reactivation unavailable. Ask the administrator for a new invitation.'});
 if(get)return reply(200,{available:true,mfa:!!row.factor_id,origin:row.origin,csrfToken:await sessionCsrfToken(row.context_digest,secret)});
 if(!await validAuthMutation(request,origin.origin,row.context_digest,secret))return reply(403,{error:'Request rejected'});
 const body=await readInput(request) as Record<string,unknown>;
 if(path==='reactivation/cancel'){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length)return reply(400,{error:'Invalid request'});
 const audited=await userActivityReady(env.DB);
 await env.DB.batch([
 env.DB.prepare("UPDATE account_reactivation SET phase='cancelled' WHERE context_digest=? AND phase='claimed'").bind(row.context_digest),assertChanged(env.DB),
 ...(audited?[
 env.DB.prepare("UPDATE lifecycle_commands SET outcome='cancelled' WHERE operation_id IN (SELECT operation_id FROM account_reactivation WHERE context_digest=?) AND outcome<>'completed'").bind(row.context_digest),
 env.DB.prepare("INSERT INTO user_activity(event,actor_kind,actor_id,target_id,operation_id) SELECT 'invitation.cancelled','account',user_id,user_id,operation_id FROM account_reactivation WHERE context_digest=? AND phase='cancelled'").bind(row.context_digest),
 ]:[]),
 ]);
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
 const response=reply(200,{next:'/account',message:'Account reactivated. Your password and two-factor protection have been verified.'},{'Set-Cookie':sessionCookie(ok.token)});
 response.headers.append('Set-Cookie',contextCookie(request,''));return response;
 }finally{body.code='';if(!done)await held.finish(false);}
 }
 const token=readSessionCookie(request),account=token?await resolveSession(env.DB,token,time):null;
 if(!token||!account||account.emailVerifiedAt===null)return reply(401,{error:'Sign in again.'});
 const digest=await digestToken(token,'session');
 const admin=!!await env.DB.prepare(`SELECT 1 FROM users u WHERE u.id=? AND ${administratorSql}`).bind(account.userId).first();
 const deletionAvailable=LIVE_DELETION_ENABLED&&await deletionSchemaReady(env.DB);
 const adminEnabled=loopback(url)||env.AUTH_LIFECYCLE_ADMIN_MODE==='enabled';
 if(get)return reply(200,{available:true,administrator:admin,deletionAvailable,memberCommands:adminEnabled&&admin&&await userActivityReady(env.DB)});
 if(!await validAuthMutation(request,origin.origin,digest,secret))return reply(403,{error:'Request rejected'});
 const body=await readInput(request) as Record<string,unknown>;
 if(!body||typeof body!=='object'||Array.isArray(body))return reply(400,{error:'Invalid request'});
 const personal=['deactivate','delete/prepare','delete'].includes(path);
 if(['member','command'].includes(path)) {
 if(!adminEnabled)return reply(404,{error:'Not found'});
 if(!admin)return reply(403,{error:'Request rejected'});
 if(!await userActivityReady(env.DB))return reply(503,{error:'Member lifecycle requires migration 0021.'});
 await requireAdmin(env.DB,account.userId,account.authVersion,digest);
 if(path==='member') {
 if(Object.keys(body).length!==1||typeof body.userId!=='string'||!commandUuid.test(body.userId))return reply(400,{error:'Invalid member request'});
 const member=await memberLifecycle(env.DB,body.userId);return member?reply(200,{member}):reply(404,{error:'Member not found'});
 }
 if(Object.keys(body).sort().join(',')!=='action,invitationId,issuedAt,operationId,userId,version'||typeof body.userId!=='string'||!commandUuid.test(body.userId)||typeof body.operationId!=='string'||!commandUuid.test(body.operationId)
 ||!Number.isSafeInteger(body.version)||(body.version as number)<0||!Number.isSafeInteger(body.issuedAt)||(body.issuedAt as number)>time||(body.issuedAt as number)<=time-86400
 ||!['invite','disable','cancel'].includes(String(body.action))||!(body.invitationId===null||typeof body.invitationId==='string'&&commandUuid.test(body.invitationId)))return reply(400,{error:'Invalid or expired member command'});
 const c=body as unknown as LifecycleCommand;
 const replay=await commandReplay(env.DB,account.userId,c);if(replay)return reply(200,replay);
 if(c.action!=='invite')return reply(200,await changeAccountState(env.DB,account.userId,account.authVersion,digest,c));
 const recipient=await env.DB.prepare('SELECT email FROM users WHERE id=?').bind(c.userId).first<string>('email');
 if(!recipient||!recipientAllowed(request,env,recipient))return reply(409,{error:'Invitation could not be prepared.'});
 const limit=await registrationLimiter(env.DB,secret,time,'lifecycle-invite');
 await limit('account',account.userId);await limit('account',c.userId);await limit('ip',authClientIP(request,env));
 let invitation;
 try{invitation=await initiateReactivation(env.DB,account.userId,account.authVersion,digest,c.userId,c);}
 catch{const replay=await commandReplay(env.DB,account.userId,c);if(replay)return reply(200,replay);throw new LifecycleConflict();}
 if('replayed' in invitation)return reply(200,invitation);
 try{
 await emailTransport(request,env).send({to:invitation.email,url:origin.origin+'/reactivate#'+invitation.token,expiresAt:invitation.expiresAt,idempotencyKey:'reactivate-'+invitation.digest,purpose:'account-reactivation'});
 await acceptInvitationDelivery(env.DB,c.operationId);
 }catch{await cancelInvitation(env.DB,invitation.digest);}
 const result=await commandReplay(env.DB,account.userId,c);
 return reply(200,{...result,member:await memberLifecycle(env.DB,c.userId)});
 }
 if(personal&&path.startsWith('delete')&&!deletionAvailable)return reply(503,{error:'Account deletion is unavailable.'});
 if(!personal&&!admin)return reply(403,{error:'Request rejected'});
 if(personal){await requireRecentMfa(env.DB,account,digest);await requireLifecycleProof(env.DB,account.userId,account.authVersion,digest);}
 else await requireAdmin(env.DB,account.userId,account.authVersion,digest);
 if(path==='delete/prepare'){
 if(Object.keys(body).length!==1||body.confirm!=='PREPARE_DELETE')return reply(400,{error:'Explicit deletion preparation required.'});
 await prepareAccountDeletion(env.DB,account.userId,account.authVersion,digest);
 return reply(200,{ready:true,message:'Confirm the final irreversible deletion warning.'});
 }
 if(path==='delete'){
 if(Object.keys(body).length!==2||body.confirm!=='DELETE'||body.acknowledged!==true)return reply(400,{error:'Explicit final deletion confirmation required.'});
 await deleteAccount(env.DB,account.userId,account.authVersion,digest);
 return reply(200,{next:'/login',message:'Account deleted.'},{'Set-Cookie':clearSessionCookie()});
 }
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
 if(await userActivityReady(env.DB))return reply(409,{error:'Use the reviewed member command in Members administration.'});
 const recipient=await env.DB.prepare("SELECT email FROM users WHERE id=? AND status='disabled'").bind(body.userId).first<string>('email');
 if(!recipient||!recipientAllowed(request,env,recipient))return reply(409,{error:'Invitation could not be prepared.'});
 const limit=await registrationLimiter(env.DB,secret,time,'lifecycle-invite');
 await limit('account',account.userId);await limit('account',body.userId);await limit('ip',authClientIP(request,env));
 const invitation=await initiateReactivation(env.DB,account.userId,account.authVersion,digest,body.userId);
 if('replayed' in invitation)return reply(200,invitation);
 try{
 await emailTransport(request,env).send({to:invitation.email,url:origin.origin+'/reactivate#'+invitation.token,
 expiresAt:invitation.expiresAt,idempotencyKey:'reactivate-'+invitation.digest,purpose:'account-reactivation'});
 }catch{
 await cancelInvitation(env.DB,invitation.digest);
 return reply(503,{error:'Invitation delivery was not confirmed. No automatic retry was made; explicitly issue a new invitation later.'});
 }
 return reply(200,{message:'Reactivation invitation requested. It expires after 30 minutes.'});
 }catch(error){
 if(error instanceof LifecycleConflict)return reply(409,{error:'Member state changed or command was already processed. Reload and review.'});
 if(error instanceof LifecycleForbidden)return reply(403,{error:'Administrator access required.'});
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
