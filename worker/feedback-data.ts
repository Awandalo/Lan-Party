import {administratorPredicate} from './rbac-authority';
import {mfaSessionCondition} from './auth/mfa-session';
export const feedbackDecisions=['pending','yes','no','maybe'] as const;
export const feedbackProgress=['new','under_review','planned','in_progress','completed','closed'] as const;
export const feedbackUUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const visibleFeedback="(f.closed_at IS NULL OR f.closed_at>unixepoch()-2592000)";
export class FeedbackError extends Error {constructor(readonly status:number, message:string){super(message);}}
export interface FeedbackContext {userId:string;digest:string;admin:boolean;ip:string;secret:string}
export async function feedbackReady(db:D1Database){
 const row=await db.prepare(`SELECT
  (SELECT count(*) FROM sqlite_schema WHERE type='table' AND name IN ('feedback_requests','feedback_events','feedback_reads')) AS tables,
  (SELECT count(*) FROM sqlite_schema WHERE type='trigger' AND name IN ('feedback_request_identity','feedback_event_content','feedback_event_actor')) AS guards`).first<{tables:number;guards:number}>();
 if(row?.tables===0)return false;
 if(row?.tables!==3||row.guards!==3)throw new Error('Partial feedback schema');return true;
}
export async function purgeFeedback(db:D1Database,batches=1,ready=false){
 if(!ready&&!await feedbackReady(db))return;
 // Same daily DEV maintenance trigger, plus bounded cleanup on authenticated use.
 for(let i=0;i<batches;i++){const result=await db.prepare('DELETE FROM feedback_requests WHERE id IN (SELECT id FROM feedback_requests WHERE closed_at<=unixepoch()-2592000 ORDER BY closed_at LIMIT 500)').run();if(result.meta.changes<500)break;}
}
export function feedbackGuard(db:D1Database,c:FeedbackContext,admin:boolean){
 return db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM users u JOIN auth_sessions s ON s.user_id=u.id
 WHERE u.id=? AND s.token_digest=? AND u.status='active' AND u.email_verified_at IS NOT NULL
 AND u.auth_version=s.auth_version AND u.updated_at<=unixepoch() AND s.revoked_at IS NULL
 AND s.created_at<=unixepoch() AND s.expires_at>unixepoch() AND ${mfaSessionCondition}
 ${admin?'AND '+administratorPredicate():''}) THEN 1 ELSE json('feedback authorization changed') END`).bind(c.userId,c.digest);
}
export const feedbackChanged=(db:D1Database)=>db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('feedback state changed') END");
function canonical(value:unknown,depth=0):unknown {if(depth>8)throw new FeedbackError(400,'Invalid input nesting');return Array.isArray(value)?value.map(v=>canonical(v,depth+1)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v,depth+1)])):value;}
export async function feedbackHash(value:unknown){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(value))));return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');}
export function feedbackText(value:unknown,max:number,multiline=false){
 if(typeof value!=='string')throw new FeedbackError(400,'Invalid text');const text=value.trim();
 if(!text||[...text].length>max||new TextEncoder().encode(text).length>max*4|| (multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/).test(text))throw new FeedbackError(400,'Invalid text');return text;
}
export function githubIssueNumber(value:unknown){
 if(value===null||value==='')return null;
 if(typeof value!=='string')throw new FeedbackError(400,'Use the LAN Party GitHub issue URL');
 const m=/^https:\/\/github\.com\/Awandalo\/Lan-Party\/issues\/([1-9][0-9]{0,9})$/.exec(value);
 if(!m||Number(m[1])>2147483647)throw new FeedbackError(400,'Use the LAN Party GitHub issue URL');return Number(m[1]);
}
export async function feedbackRequest(db:D1Database,id:string,c:FeedbackContext,admin:boolean){
 const row=await db.prepare(`SELECT f.*,n.nickname,CAST(m.member_number AS TEXT) AS member_number FROM feedback_requests f
 LEFT JOIN user_nicknames n ON n.user_id=f.owner_id LEFT JOIN member_numbers m ON m.user_id=f.owner_id
 WHERE f.id=? AND ${visibleFeedback} ${admin?'':'AND f.owner_id=?'}`).bind(id,...(admin?[]:[c.userId])).first<Record<string,unknown>>();
 if(!row)throw new FeedbackError(404,'Request not found');return row;
}
export function feedbackSummary(row:Record<string,unknown>){
 return {id:row.id,kind:row.kind,title:row.title,decision:row.decision,progress:row.progress,revision:row.revision,githubNumber:row.github_number,closedAt:row.closed_at,createdAt:row.created_at,updatedAt:row.updated_at,unread:!!row.unread,...(row.nickname!==undefined?{nickname:row.nickname,memberNumber:row.member_number}: {})};
}
