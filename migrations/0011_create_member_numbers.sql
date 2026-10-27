-- Cosmetic issuance history, not an identity or authorization source.
-- Deliberately no FK from this immutable ledger to users: UUID tombstones survive
-- account deletion. No names, email, credentials or roles are copied here.
CREATE TABLE member_numbers (
  member_number INTEGER PRIMARY KEY AUTOINCREMENT CHECK (member_number >= 1),
  user_id TEXT UNIQUE CHECK (user_id IS NULL OR length(user_id) = 36),
  registered INTEGER NOT NULL CHECK (registered IN (0, 1)),
  reserved_by_user_id TEXT CHECK (reserved_by_user_id IS NULL OR length(reserved_by_user_id) = 36),
  issued_at INTEGER CHECK (issued_at >= 0),
  CHECK (
    (member_number <= 10 AND user_id IS NULL AND registered = 0 AND reserved_by_user_id IS NULL AND issued_at IS NULL)
    OR (member_number <= 10 AND user_id IS NOT NULL AND reserved_by_user_id IS NOT NULL
      AND ((registered = 0 AND issued_at IS NULL) OR (registered = 1 AND issued_at IS NOT NULL)))
    OR (member_number >= 11 AND user_id IS NOT NULL AND registered = 1 AND reserved_by_user_id IS NULL AND issued_at IS NOT NULL)
  )
) STRICT;

-- Reserve slots, not accounts. AUTOINCREMENT now starts regular allocation at 11.
WITH RECURSIVE reserved(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM reserved WHERE n < 10)
INSERT INTO member_numbers (member_number, registered) SELECT n, 0 FROM reserved;

-- Deterministic backfill for every existing account, including unclaimed profiles.
INSERT INTO member_numbers (user_id, registered, issued_at)
  SELECT id, 1, created_at FROM users ORDER BY created_at, id;

CREATE TRIGGER member_numbers_no_delete BEFORE DELETE ON member_numbers
BEGIN
  SELECT RAISE(ABORT, 'Member numbers are permanent');
END;

CREATE TRIGGER member_numbers_immutable BEFORE UPDATE ON member_numbers
WHEN NOT (
  NEW.member_number = OLD.member_number AND OLD.member_number <= 10 AND OLD.registered = 0
  AND (
    (OLD.user_id IS NULL AND OLD.reserved_by_user_id IS NULL AND NEW.user_id IS NOT NULL
      AND NEW.reserved_by_user_id IS NOT NULL AND NEW.registered = 0 AND NEW.issued_at IS NULL)
    OR (OLD.user_id IS NOT NULL AND NEW.user_id = OLD.user_id AND NEW.reserved_by_user_id = OLD.reserved_by_user_id
      AND NEW.registered = 1 AND NEW.issued_at IS NOT NULL
      AND EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id AND created_at = NEW.issued_at))
  )
)
BEGIN
  SELECT RAISE(ABORT, 'Member number assignments are immutable');
END;

CREATE TRIGGER member_numbers_reserved_admin BEFORE UPDATE ON member_numbers
WHEN OLD.user_id IS NULL AND NEW.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM users a JOIN user_roles ur ON ur.user_id = a.id
    JOIN roles r ON r.id = ur.role_id JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE a.id = NEW.reserved_by_user_id AND a.status = 'active' AND a.email_verified_at IS NOT NULL
      AND r.code = 'admin' AND r.is_active = 1 AND p.code = 'users.manage'
  )
BEGIN
  SELECT RAISE(ABORT, 'Reserved member numbers require an authorized administrator');
END;

CREATE TRIGGER member_numbers_regular_insert BEFORE INSERT ON member_numbers
WHEN NEW.registered <> 1 OR NEW.user_id IS NULL OR NEW.reserved_by_user_id IS NOT NULL
  -- Check conflicts before SQLite REPLACE can delete a row (delete triggers alone
  -- are insufficient when recursive_triggers is off).
  OR EXISTS (SELECT 1 FROM member_numbers WHERE member_number = NEW.member_number OR user_id = NEW.user_id)
  OR NEW.member_number BETWEEN 1 AND (SELECT seq FROM sqlite_sequence WHERE name = 'member_numbers')
  OR NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND created_at = NEW.issued_at)
BEGIN
  SELECT RAISE(ABORT, 'Regular numbers are allocated with account creation');
END;

CREATE TRIGGER users_member_number_reuse BEFORE INSERT ON users
WHEN EXISTS (SELECT 1 FROM member_numbers WHERE user_id = NEW.id AND registered = 1)
BEGIN
  SELECT RAISE(ABORT, 'An issued account UUID cannot be reused');
END;

CREATE TRIGGER users_allocate_member_number AFTER INSERT ON users
BEGIN
  INSERT INTO member_numbers (user_id, registered, issued_at)
    SELECT NEW.id, 1, NEW.created_at WHERE NOT EXISTS (SELECT 1 FROM member_numbers WHERE user_id = NEW.id);
  UPDATE member_numbers SET registered = 1, issued_at = NEW.created_at WHERE user_id = NEW.id AND registered = 0;
END;
