-- Voluntary lifecycle only. Legacy disabled accounts are not reactivation eligible.
CREATE TABLE account_lifecycle (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 state TEXT NOT NULL CHECK(state IN ('deactivated','deleting')),
 deactivated_at INTEGER NOT NULL CHECK(deactivated_at>=0)
) STRICT;
CREATE TABLE account_reactivation (
 invitation_digest TEXT PRIMARY KEY NOT NULL CHECK(length(invitation_digest)=64),
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 auth_version INTEGER NOT NULL CHECK(auth_version>=0),
 email_normalized TEXT NOT NULL,
 phase TEXT NOT NULL CHECK(phase IN ('invited','claimed','complete','cancelled')),
 created_at INTEGER NOT NULL CHECK(created_at>=0),
 expires_at INTEGER NOT NULL CHECK(expires_at=created_at+1800),
 context_digest TEXT UNIQUE CHECK(context_digest IS NULL OR length(context_digest)=64),
 claimed_at INTEGER CHECK(claimed_at>=created_at AND claimed_at<expires_at),
 CHECK(phase<>'claimed' OR (context_digest IS NOT NULL AND claimed_at IS NOT NULL))
) STRICT;
CREATE UNIQUE INDEX account_reactivation_open_idx ON account_reactivation(user_id) WHERE phase IN ('invited','claimed');
CREATE INDEX account_reactivation_expiry_idx ON account_reactivation(expires_at);
CREATE TRIGGER account_reactivation_identity BEFORE UPDATE OF invitation_digest,user_id,auth_version,email_normalized,created_at,expires_at ON account_reactivation
BEGIN
 SELECT RAISE(ABORT,'Reactivation identity is immutable');
END;
CREATE TRIGGER account_reactivation_phase BEFORE UPDATE ON account_reactivation
WHEN NOT ((OLD.phase='invited' AND NEW.phase IN ('claimed','cancelled'))
 OR (OLD.phase='claimed' AND NEW.phase IN ('complete','cancelled')))
BEGIN
 SELECT RAISE(ABORT,'Reactivation transition denied');
END;
