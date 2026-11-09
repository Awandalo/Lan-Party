-- Preserve applied history and all existing IDs/dates. Refuse lossy conversion.
CREATE TABLE event_capacity_guard (valid INTEGER NOT NULL CHECK(valid=1)) STRICT;
INSERT INTO event_capacity_guard(valid)
SELECT CASE WHEN EXISTS(
 SELECT 1 FROM event_management m LEFT JOIN event_days d ON d.event_id=m.event_id
 GROUP BY m.event_id HAVING count(d.id)=0 OR count(d.capacity)<>count(d.id)
 OR min(d.capacity)<>max(d.capacity)
) OR EXISTS(SELECT 1 FROM event_days d LEFT JOIN event_management m ON m.event_id=d.event_id
 WHERE m.event_id IS NULL AND d.capacity IS NOT NULL) THEN 0 ELSE 1 END;
DROP TABLE event_capacity_guard;

ALTER TABLE event_management ADD COLUMN capacity INTEGER CHECK(capacity BETWEEN 1 AND 100000);
UPDATE event_management SET capacity=(SELECT min(capacity) FROM event_days WHERE event_id=event_management.event_id);
ALTER TABLE event_days DROP COLUMN capacity;
ALTER TABLE event_management DROP COLUMN guests_enabled;
-- The consistent member-invited rule has no per-event off state.
UPDATE event_management SET max_guests=1 WHERE max_guests=0;

CREATE TRIGGER event_snapshot_required BEFORE INSERT ON event_management
WHEN NEW.capacity IS NULL OR NEW.max_guests<1
BEGIN
 SELECT RAISE(ABORT,'A complete venue capacity snapshot is required');
END;
CREATE TRIGGER event_guest_limit_required BEFORE UPDATE OF max_guests ON event_management
WHEN NEW.max_guests<1
BEGIN
 SELECT RAISE(ABORT,'Member-invited guests require a positive limit');
END;
CREATE TRIGGER event_snapshot_immutable BEFORE UPDATE OF venue,capacity,rental_cents ON event_management
WHEN NEW.venue IS NOT OLD.venue OR NEW.capacity IS NOT OLD.capacity OR NEW.rental_cents IS NOT OLD.rental_cents
BEGIN
 SELECT RAISE(ABORT,'The event venue snapshot is immutable');
END;
