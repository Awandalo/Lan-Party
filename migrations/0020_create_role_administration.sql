-- Additive Phase 4.3 candidate. Remote execution requires separate approval.
ALTER TABLE roles ADD COLUMN is_protected INTEGER NOT NULL DEFAULT 0 CHECK(is_protected IN (0,1));
UPDATE roles SET is_protected=1 WHERE id='1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7';
INSERT INTO permissions(id,code,description,created_at) VALUES
 ('a76449e9-6e3c-4a21-b949-1b495a01597f','roles.protect_admin','Reserved protection capability - only genuine built-in Administrators exercise it.',unixepoch());
CREATE TABLE rbac_state (
 id INTEGER PRIMARY KEY CHECK(id=1),
 revision INTEGER NOT NULL CHECK(revision>=0)
) STRICT;
INSERT INTO rbac_state VALUES(1,0);
CREATE TABLE role_activity (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 operation_id TEXT NOT NULL UNIQUE,
 occurred_at INTEGER NOT NULL CHECK(occurred_at>=0),
 actor_id TEXT NOT NULL,
 operation TEXT NOT NULL CHECK(operation IN ('role.create','role.update','membership.add','membership.remove')),
 role_id TEXT NOT NULL,
 account_id TEXT,
 delta TEXT NOT NULL CHECK(json_valid(delta)),
 revision INTEGER NOT NULL UNIQUE CHECK(revision>0)
) STRICT;
-- Stable pseudonymous references deliberately have no account FK. Approved
-- deletion must not erase history or be blocked by permanent audit references.
CREATE TRIGGER role_activity_no_update BEFORE UPDATE ON role_activity BEGIN
 SELECT RAISE(ABORT,'Role activity is append-only');
END;
CREATE TRIGGER role_activity_no_delete BEFORE DELETE ON role_activity BEGIN
 SELECT RAISE(ABORT,'Role activity is append-only');
END;
CREATE TRIGGER role_activity_no_replace BEFORE INSERT ON role_activity
WHEN EXISTS(SELECT 1 FROM role_activity WHERE operation_id=NEW.operation_id OR sequence=NEW.sequence OR revision=NEW.revision)
BEGIN SELECT RAISE(ABORT,'Role activity is append-only');
END;
CREATE TRIGGER builtin_role_no_update BEFORE UPDATE ON roles
WHEN OLD.id IN ('1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7','193e06d9-4dfa-4ef9-80f2-9d457b6b7b5f')
BEGIN SELECT RAISE(ABORT,'Built-in role is immutable');
END;
CREATE TRIGGER builtin_role_no_delete BEFORE DELETE ON roles
WHEN OLD.id IN ('1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7','193e06d9-4dfa-4ef9-80f2-9d457b6b7b5f')
BEGIN SELECT RAISE(ABORT,'Built-in role is immutable');
END;
CREATE TRIGGER builtin_role_no_replace BEFORE INSERT ON roles
WHEN EXISTS(SELECT 1 FROM roles WHERE id IN ('1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7','193e06d9-4dfa-4ef9-80f2-9d457b6b7b5f') AND (id=NEW.id OR code=NEW.code))
BEGIN SELECT RAISE(ABORT,'Built-in role is immutable');
END;
-- Reconcile reserved provisioning with genuine intrinsic authority. Retain the
-- exact existing 0019 bootstrap exception, without exposing a new bootstrap path.
DROP TRIGGER member_numbers_reserved_admin;
CREATE TRIGGER member_numbers_reserved_admin BEFORE UPDATE ON member_numbers
WHEN OLD.user_id IS NULL AND NEW.user_id IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM users a JOIN user_roles ur ON ur.user_id=a.id JOIN roles r ON r.id=ur.role_id
 WHERE a.id=NEW.reserved_by_user_id AND a.status='active' AND a.email_verified_at IS NOT NULL
 AND r.id='1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7' AND r.is_active=1 AND ur.assigned_at<=unixepoch()
 AND NOT EXISTS(SELECT 1 FROM account_lifecycle l WHERE l.user_id=a.id))
 AND NOT(NEW.member_number=1 AND OLD.retired=0 AND OLD.registered=0
 AND NEW.reserved_by_user_id=NEW.user_id AND NOT EXISTS(SELECT 1 FROM users)
 AND EXISTS(SELECT 1 FROM owner_bootstrap b WHERE b.singleton=1 AND b.user_id=NEW.user_id AND b.completed_at IS NULL))
BEGIN
 SELECT RAISE(ABORT,'Reserved member numbers require an authorized administrator');
END;
