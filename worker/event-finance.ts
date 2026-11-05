import type {AuthenticationEnvironment} from './auth/http';
import {authOrigin,authRouteEnabled,hostedDev,loopback,validAuthMutation} from './auth/environment';
import {readSessionCookie} from './auth/cookies';
import {resolveSession} from './auth/sessions';
import {digestToken} from './auth/tokens';
import {sessionCsrfToken} from './auth/csrf';
import {fromHex} from './auth/encoding';
import {EventError,eventActor} from './event-data';
import {memberActor} from './event-registration-data';
import {administrationPermissions} from './manage';
import {UUID} from './role-administration';
import {closurePreview,finalizationReady,finalizedEvent,finalizeEvent} from './event-finalization-data';

const reply=(status:number,data:unknown)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie, X-LAN-Session-Proof','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
export async function eventFinance(request:Request,env:AuthenticationEnvironment){
 const url=new URL(request.url),match=/^\/api\/event-finance\/([^/]+)(\/manage)?$/.exec(url.pathname);
 if(!match||!UUID.test(match[1])||!(loopback(url)||hostedDev(request,env))||!authRouteEnabled(request,env,env.AUTH_SESSION_MODE))return reply(404,{error:'Not found'});
 const manager=!!match[2];
 if(request.method!=='GET'&&!(manager&&request.method==='POST'))return reply(405,{error:'Method not allowed'});
 try{
  const origin=authOrigin(request,env);
  if(url.search||request.headers.has('Content-Encoding')||request.headers.get('X-LAN-Request')!=='1'||request.headers.has('Origin')&&request.headers.get('Origin')!==origin.origin||request.headers.has('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin')return reply(403,{error:'Request rejected'});
  const token=readSessionCookie(request),account=token?await resolveSession(env.DB,token,Math.floor(Date.now()/1000)):null;
  if(!account||account.emailVerifiedAt===null)return reply(401,{error:'Please log in'});
  const digest=await digestToken(token!,'session'),proof=fromHex(request.headers.get('X-LAN-Session-Proof')??'',32),expected=fromHex(await sessionCsrfToken(digest,env.AUTH_RATE_LIMIT_SECRET!),32)!;
  if(!proof||!crypto.subtle.timingSafeEqual(proof,expected))return reply(409,{error:'Session changed. Reload before continuing'});
  if(manager&&!(await administrationPermissions(env.DB,account.userId,Math.floor(Date.now()/1000))).includes('events.manage_registrations'))return reply(403,{error:'Planner permission is required'});
  if(!await finalizationReady(env.DB))return reply(503,{error:'Event finalization is awaiting its database migration'});
  if(request.method==='POST'){
   if(!await validAuthMutation(request,origin.origin,digest,env.AUTH_RATE_LIMIT_SECRET!))return reply(403,{error:'Request rejected'});
   const reader=request.body?.getReader();if(!reader)throw new EventError(400,'Invalid request');
   const chunks:Uint8Array[]=[];let size=0;for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4096){await reader.cancel();throw new EventError(413,'Request too large');}chunks.push(part.value);}
   let raw:unknown;try{const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}raw=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes));}catch{throw new EventError(400,'Invalid request');}
   if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new EventError(400,'Invalid request');
   return reply(200,await finalizeEvent(env.DB,match[1],account.userId,digest,raw as Record<string,unknown>));
  }
  const final=await finalizedEvent(env.DB,match[1]);let data:unknown,revision:number|undefined;
  if(manager){
   if(final){const bills=(await env.DB.prepare('SELECT id,owner_id AS owner,lines,total_cents AS totalCents,paid FROM event_bills WHERE event_id=? ORDER BY id').bind(match[1]).all()).results;data={finalized:true,closedAt:final.closed_at,rentalCents:final.rental_cents,participantDays:final.participant_days,dailyRateCents:final.daily_rate_cents,bills:bills.map(b=>({...b,lines:JSON.parse(String(b.lines))}))};}
   else {const {review,summary}=await closurePreview(env.DB,match[1],account.userId);revision=review.snapshot.state.revision;data={finalized:false,revision,title:review.snapshot.meta.title,ended:review.snapshot.state.ended,open:review.snapshot.state.open,...summary};}
  }else if(final){const bill=await env.DB.prepare('SELECT lines,total_cents AS totalCents,paid FROM event_bills WHERE event_id=? AND owner_id=?').bind(match[1],account.userId).first<Record<string,unknown>>();data=bill?{finalized:true,closedAt:final.closed_at,dailyRateCents:final.daily_rate_cents,bill:{...bill,lines:JSON.parse(String(bill.lines)),paymentUrl:final.payment_url,instructions:final.instructions}}:{finalized:true,bill:null};}
  else data={finalized:false};
  const guard=manager?eventActor('events.manage_registrations'):memberActor;
  const valid=revision===undefined?await env.DB.prepare(`SELECT 1 WHERE ${guard}`).bind(account.userId,digest).first():await env.DB.prepare(`SELECT 1 FROM event_management WHERE event_id=? AND revision=? AND ${guard}`).bind(match[1],revision,account.userId,digest).first();
  if(!valid)return reply(409,{error:'Event or session changed. Reload before continuing'});
  return reply(200,data);
 }catch(e){if(e instanceof EventError)return reply(e.status,{error:e.message});return reply(503,{error:'Finalization could not be confirmed. Reload and check the event before trying again'});}
}
