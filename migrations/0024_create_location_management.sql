-- Forward-only candidate. Remote execution requires separate DEV approval.
-- Rebuild only locations to allow incomplete templates; preserve IDs/references.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE locations_next (
 id TEXT NOT NULL PRIMARY KEY,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 address_line TEXT CHECK(address_line IS NULL OR length(trim(address_line)) BETWEEN 1 AND 200),
 postal_code TEXT CHECK(postal_code IS NULL OR length(trim(postal_code)) BETWEEN 1 AND 30),
 city TEXT CHECK(city IS NULL OR length(trim(city)) BETWEEN 1 AND 100),
 country_code TEXT CHECK(country_code IS NULL OR country_code GLOB '[A-Z][A-Z]'),
 public_description TEXT,
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
 created_at INTEGER NOT NULL CHECK(created_at>=0),
 updated_at INTEGER NOT NULL CHECK(updated_at>=created_at),
 capacity INTEGER CHECK(capacity IS NULL OR capacity BETWEEN 1 AND 100000),
 default_rental_cents INTEGER NOT NULL DEFAULT 0 CHECK(default_rental_cents BETWEEN 0 AND 100000000),
 directions_url TEXT,
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0)
) STRICT;
INSERT INTO locations_next(id,name,address_line,postal_code,city,country_code,public_description,is_active,created_at,updated_at)
 SELECT id,name,address_line,postal_code,city,country_code,public_description,is_active,created_at,updated_at FROM locations;
DROP TABLE locations;
ALTER TABLE locations_next RENAME TO locations;
CREATE TABLE location_activity (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 operation_id TEXT NOT NULL UNIQUE,
 occurred_at INTEGER NOT NULL CHECK(occurred_at>=0),
 actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
 operation TEXT NOT NULL CHECK(operation IN ('location.create','location.update','location.archive','location.restore')),
 fields TEXT NOT NULL CHECK(json_valid(fields))
) STRICT;
CREATE INDEX location_activity_location_idx ON location_activity(location_id,sequence);
-- Retain action/field names rather than historical addresses or instructions.
CREATE TRIGGER location_activity_no_replace BEFORE INSERT ON location_activity
WHEN EXISTS(SELECT 1 FROM location_activity WHERE operation_id=NEW.operation_id OR sequence=NEW.sequence)
BEGIN
 SELECT RAISE(ABORT,'Location operation already recorded');
END;
PRAGMA defer_foreign_keys = OFF;
