import {FeedbackError,feedbackDecisions,feedbackProgress,feedbackHash,feedbackRequest,feedbackSummary,visibleFeedback} from './feedback-data';
import type {FeedbackContext} from './feedback-data';
export async function feedbackRead(db:D1Database,c:FeedbackContext,admin:boolean,id:string|null,params:URLSearchParams){
 const audience=admin?'administrator':'member';
 if(id){
  for(const k of params.keys())if(k!=='before'||params.getAll(k).length!==1)throw new FeedbackError(400,'Invalid query');
  const before=params.get('before')??'9223372036854775807';if(!/^[1-9][0-9]{0,18}$/.test(before)||BigInt(before)>9223372036854775807n)throw new FeedbackError(400,'Invalid cursor');
  const row=await feedbackRequest(db,id,c,admin);
  const events=(await db.prepare(`SELECT CAST(sequence AS TEXT) AS sequence,actor_kind AS actorKind,
   CASE WHEN actor_id IS NULL THEN 1 ELSE 0 END AS anonymized,kind,body,delta,occurred_at AS occurredAt
   FROM feedback_events WHERE request_id=? AND sequence<CAST(? AS INTEGER) ORDER BY sequence DESC LIMIT 51`).bind(id,before).all()).results;
  const page=events.slice(0,50),oldest=page.at(-1),through=page[0]?.sequence??'0';
  return {request:{...feedbackSummary(admin?row:{...row,nickname:undefined}),description:row.description},events:page.reverse(),nextBefore:events.length>50?oldest?.sequence:null,through};
 }
 for(const k of params.keys())if(!['kind','decision','progress','search','cursor'].includes(k)||params.getAll(k).length!==1)throw new FeedbackError(400,'Invalid query');
 const kind=params.get('kind')??'',decision=params.get('decision')??'',progress=params.get('progress')??'',search=(params.get('search')??'').trim();
 if(kind&&!['bug','feature'].includes(kind)||decision&&!feedbackDecisions.includes(decision as typeof feedbackDecisions[number])||progress&&!feedbackProgress.includes(progress as typeof feedbackProgress[number])||[...search].length>120||/[\u0000-\u001f\u007f]/.test(search))throw new FeedbackError(400,'Invalid filters');
 const criteria=await feedbackHash([c.userId,admin,kind,decision,progress,search]);let time=Number.MAX_SAFE_INTEGER,last='ffffffff-ffff-ffff-ffff-ffffffffffff';
 if(params.has('cursor')){const m=/^v1:([a-f0-9]{64}):([0-9]{1,12}):([a-f0-9-]{36})$/.exec(params.get('cursor')!);if(!m||m[1]!==criteria)throw new FeedbackError(400,'Invalid cursor');time=Number(m[2]);last=m[3];}
 const filters:string[]=[visibleFeedback],args:(string|number)[]=[c.userId,audience,audience];
 if(!admin){filters.push('f.owner_id=?');args.push(c.userId);}
 for(const [name,value] of [['kind',kind],['decision',decision],['progress',progress]])if(value){filters.push('f.'+name+'=?');args.push(value);}
 if(search){filters.push("f.title LIKE ? ESCAPE '\\'");args.push('%'+search.replace(/[\\%_]/g,'\\$&')+'%');}
 args.push(time,time,last);
 const rows=(await db.prepare(`SELECT f.id,f.kind,f.title,f.decision,f.progress,f.revision,f.github_number,f.closed_at,f.created_at,f.updated_at,
 ${admin?'n.nickname,CAST(m.member_number AS TEXT) AS member_number,':''}
 EXISTS(SELECT 1 FROM feedback_events e WHERE e.request_id=f.id AND e.sequence>coalesce((SELECT seen_sequence FROM feedback_reads WHERE request_id=f.id AND user_id=? AND audience=?),0) AND e.notification=?) AS unread
 FROM feedback_requests f ${admin?'LEFT JOIN user_nicknames n ON n.user_id=f.owner_id LEFT JOIN member_numbers m ON m.user_id=f.owner_id':''}
 WHERE ${filters.join(' AND ')} AND (f.created_at<? OR (f.created_at=? AND f.id<?)) ORDER BY f.created_at DESC,f.id DESC LIMIT 21`).bind(...args).all<Record<string,unknown>>()).results;
 const page=rows.slice(0,20),end=page.at(-1);
 return {requests:page.map(feedbackSummary),nextCursor:rows.length>20?`v1:${criteria}:${end!.created_at}:${end!.id}`:null};
}
export async function feedbackUnread(db:D1Database,c:FeedbackContext){
 const count=async(admin:boolean)=>await db.prepare(`SELECT count(*) n FROM feedback_requests f WHERE ${visibleFeedback} ${admin?'':'AND f.owner_id=?'}
 AND EXISTS(SELECT 1 FROM feedback_events e WHERE e.request_id=f.id AND e.notification=? AND e.sequence>coalesce((SELECT seen_sequence FROM feedback_reads WHERE request_id=f.id AND user_id=? AND audience=?),0))`)
 .bind(...(admin?[]:[c.userId]),admin?'administrator':'member',c.userId,admin?'administrator':'member').first<number>('n');
 return {memberUnread:await count(false),adminUnread:c.admin?await count(true):0};
}