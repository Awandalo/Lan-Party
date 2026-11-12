import type {AuthenticationEnvironment} from './auth/http';
import {authOrigin,authRouteEnabled,validAuthMutation} from './auth/environment';
import {readSessionCookie} from './auth/cookies';
import {resolveSession} from './auth/sessions';
import {digestToken} from './auth/tokens';
import {sessionCsrfToken} from './auth/csrf';
import {fromHex} from './auth/encoding';
import {readInput} from './auth/registration';
import {memberActor} from './event-registration-data';
import {UUID} from './role-administration';
import {pollsReady,pollSummaries} from './poll-data';
import {NewsError} from './news-data';
const reply=(status:number,body:unknown)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie, X-LAN-Session-Proof','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
async function own(db:D1Database,id:string,user:string,pollRevision:number,digest:string){const ballot=await db.prepare('SELECT revision FROM news_poll_ballots WHERE poll_id=? AND user_id=?').bind(id,user).first<{revision:number}>(),selection=(await db.prepare('SELECT option_id FROM news_poll_selections WHERE poll_id=? AND user_id=? ORDER BY option_id').bind(id,user).all<{option_id:string}>()).results.map(s=>s.option_id);const poll=(await pollSummaries(db,[id])).get(id);if(!poll||!await db.prepare("SELECT 1 FROM news_articles WHERE id=? AND publication_status='published' AND "+memberActor).bind(id,user,digest).first())throw new NewsError(409,'Poll or session changed. Reload to check');return {selection,revision:ballot?.revision??0,pollRevision:poll.revision??pollRevision,poll};}
export async function polls(request:Request,env:AuthenticationEnvironment){
 const url=new URL(request.url),id=url.pathname.slice('/api/polls/'.length);
 if(!UUID.test(id)||!authRouteEnabled(request,env,env.AUTH_SESSION_MODE))return reply(404,{error:'Poll not found'});
 if(!['GET','POST'].includes(request.method))return reply(405,{error:'Method not allowed'});
 try{
  const origin=authOrigin(request,env);if(url.search||request.headers.has('Content-Encoding')||request.headers.get('X-LAN-Request')!=='1'||request.headers.has('Origin')&&request.headers.get('Origin')!==origin.origin||request.headers.has('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin')return reply(403,{error:'Request rejected'});
  const token=readSessionCookie(request),account=token?await resolveSession(env.DB,token,Math.floor(Date.now()/1000)):null;if(!token||!account||account.emailVerifiedAt===null)return reply(401,{error:'Sign in with a verified account to vote'});
  if(!env.AUTH_RATE_LIMIT_SECRET)return reply(503,{error:'Voting unavailable'});
  const digest=await digestToken(token,'session'),proof=fromHex(request.headers.get('X-LAN-Session-Proof')??'',32),expected=fromHex(await sessionCsrfToken(digest,env.AUTH_RATE_LIMIT_SECRET),32)!;
  if(!proof||!crypto.subtle.timingSafeEqual(proof,expected))return reply(409,{error:'Session changed. Reload before voting'});
  if(!await pollsReady(env.DB))return reply(503,{error:'Polls are awaiting their database migration'});
  const poll=await env.DB.prepare("SELECT p.mode,p.closed,p.revision FROM news_polls p JOIN news_articles a ON a.id=p.article_id WHERE p.article_id=? AND a.publication_status='published'").bind(id).first<{mode:string;closed:number;revision:number}>();if(!poll)return reply(404,{error:'Poll not found'});
  if(!await env.DB.prepare('SELECT 1 WHERE '+memberActor).bind(account.userId,digest).first())return reply(401,{error:'Sign in again'});
  if(request.method==='GET')return reply(200,await own(env.DB,id,account.userId,poll.revision,digest));
  if(!await validAuthMutation(request,origin.origin,digest,env.AUTH_RATE_LIMIT_SECRET))return reply(403,{error:'Request rejected'});
  let raw:Record<string,unknown>;try{raw=await readInput(request) as Record<string,unknown>;}catch{return reply(400,{error:'Check your choices'});}
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join(',')!=='pollRevision,revision,selection'||!Number.isSafeInteger(raw.revision)||Number(raw.revision)<0||!Number.isSafeInteger(raw.pollRevision)||Number(raw.pollRevision)<0||!Array.isArray(raw.selection)||!raw.selection.length||raw.selection.length>8||raw.selection.some(x=>typeof x!=='string'||!UUID.test(x))||new Set(raw.selection).size!==raw.selection.length||poll.mode==='single'&&raw.selection.length!==1)return reply(400,{error:'Choose '+(poll.mode==='single'?'one answer':'one or more different answers')});
  if(poll.closed||poll.revision!==raw.pollRevision)return reply(409,{error:'Voting changed or closed. Reload the poll'});
  const ids=(await env.DB.prepare('SELECT id FROM news_poll_options WHERE poll_id=?').bind(id).all<{id:string}>()).results.map(o=>o.id);if(raw.selection.some(id=>!ids.includes(id)))return reply(400,{error:'Choose an answer from this poll'});
  const recent=await env.DB.prepare('SELECT changes FROM news_poll_ballots WHERE poll_id=? AND user_id=? AND window_started_at>unixepoch()-600').bind(id,account.userId).first<{changes:number}>();if(recent&&recent.changes>=60)return reply(429,{error:'Too many changes. Try again in ten minutes'});
  const gate=`EXISTS(SELECT 1 FROM news_polls p JOIN news_articles a ON a.id=p.article_id WHERE p.article_id=? AND p.closed=0 AND p.revision=? AND a.publication_status='published') AND ${memberActor}`;
  // Fence live membership, publication and both revisions inside the same
  // transaction that replaces selections; a failed assertion rolls everything back.
  await env.DB.batch([
   env.DB.prepare(`INSERT INTO news_poll_ballots(poll_id,user_id,revision,updated_at,window_started_at,changes) SELECT ?,?,1,unixepoch(),unixepoch(),1 WHERE ${gate} AND (?=0 OR EXISTS(SELECT 1 FROM news_poll_ballots WHERE poll_id=? AND user_id=? AND revision=?)) ON CONFLICT(poll_id,user_id) DO UPDATE SET revision=news_poll_ballots.revision+1,updated_at=unixepoch(),window_started_at=CASE WHEN window_started_at<=unixepoch()-600 THEN unixepoch() ELSE window_started_at END,changes=CASE WHEN window_started_at<=unixepoch()-600 THEN 1 ELSE changes+1 END WHERE news_poll_ballots.revision=? AND (changes<60 OR window_started_at<=unixepoch()-600)`).bind(id,account.userId,id,raw.pollRevision,account.userId,digest,raw.revision,id,account.userId,raw.revision,raw.revision),
   env.DB.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('poll ballot conflict') END"),
   env.DB.prepare('DELETE FROM news_poll_selections WHERE poll_id=? AND user_id=?').bind(id,account.userId),
   env.DB.prepare('INSERT INTO news_poll_selections(poll_id,user_id,option_id) SELECT ?,?,value FROM json_each(?)').bind(id,account.userId,JSON.stringify(raw.selection)),
  ]);
  return reply(200,await own(env.DB,id,account.userId,poll.revision,digest));
 }catch(e){if(e instanceof NewsError)return reply(e.status,{error:e.message});return /poll ballot conflict|malformed JSON|constraint|Single choice/i.test(String(e))?reply(409,{error:'Your vote or poll changed. Reload before saving'}):reply(503,{error:'Vote could not be confirmed. Reload to check before retrying'});}
}
