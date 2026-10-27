-- Retire Google OAuth without resetting accounts, passwords, active MFA or application data.
-- This forward migration invalidates ALL sessions and in-flight authentication/MFA operations.
-- DEV application-data deletion belongs only to the separately approved operational reset file.
-- Historical migrations 0001-0015 remain unchanged; do not use foreign_keys=OFF.

UPDATE auth_sessions SET revoked_at=max(created_at,unixepoch()) WHERE revoked_at IS NULL;
DELETE FROM auth_mfa_regeneration_operations;
DELETE FROM auth_mfa_recovery_operations;
DELETE FROM auth_session_mfa;
DELETE FROM auth_recent_authentication;
DELETE FROM auth_mfa_transactions;
DELETE FROM auth_mfa_recovery_codes WHERE NOT EXISTS (
 SELECT 1 FROM auth_totp_factors f WHERE f.user_id=auth_mfa_recovery_codes.user_id
 AND f.recovery_set_id=auth_mfa_recovery_codes.set_id);

DROP TRIGGER auth_method_generation_revoke;
DROP TRIGGER auth_mfa_generation_revoke;
DROP TRIGGER auth_mfa_assurance_insert;
DROP TRIGGER auth_mfa_assurance_identity;
DROP TRIGGER auth_mfa_transaction_identity;
DROP TRIGGER auth_mfa_transaction_phase;
DROP TRIGGER auth_mfa_recovery_generation;
DROP TRIGGER auth_mfa_recovery_identity;
DROP TRIGGER auth_mfa_recovery_phase;
DROP TRIGGER auth_mfa_regeneration_identity;
DROP TRIGGER auth_mfa_regeneration_phase;
DROP TRIGGER auth_mfa_regeneration_cleanup;
DROP TRIGGER auth_mfa_regeneration_delete;
DROP TRIGGER auth_mfa_regeneration_generation;
DROP TRIGGER auth_mfa_regeneration_session_revoke;
DROP TRIGGER auth_mfa_regeneration_factor_delete;
DROP TRIGGER auth_mfa_regeneration_factor_set;
DROP TRIGGER auth_mfa_regeneration_other_management;
DROP TRIGGER auth_mfa_regeneration_replacement;

DROP TABLE auth_oidc_transactions;
DROP TABLE auth_password_setup;
DROP TABLE user_auth_providers;
DROP TABLE auth_recent_authentication;
DROP TABLE auth_mfa_transactions;
DROP TABLE auth_session_mfa;
DROP TABLE auth_mfa_recovery_operations;
DROP TABLE auth_mfa_regeneration_operations;

CREATE TABLE auth_recent_authentication (
  session_digest TEXT PRIMARY KEY NOT NULL REFERENCES auth_sessions(token_digest) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  auth_version INTEGER NOT NULL CHECK (auth_version>=0),
  method TEXT NOT NULL CHECK (method ='password'),
  assurance_level INTEGER NOT NULL DEFAULT 1 CHECK (assurance_level=1),
  mfa_verified INTEGER NOT NULL DEFAULT 0 CHECK (mfa_verified=0),
  authenticated_at INTEGER NOT NULL CHECK (authenticated_at>=0),
  expires_at INTEGER NOT NULL CHECK (expires_at=authenticated_at+300)
) STRICT;

CREATE TABLE auth_mfa_transactions (
  token_digest TEXT PRIMARY KEY NOT NULL CHECK (length(token_digest)=64 AND token_digest NOT GLOB '*[^0-9a-f]*'),
  transaction_id TEXT NOT NULL UNIQUE CHECK (length(transaction_id)=36),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  auth_version INTEGER NOT NULL CHECK (auth_version>=0),
  session_digest TEXT REFERENCES auth_sessions(token_digest) ON DELETE RESTRICT,
  browser_digest TEXT NOT NULL CHECK (length(browser_digest)=64 AND browser_digest NOT GLOB '*[^0-9a-f]*'),
  purpose TEXT NOT NULL CHECK (purpose IN ('enroll','login','step-up','disable','regenerate')),
  phase TEXT NOT NULL CHECK (phase IN ('pending','verified','consumed','cancelled')),
  factor_id TEXT NOT NULL CHECK (length(factor_id)=36),
  recovery_set_id TEXT CHECK (recovery_set_id IS NULL OR length(recovery_set_id)=36),
  primary_method TEXT NOT NULL CHECK (primary_method ='password'),
  primary_authenticated_at INTEGER NOT NULL CHECK (primary_authenticated_at>=0 AND primary_authenticated_at<=created_at),
  secret_ciphertext TEXT CHECK (secret_ciphertext IS NULL OR (length(secret_ciphertext)=72 AND secret_ciphertext NOT GLOB '*[^0-9a-f]*')),
  secret_nonce TEXT CHECK (secret_nonce IS NULL OR (length(secret_nonce)=24 AND secret_nonce NOT GLOB '*[^0-9a-f]*')),
  key_id TEXT CHECK (key_id IS NULL OR (length(key_id) BETWEEN 1 AND 32 AND key_id NOT GLOB '*[^a-zA-Z0-9_-]*')),
  last_step INTEGER NOT NULL DEFAULT -1 CHECK (last_step>=-1),
  ack_digest TEXT CHECK (ack_digest IS NULL OR (length(ack_digest)=64 AND ack_digest NOT GLOB '*[^0-9a-f]*')),
  proof_method TEXT CHECK (proof_method IN ('totp','recovery')),
  created_at INTEGER NOT NULL CHECK (created_at>=0),
  expires_at INTEGER NOT NULL CHECK (expires_at>created_at AND expires_at<=created_at+600),
  verified_at INTEGER CHECK (verified_at>=created_at AND verified_at<expires_at),
  consumed_at INTEGER CHECK (consumed_at>=created_at),
  CHECK (purpose<>'enroll' OR session_digest IS NOT NULL),
  CHECK ((secret_ciphertext IS NULL AND secret_nonce IS NULL AND key_id IS NULL)
    OR (secret_ciphertext IS NOT NULL AND secret_nonce IS NOT NULL AND key_id IS NOT NULL)),
  CHECK (purpose<>'enroll' OR phase NOT IN ('pending','verified') OR secret_ciphertext IS NOT NULL),
  CHECK (purpose<>'enroll' OR phase<>'verified' OR (ack_digest IS NOT NULL AND recovery_set_id IS NOT NULL AND last_step>=0 AND verified_at IS NOT NULL)),
  CHECK (phase NOT IN ('consumed','cancelled') OR (secret_ciphertext IS NULL AND ack_digest IS NULL))
  ,CHECK (phase<>'consumed' OR consumed_at IS NOT NULL)
) STRICT;

CREATE TABLE auth_session_mfa (
  session_digest TEXT PRIMARY KEY NOT NULL REFERENCES auth_sessions(token_digest) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  auth_version INTEGER NOT NULL CHECK (auth_version>=0),
  factor_id TEXT NOT NULL REFERENCES auth_totp_factors(factor_id) ON DELETE RESTRICT,
  method TEXT NOT NULL CHECK (method IN ('totp','recovery')),
  verified_at INTEGER NOT NULL CHECK (verified_at>=0),
  primary_method TEXT NOT NULL CHECK (primary_method ='password'),
  primary_authenticated_at INTEGER NOT NULL CHECK (primary_authenticated_at>=0)
) STRICT;

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
  primary_method TEXT NOT NULL CHECK (primary_method ='password'),
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

CREATE TABLE auth_mfa_regeneration_operations (
 operation_digest TEXT PRIMARY KEY NOT NULL CHECK(length(operation_digest)=64 AND operation_digest NOT GLOB '*[^0-9a-f]*'),
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 session_digest TEXT NOT NULL REFERENCES auth_sessions(token_digest) ON DELETE CASCADE,
 auth_version INTEGER NOT NULL CHECK(auth_version>=0),
 factor_id TEXT NOT NULL CHECK(length(factor_id)=36),
 old_set_id TEXT NOT NULL CHECK(length(old_set_id)=36),
 new_set_id TEXT UNIQUE CHECK(new_set_id IS NULL OR length(new_set_id)=36),
 phase TEXT NOT NULL CHECK(phase IN ('prepared','revealed','activated','cancelled')),
 created_at INTEGER NOT NULL CHECK(created_at>=0),
 primary_method TEXT NOT NULL CHECK(primary_method ='password'),
 primary_authenticated_at INTEGER NOT NULL CHECK(primary_authenticated_at>=0 AND primary_authenticated_at<=created_at),
 proof_method TEXT CHECK(proof_method IN ('totp','recovery')),
 proof_verified_at INTEGER CHECK(proof_verified_at>=created_at),
 proof_primary_method TEXT CHECK(proof_primary_method ='password'),
 proof_primary_at INTEGER CHECK(proof_primary_at>=0 AND proof_primary_at<=proof_verified_at),
 acknowledgment_digest TEXT CHECK(acknowledgment_digest IS NULL OR (length(acknowledgment_digest)=64 AND acknowledgment_digest NOT GLOB '*[^0-9a-f]*')),
 activated_at INTEGER CHECK(activated_at>=created_at),
 CHECK((proof_method IS NULL AND proof_verified_at IS NULL AND proof_primary_method IS NULL AND proof_primary_at IS NULL)
  OR (proof_method IS NOT NULL AND proof_verified_at IS NOT NULL AND proof_primary_method IS NOT NULL AND proof_primary_at IS NOT NULL)),
 CHECK(phase<>'prepared' OR (new_set_id IS NULL AND acknowledgment_digest IS NULL)),
 CHECK(phase<>'revealed' OR (new_set_id IS NOT NULL AND acknowledgment_digest IS NOT NULL AND proof_verified_at IS NOT NULL)),
 CHECK(phase<>'activated' OR (new_set_id IS NOT NULL AND activated_at IS NOT NULL)),
 CHECK(phase NOT IN ('activated','cancelled') OR acknowledgment_digest IS NULL)
) STRICT;

CREATE INDEX auth_recent_expiry_idx ON auth_recent_authentication(expires_at);

CREATE INDEX auth_mfa_expiry_idx ON auth_mfa_transactions(expires_at);

CREATE INDEX auth_mfa_user_idx ON auth_mfa_transactions(user_id);

CREATE UNIQUE INDEX auth_mfa_management_idx ON auth_mfa_transactions(user_id)
  WHERE purpose IN ('enroll','disable','regenerate') AND phase IN ('pending','verified');

CREATE INDEX auth_session_mfa_user_idx ON auth_session_mfa(user_id);

CREATE UNIQUE INDEX auth_mfa_recovery_active_idx ON auth_mfa_recovery_operations(user_id)
  WHERE phase IN ('pending','switching','committed');

CREATE INDEX auth_mfa_recovery_expiry_idx ON auth_mfa_recovery_operations(expires_at,display_expires_at);

CREATE UNIQUE INDEX auth_mfa_regeneration_active_idx ON auth_mfa_regeneration_operations(user_id) WHERE phase IN ('prepared','revealed');

CREATE INDEX auth_mfa_regeneration_session_idx ON auth_mfa_regeneration_operations(session_digest);

CREATE TRIGGER auth_method_generation_revoke AFTER UPDATE OF auth_version ON users
BEGIN
  DELETE FROM auth_recent_authentication WHERE user_id=NEW.id;
END;

CREATE TRIGGER auth_mfa_generation_revoke AFTER UPDATE OF auth_version ON users
BEGIN
  UPDATE auth_mfa_transactions SET phase='cancelled',secret_ciphertext=NULL,secret_nonce=NULL,key_id=NULL,ack_digest=NULL
    WHERE user_id=NEW.id AND phase IN ('pending','verified');
  DELETE FROM auth_session_mfa WHERE user_id=NEW.id;
END;

CREATE TRIGGER auth_mfa_assurance_insert BEFORE INSERT ON auth_session_mfa
WHEN NOT EXISTS (SELECT 1 FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN auth_totp_factors f ON f.user_id=u.id
  WHERE s.token_digest=NEW.session_digest AND s.user_id=NEW.user_id AND s.auth_version=NEW.auth_version
    AND u.auth_version=NEW.auth_version AND u.status='active' AND s.revoked_at IS NULL
    AND f.factor_id=NEW.factor_id AND NEW.verified_at<=s.created_at AND NEW.primary_authenticated_at<=s.created_at
    AND s.expires_at>NEW.verified_at)
BEGIN
  SELECT RAISE(ABORT,'MFA assurance requires the current account session');
END;

CREATE TRIGGER auth_mfa_assurance_identity BEFORE UPDATE ON auth_session_mfa
BEGIN
  SELECT RAISE(ABORT,'MFA assurance is immutable');
END;

CREATE TRIGGER auth_mfa_transaction_identity BEFORE UPDATE OF token_digest,transaction_id,user_id,auth_version,session_digest,browser_digest,purpose,factor_id,primary_method,primary_authenticated_at,created_at,expires_at ON auth_mfa_transactions
BEGIN
  SELECT RAISE(ABORT,'MFA transaction identity is immutable');
END;

CREATE TRIGGER auth_mfa_transaction_phase BEFORE UPDATE OF phase ON auth_mfa_transactions
WHEN (OLD.phase IN ('consumed','cancelled') AND NEW.phase<>OLD.phase)
  OR (OLD.phase='verified' AND NEW.phase='pending') OR (OLD.phase='pending' AND NEW.phase='consumed')
BEGIN
  SELECT RAISE(ABORT,'MFA transaction transition is invalid');
END;

CREATE TRIGGER auth_mfa_recovery_generation AFTER UPDATE OF auth_version ON users
BEGIN
  UPDATE auth_mfa_recovery_operations SET phase='cancelled',secret_ciphertext=NULL,secret_nonce=NULL,key_id=NULL,
    display_ciphertext=NULL,display_nonce=NULL,display_key_id=NULL
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

CREATE TRIGGER auth_mfa_regeneration_identity BEFORE UPDATE OF operation_digest,user_id,session_digest,auth_version,factor_id,old_set_id,created_at,primary_method,primary_authenticated_at ON auth_mfa_regeneration_operations
BEGIN
 SELECT RAISE(ABORT,'Regeneration identity is immutable');
END;

CREATE TRIGGER auth_mfa_regeneration_phase BEFORE UPDATE ON auth_mfa_regeneration_operations
WHEN (OLD.phase IN ('activated','cancelled') AND NEW.phase<>OLD.phase)
 OR (OLD.phase='revealed' AND NEW.phase NOT IN ('revealed','activated','cancelled'))
 OR (OLD.phase='prepared' AND NEW.phase NOT IN ('prepared','revealed','cancelled'))
 OR (OLD.new_set_id IS NOT NULL AND NEW.new_set_id IS NOT OLD.new_set_id)
BEGIN
 SELECT RAISE(ABORT,'Regeneration transition is invalid');
END;

CREATE TRIGGER auth_mfa_regeneration_cleanup AFTER UPDATE OF phase ON auth_mfa_regeneration_operations
WHEN NEW.phase='cancelled'
BEGIN
 DELETE FROM auth_mfa_recovery_codes WHERE user_id=NEW.user_id AND set_id=NEW.new_set_id
  AND NOT EXISTS(SELECT 1 FROM auth_totp_factors f WHERE f.user_id=NEW.user_id AND f.recovery_set_id=NEW.new_set_id);
END;

CREATE TRIGGER auth_mfa_regeneration_delete BEFORE DELETE ON auth_mfa_regeneration_operations
BEGIN
 DELETE FROM auth_mfa_recovery_codes WHERE user_id=OLD.user_id AND set_id=OLD.new_set_id
  AND NOT EXISTS(SELECT 1 FROM auth_totp_factors f WHERE f.user_id=OLD.user_id AND f.recovery_set_id=OLD.new_set_id);
END;

CREATE TRIGGER auth_mfa_regeneration_generation AFTER UPDATE OF auth_version ON users
BEGIN
 UPDATE auth_mfa_regeneration_operations SET phase='cancelled',acknowledgment_digest=NULL WHERE user_id=NEW.id AND phase IN ('prepared','revealed');
END;

CREATE TRIGGER auth_mfa_regeneration_session_revoke AFTER UPDATE OF revoked_at ON auth_sessions
WHEN NEW.revoked_at IS NOT NULL
BEGIN
 UPDATE auth_mfa_regeneration_operations SET phase='cancelled',acknowledgment_digest=NULL WHERE session_digest=NEW.token_digest AND phase IN ('prepared','revealed');
END;

CREATE TRIGGER auth_mfa_regeneration_factor_delete BEFORE DELETE ON auth_totp_factors
BEGIN
 UPDATE auth_mfa_regeneration_operations SET phase='cancelled',acknowledgment_digest=NULL WHERE user_id=OLD.user_id AND phase IN ('prepared','revealed');
END;

CREATE TRIGGER auth_mfa_regeneration_factor_set AFTER UPDATE OF recovery_set_id ON auth_totp_factors
BEGIN
 UPDATE auth_mfa_regeneration_operations SET phase='cancelled',acknowledgment_digest=NULL WHERE user_id=NEW.user_id AND phase IN ('prepared','revealed') AND old_set_id<>NEW.recovery_set_id;
END;

CREATE TRIGGER auth_mfa_regeneration_other_management BEFORE INSERT ON auth_mfa_transactions
WHEN NEW.purpose IN ('enroll','disable','regenerate')
BEGIN
 UPDATE auth_mfa_regeneration_operations SET phase='cancelled',acknowledgment_digest=NULL WHERE user_id=NEW.user_id AND phase IN ('prepared','revealed');
END;

CREATE TRIGGER auth_mfa_regeneration_replacement BEFORE INSERT ON auth_mfa_recovery_operations
BEGIN
 UPDATE auth_mfa_regeneration_operations SET phase='cancelled',acknowledgment_digest=NULL WHERE user_id=NEW.user_id AND phase IN ('prepared','revealed');
END;
