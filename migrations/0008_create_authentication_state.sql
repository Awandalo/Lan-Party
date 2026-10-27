-- Additive local Phase 3 authentication state; migrations 0001-0007 are immutable.
-- UUIDs are application generated. Instants are nonnegative UTC Unix seconds.
ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0 CHECK (auth_version >= 0);

-- Canonical public nickname source. Legacy users without a display name remain unclaimed.
CREATE TABLE user_nicknames (
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  nickname TEXT NOT NULL CHECK (
    length(nickname) BETWEEN 3 AND 24
    AND nickname NOT GLOB '*[^A-Za-z0-9 _-]*'
    AND instr(nickname, char(0)) = 0
    AND nickname = trim(nickname)
    AND instr(nickname, '  ') = 0
    AND instr(nickname, ' _') = 0 AND instr(nickname, '_ ') = 0
    AND instr(nickname, ' -') = 0 AND instr(nickname, '- ') = 0
    AND replace(replace(replace(lower(nickname), ' ', ''), '_', ''), '-', '')
      NOT IN ('admin', 'moderator', 'system')
  ),
  nickname_key TEXT GENERATED ALWAYS AS (lower(nickname)) STORED NOT NULL UNIQUE,
  nickname_changed_at INTEGER CHECK (nickname_changed_at >= created_at AND nickname_changed_at <= updated_at),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
) STRICT;

-- Plain INSERT deliberately aborts on invalid/duplicate legacy names; never auto-correct.
INSERT INTO user_nicknames (user_id, nickname, created_at, updated_at)
  SELECT id, display_name, created_at, updated_at FROM users WHERE display_name IS NOT NULL;

CREATE TABLE auth_sessions (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(trim(id)) > 0),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  token_digest TEXT NOT NULL UNIQUE CHECK (length(token_digest) = 64 AND token_digest NOT GLOB '*[^0-9a-f]*' AND instr(token_digest, char(0)) = 0),
  auth_version INTEGER NOT NULL CHECK (auth_version >= 0),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
  revoked_at INTEGER CHECK (revoked_at >= created_at)
) STRICT;
CREATE INDEX auth_sessions_user_id_idx ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expires_at_idx ON auth_sessions(expires_at);

CREATE TABLE auth_action_tokens (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(trim(id)) > 0),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  purpose TEXT NOT NULL CHECK (purpose IN ('email-verification', 'password-reset')),
  token_digest TEXT NOT NULL UNIQUE CHECK (length(token_digest) = 64 AND token_digest NOT GLOB '*[^0-9a-f]*' AND instr(token_digest, char(0)) = 0),
  auth_version INTEGER NOT NULL CHECK (auth_version >= 0),
  -- Verification must remain bound to the current address; reset uses the auth version.
  email_normalized TEXT,
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  expires_at INTEGER NOT NULL CHECK (expires_at = created_at + CASE purpose WHEN 'email-verification' THEN 86400 ELSE 1800 END),
  consumed_at INTEGER CHECK (consumed_at >= created_at AND consumed_at < expires_at),
  revoked_at INTEGER CHECK (revoked_at >= created_at),
  CHECK ((purpose = 'email-verification' AND email_normalized IS NOT NULL AND length(trim(email_normalized)) > 0)
    OR (purpose = 'password-reset' AND email_normalized IS NULL))
) STRICT;
CREATE INDEX auth_action_tokens_user_purpose_idx ON auth_action_tokens(user_id, purpose);
CREATE INDEX auth_action_tokens_expires_at_idx ON auth_action_tokens(expires_at);

-- Generation fencing prevents a login verified before reset from issuing a session afterward.
CREATE TRIGGER auth_sessions_current_account_insert BEFORE INSERT ON auth_sessions
WHEN NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND status = 'active' AND auth_version = NEW.auth_version)
BEGIN
  SELECT RAISE(ABORT, 'Session requires the current active account version');
END;

CREATE TRIGGER auth_sessions_identity_immutable BEFORE UPDATE OF id, user_id, auth_version, token_digest, created_at, expires_at ON auth_sessions
BEGIN
  SELECT RAISE(ABORT, 'Session identity is immutable');
END;

CREATE TRIGGER auth_sessions_revocation_final BEFORE UPDATE OF revoked_at ON auth_sessions
WHEN OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NOT OLD.revoked_at
BEGIN
  SELECT RAISE(ABORT, 'Session revocation is final');
END;

CREATE TRIGGER auth_action_tokens_current_account_insert BEFORE INSERT ON auth_action_tokens
WHEN NEW.consumed_at IS NOT NULL OR NEW.revoked_at IS NOT NULL OR NOT EXISTS (
  SELECT 1 FROM users WHERE id = NEW.user_id AND status = 'active' AND auth_version = NEW.auth_version
    AND (NEW.purpose = 'password-reset' OR email_normalized = NEW.email_normalized)
)
BEGIN
  SELECT RAISE(ABORT, 'Action token requires the current active account version');
END;

CREATE TRIGGER auth_action_tokens_identity_immutable BEFORE UPDATE OF id, user_id, purpose, token_digest, auth_version, email_normalized, created_at, expires_at ON auth_action_tokens
BEGIN
  SELECT RAISE(ABORT, 'Action token identity is immutable');
END;

CREATE TRIGGER auth_action_tokens_revocation_final BEFORE UPDATE OF revoked_at ON auth_action_tokens
WHEN OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NOT OLD.revoked_at
BEGIN
  SELECT RAISE(ABORT, 'Action token revocation is final');
END;

CREATE TRIGGER auth_action_tokens_single_use BEFORE UPDATE OF consumed_at ON auth_action_tokens
WHEN OLD.consumed_at IS NOT NULL OR NEW.consumed_at IS NULL OR OLD.revoked_at IS NOT NULL
  OR NOT EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id AND status = 'active' AND auth_version = OLD.auth_version)
BEGIN
  SELECT RAISE(ABORT, 'Action token is no longer usable');
END;

CREATE TRIGGER users_auth_version_monotonic BEFORE UPDATE OF auth_version ON users
WHEN NEW.auth_version <> OLD.auth_version + 1
BEGIN
  SELECT RAISE(ABORT, 'Authentication version must advance by one');
END;

CREATE TRIGGER users_auth_version_revoke AFTER UPDATE OF auth_version ON users
BEGIN
  UPDATE auth_sessions SET revoked_at = max(created_at, NEW.updated_at) WHERE user_id = NEW.id AND revoked_at IS NULL;
  UPDATE auth_action_tokens SET revoked_at = max(created_at, NEW.updated_at) WHERE user_id = NEW.id AND revoked_at IS NULL;
END;

CREATE TRIGGER credentials_change_auth_version AFTER UPDATE OF password_hash, password_changed_at ON user_password_credentials
WHEN NEW.password_hash <> OLD.password_hash OR NEW.password_changed_at <> OLD.password_changed_at
BEGIN
  UPDATE users SET auth_version = auth_version + 1, updated_at = max(updated_at, NEW.updated_at) WHERE id = NEW.user_id;
END;

CREATE TRIGGER credentials_ownership_immutable BEFORE UPDATE OF user_id ON user_password_credentials
WHEN NEW.user_id <> OLD.user_id
BEGIN
  SELECT RAISE(ABORT, 'Password credential ownership is immutable');
END;

CREATE TRIGGER credentials_delete_auth_version AFTER DELETE ON user_password_credentials
BEGIN
  UPDATE users SET auth_version = auth_version + 1 WHERE id = OLD.user_id;
END;

CREATE TRIGGER users_email_change_auth_version AFTER UPDATE OF email_normalized ON users
WHEN NEW.email_normalized <> OLD.email_normalized
BEGIN
  UPDATE users SET auth_version = auth_version + 1, email_verified_at = NULL WHERE id = NEW.id;
END;

CREATE TRIGGER users_status_change_auth_version AFTER UPDATE OF status ON users
WHEN NEW.status <> OLD.status
BEGIN
  UPDATE users SET auth_version = auth_version + 1 WHERE id = NEW.id;
END;

-- The future trusted adapter must consume tokens and perform the associated mutation
-- in one guarded D1 batch. The schema is not a public authentication workflow.
-- Participant nickname cooldown enforcement is future trusted API logic; admin
-- corrections may update nickname without changing nickname_changed_at.
