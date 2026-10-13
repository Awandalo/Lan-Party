-- UUID generation/validation and stable role codes are future Worker responsibilities.
-- Table structure only. Reference data and reviewed mappings are reserved for 0006.
CREATE TABLE roles (
  id TEXT NOT NULL PRIMARY KEY
    CHECK (length(trim(id, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  code TEXT NOT NULL UNIQUE
    CHECK (code GLOB '[a-z]*' AND code NOT GLOB '*[^a-z0-9_]*'
      AND substr(code, -1) <> '_'),
  name TEXT NOT NULL
    CHECK (length(trim(name, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at)
) STRICT;

CREATE TABLE permissions (
  id TEXT NOT NULL PRIMARY KEY
    CHECK (length(trim(id, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  -- Lowercase resource.action identifiers, no wildcards or additional dots.
  code TEXT NOT NULL UNIQUE CHECK (
    code GLOB '[a-z]*.[a-z]*'
    AND code NOT GLOB '*[^a-z0-9_.]*'
    AND instr(substr(code, instr(code, '.') + 1), '.') = 0
    AND substr(code, -1) <> '_'
  ),
  description TEXT NOT NULL
    CHECK (length(trim(description, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  created_at INTEGER NOT NULL CHECK (created_at >= 0)
) STRICT;

CREATE TABLE user_roles (
  user_id TEXT NOT NULL
    CHECK (length(trim(user_id, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  role_id TEXT NOT NULL
    CHECK (length(trim(role_id, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  assigned_at INTEGER NOT NULL CHECK (assigned_at >= 0),
  assigned_by_user_id TEXT,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) STRICT;

-- Composite primary keys cover lookups by their first column.
CREATE INDEX user_roles_role_id_idx ON user_roles(role_id);
CREATE INDEX user_roles_assigned_by_user_id_idx ON user_roles(assigned_by_user_id);

CREATE TABLE role_permissions (
  role_id TEXT NOT NULL
    CHECK (length(trim(role_id, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  permission_id TEXT NOT NULL
    CHECK (length(trim(permission_id, char(9) || char(10) || char(11) || char(12) || char(13) || ' ')) > 0),
  granted_at INTEGER NOT NULL CHECK (granted_at >= 0),
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) STRICT;

CREATE INDEX role_permissions_permission_id_idx ON role_permissions(permission_id);

-- These records do not establish authorization. Trusted Worker checks remain required.
-- No roles, permissions, user accounts or privileged assignments are seeded here.
