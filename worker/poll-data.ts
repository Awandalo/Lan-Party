import {NewsError} from './news-data';
export async function pollsReady(db:D1Database){return !!await db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='news_poll_selections'").first();}
export type PollMode='single'|'multiple';
export function pollDraft(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new NewsError(400,'Check poll choices');
 const p=raw as Record<string,unknown>;
 if(Object.keys(p).sort().join(',')!=='mode,options'||!['single','multiple'].includes(String(p.mode))||!Array.isArray(p.options)||p.options.length<2||p.options.length>8||p.options.some(o=>typeof o!=='string'||!o.trim()||o.trim().length>120||/[\u0000-\u001f\u007f]/.test(o)))throw new NewsError(400,'Choose a voting mode and 2–8 answers up to 120 characters');
 const options=(p.options as string[]).map(o=>o.trim());if(new Set(options.map(o=>o.toLocaleLowerCase('en'))).size!==options.length)throw new NewsError(400,'Each answer must be different');
 return {mode:p.mode as PollMode,options};
}
export async function pollSummaries(db:D1Database,ids:string[]){
 if(!ids.length||!await pollsReady(db))return new Map<string,PollSummary>();
 const input=JSON.stringify(ids),rows=(await db.prepare('SELECT p.*,(SELECT count(*) FROM news_poll_ballots b WHERE b.poll_id=p.article_id) AS voters FROM news_polls p WHERE p.article_id IN (SELECT value FROM json_each(?))').bind(input).all<{article_id:string;mode:PollMode;closed:number;locked:number;revision:number;voters:number}>()).results;
 const options=(await db.prepare('SELECT o.poll_id,o.id,o.label,(SELECT count(*) FROM news_poll_selections s WHERE s.poll_id=o.poll_id AND s.option_id=o.id) AS votes FROM news_poll_options o WHERE o.poll_id IN (SELECT value FROM json_each(?)) ORDER BY o.poll_id,o.sort_order').bind(input).all<{poll_id:string;id:string;label:string;votes:number}>()).results;
 return new Map(rows.map(p=>[p.article_id,{mode:p.mode,closed:p.closed===1,locked:p.locked===1,revision:p.revision,voters:p.voters,options:options.filter(o=>o.poll_id===p.article_id).map(({id,label,votes})=>({id,label,votes}))}]));
}
export interface PollSummary {mode:PollMode;closed:boolean;locked:boolean;revision:number;voters:number;options:{id:string;label:string;votes:number}[]}
