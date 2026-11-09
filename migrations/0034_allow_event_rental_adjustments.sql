-- Rental belongs to the event after copying; venue and capacity remain snapshots.
DROP TRIGGER event_snapshot_immutable;
CREATE TRIGGER event_snapshot_immutable BEFORE UPDATE OF venue,capacity ON event_management
WHEN NEW.venue IS NOT OLD.venue OR NEW.capacity IS NOT OLD.capacity
BEGIN
 SELECT RAISE(ABORT,'The event venue snapshot is immutable');
END;
CREATE TRIGGER event_rental_finalized_locked BEFORE UPDATE OF rental_cents ON event_management
WHEN NEW.rental_cents IS NOT OLD.rental_cents
 AND EXISTS(SELECT 1 FROM event_finalizations WHERE event_id=OLD.event_id)
BEGIN
 SELECT RAISE(ABORT,'Finalized event is locked');
END;
