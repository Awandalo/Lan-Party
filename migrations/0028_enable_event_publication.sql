-- Existing Drafts remain private. Unpublishing retains the published lifecycle.
ALTER TABLE event_management ADD COLUMN is_listed INTEGER NOT NULL DEFAULT 0 CHECK(is_listed IN (0,1));

CREATE TABLE event_activity_next (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 operation_id TEXT NOT NULL UNIQUE,
 occurred_at INTEGER NOT NULL CHECK(occurred_at>=0),
 actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
 event_reference TEXT NOT NULL,
 event_title TEXT NOT NULL,
 operation TEXT NOT NULL CHECK(operation IN ('event.create','event.update','event.duplicate','event.delete','event.publish','event.unpublish','event.cancel')),
 fields TEXT NOT NULL CHECK(json_valid(fields) AND json_type(fields)='array')
) STRICT;
INSERT INTO event_activity_next SELECT * FROM event_activity;
UPDATE sqlite_sequence SET seq=max(seq,coalesce((SELECT seq FROM sqlite_sequence WHERE name='event_activity'),0)) WHERE name='event_activity_next';
DELETE FROM sqlite_sequence WHERE name='event_activity_next' AND NOT EXISTS(SELECT 1 FROM sqlite_sequence WHERE name='event_activity');
DROP TABLE event_activity;
ALTER TABLE event_activity_next RENAME TO event_activity;
CREATE INDEX event_activity_event_idx ON event_activity(event_reference,sequence);
