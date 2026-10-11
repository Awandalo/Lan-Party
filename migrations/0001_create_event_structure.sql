-- IDs are application-generated UUIDs. All instant timestamps use UTC Unix seconds.
-- Mutable records require callers to supply created_at and maintain updated_at.
CREATE TABLE locations (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  address_line TEXT NOT NULL CHECK (length(trim(address_line)) > 0),
  postal_code TEXT NOT NULL CHECK (length(trim(postal_code)) > 0),
  city TEXT NOT NULL CHECK (length(trim(city)) > 0),
  country_code TEXT NOT NULL CHECK (country_code GLOB '[A-Z][A-Z]'),
  public_description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
) STRICT;

CREATE TABLE events (
  id TEXT NOT NULL PRIMARY KEY,
  location_id TEXT,
  slug TEXT NOT NULL UNIQUE CHECK (length(trim(slug)) > 0),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/Amsterdam' CHECK (length(trim(timezone)) > 0),
  publication_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (publication_status IN ('draft', 'published', 'archived', 'cancelled')),
  registration_status TEXT NOT NULL DEFAULT 'closed'
    CHECK (registration_status IN ('closed', 'open')),
  registration_opens_at INTEGER CHECK (registration_opens_at >= 0),
  registration_closes_at INTEGER CHECK (registration_closes_at >= 0),
  location_visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (location_visibility IN ('public', 'authenticated')),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
  CHECK (registration_opens_at IS NULL OR registration_closes_at IS NULL
    OR registration_closes_at > registration_opens_at),
  -- Drafts may lack a location; published events require an existing location.
  CHECK (publication_status <> 'published' OR location_id IS NOT NULL),
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) STRICT;

CREATE INDEX events_location_id_idx ON events(location_id);
CREATE INDEX events_publication_status_idx ON events(publication_status);

CREATE TABLE event_days (
  id TEXT NOT NULL PRIMARY KEY,
  event_id TEXT NOT NULL,
  attendance_date TEXT NOT NULL CHECK (
    attendance_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND date(attendance_date, '+0 days') IS attendance_date
  ),
  label TEXT,
  starts_at INTEGER NOT NULL CHECK (starts_at >= 0),
  ends_at INTEGER NOT NULL CHECK (ends_at > starts_at),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  -- scheduled: selectable session; cancelled: retained historical session.
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
  UNIQUE (event_id, attendance_date),
  -- Parent key for future registration_days(event_day_id, event_id) foreign keys.
  UNIQUE (id, event_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) STRICT;

-- UNIQUE(event_id, attendance_date) already indexes the event foreign key and day listing.
