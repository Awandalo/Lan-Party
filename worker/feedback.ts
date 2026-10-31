import type {AuthenticationEnvironment} from './auth/http';
import {authOrigin,authRouteEnabled,hostedDev,loopback,validAuthMutation,authClientIP} from './auth/environment';
import {resolveSession} from './auth/sessions';
import {readSessionCookie} from './auth/cookies';
import {digestToken} from './auth/tokens';
import {sessionCsrfToken} from './auth/csrf';
import {fromHex} from './auth/encoding';
import {isAdministrator} from './role-administration';
import {FeedbackError,feedbackReady,purgeFeedback,feedbackUUID} from './feedback-data';
import {feedbackRead,feedbackUnread} from './feedback-read';
import {feedbackWrite} from './feedback-write';
export async function feedback(request:Request,env:AuthenticationEnvironment){
 const reply=(status:number,data:object)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 const url=new URL(request.url),admin=url.pathname.startsWith('/api/manage/');
 if(!(loopback(url)||hostedDev(request,env))||!authRouteEnabled(request,env,env.AUTH_SESSION_MODE))return reply(404,{error:'Not found'});
 const prefix=admin?'/api/manage/feedback':'/api/feedback/requests',tail=url.pathname.slice(prefix.length),parts=tail.split('/').filter(Boolean);
 const unread=!admin&&url.pathname==='/api/feedback/unread';
 if(!unread&&(!url.pathname.startsWith(prefix)||parts.length>2||parts[0]&&!feedbackUUID.test(parts[0])||parts[1]&&!['replies','read','triage','github-link'].includes(parts[1])))return reply(404,{error:'Not found'});
 if(!['GET','POST'].includes(request.method)||request.method==='GET'&&parts[1]||request.method==='POST'&&(unread||parts.length===1||admin&&!parts.length))return reply(405,{error:'Method not allowed'});
 try{
  const origin=authOrigin(request,env),proof=fromHex(request.headers.get('X-LAN-Session-Proof')??'',32);
  if(request.headers.get('X-LAN-Request')!=='1'||request.headers.has('Content-Encoding')||request.headers.has('Origin')&&request.headers.get('Origin')!==origin.origin||request.headers.has('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin')return reply(403,{error:'Request rejected'});
  const token=readSessionCookie(request),account=token?await resolveSession(env.DB,token,Math.floor(Date.now()/1000)):null;
  if(!account||account.emailVerifiedAt===null)return reply(401,{error:'Please log in'});
  const digest=await digestToken(token!,'session'),expected=fromHex(await sessionCsrfToken(digest,env.AUTH_RATE_LIMIT_SECRET!),32)!;
  if(!proof)return reply(403,{error:'Session proof required'});
  if(!crypto.subtle.timingSafeEqual(proof,expected))return reply(409,{error:'Session context changed'});
  const administrator=await isAdministrator(env.DB,account.userId);
  if(admin&&!administrator)return reply(403,{error:'Feedback administration is restricted'});
  if(!await feedbackReady(env.DB))return reply(503,{error:'Feedback requires its approved database migration'});
  await purgeFeedback(env.DB);
  const c={userId:account.userId,digest,admin:administrator,ip:authClientIP(request,env),secret:env.AUTH_RATE_LIMIT_SECRET!};
  if(unread){if(url.search)throw new FeedbackError(400,'Invalid query');return reply(200,await feedbackUnread(env.DB,c));}
  if(request.method==='GET')return reply(200,await feedbackRead(env.DB,c,admin,parts[0]??null,url.searchParams));
  if(url.search||request.headers.get('Content-Type')!=='application/json')throw new FeedbackError(400,'Invalid request');
  if(!await validAuthMutation(request,origin.origin,digest,env.AUTH_RATE_LIMIT_SECRET!))return reply(403,{error:'Request rejected'});
  const reader=request.body?.getReader();if(!reader)throw new FeedbackError(400,'Invalid request');let size=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false});
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>32768){await reader.cancel();throw new FeedbackError(413,'Request too large');}text+=decoder.decode(value,{stream:true});}
  let raw:unknown;try{raw=JSON.parse(text+decoder.decode());}catch{throw new FeedbackError(400,'Invalid request');}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new FeedbackError(400,'Invalid request');
  return reply(200,await feedbackWrite(env.DB,c,admin,parts[0]??null,parts[1]??'create',raw as Record<string,unknown>));
 }catch(e){return e instanceof FeedbackError?reply(e.status,{error:e.message}):reply(503,{error:'Feedback is unavailable. Reload to check the current state.'});}
}