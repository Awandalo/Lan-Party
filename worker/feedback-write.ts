import {FeedbackError,feedbackDecisions,feedbackProgress,feedbackUUID,feedbackText,feedbackHash,feedbackRequest,feedbackGuard,feedbackChanged,githubIssueNumber,visibleFeedback} from './feedback-data';
import type {FeedbackContext} from './feedback-data';
import {fromHex,toHex} from './auth/encoding';
const closed=(p:unknown)=>p==='completed'||p==='closed';
async function rateStatements(db:D1Database,c:FeedbackContext,kind:'create'|'reply'){
 const bytes=fromHex(c.secret,32);if(!bytes)throw Error('Feedback limiter unavailable');
 const key=await crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const now=(await db.prepare('SELECT unixepoch() n').first<number>('n'))!;
 await db.prepare('DELETE FROM registration_rate_limits WHERE key_hash IN (SELECT key_hash FROM registration_rate_limits WHERE expires_at<=? ORDER BY expires_at LIMIT 100)').bind(now).run();
 const statements:D1PreparedStatement[]=[];
 for(const [scope,identity,seconds,limit] of [['account',c.userId,kind==='create'?86400:3600,kind==='create'?5:10],['ip',c.ip,3600,kind==='create'?20:60],['global','all',3600,kind==='create'?100:500]] as const){
  const window=Math.floor(now/seconds)*seconds,digest=toHex(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify(['lan-party:feedback:v1',kind,scope,window,identity])))));
  if((await db.prepare('SELECT hits FROM registration_rate_limits WHERE key_hash=?').bind(digest).first<number>('hits')??0)>=limit)throw new FeedbackError(429,'Feedback limit reached. Please try later.');
  statements.push(db.prepare('INSERT INTO registration_rate_limits(key_hash,hits,expires_at) VALUES (?,1,?) ON CONFLICT(key_hash) DO UPDATE SET hits=hits+1 WHERE hits<?').bind(digest,window+seconds,limit),feedbackChanged(db));
 }
 return statements;
}
function input(raw:Record<string,unknown>,fields:string[]){if(Object.keys(raw).some(k=>!fields.includes(k)))throw new FeedbackError(400,'Unexpected field');}
function operation(raw:Record<string,unknown>){if(!feedbackUUID.test(String(raw.operationId)))throw new FeedbackError(400,'Invalid operation');return String(raw.operationId);}
export async function feedbackWrite(db:D1Database,c:FeedbackContext,admin:boolean,id:string|null,action:string,raw:Record<string,unknown>){
 if(!id){
  input(raw,['operationId','kind','title','description']);const op=operation(raw);
  if(!['bug','feature'].includes(String(raw.kind)))throw new FeedbackError(400,'Choose bug report or feature request');
  const values={kind:String(raw.kind),title:feedbackText(raw.title,120),description:feedbackText(raw.description,5000,true)},hash=await feedbackHash(values);
  const replay=await db.prepare('SELECT id,creation_hash FROM feedback_requests WHERE owner_id=? AND creation_id=?').bind(c.userId,op).first<{id:string;creation_hash:string}>();
  if(replay){if(replay.creation_hash!==hash)throw new FeedbackError(409,'Operation content changed');return {requestId:replay.id};}
  const requestId=crypto.randomUUID(),limits=await rateStatements(db,c,'create');
  try{await db.batch([feedbackGuard(db,c,false),...limits,db.prepare('INSERT INTO feedback_requests(id,owner_id,creation_id,creation_hash,kind,title,description) VALUES (?,?,?,?,?,?,?)').bind(requestId,c.userId,op,hash,values.kind,values.title,values.description),db.prepare("INSERT INTO feedback_events(request_id,actor_id,actor_kind,kind,notification,operation_id,operation_hash) VALUES (?,?,'member','created','administrator',?,?)").bind(requestId,c.userId,op,hash)]);}
  catch{const found=await db.prepare('SELECT id,creation_hash FROM feedback_requests WHERE owner_id=? AND creation_id=?').bind(c.userId,op).first<{id:string;creation_hash:string}>();if(found?.creation_hash===hash)return {requestId:found.id};throw new FeedbackError(409,'State changed. Reload before trying again.');}
  return {requestId};
 }
 const old=await feedbackRequest(db,id,c,admin);
 const audience=admin?'administrator':'member';
 if(action==='read'){
  input(raw,['through']);const through=String(raw.through);
  if(!/^(0|[1-9][0-9]{0,18})$/.test(through)||BigInt(through)>9223372036854775807n)throw new FeedbackError(400,'Invalid read boundary');
  const max=await db.prepare('SELECT CAST(coalesce(max(sequence),0) AS TEXT) n FROM feedback_events WHERE request_id=?').bind(id).first<string>('n');
  if(BigInt(through)>BigInt(max!))throw new FeedbackError(400,'Invalid read boundary');
  await db.batch([feedbackGuard(db,c,admin),db.prepare(`INSERT INTO feedback_reads(request_id,user_id,audience,seen_sequence)
   SELECT ?,?,?,CAST(? AS INTEGER) WHERE EXISTS(SELECT 1 FROM feedback_requests f WHERE f.id=? AND ${visibleFeedback} ${admin?'':'AND f.owner_id=?'})
   ON CONFLICT(request_id,user_id,audience) DO UPDATE SET seen_sequence=max(seen_sequence,excluded.seen_sequence)`)
   .bind(id,c.userId,audience,through,id,...(admin?[]:[c.userId])),feedbackChanged(db)]);
  return {requestId:id};
 }
 const op=operation(raw),hash=await feedbackHash([action,raw]);
 const replay=await db.prepare('SELECT actor_id,operation_hash FROM feedback_events WHERE request_id=? AND operation_id=?').bind(id,op).first<{actor_id:string;operation_hash:string}>();
 if(replay){if(replay.actor_id!==c.userId||replay.operation_hash!==hash)throw new FeedbackError(409,'Operation content changed');return {requestId:id};}
 let eventKind='',notification='none',body:string|null=null,delta:object|null=null;
 const edits:D1PreparedStatement[]=[],limits:D1PreparedStatement[]=[];
 if(action==='replies'){
  input(raw,['operationId','body']);body=feedbackText(raw.body,2000,true);
  if(!admin&&closed(old.progress))throw new FeedbackError(409,'This request is read-only. An administrator can reopen it.');
  limits.push(...await rateStatements(db,c,'reply'));eventKind='reply';notification=admin?'member':'administrator';
 }else if(action==='triage'&&admin){
  input(raw,['operationId','revision','decision','progress']);
  if(!feedbackDecisions.includes(raw.decision as typeof feedbackDecisions[number])||!feedbackProgress.includes(raw.progress as typeof feedbackProgress[number]))throw new FeedbackError(400,'Invalid decision or progress');
  if(raw.decision===old.decision&&raw.progress===old.progress)throw new FeedbackError(400,'No changes to save');
  edits.push(db.prepare("UPDATE feedback_requests SET decision=?,progress=?,closed_at=CASE WHEN ? IN ('completed','closed') THEN coalesce(closed_at,unixepoch()) ELSE NULL END WHERE id=?").bind(String(raw.decision),String(raw.progress),String(raw.progress),id));
  eventKind='triage';notification='member';delta={decision:{before:old.decision,after:raw.decision},progress:{before:old.progress,after:raw.progress}};
 }else if(action==='github-link'&&admin){
  input(raw,['operationId','revision','url']);const number=githubIssueNumber(raw.url);
  if(number===old.github_number)throw new FeedbackError(400,'No changes to save');
  edits.push(db.prepare('UPDATE feedback_requests SET github_number=? WHERE id=?').bind(number,id));
  eventKind='github_link';delta={issue:{before:old.github_number,after:number}};
 }else throw new FeedbackError(404,'Not found');
 const revision=action==='replies'?old.revision:raw.revision;
 if(!Number.isSafeInteger(revision)||revision!==old.revision)throw new FeedbackError(409,'Request changed. Reload and review.');
 try{await db.batch([feedbackGuard(db,c,admin),...limits,db.prepare(`UPDATE feedback_requests AS f SET revision=revision+1,updated_at=unixepoch() WHERE id=? AND revision=? AND ${visibleFeedback} ${admin?'':'AND owner_id=? AND progress NOT IN (\'completed\',\'closed\')'}`).bind(id,Number(revision),...(admin?[]:[c.userId])),feedbackChanged(db),...edits,
  db.prepare('INSERT INTO feedback_events(request_id,actor_id,actor_kind,kind,notification,body,delta,operation_id,operation_hash) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,c.userId,admin?'administrator':'member',eventKind,notification,body,delta?JSON.stringify(delta):null,op,hash)]);}
 catch{const found=await db.prepare('SELECT actor_id,operation_hash FROM feedback_events WHERE request_id=? AND operation_id=?').bind(id,op).first<{actor_id:string;operation_hash:string}>();if(found?.actor_id===c.userId&&found.operation_hash===hash)return {requestId:id};throw new FeedbackError(409,'State changed. Reload and review before trying again.');}
 return {requestId:id};
}