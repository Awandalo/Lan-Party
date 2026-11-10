import {achievementAwards,highestAchievement} from '../src/lib/achievements';
import type {AchievementFact} from '../src/lib/achievements';
export async function achievementsReady(db:D1Database){return !!await db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='member_achievement_showcase'").first();}
async function achievementFacts(db:D1Database,userIds:string[]){
 // One bounded query for the roster. Missing attendance must remain in the
 // sequence to break streaks. Only the owner's Member line contributes days.
 const rows=(await db.prepare(`SELECT ids.value AS userId,f.event_id AS eventId,m.starts_at AS startsAt,max(f.closed_at,m.ends_at) AS completedAt,
 coalesce((SELECT json_extract(line.value,'$.days') FROM event_bills b,json_each(b.lines) line WHERE b.event_id=f.event_id AND b.owner_id=ids.value AND json_extract(line.value,'$.kind')='Member' LIMIT 1),'[]') AS days,
 (SELECT json_group_array(d.attendance_date) FROM event_days d WHERE d.event_id=f.event_id AND d.status='scheduled') AS eventDays
 FROM event_finalizations f JOIN event_management m ON m.event_id=f.event_id JOIN events e ON e.id=f.event_id CROSS JOIN json_each(?) ids
 WHERE m.achievements_enabled=1 AND m.ends_at<=unixepoch() AND f.closed_at<=unixepoch() AND e.publication_status='published'
 ORDER BY m.starts_at,f.event_id`).bind(JSON.stringify([...new Set(userIds)])).all<{userId:string;eventId:string;startsAt:number;completedAt:number;days:string;eventDays:string}>()).results;
 const facts=new Map<string,AchievementFact[]>();for(const row of rows){const list=facts.get(row.userId)??[];list.push({...row,days:JSON.parse(row.days),eventDays:JSON.parse(row.eventDays)});facts.set(row.userId,list);}return facts;
}
export async function memberAchievements(db:D1Database,userId:string){return achievementAwards((await achievementFacts(db,[userId])).get(userId)??[]);}
export async function memberAchievementRanks(db:D1Database,userIds:string[]){const facts=await achievementFacts(db,userIds);return new Map([...facts].map(([id,events])=>{const awards=achievementAwards(events);return [id,{rankCode:highestAchievement(awards)?.code??null,earned:new Set(awards.filter(a=>a.unlocked).map(a=>a.code as string))}] as const;}));}
