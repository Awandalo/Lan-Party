import type {AuthenticationEnvironment} from './auth/http';
import {authRouteEnabled} from './auth/environment';
import {newsArticle,newsReady} from './news-data';
import {pageShell} from './site-page';
import {previewTags,rewritePreview} from './site-preview';
import {newsLanguage} from '../src/lib/news-language';
// Anonymous publication lookup only. No private article content enters an HTML preview.
export async function newsPage(request:Request,env:AuthenticationEnvironment&{ASSETS:Fetcher}):Promise<Response|null>{
 if(!['GET','HEAD'].includes(request.method)||!authRouteEnabled(request,env,env.AUTH_SESSION_MODE))return null;
 const url=new URL(request.url),slug=/^\/news\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(url.pathname)?.[1];
 let article:Record<string,unknown>|null=null,status=404;
 try{if(!await newsReady(env.DB))status=503;else if(slug&&slug.length<=120){article=await newsArticle(env.DB,slug,true);status=article?200:404;}}catch{status=503;}
 const title=article?String(article.title):'News',summary=article?(String(article.excerpt??'').trim()||(article.kind==='poll'?'Vote in this LAN Party poll.':'News from the LAN Party crew.')):'News from the LAN Party crew.',canonical=new URL(article?'/news/'+article.slug:'/news',url.origin).href;
 const tags=previewTags({title,description:summary,canonical,type:'article',language:article?newsLanguage(article.language):undefined})+(article?'':'<meta name="robots" content="noindex">');
 const shell=await pageShell(request,env),headers=new Headers(shell.headers);
 const source=new Response(shell.body,{status:shell.ok?status:shell.status,headers});
 if(!shell.ok||!headers.get('Content-Type')?.startsWith('text/html'))return request.method==='HEAD'?new Response(null,source):source;
 const result=rewritePreview(source,tags);
 return request.method==='HEAD'?new Response(null,result):result;
}
