-- No regeneration-age deadline. Existing active sets are unchanged.
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
 primary_method TEXT NOT NULL CHECK(primary_method IN ('password','google')),
 primary_authenticated_at INTEGER NOT NULL CHECK(primary_authenticated_at>=0 AND primary_authenticated_at<=created_at),
 proof_method TEXT CHECK(proof_method IN ('totp','recovery')),
 proof_verified_at INTEGER CHECK(proof_verified_at>=created_at),
 proof_primary_method TEXT CHECK(proof_primary_method IN ('password','google')),
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
CREATE UNIQUE INDEX auth_mfa_regeneration_active_idx ON auth_mfa_regeneration_operations(user_id) WHERE phase IN ('prepared','revealed');
CREATE INDEX auth_mfa_regeneration_session_idx ON auth_mfa_regeneration_operations(session_digest);
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
