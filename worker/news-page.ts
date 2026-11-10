import type {AuthenticationEnvironment} from './auth/http';
import {authRouteEnabled} from './auth/environment';
import {newsArticle,newsReady} from './news-data';
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
// Anonymous publication lookup only. No private article content enters an HTML preview.
export async function newsPage(request:Request,env:AuthenticationEnvironment&{ASSETS:Fetcher}):Promise<Response|null>{
 if(!['GET','HEAD'].includes(request.method)||!authRouteEnabled(request,env,env.AUTH_SESSION_MODE))return null;
 const url=new URL(request.url),slug=/^\/news\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(url.pathname)?.[1];
 let article:Record<string,unknown>|null=null,status=404;
 try{if(!await newsReady(env.DB))status=503;else if(slug&&slug.length<=120){article=await newsArticle(env.DB,slug,true);status=article?200:404;}}catch{status=503;}
 const title=article?String(article.title):'News',summary=article?String(article.excerpt??'News from the LAN Party crew.'):'News from the LAN Party crew.',canonical=new URL(article?'/news/'+article.slug:'/news',url.origin).href;
 const tags=`<title>${escape('LAN Party | '+title)}</title><meta name="description" content="${escape(summary)}"><link rel="canonical" href="${escape(canonical)}">`+[['og:type','article'],['og:title',title],['og:description',summary],['og:url',canonical],['og:site_name','LAN Party']].map(([key,value])=>`<meta property="${key}" content="${escape(value)}">`).join('')+(article?'':'<meta name="robots" content="noindex">');
 const shell=await env.ASSETS.fetch(new Request(new URL(url.pathname,url.origin),{headers:{Accept:'text/html','Accept-Encoding':'identity'}})),headers=new Headers(shell.headers);
 for(const name of ['Content-Length','ETag','Last-Modified','Content-Range','Accept-Ranges'])headers.delete(name);headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');
 const source=new Response(shell.body,{status:shell.ok?status:shell.status,headers});
 if(!shell.ok||!headers.get('Content-Type')?.startsWith('text/html'))return request.method==='HEAD'?new Response(null,source):source;
 const result=new HTMLRewriter().on('title, meta[name="description"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"]',{element(element){element.remove();}}).on('head',{element(element){element.append(tags,{html:true});}}).transform(source);
 return request.method==='HEAD'?new Response(null,result):result;
}
