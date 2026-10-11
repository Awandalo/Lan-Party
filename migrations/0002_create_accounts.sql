-- UUID generation/validation and email normalization belong to future Worker APIs.
-- All instants are UTC Unix seconds; callers maintain updated_at.
CREATE TABLE name_prefixes (
  id TEXT NOT NULL PRIMARY KEY
    CHECK (length(trim(id, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  label TEXT NOT NULL UNIQUE
    CHECK (length(trim(label, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
) STRICT;

CREATE TABLE users (
  id TEXT NOT NULL PRIMARY KEY
    CHECK (length(trim(id, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  first_name TEXT NOT NULL
    CHECK (length(trim(first_name, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  last_name TEXT NOT NULL
    CHECK (length(trim(last_name, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  display_name TEXT,
  name_prefix_id TEXT,
  -- Preserve original casing; APIs must supply a consistent canonical comparison value.
  email TEXT NOT NULL
    CHECK (length(trim(email, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  email_normalized TEXT NOT NULL UNIQUE
    CHECK (length(trim(email_normalized, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  -- NULL means verification has not been completed. Never infer it from provider email alone.
  email_verified_at INTEGER CHECK (email_verified_at >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
  -- Deactivate prefixes to retain historical references; do not cascade participant deletion.
  FOREIGN KEY (name_prefix_id) REFERENCES name_prefixes(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) STRICT;

CREATE INDEX users_name_prefix_id_idx ON users(name_prefix_id);

-- No reference-data seeds, authentication credentials, or account-merging behavior.
