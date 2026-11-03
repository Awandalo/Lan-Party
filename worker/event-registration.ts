import type {AuthenticationEnvironment} from './auth/http';
import {authOrigin,authRouteEnabled,hostedDev,loopback,validAuthMutation} from './auth/environment';
import {readSessionCookie} from './auth/cookies';
import {resolveSession} from './auth/sessions';
import {digestToken} from './auth/tokens';
import {sessionCsrfToken} from './auth/csrf';
import {fromHex} from './auth/encoding';
import {administrationPermissions} from './manage';
import {EventError,eventActor} from './event-data';
import {registrationReady,registrationSnapshot,registrationProjection,mutateRegistration,memberActor} from './event-registration-data';
import {UUID} from './role-administration';
import {deliverRegistrationNotifications} from './event-registration-mail';

const reply=(status:number,data:unknown)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie, X-LAN-Session-Proof','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
export async function eventRegistration(request:Request,env:AuthenticationEnvironment,ctx:ExecutionContext){
 const url=new URL(request.url),match=/^\/api\/(event-registration|event-participants)\/([^/]+)$/.exec(url.pathname);
 if(!match||!UUID.test(match[2])||!(loopback(url)||hostedDev(request,env))||!authRouteEnabled(request,env,env.AUTH_SESSION_MODE))return reply(404,{error:'Not found'});
 if(!['GET','POST'].includes(request.method))return reply(405,{error:'Method not allowed'});
 try{
  const origin=authOrigin(request,env);
  if(url.search||request.headers.has('Content-Encoding')||request.headers.get('X-LAN-Request')!=='1'||request.headers.has('Origin')&&request.headers.get('Origin')!==origin.origin||request.headers.has('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin')return reply(403,{error:'Request rejected'});
  const token=readSessionCookie(request),account=token?await resolveSession(env.DB,token,Math.floor(Date.now()/1000)):null;
  if(!account||account.emailVerifiedAt===null)return reply(401,{error:'Please log in'});
  const digest=await digestToken(token!,'session'),proof=fromHex(request.headers.get('X-LAN-Session-Proof')??'',32),expected=fromHex(await sessionCsrfToken(digest,env.AUTH_RATE_LIMIT_SECRET!),32)!;
  if(!proof||!crypto.subtle.timingSafeEqual(proof,expected))return reply(409,{error:'Session changed. Reload before continuing'});
  const manager=match[1]==='event-participants';
  const permissions=manager?await administrationPermissions(env.DB,account.userId,Math.floor(Date.now()/1000)):[];
  if(manager&&!permissions.includes('events.manage_registrations'))return reply(403,{error:'Participant access is restricted'});
  if(!await registrationReady(env.DB))return reply(503,{error:'Registration is awaiting its database migration'});
  if(request.method==='GET'){
   const snapshot=await registrationSnapshot(env.DB,match[2]);
   if(!manager&&(snapshot.meta.publication_status!=='published'||snapshot.meta.is_listed!==1))return reply(404,{error:'Event not found'});
   // A separate final authority read fences revocation during the data snapshot.
   if(!await env.DB.prepare(`SELECT 1 WHERE ${manager?eventActor('events.manage_registrations'):memberActor}`).bind(account.userId,digest).first())return reply(401,{error:'Please log in again'});
   return reply(200,registrationProjection(snapshot,account.userId,manager));
  }
  if(!await validAuthMutation(request,origin.origin,digest,env.AUTH_RATE_LIMIT_SECRET!))return reply(403,{error:'Request rejected'});
  const reader=request.body?.getReader();if(!reader)throw new EventError(400,'Invalid request');
  let size=0,body='';const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false});
  for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>32768){await reader.cancel();throw new EventError(413,'Request too large');}body+=decoder.decode(part.value,{stream:true});}
  let raw:unknown;try{raw=JSON.parse(body+decoder.decode());}catch{throw new EventError(400,'Invalid request');}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new EventError(400,'Invalid request');
  if(manager&&(raw as Record<string,unknown>).action==='cancel-event')throw new EventError(400,'Use Overview and confirm the event name to cancel');
  const result=await mutateRegistration(env.DB,match[2],account.userId,digest,raw as Record<string,unknown>,manager);
  ctx.waitUntil(deliverRegistrationNotifications(request,env,String((raw as Record<string,unknown>).operationId)));
  return reply(200,result);
 }catch(e){if(e instanceof EventError)return reply(e.status,{error:e.message});return reply(503,{error:'Registration could not be confirmed. Reload before trying again'});}
}
