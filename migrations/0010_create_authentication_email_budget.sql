-- Local preparation only. Existing migrations 0001-0009 are immutable.
-- Aggregate UTC-day counts contain no recipients, credentials or message bodies.
CREATE TABLE auth_email_daily_budget (
  utc_day INTEGER NOT NULL PRIMARY KEY CHECK (utc_day >= 0 AND utc_day % 86400 = 0),
  attempts INTEGER NOT NULL CHECK (attempts BETWEEN 1 AND 70)
) STRICT;

-- No extensions are seeded. A separately approved operation may record exactly
-- one 5-10 attempt extension for a specific UTC day, with its approval reference.
CREATE TABLE auth_email_budget_extensions (
  utc_day INTEGER NOT NULL PRIMARY KEY CHECK (utc_day >= 0 AND utc_day % 86400 = 0),
  additional_attempts INTEGER NOT NULL CHECK (additional_attempts BETWEEN 5 AND 10),
  approval_reference TEXT NOT NULL CHECK (length(trim(approval_reference)) > 0),
  approved_at INTEGER NOT NULL CHECK (approved_at >= 0)
) STRICT;
