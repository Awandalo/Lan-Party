import {RoleInvalid} from './role-administration';

export const userEvents=['account.created','account.deleted','account.deactivated','account.activated','invitation.prepared','invitation.accepted','invitation.unconfirmed','invitation.cancelled'] as const;
export async function readUserActivity(db:D1Database,url:URL){
 const params=url.searchParams;
 if([...params.keys()].some(key=>!['before','date','event','search'].includes(key)||params.getAll(key).length!==1))throw new RoleInvalid();
 const before=params.get('before'),date=params.get('date')??'',event=params.get('event')??'',search=params.get('search')??'';
 if(before!==null&&(!/^[1-9][0-9]{0,18}$/.test(before)||BigInt(before)>9223372036854775807n))throw new RoleInvalid();
 if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date))throw new RoleInvalid();
 if(event&&!userEvents.includes(event as typeof userEvents[number])||search.length>80||/[\u0000-\u001f\u007f]/.test(search))throw new RoleInvalid();
 const start=date?Date.parse(date+'T00:00:00Z')/1000:0;
 // Anonymized rows must not acquire identity through joins or search, even if a
 // malformed old record contains a reference. Deleted groups stay unlinked.
 const projection=`SELECT CAST(a.sequence AS TEXT) AS sequence,a.occurred_at AS occurredAt,a.event,a.actor_kind AS actorKind,
 a.actor_kind='anonymous' AS dateOnly,
 CASE WHEN a.actor_kind<>'anonymous' THEN a.actor_id END AS actorId,
 CASE WHEN a.actor_kind<>'anonymous' THEN a.target_id END AS targetId,
 CASE WHEN a.actor_kind<>'anonymous' THEN a.operation_id END AS operationId,
 an.nickname AS actorName,tn.nickname AS targetName
 FROM user_activity a
 LEFT JOIN users au ON a.actor_kind<>'anonymous' AND au.id=a.actor_id AND au.status='active' AND NOT EXISTS(SELECT 1 FROM account_lifecycle WHERE user_id=au.id)
 LEFT JOIN user_nicknames an ON an.user_id=au.id
 LEFT JOIN users tu ON a.actor_kind<>'anonymous' AND tu.id=a.target_id AND tu.status='active' AND NOT EXISTS(SELECT 1 FROM account_lifecycle WHERE user_id=tu.id)
 LEFT JOIN user_nicknames tn ON tn.user_id=tu.id
 WHERE a.occurred_at>CAST(strftime('%s','now','-2 years') AS INTEGER)
 AND a.sequence<CAST(? AS INTEGER) AND (?='' OR a.occurred_at>=? AND a.occurred_at<?) AND (?='' OR a.event=?)`;
 const rows=(await db.prepare(`WITH visible AS (${projection}) SELECT * FROM visible
 WHERE ?='' OR instr(lower(event||' '||coalesce(actorId,'')||' '||coalesce(targetId,'')||' '||coalesce(operationId,'')||' '||coalesce(actorName,'')||' '||coalesce(targetName,'')),lower(?))>0
 ORDER BY CAST(sequence AS INTEGER) DESC LIMIT 21`).bind(before??'9223372036854775807',date,start,start+86400,event,event,search,search).all()).results;
 return {entries:rows.slice(0,20),nextBefore:rows.length>20?String(rows[19].sequence):null};
}
