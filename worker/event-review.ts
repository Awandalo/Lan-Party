import {finalizedEvent} from './event-finalization-data';
import type {AuthenticationEnvironment} from './auth/http';
import {authOrigin,authRouteEnabled,hostedDev,loopback,validAuthMutation} from './auth/environment';
import {readSessionCookie} from './auth/cookies';
import {resolveSession} from './auth/sessions';
import {digestToken} from './auth/tokens';
import {sessionCsrfToken} from './auth/csrf';
import {fromHex} from './auth/encoding';
import {administrationPermissions} from './manage';
import {EventError,eventActor} from './event-data';
import {UUID} from './role-administration';
import {reviewReady,reviewSnapshot,writeReview} from './event-review-data';

const reply=(status:number,data:unknown)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie, X-LAN-Session-Proof','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
export async function eventReview(request:Request,env:AuthenticationEnvironment){
 const url=new URL(request.url),match=/^\/api\/event-review\/([^/]+)$/.exec(url.pathname);
 if(!match||!UUID.test(match[1])||!(loopback(url)||hostedDev(request,env))||!authRouteEnabled(request,env,env.AUTH_SESSION_MODE))return reply(404,{error:'Not found'});
 if(!['GET','POST'].includes(request.method))return reply(405,{error:'Method not allowed'});
 try{
  const origin=authOrigin(request,env);
  if(url.search||request.headers.has('Content-Encoding')||request.headers.get('X-LAN-Request')!=='1'||request.headers.has('Origin')&&request.headers.get('Origin')!==origin.origin||request.headers.has('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin')return reply(403,{error:'Request rejected'});
  const token=readSessionCookie(request),account=token?await resolveSession(env.DB,token,Math.floor(Date.now()/1000)):null;
  if(!account||account.emailVerifiedAt===null)return reply(401,{error:'Please log in'});
  const digest=await digestToken(token!,'session'),proof=fromHex(request.headers.get('X-LAN-Session-Proof')??'',32),expected=fromHex(await sessionCsrfToken(digest,env.AUTH_RATE_LIMIT_SECRET!),32)!;
  if(!proof||!crypto.subtle.timingSafeEqual(proof,expected))return reply(409,{error:'Session changed. Reload before continuing'});
  const permissions=await administrationPermissions(env.DB,account.userId,Math.floor(Date.now()/1000));
  const canFinance=permissions.includes('finance.manage');
  if(!permissions.includes('events.manage_registrations'))return reply(403,{error:'Participant access is restricted'});
  if(!await reviewReady(env.DB))return reply(503,{error:'Attendance review is awaiting its database migration'});
  if(request.method==='GET'){
   const review=await reviewSnapshot(env.DB,match[1],account.userId);
   if(review.snapshot.meta.publication_status!=='published')return reply(404,{error:'Event not found'});
   const guard=eventActor('events.manage_registrations')+(canFinance?' AND '+eventActor('finance.manage'):'');
   if(!await env.DB.prepare('SELECT 1 FROM event_management WHERE event_id=? AND revision=? AND '+guard).bind(match[1],review.snapshot.state.revision,account.userId,digest,...(canFinance?[account.userId,digest]:[])).first())return reply(409,{error:'Event or permissions changed. Reload before continuing'});
   return reply(200,{finalized:!!await finalizedEvent(env.DB,match[1]),revision:review.snapshot.state.revision,ended:review.snapshot.state.ended,open:review.snapshot.state.open,canFinance,rentalCents:Number(review.snapshot.meta.rental_cents),days:review.snapshot.state.days,people:review.people.map(p=>canFinance?p:{...p,complimentary:undefined}),anonymousDays:review.anonymousDays,anonymousPeople:review.anonymousPeople,deletedAccounts:review.deletedAccounts,...canFinance?{settings:review.settings}:{},activity:review.activity.filter(r=>canFinance||r.action==='attendance')});
  }
  if(!await validAuthMutation(request,origin.origin,digest,env.AUTH_RATE_LIMIT_SECRET!))return reply(403,{error:'Request rejected'});
  const reader=request.body?.getReader();if(!reader)throw new EventError(400,'Invalid request');
  let size=0,body='';const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false});
  for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>32768){await reader.cancel();throw new EventError(413,'Request too large');}body+=decoder.decode(part.value,{stream:true});}
  let raw:unknown;try{raw=JSON.parse(body+decoder.decode());}catch{throw new EventError(400,'Invalid request');}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new EventError(400,'Invalid request');
  const command=raw as Record<string,unknown>;
  if(['complimentary','instructions'].includes(String(command.action))&&!canFinance)return reply(403,{error:'Planner and Finance permissions are required'});
  const result=await writeReview(env.DB,match[1],account.userId,digest,command);
  return reply(200,result);
 }catch(e){if(e instanceof EventError)return reply(e.status,{error:e.message});return reply(503,{error:'Review could not be confirmed. Reload before trying again'});}
}
