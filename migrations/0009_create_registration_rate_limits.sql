-- Registration-only fixed windows. Keys are HMAC digests, never IPs or emails.
CREATE TABLE registration_rate_limits (
  key_hash TEXT NOT NULL PRIMARY KEY CHECK (length(key_hash)=64 AND key_hash NOT GLOB '*[^0-9a-f]*' AND instr(key_hash,char(0))=0),
  hits INTEGER NOT NULL CHECK (hits BETWEEN 1 AND 30),
  expires_at INTEGER NOT NULL CHECK (expires_at >= 0)
) STRICT;
CREATE INDEX registration_rate_limits_expiry_idx ON registration_rate_limits(expires_at);
