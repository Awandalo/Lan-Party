import {eventEnvironmentEnabled} from './event-environment';
import type {AuthenticationEnvironment} from './auth/http';
import {authRouteEnabled,} from './auth/environment';
import {eventsReady} from './event-data';
import {UUID} from './role-administration';
import {eventDocument} from '../src/lib/event-document';
import type {EventNode} from '../src/lib/event-document';
import {EVENT_ARTWORK,EVENT_ARTWORK_ALT} from '../src/lib/event-artwork';

const genericDescription='Find your next LAN party, dates and event details on LAN Party.';
const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function description(source:string){
 const plain=(node:EventNode):string=>[node.text??'',...(node.content??[]).map(plain)].join(' ');
 const text=plain(eventDocument(source)).replace(/\s+/g,' ').trim(),chars=Array.from(text);
 return chars.length>180?chars.slice(0,179).join('')+'…':text||genericDescription;
}

// Always use an anonymous projection, even for signed-in visitors and crawlers.
// No UA-specific rendering, external fetches, account reads or cached event HTML.
export async function eventPage(request:Request,env:AuthenticationEnvironment&{ASSETS:Fetcher}):Promise<Response|null>{
 const url=new URL(request.url);
 if(!eventEnvironmentEnabled(request,env)||!authRouteEnabled(request,env,env.AUTH_SESSION_MODE)||!['GET','HEAD'].includes(request.method))return null;
 const id=/^\/events\/([^/]+)(?:\/registration)?\/?$/.exec(url.pathname)?.[1];
 let event:{title:string;description:string}|null=null,status=404;
 if(id&&UUID.test(id)){
  try{
   if(await eventsReady(env.DB)){
    event=await env.DB.prepare("SELECT e.title,e.description FROM events e JOIN event_management m ON m.event_id=e.id WHERE e.id=? AND e.publication_status='published' AND m.is_listed=1").bind(id).first();
    status=event?200:404;
   }else status=503;
  }catch{status=503;}
 }
 const title=event?.title??'LAN Party | Events',summary=event?description(event.description):genericDescription;
 const canonical=new URL(event?'/events/'+id:'/events',url.origin).href,image=new URL(EVENT_ARTWORK,url.origin).href;
 const tags=[`<title>${escape(event?'LAN Party | '+title:title)}</title>`,
  `<meta name="description" content="${escape(summary)}">`,
  `<link rel="canonical" href="${escape(canonical)}">`,
  ...[['og:type','website'],['og:site_name','LAN Party'],['og:title',title],['og:description',summary],['og:url',canonical],['og:image',image],['og:image:alt',EVENT_ARTWORK_ALT]].map(([key,value])=>`<meta property="${key}" content="${escape(value)}">`),
  ...[['twitter:card','summary_large_image'],['twitter:title',title],['twitter:description',summary],['twitter:image',image],['twitter:image:alt',EVENT_ARTWORK_ALT]].map(([key,value])=>`<meta name="${key}" content="${escape(value)}">`),
  ...event?[]:['<meta name="robots" content="noindex">']].join('');
 // Strip conditional/session/query headers so the shell cannot return 304 or
 // inherit a private response. ASSETS.fetch bypasses Worker routing recursion.
 const assetUrl=new URL(url.pathname,url.origin);
 const shell=await env.ASSETS.fetch(new Request(assetUrl,{headers:{Accept:'text/html','Accept-Encoding':'identity'}}));
 const headers=new Headers(shell.headers);
 for(const key of ['Content-Length','ETag','Last-Modified','Content-Range','Accept-Ranges'])headers.delete(key);
 headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');
 const source=new Response(shell.body,{status:shell.ok?status:shell.status,headers});
 if(!shell.ok||!headers.get('Content-Type')?.startsWith('text/html'))return request.method==='HEAD'?new Response(null,source):source;
 const rewritten=new HTMLRewriter().on('title, meta[name="description"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"]',{element(element){element.remove();}}).on('head',{element(element){element.append(tags,{html:true});}}).transform(source);
 return request.method==='HEAD'?new Response(null,rewritten):rewritten;
}
