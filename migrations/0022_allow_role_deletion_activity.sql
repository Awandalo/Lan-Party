-- Phase 4.5 custom-role deletion. Execute as one migration transaction.
-- Rebuild only the audit operation CHECK; retain every historical value and ID.
CREATE TABLE role_activity_sequence_backup AS SELECT seq FROM sqlite_sequence WHERE name='role_activity';
CREATE TABLE role_activity_next (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 operation_id TEXT NOT NULL UNIQUE,
 occurred_at INTEGER NOT NULL CHECK(occurred_at>=0),
 actor_id TEXT NOT NULL,
 operation TEXT NOT NULL CHECK(operation IN ('role.create','role.update','role.delete','membership.add','membership.remove')),
 role_id TEXT NOT NULL,
 account_id TEXT,
 delta TEXT NOT NULL CHECK(json_valid(delta)),
 revision INTEGER NOT NULL UNIQUE CHECK(revision>0)
) STRICT;
INSERT INTO role_activity_next SELECT * FROM role_activity ORDER BY sequence;
DROP TABLE role_activity;
ALTER TABLE role_activity_next RENAME TO role_activity;
UPDATE sqlite_sequence SET seq=max(seq,coalesce((SELECT seq FROM role_activity_sequence_backup),0)) WHERE name='role_activity';
DROP TABLE role_activity_sequence_backup;
CREATE TRIGGER role_activity_no_update BEFORE UPDATE ON role_activity BEGIN
 SELECT RAISE(ABORT,'Role activity is append-only');
END;
CREATE TRIGGER role_activity_no_delete BEFORE DELETE ON role_activity BEGIN
 SELECT RAISE(ABORT,'Role activity is append-only');
END;
CREATE TRIGGER role_activity_no_replace BEFORE INSERT ON role_activity
WHEN EXISTS(SELECT 1 FROM role_activity WHERE operation_id=NEW.operation_id OR sequence=NEW.sequence OR revision=NEW.revision)
BEGIN
 SELECT RAISE(ABORT,'Role activity is append-only');
END;
