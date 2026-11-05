CREATE TABLE event_finalizations (
 event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE RESTRICT,
 operation_id TEXT NOT NULL UNIQUE,
 actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 closed_at INTEGER NOT NULL,
 rental_cents INTEGER NOT NULL CHECK(rental_cents>=0),
 participant_days INTEGER NOT NULL CHECK(participant_days>0),
 daily_rate_cents INTEGER NOT NULL CHECK(daily_rate_cents>=0 AND daily_rate_cents%50=0),
 payment_url TEXT NOT NULL,
 instructions TEXT NOT NULL
) STRICT;
CREATE TABLE event_bills (
 id TEXT PRIMARY KEY,
 event_id TEXT NOT NULL REFERENCES event_finalizations(event_id) ON DELETE RESTRICT,
 owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 lines TEXT NOT NULL CHECK(json_valid(lines) AND json_type(lines)='array'),
 total_cents INTEGER NOT NULL CHECK(total_cents>=0),
 paid INTEGER NOT NULL DEFAULT 0 CHECK(paid IN (0,1)),
 UNIQUE(event_id,owner_id)
) STRICT;
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
