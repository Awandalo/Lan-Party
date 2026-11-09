import {eventEnvironmentEnabled} from './event-environment';
import type {AuthenticationEnvironment} from './auth/http';
import {authRouteEnabled,} from './auth/environment';
import {readSessionCookie} from './auth/cookies';
import {resolveSession} from './auth/sessions';
import {digestToken} from './auth/tokens';
import {sessionCsrfToken} from './auth/csrf';
import {fromHex} from './auth/encoding';
import {eventsReady} from './event-data';
import {UUID} from './role-administration';
import {registrationReady,registrationCapacityReady} from './event-registration-data';

const reply=(status:number,data:unknown)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie, X-LAN-Session-Proof','X-Content-Type-Options':'nosniff'}});
export async function publicEvents(request:Request,env:AuthenticationEnvironment){
 const url=new URL(request.url),id=url.pathname.slice('/api/events/'.length),detail=url.pathname!=='/api/events';
 if(!eventEnvironmentEnabled(request,env)||!authRouteEnabled(request,env,env.AUTH_SESSION_MODE)||detail&&!UUID.test(id))return reply(404,{error:'Not found'});
 if(request.method!=='GET')return reply(405,{error:'Method not allowed'});
 if([...url.searchParams.keys()].some(k=>detail||!['period','limit'].includes(k)||url.searchParams.getAll(k).length!==1))return reply(400,{error:'Invalid query'});
 const period=url.searchParams.get('period')??'upcoming',limit=url.searchParams.get('limit');
 if(!['upcoming','past'].includes(period)||limit!==null&&limit!=='1')return reply(400,{error:'Invalid query'});
 try{
  if(!await eventsReady(env.DB))return reply(503,{error:'Events is awaiting activation'});
  let member=false;
  // A cookie alone never upgrades an anonymous projection. Correlate private
  // venue access with the same session snapshot displayed by the frontend.
  const proof=request.headers.get('X-LAN-Session-Proof');
  if(detail&&proof!==null){
   const token=readSessionCookie(request),account=token?await resolveSession(env.DB,token,Math.floor(Date.now()/1000)):null;
   if(!account||account.emailVerifiedAt===null)return reply(401,{error:'Please log in again'});
   const bytes=fromHex(proof,32),expected=fromHex(await sessionCsrfToken(await digestToken(token!,'session'),env.AUTH_RATE_LIMIT_SECRET!),32)!;
   if(!bytes||!crypto.subtle.timingSafeEqual(bytes,expected))return reply(409,{error:'Session context changed'});
   member=true;
  }
  const where=detail?'e.id=?':period==='past'?'m.ends_at<unixepoch()':'m.ends_at>=unixepoch()';
  const capacity=await registrationCapacityReady(env.DB)?'coalesce((SELECT c.capacity FROM event_registration_control c WHERE c.event_id=e.id),m.capacity)':'m.capacity';
  const count=await registrationReady(env.DB)?`(SELECT count(*) FROM event_registration_places p JOIN registrations r ON r.id=p.registration_id WHERE p.event_day_id=d.id AND p.event_id=e.id AND p.state='confirmed' AND r.status='registered')+(SELECT count(*) FROM registration_days rd JOIN registrations r ON r.id=rd.registration_id WHERE rd.event_day_id=d.id AND r.status='registered' AND NOT EXISTS(SELECT 1 FROM event_registration_parties p WHERE p.registration_id=r.id))`:`(SELECT count(*) FROM registration_days rd JOIN registrations r ON r.id=rd.registration_id AND r.event_id=rd.event_id WHERE rd.event_day_id=d.id AND rd.event_id=e.id AND r.status='registered')`;
  const statement=env.DB.prepare(`SELECT e.id,e.title,${detail?'e.description,':''}m.starts_at AS startsAt,m.ends_at AS endsAt,e.registration_status AS registrationStatus,CASE WHEN e.location_visibility='public' OR ?=1 THEN m.venue ELSE NULL END AS venue,(SELECT json_group_array(json_object('date',daily.date,'remaining',daily.remaining)) FROM (SELECT d.attendance_date AS date,max(0,${capacity}-(${count})) AS remaining FROM event_days d WHERE d.event_id=e.id AND d.status='scheduled' ORDER BY d.attendance_date) daily) AS days FROM events e JOIN event_management m ON m.event_id=e.id WHERE e.publication_status='published' AND m.is_listed=1 AND ${where} ORDER BY m.starts_at ${period==='past'?'DESC':'ASC'},e.id LIMIT ${detail||limit==='1'?1:200}`);
  const rows=(await statement.bind(member?1:0,...detail?[id]:[]).all()).results;
  if(detail&&!rows.length)return reply(404,{error:'Not found'});
  const result=rows.map(row=>({...row,venue:row.venue?JSON.parse(String(row.venue)):null,days:JSON.parse(String(row.days))}));
  return reply(200,detail?{event:result[0]}:{events:result});
 }catch{return reply(503,{error:'Events could not be loaded'});}
}
