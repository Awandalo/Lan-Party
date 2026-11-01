// No read API in Phase 4.4; Administrator-only viewing belongs to #30.
export async function userActivityReady(db:D1Database) {
 return await db.prepare("SELECT count(*) n FROM sqlite_schema WHERE name IN ('user_activity','lifecycle_commands','user_activity_created','user_activity_deleted','user_activity_deactivated','user_activity_activated','account_reactivation_operation_identity')").first<number>('n')===7;
}
export function userEvent(db:D1Database,event:string,actor:string|null,target:string,operation:string|null,kind='administrator') {
 return db.prepare('INSERT INTO user_activity(event,actor_kind,actor_id,target_id,operation_id) VALUES (?,?,?,?,?)').bind(event,kind,actor,target,operation);
}
export async function purgeUserActivity(db:D1Database) {
 if(!await userActivityReady(db))throw Error('Lifecycle maintenance requires migration 0021');
 // Calendar years, not an assumed 730 days. Daily execution bounds expiry lag.
 return db.batch([
  db.prepare("DELETE FROM user_activity WHERE occurred_at<=CAST(strftime('%s','now','-2 years') AS INTEGER)"),
  db.prepare('DELETE FROM lifecycle_commands WHERE created_at<=unixepoch()-86400'),
  db.prepare("DELETE FROM account_reactivation WHERE expires_at<=unixepoch() OR phase='cancelled'"),
 ]);
}
