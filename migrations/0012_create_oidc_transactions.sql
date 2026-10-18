-- Short-lived, server-only OIDC context. No Google access/refresh tokens are stored.
CREATE TABLE auth_oidc_transactions (
  state_digest TEXT PRIMARY KEY NOT NULL CHECK (length(state_digest)=64 AND state_digest NOT GLOB '*[^0-9a-f]*'),
  browser_digest TEXT NOT NULL CHECK (length(browser_digest)=64 AND browser_digest NOT GLOB '*[^0-9a-f]*'),
  purpose TEXT NOT NULL CHECK (purpose IN ('signin','link','reauth')),
  phase TEXT NOT NULL CHECK (phase IN ('pending','exchanging','ready','consumed')),
  verifier TEXT NOT NULL CHECK (length(verifier) IN (0,64)),
  nonce TEXT NOT NULL CHECK (length(nonce) IN (0,64)),
  user_id TEXT REFERENCES users(id) ON DELETE RESTRICT CHECK (user_id IS NULL OR length(user_id)=36),
  session_digest TEXT,
  auth_version INTEGER CHECK (auth_version>=0),
  subject TEXT CHECK (subject IS NULL OR length(subject) BETWEEN 1 AND 255),
  email TEXT,
  authoritative INTEGER CHECK (authoritative IN (0,1)),
  created_at INTEGER NOT NULL CHECK (created_at>=0),
  expires_at INTEGER NOT NULL CHECK (expires_at=created_at+600),
  CHECK ((purpose='signin' AND user_id IS NULL AND session_digest IS NULL AND auth_version IS NULL)
    OR (purpose<>'signin' AND user_id IS NOT NULL AND length(session_digest)=64 AND auth_version IS NOT NULL))
) STRICT;
CREATE INDEX auth_oidc_expiry_idx ON auth_oidc_transactions(expires_at);
-- One Google connection per account; issuer aliases cannot duplicate a Google subject.
CREATE UNIQUE INDEX auth_google_user_idx ON user_auth_providers(user_id) WHERE provider='google';
CREATE UNIQUE INDEX auth_google_subject_idx ON user_auth_providers(provider_subject) WHERE provider='google';

CREATE TABLE auth_recent_authentication (
  session_digest TEXT PRIMARY KEY NOT NULL REFERENCES auth_sessions(token_digest) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  auth_version INTEGER NOT NULL CHECK (auth_version>=0),
  method TEXT NOT NULL CHECK (method IN ('password','google')),
  assurance_level INTEGER NOT NULL DEFAULT 1 CHECK (assurance_level=1),
  mfa_verified INTEGER NOT NULL DEFAULT 0 CHECK (mfa_verified=0),
  authenticated_at INTEGER NOT NULL CHECK (authenticated_at>=0),
  expires_at INTEGER NOT NULL CHECK (expires_at=authenticated_at+300)
) STRICT;
CREATE INDEX auth_recent_expiry_idx ON auth_recent_authentication(expires_at);

CREATE TABLE auth_password_setup (
  token_digest TEXT PRIMARY KEY NOT NULL CHECK (length(token_digest)=64 AND token_digest NOT GLOB '*[^0-9a-f]*'),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  session_digest TEXT NOT NULL REFERENCES auth_sessions(token_digest) ON DELETE RESTRICT,
  auth_version INTEGER NOT NULL CHECK (auth_version>=0),
  email_normalized TEXT NOT NULL,
  created_at INTEGER NOT NULL CHECK (created_at>=0),
  expires_at INTEGER NOT NULL CHECK (expires_at=created_at+600),
  consumed_at INTEGER CHECK (consumed_at>=created_at),
  revoked_at INTEGER CHECK (revoked_at>=created_at)
) STRICT;
CREATE INDEX auth_setup_expiry_idx ON auth_password_setup(expires_at);
CREATE INDEX auth_setup_user_idx ON auth_password_setup(user_id);

CREATE TRIGGER auth_method_generation_revoke AFTER UPDATE OF auth_version ON users
BEGIN
  DELETE FROM auth_recent_authentication WHERE user_id=NEW.id;
  UPDATE auth_password_setup SET revoked_at=max(created_at,NEW.updated_at)
    WHERE user_id=NEW.id AND revoked_at IS NULL;
END;
