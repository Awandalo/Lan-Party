-- Optional account MFA. No account is enrolled by this migration.
CREATE TABLE auth_totp_factors (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  factor_id TEXT NOT NULL UNIQUE CHECK (length(factor_id)=36),
  secret_ciphertext TEXT NOT NULL CHECK (length(secret_ciphertext)=72 AND secret_ciphertext NOT GLOB '*[^0-9a-f]*'),
  secret_nonce TEXT NOT NULL CHECK (length(secret_nonce)=24 AND secret_nonce NOT GLOB '*[^0-9a-f]*'),
  key_id TEXT NOT NULL CHECK (length(key_id) BETWEEN 1 AND 32 AND key_id NOT GLOB '*[^a-zA-Z0-9_-]*'),
  algorithm TEXT NOT NULL DEFAULT 'sha1' CHECK (algorithm='sha1'),
  digits INTEGER NOT NULL DEFAULT 6 CHECK (digits=6),
  period INTEGER NOT NULL DEFAULT 30 CHECK (period=30),
  last_step INTEGER NOT NULL CHECK (last_step>=0),
  recovery_set_id TEXT NOT NULL CHECK (length(recovery_set_id)=36),
  enabled_at INTEGER NOT NULL CHECK (enabled_at>=0)
) STRICT;

CREATE TABLE auth_mfa_transactions (
  token_digest TEXT PRIMARY KEY NOT NULL CHECK (length(token_digest)=64 AND token_digest NOT GLOB '*[^0-9a-f]*'),
  transaction_id TEXT NOT NULL UNIQUE CHECK (length(transaction_id)=36),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  auth_version INTEGER NOT NULL CHECK (auth_version>=0),
  session_digest TEXT REFERENCES auth_sessions(token_digest) ON DELETE RESTRICT,
  browser_digest TEXT NOT NULL CHECK (length(browser_digest)=64 AND browser_digest NOT GLOB '*[^0-9a-f]*'),
  purpose TEXT NOT NULL CHECK (purpose IN ('enroll','login','step-up','disable','regenerate','rotate')),
  phase TEXT NOT NULL CHECK (phase IN ('pending','verified','consumed','cancelled')),
  factor_id TEXT NOT NULL CHECK (length(factor_id)=36),
  recovery_set_id TEXT CHECK (recovery_set_id IS NULL OR length(recovery_set_id)=36),
  primary_method TEXT NOT NULL CHECK (primary_method IN ('password','google')),
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
CREATE INDEX auth_mfa_expiry_idx ON auth_mfa_transactions(expires_at);
CREATE INDEX auth_mfa_user_idx ON auth_mfa_transactions(user_id);
CREATE UNIQUE INDEX auth_mfa_management_idx ON auth_mfa_transactions(user_id)
  WHERE purpose IN ('enroll','disable','regenerate') AND phase IN ('pending','verified');

CREATE TABLE auth_mfa_recovery_codes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  set_id TEXT NOT NULL CHECK (length(set_id)=36),
  verifier TEXT NOT NULL CHECK (length(verifier)=64 AND verifier NOT GLOB '*[^0-9a-f]*'),
  created_at INTEGER NOT NULL CHECK (created_at>=0),
  consumed_at INTEGER CHECK (consumed_at>=created_at),
  PRIMARY KEY (user_id,set_id,verifier)
) STRICT;

CREATE TABLE auth_session_mfa (
  session_digest TEXT PRIMARY KEY NOT NULL REFERENCES auth_sessions(token_digest) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  auth_version INTEGER NOT NULL CHECK (auth_version>=0),
  factor_id TEXT NOT NULL REFERENCES auth_totp_factors(factor_id) ON DELETE RESTRICT,
  method TEXT NOT NULL CHECK (method IN ('totp','recovery')),
  verified_at INTEGER NOT NULL CHECK (verified_at>=0),
  primary_method TEXT NOT NULL CHECK (primary_method IN ('password','google')),
  primary_authenticated_at INTEGER NOT NULL CHECK (primary_authenticated_at>=0 AND primary_authenticated_at<=verified_at)
) STRICT;
CREATE INDEX auth_session_mfa_user_idx ON auth_session_mfa(user_id);

CREATE TRIGGER auth_mfa_generation_revoke AFTER UPDATE OF auth_version ON users
BEGIN
  UPDATE auth_mfa_transactions SET phase='cancelled',secret_ciphertext=NULL,secret_nonce=NULL,key_id=NULL,ack_digest=NULL
    WHERE user_id=NEW.id AND phase IN ('pending','verified');
  DELETE FROM auth_session_mfa WHERE user_id=NEW.id;
END;

CREATE TRIGGER auth_mfa_factor_identity BEFORE UPDATE OF user_id,factor_id,algorithm,digits,period,enabled_at ON auth_totp_factors
BEGIN
  SELECT RAISE(ABORT,'MFA factor identity is immutable');
END;

CREATE TRIGGER auth_mfa_step_monotonic BEFORE UPDATE OF last_step ON auth_totp_factors
WHEN NEW.last_step<=OLD.last_step
BEGIN
  SELECT RAISE(ABORT,'MFA step must advance');
END;

CREATE TRIGGER auth_mfa_code_single_use BEFORE UPDATE OF consumed_at ON auth_mfa_recovery_codes
WHEN OLD.consumed_at IS NOT NULL OR NEW.consumed_at IS NULL
BEGIN
  SELECT RAISE(ABORT,'Recovery code is no longer usable');
END;

CREATE TRIGGER auth_mfa_code_identity BEFORE UPDATE OF user_id,set_id,verifier,created_at ON auth_mfa_recovery_codes
BEGIN
  SELECT RAISE(ABORT,'Recovery code identity is immutable');
END;

CREATE TRIGGER auth_mfa_assurance_insert BEFORE INSERT ON auth_session_mfa
WHEN NOT EXISTS (SELECT 1 FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN auth_totp_factors f ON f.user_id=u.id
  WHERE s.token_digest=NEW.session_digest AND s.user_id=NEW.user_id AND s.auth_version=NEW.auth_version
    AND u.auth_version=NEW.auth_version AND u.status='active' AND s.revoked_at IS NULL
    AND f.factor_id=NEW.factor_id AND s.created_at<=NEW.verified_at AND s.expires_at>NEW.verified_at)
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
