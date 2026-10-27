-- No account, role grant, private email or capability is seeded by this migration.
-- The application must opt in through the trusted PROD build and private config.
CREATE TABLE owner_bootstrap (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 user_id TEXT UNIQUE CHECK(user_id IS NULL OR length(user_id)=36),
 email_normalized TEXT,
 created_at INTEGER NOT NULL CHECK(created_at>=0),
 completed_at INTEGER CHECK(completed_at>=created_at),
 CHECK((completed_at IS NULL AND user_id IS NOT NULL AND email_normalized IS NOT NULL AND email_normalized=lower(email_normalized))
   OR (completed_at IS NOT NULL AND email_normalized IS NULL))
) STRICT;
CREATE TRIGGER owner_bootstrap_once BEFORE INSERT ON owner_bootstrap
WHEN EXISTS(SELECT 1 FROM owner_bootstrap) OR NEW.completed_at IS NOT NULL
 OR EXISTS(SELECT 1 FROM users)
 OR NOT EXISTS(SELECT 1 FROM member_numbers WHERE member_number=1 AND user_id IS NULL AND registered=0 AND retired=0)
 OR NOT EXISTS(SELECT 1 FROM roles r JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id
   WHERE r.code='admin' AND r.is_active=1 AND p.code='users.manage')
BEGIN
 SELECT RAISE(ABORT,'First owner setup unavailable');
END;
CREATE TRIGGER owner_bootstrap_no_delete BEFORE DELETE ON owner_bootstrap
BEGIN
 SELECT RAISE(ABORT,'First owner setup is one-time');
END;
CREATE TRIGGER owner_bootstrap_transition BEFORE UPDATE ON owner_bootstrap
WHEN NOT (NEW.singleton=OLD.singleton AND NEW.created_at=OLD.created_at AND (
 (OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL AND NEW.user_id=OLD.user_id AND NEW.email_normalized IS NULL
   AND EXISTS(SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
     JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id
     WHERE u.id=OLD.user_id AND u.email_normalized=OLD.email_normalized AND u.email_verified_at=NEW.completed_at
     AND u.status='active' AND r.code='admin' AND r.is_active=1 AND p.code='users.manage'))
 OR (OLD.completed_at IS NOT NULL AND NEW.completed_at=OLD.completed_at AND NEW.email_normalized IS NULL
   AND NEW.user_id IS NULL AND OLD.user_id IS NOT NULL
   AND EXISTS(SELECT 1 FROM account_lifecycle l JOIN users u ON u.id=l.user_id
     WHERE u.id=OLD.user_id AND l.state='deleting' AND u.status='disabled'))
))
BEGIN
 SELECT RAISE(ABORT,'First owner receipt is immutable');
END;
DROP TRIGGER member_numbers_reserved_admin;
CREATE TRIGGER member_numbers_reserved_admin BEFORE UPDATE ON member_numbers
WHEN OLD.user_id IS NULL AND NEW.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM users a JOIN user_roles ur ON ur.user_id = a.id
    JOIN roles r ON r.id = ur.role_id JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE a.id = NEW.reserved_by_user_id AND a.status = 'active' AND a.email_verified_at IS NOT NULL
      AND r.code = 'admin' AND r.is_active = 1 AND p.code = 'users.manage'
  )
  AND NOT (
    NEW.member_number=1 AND OLD.retired=0 AND OLD.registered=0
    AND NEW.reserved_by_user_id=NEW.user_id AND NOT EXISTS(SELECT 1 FROM users)
    AND EXISTS(SELECT 1 FROM owner_bootstrap b WHERE b.singleton=1 AND b.user_id=NEW.user_id AND b.completed_at IS NULL)
  )
BEGIN
  SELECT RAISE(ABORT, 'Reserved member numbers require an authorized administrator');
END;
-- The existing purpose-bound verification transaction consumes the token first.
-- The role and completion receipt commit with verification, never with signup.
CREATE TRIGGER owner_bootstrap_verified AFTER UPDATE OF email_verified_at ON users
WHEN OLD.email_verified_at IS NULL AND NEW.email_verified_at IS NOT NULL
 AND EXISTS(SELECT 1 FROM owner_bootstrap WHERE user_id=NEW.id AND completed_at IS NULL)
BEGIN
 SELECT CASE WHEN NEW.status<>'active'
  OR NOT EXISTS(SELECT 1 FROM owner_bootstrap WHERE user_id=NEW.id AND email_normalized=NEW.email_normalized)
  OR NOT EXISTS(SELECT 1 FROM member_numbers WHERE member_number=1 AND user_id=NEW.id AND registered=1 AND retired=0)
  OR NOT EXISTS(SELECT 1 FROM user_password_credentials WHERE user_id=NEW.id)
  OR NOT EXISTS(SELECT 1 FROM auth_action_tokens WHERE user_id=NEW.id AND purpose='email-verification'
    AND email_normalized=NEW.email_normalized AND auth_version=NEW.auth_version
    AND consumed_at=NEW.email_verified_at AND revoked_at IS NULL AND expires_at>NEW.email_verified_at)
  OR NOT EXISTS(SELECT 1 FROM roles r JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id
    WHERE r.code='admin' AND r.is_active=1 AND p.code='users.manage')
 THEN RAISE(ABORT,'First owner verification unavailable') END;
 INSERT INTO user_roles(user_id,role_id,assigned_at,assigned_by_user_id)
  SELECT NEW.id,id,NEW.email_verified_at,NEW.id FROM roles WHERE code='admin' AND is_active=1;
 UPDATE owner_bootstrap SET completed_at=NEW.email_verified_at,email_normalized=NULL WHERE user_id=NEW.id AND completed_at IS NULL;
END;
-- Retain only a consumed marker/timestamps after normal approved deletion, not
-- an identifying deletion registry. A deleted first owner can never reopen setup.
CREATE TRIGGER owner_bootstrap_account_delete AFTER UPDATE OF status ON users
WHEN NEW.status='disabled' AND EXISTS(SELECT 1 FROM account_lifecycle WHERE user_id=NEW.id AND state='deleting')
BEGIN
 UPDATE owner_bootstrap SET user_id=NULL WHERE user_id=NEW.id AND completed_at IS NOT NULL;
END;
