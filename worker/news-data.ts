import {pollsReady,pollDraft,pollSummaries} from './poll-data';
import {validateEventDocument} from '../src/lib/event-document';
import type {EventNode} from '../src/lib/event-document';
import {eventActor} from './event-data';
import {UUID} from './role-administration';

export class NewsError extends Error {constructor(public status:number,message:string){super(message);}}
export const newsPermissions=['news.create','news.update','news.publish','news.archive'] as const;
const permission={create:'news.create',update:'news.update',publish:'news.publish',unpublish:'news.archive',delete:null,'close-poll':'news.publish','reopen-poll':'news.publish'} as const;
export type NewsAction=keyof typeof permission;
export async function newsReady(db:D1Database){return !!await db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='news_activity'").first();}
export function newsText(node:EventNode):string{return [node.text??'',...(node.content??[]).map(newsText)].join(' ').replace(/\s+/g,' ').trim();}
const columns=`a.id,a.slug,a.title,a.excerpt,a.publication_status AS status,a.created_at AS createdAt,a.updated_at AS updatedAt,a.published_at AS publishedAt,(SELECT nickname FROM user_nicknames WHERE user_id=a.updated_by_user_id) AS editorName`;
const revision=`coalesce((SELECT max(sequence) FROM news_activity WHERE article_id=a.id),0)`;
export async function newsList(db:D1Database,publicView:boolean,limit=20,offset=0,openPolls=false){
 if(openPolls&&!await pollsReady(db))return {articles:[],hasMore:false};
 const articles=(await db.prepare(`SELECT ${columns}${publicView?'':','+revision+' AS revision'} FROM news_articles a ${publicView?"WHERE a.publication_status='published'":''}${openPolls?" AND EXISTS(SELECT 1 FROM news_polls p WHERE p.article_id=a.id AND p.closed=0)":''} ORDER BY ${publicView?'a.published_at':'a.created_at'} DESC,a.id DESC LIMIT ? OFFSET ?`).bind(limit+1,offset).all()).results;
 const summaries=await pollSummaries(db,articles.slice(0,limit).map(a=>String(a.id)));
 return {articles:articles.slice(0,limit).map(a=>summaries.has(String(a.id))?{...a,kind:'poll',poll:summaries.get(String(a.id))}:a),hasMore:articles.length>limit};
}
export async function newsArticle(db:D1Database,key:string,publicView:boolean){const row=await db.prepare(`SELECT ${columns},a.content${publicView?'':','+revision+' AS revision'} FROM news_articles a WHERE a.${publicView?'slug':'id'}=? ${publicView?"AND a.publication_status='published'":''}`).bind(key).first<{id:string;title:string;content:string;status:string;revision:number;[key:string]:unknown}>();if(!row)return null;const poll=(await pollSummaries(db,[String(row.id)])).get(String(row.id));return {...row,...poll?{kind:'poll',poll}:{}};}

const assertChange=(db:D1Database)=>db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('news-stale-or-permission-changed') END");
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export async function writeNews(db:D1Database,userId:string,digest:string,raw:Record<string,unknown>){
 const action=String(raw.action) as NewsAction;
 if(!Object.hasOwn(permission,action)||typeof raw.operationId!=='string'||!UUID.test(raw.operationId))throw new NewsError(400,'Invalid News action');
 const allowed=['action','operationId',...(action==='create'?['title','content','poll']:['id','revision',...(action==='update'?['title','content','poll']:action==='delete'?['confirmation']:[])])];
 if(Object.keys(raw).some(k=>!allowed.includes(k)))throw new NewsError(400,'Unsupported News fields');
 const payload=await hash(JSON.stringify(raw));
 const previous=await db.prepare('SELECT article_id,actor_id,payload_digest FROM news_activity WHERE operation_id=?').bind(raw.operationId).first<{article_id:string;actor_id:string|null;payload_digest:string}>();
 // Even an idempotent replay must retain live authority; the HTTP boundary also checks.
 const guard=eventActor(permission[action]);
 if(!await db.prepare('SELECT 1 WHERE '+guard).bind(userId,digest).first())throw new NewsError(403,'News action is restricted');
 if(previous){if(previous.actor_id!==userId||previous.payload_digest!==payload)throw new NewsError(409,'This operation was already used');return {id:previous.article_id,duplicate:true};}
 const id=action==='create'?crypto.randomUUID():String(raw.id);
 if(!UUID.test(id)||action!=='create'&&(!Number.isSafeInteger(raw.revision)||Number(raw.revision)<0))throw new NewsError(400,'Invalid article reference');
 const old=action==='create'?null:await newsArticle(db,id,false);
 if(action!=='create'&&!old)throw new NewsError(404,'Article not found');
 if(old&&old.revision!==raw.revision)throw new NewsError(409,'This article changed. Reload before continuing');
 const oldPoll=old?.poll;
 const draft=raw.poll===undefined?null:pollDraft(raw.poll);
 if(draft&&!await pollsReady(db))throw new NewsError(503,'Polls are awaiting their database migration');
 if(draft&&action!=='create'&&!oldPoll)throw new NewsError(400,'News and Poll types cannot be changed');
 if(['close-poll','reopen-poll'].includes(action)&&(!oldPoll||old?.status!=='published'||oldPoll.closed===(action==='close-poll')))throw new NewsError(409,'Poll voting state changed');
 let title='',content='',excerpt='';
 if(action==='create'||action==='update'){
  if(typeof raw.title!=='string'||!raw.title.trim()||raw.title.length>160||/[\u0000-\u001f\u007f]/.test(raw.title))throw new NewsError(400,'Enter a title up to 160 characters');title=raw.title.trim();
  let doc:EventNode;try{doc=validateEventDocument(raw.content);}catch(e){throw new NewsError(400,(e as Error).message);}content=JSON.stringify(doc);excerpt=Array.from(newsText(doc)).slice(0,180).join('');
  if(old?.status==='published'&&!oldPoll&&!excerpt)throw new NewsError(400,'Published posts need content');
 }
 if(action==='publish'){
  if(old?.status==='published')throw new NewsError(409,'Article is already published');
  let text='';try{text=newsText(validateEventDocument(JSON.parse(String(old?.content))));}catch{throw new NewsError(400,'Correct unsupported content before publishing');}
  if(!text&&!oldPoll)throw new NewsError(400,'Add content before publishing');
 }
 if(action==='unpublish'&&old?.status!=='published')throw new NewsError(409,'Article is not published');
 if(action==='delete'&&raw.confirmation!==old?.title)throw new NewsError(400,'Confirm the article title before deleting');
 if(oldPoll?.locked&&action==='update'&&(title!==old?.title||draft&&(draft.mode!==oldPoll.mode||JSON.stringify(draft.options)!==JSON.stringify(oldPoll.options.map(o=>o.label)))))throw new NewsError(400,'Question, voting mode and choices lock after the first vote');
 const statements:D1PreparedStatement[]=[];
 const current=`coalesce((SELECT max(sequence) FROM news_activity WHERE article_id=news_articles.id),0)=?`;
 if(action==='create'){
  const stem=title.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60).replace(/-$/,'')||'news';
  statements.push(db.prepare(`INSERT INTO news_articles(id,title,slug,content,excerpt,author_user_id,updated_by_user_id,created_at,updated_at) SELECT ?,?,?,?,?,?,?,unixepoch(),unixepoch() WHERE ${guard}`).bind(id,title,stem+'-'+id,content,excerpt,userId,userId,userId,digest));
 }else{
  const where=`WHERE id=? AND ${current} AND ${guard}`;
  if(action==='update')statements.push(db.prepare(`UPDATE news_articles SET title=?,content=?,excerpt=?,updated_by_user_id=?,updated_at=max(updated_at,unixepoch()) ${where}`).bind(title,content,excerpt,userId,id,raw.revision,userId,digest));
  else if(action==='delete')statements.push(db.prepare(`DELETE FROM news_articles ${where}`).bind(id,raw.revision,userId,digest));
  else if(action==='close-poll'||action==='reopen-poll')statements.push(db.prepare(`UPDATE news_articles SET updated_at=max(updated_at,unixepoch()),updated_by_user_id=? ${where}`).bind(userId,id,raw.revision,userId,digest));
  else statements.push(db.prepare(`UPDATE news_articles SET publication_status=?,published_at=${action==='publish'?'coalesce(published_at,unixepoch())':'published_at'},updated_at=max(updated_at,unixepoch()),updated_by_user_id=? ${where}`).bind(action==='publish'?'published':'archived',userId,id,raw.revision,userId,digest));
 }
 statements.push(assertChange(db));
 if(action==='create'&&draft){
  statements.push(db.prepare('INSERT INTO news_polls(article_id,mode) VALUES(?,?)').bind(id,draft.mode));
  statements.push(db.prepare("INSERT INTO news_poll_options(poll_id,id,label,sort_order) SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.label'),CAST(key AS INTEGER) FROM json_each(?)").bind(id,JSON.stringify(draft.options.map(label=>({id:crypto.randomUUID(),label})))));
 }else if(oldPoll&&action!=='delete'){
  statements.push(db.prepare('UPDATE news_polls SET revision=revision+1,mode=?,closed=? WHERE article_id=?').bind(draft?.mode??oldPoll.mode,action==='close-poll'?1:action==='reopen-poll'?0:oldPoll.closed?1:0,id));
  if(action==='update'&&draft&&!oldPoll.locked){statements.push(db.prepare('DELETE FROM news_poll_options WHERE poll_id=?').bind(id));statements.push(db.prepare("INSERT INTO news_poll_options(poll_id,id,label,sort_order) SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.label'),CAST(key AS INTEGER) FROM json_each(?)").bind(id,JSON.stringify(draft.options.map(label=>({id:crypto.randomUUID(),label})))));}
 }
 statements.push(db.prepare('INSERT INTO news_activity(operation_id,article_id,actor_id,action,payload_digest,occurred_at) VALUES(?,?,?,?,?,unixepoch())').bind(raw.operationId,id,userId,action==='close-poll'||action==='reopen-poll'?'update':action,payload));
 try{await db.batch(statements);}catch{throw new NewsError(409,'Article or permissions changed. Reload before trying again');}
 return {id};
}
