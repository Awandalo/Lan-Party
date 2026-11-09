-- Rebuild the finalization parent and its referencing bill/history tables atomically.
-- Preserve all rows, locks and the payment audit sequence; allow zero-day closure.
CREATE TABLE event_finalizations_0036_saved AS SELECT * FROM event_finalizations;
CREATE TABLE event_bills_0036_saved AS SELECT * FROM event_bills;
CREATE TABLE event_bill_payment_activity_0036_saved AS SELECT * FROM event_bill_payment_activity;
CREATE TABLE event_payment_info_emails_0036_saved AS SELECT * FROM event_payment_info_emails;
CREATE TABLE payment_sequence_0036_saved AS SELECT name,seq FROM sqlite_sequence WHERE name='event_bill_payment_activity';
DROP TRIGGER event_finalization_immutable;
DROP TRIGGER event_finalization_no_delete;
DROP TRIGGER event_bill_immutable;
DROP TRIGGER event_bill_no_delete;
DROP TRIGGER event_bill_account_erased;
DROP TRIGGER finalized_event_locked;
DROP TRIGGER finalized_snapshot_locked;
DROP TRIGGER finalized_review_insert;
DROP TRIGGER finalized_review_update;
DROP TRIGGER finalized_instructions_insert;
DROP TRIGGER finalized_instructions_update;
DROP TRIGGER finalized_capacity_locked;
DROP TRIGGER event_rental_finalized_locked;
DROP TABLE event_payment_info_emails;
DROP TABLE event_bill_payment_activity;
DROP TABLE event_bills;
DROP TABLE event_finalizations;
CREATE TABLE event_finalizations (
 event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE RESTRICT,
 operation_id TEXT NOT NULL UNIQUE,
 actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 closed_at INTEGER NOT NULL,
 rental_cents INTEGER NOT NULL CHECK(rental_cents>=0),
 participant_days INTEGER NOT NULL CHECK(participant_days>=0),
 daily_rate_cents INTEGER NOT NULL CHECK(daily_rate_cents>=0 AND daily_rate_cents%50=0 AND (participant_days>0 OR daily_rate_cents=0)),
 payment_url TEXT NOT NULL,
 instructions TEXT NOT NULL
) STRICT;
INSERT INTO event_finalizations SELECT * FROM event_finalizations_0036_saved;
CREATE TABLE event_bills (
 id TEXT PRIMARY KEY,
 event_id TEXT NOT NULL REFERENCES event_finalizations(event_id) ON DELETE RESTRICT,
 owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 lines TEXT NOT NULL CHECK(json_valid(lines) AND json_type(lines)='array'),
 total_cents INTEGER NOT NULL CHECK(total_cents>=0),
 paid INTEGER NOT NULL DEFAULT 0 CHECK(paid IN (0,1)),
 UNIQUE(event_id,owner_id)
) STRICT;
INSERT INTO event_bills SELECT * FROM event_bills_0036_saved;
CREATE TABLE event_bill_payment_activity (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 operation_id TEXT NOT NULL UNIQUE,
 event_id TEXT NOT NULL REFERENCES event_finalizations(event_id) ON DELETE RESTRICT,
 bill_id TEXT NOT NULL REFERENCES event_bills(id) ON DELETE RESTRICT,
 actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 was_paid INTEGER NOT NULL CHECK(was_paid IN (0,1)),
 paid INTEGER NOT NULL CHECK(paid IN (0,1) AND paid<>was_paid),
 occurred_at INTEGER NOT NULL
) STRICT;
INSERT INTO event_bill_payment_activity SELECT * FROM event_bill_payment_activity_0036_saved;
CREATE TABLE event_payment_info_emails (
 bill_id TEXT NOT NULL REFERENCES event_bills(id) ON DELETE RESTRICT,
 recipient_key TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('sending','sent','failed','unknown')),
 attempt INTEGER NOT NULL CHECK(attempt>0),
 operation_id TEXT NOT NULL,
 provider_id TEXT,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(bill_id,recipient_key)
) STRICT;
INSERT INTO event_payment_info_emails SELECT * FROM event_payment_info_emails_0036_saved;
DELETE FROM sqlite_sequence WHERE name='event_bill_payment_activity';
INSERT INTO sqlite_sequence(name,seq) SELECT name,seq FROM payment_sequence_0036_saved;
CREATE INDEX event_bill_payment_activity_event ON event_bill_payment_activity(event_id,sequence);
CREATE TRIGGER event_finalization_immutable BEFORE UPDATE ON event_finalizations
WHEN NEW.event_id IS NOT OLD.event_id OR NEW.operation_id IS NOT OLD.operation_id
 OR NEW.closed_at IS NOT OLD.closed_at OR NEW.rental_cents IS NOT OLD.rental_cents
 OR NEW.participant_days IS NOT OLD.participant_days
 OR NEW.daily_rate_cents IS NOT OLD.daily_rate_cents OR NEW.payment_url IS NOT OLD.payment_url
 OR NEW.instructions IS NOT OLD.instructions OR (NEW.actor_id IS NOT OLD.actor_id AND NEW.actor_id IS NOT NULL)
BEGIN
 SELECT RAISE(ABORT,'Event finalization is permanent');
END;
CREATE TRIGGER event_finalization_no_delete BEFORE DELETE ON event_finalizations
BEGIN
 SELECT RAISE(ABORT,'Event finalization is permanent');
END;
CREATE TRIGGER event_bill_immutable BEFORE UPDATE ON event_bills
WHEN NEW.id IS NOT OLD.id OR NEW.event_id IS NOT OLD.event_id OR NEW.total_cents IS NOT OLD.total_cents
 OR ((NEW.owner_id IS NOT OLD.owner_id OR NEW.lines IS NOT OLD.lines)
 AND NOT (OLD.owner_id IS NOT NULL AND NEW.owner_id IS NULL AND NEW.lines='[]'))
BEGIN
 SELECT RAISE(ABORT,'Final bill is immutable');
END;
CREATE TRIGGER event_bill_no_delete BEFORE DELETE ON event_bills
BEGIN
 SELECT RAISE(ABORT,'Final bill is immutable');
END;
CREATE TRIGGER event_bill_account_erased BEFORE DELETE ON users
BEGIN
 UPDATE event_bills SET owner_id=NULL,lines='[]' WHERE owner_id=OLD.id;
END;
CREATE TRIGGER finalized_event_locked BEFORE UPDATE ON events
WHEN EXISTS(SELECT 1 FROM event_finalizations WHERE event_id=OLD.id)
 AND (NEW.title IS NOT OLD.title OR NEW.description IS NOT OLD.description
 OR NEW.publication_status IS NOT OLD.publication_status OR NEW.registration_status IS NOT OLD.registration_status
 OR NEW.location_id IS NOT OLD.location_id OR NEW.location_visibility IS NOT OLD.location_visibility)
BEGIN
 SELECT RAISE(ABORT,'Finalized event is locked');
END;
CREATE TRIGGER finalized_snapshot_locked BEFORE UPDATE ON event_management
WHEN EXISTS(SELECT 1 FROM event_finalizations WHERE event_id=OLD.event_id)
 AND (NEW.starts_at IS NOT OLD.starts_at OR NEW.ends_at IS NOT OLD.ends_at
 OR NEW.venue IS NOT OLD.venue OR NEW.rental_cents IS NOT OLD.rental_cents
 OR NEW.capacity IS NOT OLD.capacity OR NEW.max_guests IS NOT OLD.max_guests
 OR NEW.minimum_participants IS NOT OLD.minimum_participants OR NEW.is_listed IS NOT OLD.is_listed)
BEGIN
 SELECT RAISE(ABORT,'Finalized event is locked');
END;
CREATE TRIGGER finalized_review_insert BEFORE INSERT ON event_attendance_review
WHEN EXISTS(SELECT 1 FROM registrations r JOIN event_finalizations f ON f.event_id=r.event_id WHERE r.id=NEW.registration_id)
BEGIN
 SELECT RAISE(ABORT,'Finalized attendance is locked');
END;
CREATE TRIGGER finalized_review_update BEFORE UPDATE ON event_attendance_review
WHEN EXISTS(SELECT 1 FROM registrations r JOIN event_finalizations f ON f.event_id=r.event_id WHERE r.id=OLD.registration_id)
BEGIN
 SELECT RAISE(ABORT,'Finalized attendance is locked');
END;
CREATE TRIGGER finalized_instructions_insert BEFORE INSERT ON event_payment_instructions
WHEN EXISTS(SELECT 1 FROM event_finalizations WHERE event_id=NEW.event_id)
BEGIN
 SELECT RAISE(ABORT,'Finalized instructions are locked');
END;
CREATE TRIGGER finalized_instructions_update BEFORE UPDATE ON event_payment_instructions
WHEN EXISTS(SELECT 1 FROM event_finalizations WHERE event_id=OLD.event_id)
BEGIN
 SELECT RAISE(ABORT,'Finalized instructions are locked');
END;
CREATE TRIGGER finalized_capacity_locked BEFORE UPDATE OF capacity ON event_registration_control
WHEN NEW.capacity IS NOT OLD.capacity AND EXISTS(SELECT 1 FROM event_finalizations WHERE event_id=OLD.event_id)
BEGIN
 SELECT RAISE(ABORT,'Finalized capacity is locked');
END;
CREATE TRIGGER event_rental_finalized_locked BEFORE UPDATE OF rental_cents ON event_management
WHEN NEW.rental_cents IS NOT OLD.rental_cents
 AND EXISTS(SELECT 1 FROM event_finalizations WHERE event_id=OLD.event_id)
BEGIN
 SELECT RAISE(ABORT,'Finalized event is locked');
END;
CREATE TRIGGER event_finalization_empty_rate BEFORE INSERT ON event_finalizations
WHEN NEW.participant_days=0 AND NEW.daily_rate_cents<>0
BEGIN
 SELECT RAISE(ABORT,'An empty event has no daily price');
END;
DROP TABLE event_finalizations_0036_saved;
DROP TABLE event_bills_0036_saved;
DROP TABLE event_bill_payment_activity_0036_saved;
DROP TABLE event_payment_info_emails_0036_saved;
DROP TABLE payment_sequence_0036_saved;
