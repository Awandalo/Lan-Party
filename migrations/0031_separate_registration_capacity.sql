-- Keep the original venue capacity snapshot immutable. NULL uses that snapshot
-- until an organizer explicitly changes the operational registration limit.
ALTER TABLE event_registration_control ADD COLUMN capacity INTEGER
 CHECK(capacity IS NULL OR capacity BETWEEN 1 AND 100000);
