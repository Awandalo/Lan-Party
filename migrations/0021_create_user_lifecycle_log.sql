-- Phase 4.4. Additive; apply to DEV only after separate owner approval.
ALTER TABLE account_lifecycle ADD COLUMN origin TEXT NOT NULL DEFAULT 'voluntary' CHECK(origin IN ('voluntary','administrator'));
ALTER TABLE account_lifecycle ADD COLUMN disabled_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE account_reactivation ADD COLUMN operation_id TEXT;
CREATE TABLE lifecycle_commands (
 operation_id TEXT PRIMARY KEY NOT NULL,
 actor_id TEXT NOT NULL,
 target_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('invite','disable','cancel')),
 target_version INTEGER NOT NULL,
 issued_at INTEGER NOT NULL,
 invitation_id TEXT,
 outcome TEXT NOT NULL CHECK(outcome IN ('pending','accepted','unconfirmed','disabled','cancelled','completed','superseded')),
 created_at INTEGER NOT NULL DEFAULT(unixepoch())
) STRICT;
CREATE INDEX lifecycle_commands_expiry ON lifecycle_commands(created_at);
CREATE TABLE user_activity (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 occurred_at INTEGER NOT NULL DEFAULT(unixepoch()),
 event TEXT NOT NULL CHECK(event IN ('account.created','account.deleted','account.deactivated','account.activated','invitation.prepared','invitation.accepted','invitation.unconfirmed','invitation.cancelled')),
 actor_kind TEXT NOT NULL CHECK(actor_kind IN ('account','administrator','system','anonymous')),
 actor_id TEXT,
 target_id TEXT,
 operation_id TEXT
) STRICT;
CREATE INDEX user_activity_retention ON user_activity(occurred_at);
CREATE TRIGGER user_activity_created AFTER INSERT ON users
BEGIN
 INSERT INTO user_activity(event,actor_kind,target_id) VALUES ('account.created','system',NEW.id);
END;
CREATE TRIGGER user_activity_deactivated AFTER INSERT ON account_lifecycle WHEN NEW.state='deactivated'
BEGIN
 INSERT INTO user_activity(event,actor_kind,actor_id,target_id) VALUES ('account.deactivated',CASE WHEN NEW.origin='administrator' THEN 'administrator' ELSE 'account' END,COALESCE(NEW.disabled_by,NEW.user_id),NEW.user_id);
END;
CREATE TRIGGER user_activity_activated AFTER UPDATE OF status ON users WHEN OLD.status='disabled' AND NEW.status='active' AND EXISTS(SELECT 1 FROM account_lifecycle WHERE user_id=NEW.id)
BEGIN
 INSERT INTO user_activity(event,actor_kind,actor_id,target_id,operation_id) VALUES ('account.activated','account',NEW.id,NEW.id,(SELECT operation_id FROM account_reactivation WHERE user_id=NEW.id AND phase='complete'));
 UPDATE lifecycle_commands SET outcome='completed' WHERE operation_id IN (SELECT operation_id FROM account_reactivation WHERE user_id=NEW.id AND phase='complete');
END;
CREATE TRIGGER user_activity_deleted AFTER DELETE ON users
BEGIN
 UPDATE user_activity SET actor_id=NULL,target_id=NULL,operation_id=NULL,actor_kind='anonymous',occurred_at=(occurred_at/86400)*86400
 WHERE actor_id=OLD.id OR target_id=OLD.id OR operation_id IN (SELECT operation_id FROM user_activity WHERE actor_id=OLD.id OR target_id=OLD.id) OR operation_id IN (SELECT operation_id FROM lifecycle_commands WHERE actor_id=OLD.id OR target_id=OLD.id);
 DELETE FROM lifecycle_commands WHERE actor_id=OLD.id OR target_id=OLD.id;
 INSERT INTO user_activity(event,actor_kind,occurred_at) VALUES ('account.deleted','anonymous',(unixepoch()/86400)*86400);
END;
CREATE TRIGGER account_reactivation_operation_identity BEFORE UPDATE OF operation_id ON account_reactivation
BEGIN
 SELECT RAISE(ABORT,'Reactivation operation identity is immutable');
END;
