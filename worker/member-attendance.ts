import type {MemberAttendanceHistory} from '../src/lib/members';

// Read finalized member days only. Registration intentions and guests are not attendance.
export async function memberAttendance(db:D1Database,userId:string):Promise<MemberAttendanceHistory>{
 const ready=await db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type='table' AND name IN ('event_finalizations','event_bills','event_management')").first<number>('n');
 if(ready!==3)return {available:false,events:[],hasMore:false};
 const qualifications=!!await db.prepare("SELECT 1 FROM pragma_table_info('event_management') WHERE name='achievements_enabled'").first();
 const rows=(await db.prepare(`SELECT e.id,e.title,json_extract(m.venue,'$.name') AS venue,
 ${qualifications?'m.achievements_enabled':'0'} AS achievementsEnabled,json_group_array(DISTINCT day.value) AS days
 FROM event_bills b JOIN event_finalizations f ON f.event_id=b.event_id
 JOIN events e ON e.id=f.event_id JOIN event_management m ON m.event_id=e.id
 JOIN json_each(b.lines) line JOIN json_each(line.value,'$.days') day
 WHERE b.owner_id=? AND json_extract(line.value,'$.kind')='Member'
 AND m.ends_at<=unixepoch() AND f.closed_at<=unixepoch()
 AND e.publication_status IN ('published','archived')
 GROUP BY e.id ORDER BY m.starts_at DESC,e.id LIMIT 101`).bind(userId).all<{id:string;title:string;venue:string|null;achievementsEnabled:number;days:string}>()).results;
 return {available:true,hasMore:rows.length>100,events:rows.slice(0,100).map(row=>({...row,achievementsEnabled:row.achievementsEnabled===1,days:(JSON.parse(row.days) as string[]).sort()}))};
}
