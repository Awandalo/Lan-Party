-- Additive rollout: legacy events remain readable but are not silently adopted.
ALTER TABLE event_days ADD COLUMN capacity INTEGER CHECK(capacity BETWEEN 1 AND 100000);

CREATE TABLE event_management (
 event_id TEXT NOT NULL PRIMARY KEY REFERENCES events(id) ON DELETE RESTRICT,
 creator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 starts_at INTEGER NOT NULL CHECK(starts_at>=0),
 ends_at INTEGER NOT NULL CHECK(ends_at>starts_at),
 venue TEXT NOT NULL CHECK(json_valid(venue) AND json_type(venue)='object'),
 finance_enabled INTEGER NOT NULL DEFAULT 0 CHECK(finance_enabled IN (0,1)),
 rental_cents INTEGER NOT NULL DEFAULT 0 CHECK(rental_cents BETWEEN 0 AND 100000000),
 guests_enabled INTEGER NOT NULL DEFAULT 0 CHECK(guests_enabled IN (0,1)),
 max_guests INTEGER NOT NULL DEFAULT 0 CHECK(max_guests BETWEEN 0 AND 20),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0)
) STRICT;

CREATE TABLE event_activity (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 operation_id TEXT NOT NULL UNIQUE,
 occurred_at INTEGER NOT NULL CHECK(occurred_at>=0),
 actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
 operation TEXT NOT NULL CHECK(operation IN ('event.create','event.update','event.duplicate')),
 fields TEXT NOT NULL CHECK(json_valid(fields) AND json_type(fields)='array')
) STRICT;
CREATE INDEX event_activity_event_idx ON event_activity(event_id,sequence);

-- Insert days before the management record, in the same atomic creation batch.
CREATE TRIGGER event_days_locked_insert BEFORE INSERT ON event_days
WHEN EXISTS(SELECT 1 FROM event_management WHERE event_id=NEW.event_id)
BEGIN
 SELECT RAISE(ABORT,'Event attendance days are locked');
END;
CREATE TRIGGER event_days_locked_delete BEFORE DELETE ON event_days
WHEN EXISTS(SELECT 1 FROM event_management WHERE event_id=OLD.event_id)
BEGIN
 SELECT RAISE(ABORT,'Event attendance days are locked');
END;
CREATE TRIGGER event_days_locked_update BEFORE UPDATE OF id,event_id,attendance_date ON event_days
WHEN EXISTS(SELECT 1 FROM event_management WHERE event_id=OLD.event_id)
BEGIN
 SELECT RAISE(ABORT,'Event attendance days are locked');
END;
