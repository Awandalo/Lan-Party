-- UUID and provider/issuer/subject validation belong to future Worker APIs.
-- External identity mapping uses issuer and subject, never provider email.
CREATE TABLE user_auth_providers (
  id TEXT NOT NULL PRIMARY KEY
    CHECK (length(trim(id, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  user_id TEXT NOT NULL
    CHECK (length(trim(user_id, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  provider TEXT NOT NULL
    CHECK (length(trim(provider, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0 AND provider <> 'password'),
  identity_namespace TEXT NOT NULL
    CHECK (length(trim(identity_namespace, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  provider_subject TEXT NOT NULL
    CHECK (length(trim(provider_subject, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  linked_at INTEGER NOT NULL CHECK (linked_at >= 0),
  last_login_at INTEGER CHECK (last_login_at >= linked_at),
  UNIQUE (provider, identity_namespace, provider_subject),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) STRICT;

CREATE INDEX user_auth_providers_user_id_idx ON user_auth_providers(user_id);

-- One current password credential per profile. No passwords or hashes are seeded.
-- Future trusted Worker logic must use salted password hashing with reviewed costs.
CREATE TABLE user_password_credentials (
  user_id TEXT NOT NULL PRIMARY KEY
    CHECK (length(trim(user_id, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  password_hash TEXT NOT NULL
    CHECK (length(trim(password_hash, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  password_changed_at INTEGER NOT NULL CHECK (password_changed_at >= created_at),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= password_changed_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) STRICT;
