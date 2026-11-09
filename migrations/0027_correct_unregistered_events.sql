-- Retain registration history even if a future retention operation removes rows.
ALTER TABLE events ADD COLUMN registration_recorded INTEGER NOT NULL DEFAULT 0 CHECK(registration_recorded IN (0,1));
UPDATE events SET registration_recorded=1 WHERE EXISTS(SELECT 1 FROM registrations WHERE event_id=events.id);
CREATE TRIGGER event_registration_recorded AFTER INSERT ON registrations
BEGIN
 UPDATE events SET registration_recorded=1 WHERE id=NEW.event_id;
END;
CREATE TRIGGER event_registration_moved AFTER UPDATE OF event_id ON registrations
BEGIN
 UPDATE events SET registration_recorded=1 WHERE id=NEW.event_id;
END;
CREATE TRIGGER event_registration_history_permanent BEFORE UPDATE OF registration_recorded ON events
WHEN OLD.registration_recorded=1 AND NEW.registration_recorded<>1
BEGIN
 SELECT RAISE(ABORT,'Registration history cannot be cleared');
END;
CREATE TRIGGER event_registration_prevents_delete BEFORE DELETE ON events
WHEN OLD.registration_recorded=1 OR EXISTS(SELECT 1 FROM registrations WHERE event_id=OLD.id)
BEGIN
 SELECT RAISE(ABORT,'Registration history prevents event deletion');
END;

DROP TRIGGER event_days_locked_insert;
DROP TRIGGER event_days_locked_delete;
DROP TRIGGER event_days_locked_update;
CREATE TRIGGER event_days_locked_insert BEFORE INSERT ON event_days
WHEN EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id AND registration_recorded=1)
BEGIN
 SELECT RAISE(ABORT,'Event attendance days are locked after registration');
END;
CREATE TRIGGER event_days_locked_delete BEFORE DELETE ON event_days
WHEN EXISTS(SELECT 1 FROM events WHERE id=OLD.event_id AND registration_recorded=1)
BEGIN
 SELECT RAISE(ABORT,'Event attendance days are locked after registration');
END;
CREATE TRIGGER event_days_locked_update BEFORE UPDATE OF id,event_id,attendance_date ON event_days
WHEN EXISTS(SELECT 1 FROM events WHERE id=OLD.event_id AND registration_recorded=1)
 OR EXISTS(SELECT 1 FROM events WHERE id=NEW.event_id AND registration_recorded=1)
BEGIN
 SELECT RAISE(ABORT,'Event attendance days are locked after registration');
END;

ALTER TABLE event_management DROP COLUMN finance_enabled;
ALTER TABLE event_management ADD COLUMN minimum_participants INTEGER NOT NULL DEFAULT 1 CHECK(minimum_participants BETWEEN 1 AND 100000);

-- Deleting an eligible event retains its audit, identity and last recorded title.
CREATE TABLE event_activity_next (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 operation_id TEXT NOT NULL UNIQUE,
 occurred_at INTEGER NOT NULL CHECK(occurred_at>=0),
 actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
 event_reference TEXT NOT NULL,
 event_title TEXT NOT NULL,
 operation TEXT NOT NULL CHECK(operation IN ('event.create','event.update','event.duplicate','event.delete')),
 fields TEXT NOT NULL CHECK(json_valid(fields) AND json_type(fields)='array')
) STRICT;
INSERT INTO event_activity_next(sequence,operation_id,occurred_at,actor_id,event_id,event_reference,event_title,operation,fields)
 SELECT a.sequence,a.operation_id,a.occurred_at,a.actor_id,a.event_id,a.event_id,e.title,a.operation,a.fields
 FROM event_activity a JOIN events e ON e.id=a.event_id;
UPDATE sqlite_sequence SET seq=max(seq,coalesce((SELECT seq FROM sqlite_sequence WHERE name='event_activity'),0)) WHERE name='event_activity_next';
DELETE FROM sqlite_sequence WHERE name='event_activity_next' AND NOT EXISTS(SELECT 1 FROM sqlite_sequence WHERE name='event_activity');
DROP TABLE event_activity;
ALTER TABLE event_activity_next RENAME TO event_activity;
CREATE INDEX event_activity_event_idx ON event_activity(event_reference,sequence);
