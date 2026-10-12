-- UUID validation and transactional lifecycle checks belong to future Worker APIs.
-- Keep one durable registration record per user/event, including after cancellation.
CREATE TABLE registrations (
  id TEXT NOT NULL PRIMARY KEY
    CHECK (length(trim(id, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  user_id TEXT NOT NULL
    CHECK (length(trim(user_id, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  event_id TEXT NOT NULL
    CHECK (length(trim(event_id, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'cancelled')),
  registered_at INTEGER NOT NULL CHECK (registered_at >= created_at),
  cancelled_at INTEGER CHECK (cancelled_at >= registered_at AND cancelled_at <= updated_at),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= registered_at),
  CHECK ((status = 'registered' AND cancelled_at IS NULL)
    OR (status = 'cancelled' AND cancelled_at IS NOT NULL)),
  UNIQUE (user_id, event_id),
  -- Required parent key for registration_days' composite event-consistency FK.
  UNIQUE (id, event_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) STRICT;

-- UNIQUE(user_id, event_id) already covers user lookup.
CREATE INDEX registrations_event_status_idx ON registrations(event_id, status);
CREATE INDEX registrations_status_idx ON registrations(status);

CREATE TABLE registration_days (
  registration_id TEXT NOT NULL
    CHECK (length(trim(registration_id, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  event_id TEXT NOT NULL
    CHECK (length(trim(event_id, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  event_day_id TEXT NOT NULL
    CHECK (length(trim(event_day_id, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  selected_at INTEGER NOT NULL CHECK (selected_at >= 0),
  PRIMARY KEY (registration_id, event_day_id),
  FOREIGN KEY (registration_id, event_id) REFERENCES registrations(id, event_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY (event_day_id, event_id) REFERENCES event_days(id, event_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) STRICT;

-- Composite PK covers registration lookup; this covers the other composite FK.
CREATE INDEX registration_days_event_day_event_idx ON registration_days(event_day_id, event_id);

-- No seeds. Retain selected days on cancellation; attendance counts filter active registrations.
-- Minimum one selected day, event readiness, ownership and history require future Worker logic.
