import type {AuthenticationEnvironment} from './auth/http';
import {authOrigin,authRouteEnabled,validAuthMutation} from './auth/environment';
import {readSessionCookie} from './auth/cookies';
import {resolveSession} from './auth/sessions';
import {digestToken} from './auth/tokens';
import {sessionCsrfToken} from './auth/csrf';
import {fromHex} from './auth/encoding';
import {administrationPermissions} from './manage';
import {isAdministrator,UUID} from './role-administration';
import {eventActor} from './event-data';
import {NewsError,newsReady,newsPermissions,newsArticle,newsList,writeNews} from './news-data';

const reply=(status:number,body:unknown)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Vary':'Cookie, X-LAN-Session-Proof','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
export async function news(request:Request,env:AuthenticationEnvironment){
 const url=new URL(request.url),manager=url.pathname==='/api/manage/news';
 if(!authRouteEnabled(request,env,env.AUTH_SESSION_MODE))return reply(404,{error:'Not found'});
 if(!['GET',...(manager?['POST']:[])].includes(request.method))return reply(405,{error:'Method not allowed'});
 try{
  if(!await newsReady(env.DB))return reply(503,{error:'News is awaiting migration 0038'});
  if(!manager){
   if(url.pathname==='/api/news'){
    if([...url.searchParams.keys()].some(k=>!['limit','offset','polls'].includes(k)||url.searchParams.getAll(k).length!==1))throw new NewsError(400,'Invalid News query');
    const limit=Number(url.searchParams.get('limit')??12),offset=Number(url.searchParams.get('offset')??0);
    if(!Number.isSafeInteger(limit)||limit<1||limit>20||!Number.isSafeInteger(offset)||offset<0||offset>10000)throw new NewsError(400,'Invalid News page');
    if(url.searchParams.has('polls')&&url.searchParams.get('polls')!=='open')throw new NewsError(400,'Invalid Poll filter');
    return reply(200,await newsList(env.DB,true,limit,offset,url.searchParams.get('polls')==='open'));
   }
   const slug=url.pathname.slice('/api/news/'.length);if(url.search||!slug||slug.length>120||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return reply(404,{error:'Article not found'});
   const article=await newsArticle(env.DB,slug,true);return article?reply(200,{article}):reply(404,{error:'Article not found'});
  }
  const origin=authOrigin(request,env);
  if(request.headers.has('Content-Encoding')||request.headers.get('X-LAN-Request')!=='1'||request.headers.has('Origin')&&request.headers.get('Origin')!==origin.origin||request.headers.has('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin')return reply(403,{error:'Request rejected'});
  const token=readSessionCookie(request),account=token?await resolveSession(env.DB,token,Math.floor(Date.now()/1000)):null;
  if(!token||!account||account.emailVerifiedAt===null)return reply(401,{error:'Please log in'});
  if(!env.AUTH_RATE_LIMIT_SECRET)return reply(503,{error:'News unavailable'});
  const digest=await digestToken(token,'session'),proof=fromHex(request.headers.get('X-LAN-Session-Proof')??'',32),expected=fromHex(await sessionCsrfToken(digest,env.AUTH_RATE_LIMIT_SECRET),32)!;
  if(!proof||!crypto.subtle.timingSafeEqual(proof,expected))return reply(403,{error:'Reload to check your session'});
  const permissions=await administrationPermissions(env.DB,account.userId,Math.floor(Date.now()/1000));
  if(!newsPermissions.some(p=>permissions.includes(p)))return reply(403,{error:'News access is restricted'});
  if(request.method==='GET'){
   if([...url.searchParams.keys()].some(k=>k!=='id'||url.searchParams.getAll(k).length!==1))throw new NewsError(400,'Invalid News query');
   const id=url.searchParams.get('id');if(id&&!UUID.test(id))throw new NewsError(400,'Invalid article');
   const data=id?{article:await newsArticle(env.DB,id,false)}:await newsList(env.DB,false,200);
   // Fence reads against a concurrently revoked role/session after the first lookup.
   const guards=newsPermissions.map(p=>eventActor(p)).join(' OR ');
   if(!await env.DB.prepare('SELECT 1 WHERE '+guards).bind(...newsPermissions.flatMap(()=>[account.userId,digest])).first())return reply(403,{error:'News access changed'});
   return reply(200,{...data,permissions:permissions.filter(p=>newsPermissions.includes(p as typeof newsPermissions[number])),administrator:await isAdministrator(env.DB,account.userId)});
  }
  if(url.search||!await validAuthMutation(request,origin.origin,digest,env.AUTH_RATE_LIMIT_SECRET))return reply(403,{error:'Request rejected'});
  const reader=request.body?.getReader();if(!reader)throw new NewsError(400,'Invalid request');let bytes=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false});
  for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>65536){await reader.cancel();throw new NewsError(413,'Request too large');}text+=decoder.decode(part.value,{stream:true});}
  let raw:unknown;try{raw=JSON.parse(text+decoder.decode());}catch{throw new NewsError(400,'Invalid request');}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new NewsError(400,'Invalid request');
  return reply(200,await writeNews(env.DB,account.userId,digest,raw as Record<string,unknown>));
 }catch(e){return e instanceof NewsError?reply(e.status,{error:e.message}):reply(503,{error:'News could not be confirmed. Reload before trying again'});}
}
