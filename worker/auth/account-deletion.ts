import {assertChanged,requireLifecycleProof,lastAdministratorSql,LastAdministrator,eraseLifecycleOperations} from './account-lifecycle';

// This service is deliberately NOT routed: retention/restore approval is outstanding.
export async function deleteAccount(db:D1Database,userId:string,version:number,digest:string){
 const guard=await requireLifecycleProof(db,userId,version,digest);
 if(!await db.prepare(`SELECT 1 FROM users u WHERE u.id=? AND ${lastAdministratorSql}`).bind(userId).first())throw new LastAdministrator();
 const completed=`e.publication_status IN ('published','archived')
 AND EXISTS(SELECT 1 FROM event_days d WHERE d.event_id=e.id AND d.status='scheduled')
 AND (SELECT max(d.ends_at) FROM event_days d WHERE d.event_id=e.id AND d.status='scheduled')<=unixepoch()`;
 await db.batch([
 db.prepare(`INSERT INTO account_lifecycle(user_id,state,deactivated_at) SELECT u.id,'deleting',unixepoch()
 FROM users u WHERE u.id=? AND ${lastAdministratorSql} AND ${guard.sql}`).bind(userId,...guard.values),assertChanged(db),
 db.prepare("UPDATE users SET status='disabled',updated_at=max(updated_at,unixepoch()) WHERE id=? AND status='active'").bind(userId),assertChanged(db),
 db.prepare(`INSERT INTO anonymous_event_registrations(event_id,total)
 SELECT e.id,count(DISTINCT r.id) FROM registrations r JOIN events e ON e.id=r.event_id
 JOIN registration_days rd ON rd.registration_id=r.id AND rd.event_id=r.event_id
 WHERE r.user_id=? AND r.status='registered' AND ${completed} GROUP BY e.id
 ON CONFLICT(event_id) DO UPDATE SET total=total+excluded.total`).bind(userId),
 db.prepare(`INSERT INTO anonymous_day_registrations(event_day_id,event_id,total)
 SELECT rd.event_day_id,e.id,count(DISTINCT r.id) FROM registrations r JOIN events e ON e.id=r.event_id
 JOIN registration_days rd ON rd.registration_id=r.id AND rd.event_id=r.event_id
 WHERE r.user_id=? AND r.status='registered' AND ${completed} GROUP BY rd.event_day_id,e.id
 ON CONFLICT(event_day_id) DO UPDATE SET total=total+excluded.total`).bind(userId),
 db.prepare("DELETE FROM registration_days WHERE registration_id IN (SELECT id FROM registrations WHERE user_id=?)").bind(userId),
 db.prepare("DELETE FROM registrations WHERE user_id=?").bind(userId),
 db.prepare("UPDATE news_articles SET author_user_id=NULL WHERE author_user_id=?").bind(userId),
 db.prepare("UPDATE news_articles SET updated_by_user_id=NULL WHERE updated_by_user_id=?").bind(userId),
 db.prepare("UPDATE user_roles SET assigned_by_user_id=NULL WHERE assigned_by_user_id=?").bind(userId),
 db.prepare("DELETE FROM user_roles WHERE user_id=?").bind(userId),
 db.prepare("UPDATE member_numbers SET retired=1,user_id=NULL,reserved_by_user_id=NULL WHERE user_id=?").bind(userId),
 db.prepare("UPDATE member_numbers SET reserved_by_user_id=NULL WHERE reserved_by_user_id=?").bind(userId),
 ...eraseLifecycleOperations(db,userId),
 ...['auth_session_mfa','auth_mfa_recovery_codes','auth_totp_factors','auth_action_tokens','auth_sessions',
 'user_password_credentials','user_nicknames','account_lifecycle'].map(table=>db.prepare('DELETE FROM '+table+' WHERE user_id=?').bind(userId)),
 db.prepare("DELETE FROM users WHERE id=? AND status='disabled'").bind(userId),assertChanged(db),
 ]);
}
// Count live registrations once, then add the aggregate; never join aggregate counts to day rows.
export async function registrationTotals(db:D1Database,eventId:string){
 const event=await db.prepare(`SELECT
 (SELECT count(DISTINCT r.id) FROM registrations r JOIN registration_days d ON d.registration_id=r.id AND d.event_id=r.event_id
 WHERE r.event_id=? AND r.status='registered')+
 COALESCE((SELECT total FROM anonymous_event_registrations WHERE event_id=?),0) AS registrations`).bind(eventId,eventId).first<number>('registrations');
 const days=await db.prepare(`SELECT e.id AS eventDayId,
 (SELECT count(DISTINCT r.id) FROM registrations r JOIN registration_days d ON d.registration_id=r.id AND d.event_id=r.event_id
 WHERE d.event_day_id=e.id AND r.status='registered')+COALESCE(a.total,0) AS registrations
 FROM event_days e LEFT JOIN anonymous_day_registrations a ON a.event_day_id=e.id AND a.event_id=e.event_id
 WHERE e.event_id=? ORDER BY e.id`).bind(eventId).all();
 return {registrations:event,days:days.results};
}
