-- Restricted lost-authenticator replacement. No accounts are enrolled or changed.
CREATE TABLE auth_mfa_recovery_operations (
  operation_digest TEXT PRIMARY KEY NOT NULL CHECK (length(operation_digest)=64 AND operation_digest NOT GLOB '*[^0-9a-f]*'),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_digest TEXT NOT NULL UNIQUE CHECK (length(source_digest)=64 AND source_digest NOT GLOB '*[^0-9a-f]*'),
  browser_digest TEXT NOT NULL CHECK (length(browser_digest)=64 AND browser_digest NOT GLOB '*[^0-9a-f]*'),
  auth_version INTEGER NOT NULL CHECK (auth_version>=0),
  old_factor_id TEXT NOT NULL CHECK (length(old_factor_id)=36),
  old_set_id TEXT NOT NULL CHECK (length(old_set_id)=36),
  new_factor_id TEXT NOT NULL UNIQUE CHECK (length(new_factor_id)=36),
  new_set_id TEXT NOT NULL UNIQUE CHECK (length(new_set_id)=36),
  primary_method TEXT NOT NULL CHECK (primary_method IN ('password','google')),
  primary_authenticated_at INTEGER NOT NULL CHECK (primary_authenticated_at>=0),
  phase TEXT NOT NULL CHECK (phase IN ('pending','switching','committed','acknowledged','cancelled')),
  secret_ciphertext TEXT,
  secret_nonce TEXT,
  key_id TEXT,
  display_ciphertext TEXT,
  display_nonce TEXT,
  display_key_id TEXT,
  created_at INTEGER NOT NULL CHECK (created_at>=0),
  expires_at INTEGER NOT NULL CHECK (expires_at=created_at+300),
  committed_at INTEGER CHECK (committed_at>=created_at AND committed_at<expires_at),
  display_expires_at INTEGER CHECK (display_expires_at=committed_at+300),
  acknowledged_at INTEGER CHECK (acknowledged_at>=committed_at),
  oidc_state_digest TEXT UNIQUE CHECK (oidc_state_digest IS NULL OR (length(oidc_state_digest)=64 AND oidc_state_digest NOT GLOB '*[^0-9a-f]*')),
  CHECK ((secret_ciphertext IS NULL AND secret_nonce IS NULL AND key_id IS NULL)
    OR (secret_ciphertext IS NOT NULL AND secret_nonce IS NOT NULL AND key_id IS NOT NULL
      AND length(secret_ciphertext)=72 AND secret_ciphertext NOT GLOB '*[^0-9a-f]*'
      AND length(secret_nonce)=24 AND secret_nonce NOT GLOB '*[^0-9a-f]*' AND length(key_id) BETWEEN 1 AND 32)),
  CHECK ((display_ciphertext IS NULL AND display_nonce IS NULL AND display_key_id IS NULL)
    OR (display_ciphertext IS NOT NULL AND display_nonce IS NOT NULL AND display_key_id IS NOT NULL
      AND length(display_ciphertext) BETWEEN 32 AND 2048 AND display_ciphertext NOT GLOB '*[^0-9a-f]*'
      AND length(display_nonce)=24 AND display_nonce NOT GLOB '*[^0-9a-f]*' AND length(display_key_id) BETWEEN 1 AND 32)),
  CHECK (phase NOT IN ('pending','switching') OR secret_ciphertext IS NOT NULL),
  CHECK (phase NOT IN ('committed','acknowledged') OR (committed_at IS NOT NULL AND display_expires_at IS NOT NULL)),
  CHECK (phase<>'committed' OR display_ciphertext IS NOT NULL),
  CHECK (phase NOT IN ('acknowledged','cancelled') OR (secret_ciphertext IS NULL AND display_ciphertext IS NULL)),
  CHECK (phase<>'acknowledged' OR acknowledged_at IS NOT NULL)
) STRICT;
CREATE UNIQUE INDEX auth_mfa_recovery_active_idx ON auth_mfa_recovery_operations(user_id)
  WHERE phase IN ('pending','switching','committed');
CREATE INDEX auth_mfa_recovery_expiry_idx ON auth_mfa_recovery_operations(expires_at,display_expires_at);

CREATE TRIGGER auth_mfa_recovery_generation AFTER UPDATE OF auth_version ON users
BEGIN
  UPDATE auth_mfa_recovery_operations SET phase='cancelled',secret_ciphertext=NULL,secret_nonce=NULL,key_id=NULL,
    display_ciphertext=NULL,display_nonce=NULL,display_key_id=NULL,oidc_state_digest=NULL
    WHERE user_id=NEW.id AND phase IN ('pending','switching','committed')
      AND NOT (phase='switching' AND auth_version=OLD.auth_version AND NEW.auth_version=auth_version+1
        AND NEW.status='active' AND EXISTS(SELECT 1 FROM auth_totp_factors f
          WHERE f.user_id=NEW.id AND f.factor_id=new_factor_id AND f.recovery_set_id=new_set_id));
END;

CREATE TRIGGER auth_mfa_recovery_identity BEFORE UPDATE OF operation_digest,user_id,source_digest,browser_digest,
  auth_version,old_factor_id,old_set_id,new_factor_id,new_set_id,created_at,expires_at ON auth_mfa_recovery_operations
BEGIN
  SELECT RAISE(ABORT,'Recovery operation identity is immutable');
END;
CREATE TRIGGER auth_mfa_recovery_phase BEFORE UPDATE OF phase ON auth_mfa_recovery_operations
WHEN (OLD.phase IN ('acknowledged','cancelled') AND NEW.phase<>OLD.phase)
  OR (OLD.phase='committed' AND NEW.phase NOT IN ('committed','acknowledged','cancelled'))
  OR (OLD.phase='pending' AND NEW.phase NOT IN ('pending','switching','cancelled'))
  OR (OLD.phase='switching' AND NEW.phase NOT IN ('committed','cancelled'))
BEGIN
  SELECT RAISE(ABORT,'Recovery operation transition is invalid');
END;
