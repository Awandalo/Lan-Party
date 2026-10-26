-- Local deletion preparation. No HTTP deletion route until retention/restore approval.
CREATE TABLE anonymous_event_registrations (
 event_id TEXT PRIMARY KEY NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
 total INTEGER NOT NULL CHECK(total>=0)
) STRICT;
CREATE TABLE anonymous_day_registrations (
 event_day_id TEXT PRIMARY KEY NOT NULL,
 event_id TEXT NOT NULL,
 total INTEGER NOT NULL CHECK(total>=0),
 FOREIGN KEY(event_day_id,event_id) REFERENCES event_days(id,event_id) ON DELETE RESTRICT
) STRICT;
CREATE TABLE member_sequence_checkpoint (value INTEGER NOT NULL);
INSERT INTO member_sequence_checkpoint SELECT coalesce((SELECT seq FROM sqlite_sequence WHERE name='member_numbers'),0);
DROP TRIGGER member_numbers_no_delete;
DROP TRIGGER member_numbers_immutable;
DROP TRIGGER member_numbers_reserved_admin;
DROP TRIGGER member_numbers_regular_insert;
DROP TRIGGER users_member_number_reuse;
DROP TRIGGER users_allocate_member_number;
CREATE TABLE member_numbers_next (
  member_number INTEGER PRIMARY KEY AUTOINCREMENT CHECK (member_number >= 1),
  user_id TEXT UNIQUE CHECK (user_id IS NULL OR length(user_id) = 36),
  retired INTEGER NOT NULL DEFAULT 0 CHECK(retired IN (0,1)),
  registered INTEGER NOT NULL CHECK (registered IN (0, 1)),
  reserved_by_user_id TEXT CHECK (reserved_by_user_id IS NULL OR length(reserved_by_user_id) = 36),
  issued_at INTEGER CHECK (issued_at >= 0),
  CHECK (
   (retired=1 AND user_id IS NULL AND reserved_by_user_id IS NULL AND registered=1 AND issued_at IS NOT NULL)
   OR (retired=0 AND (
    (member_number<=10 AND user_id IS NULL AND registered=0 AND reserved_by_user_id IS NULL AND issued_at IS NULL)
    OR (member_number<=10 AND user_id IS NOT NULL AND ((registered=0 AND issued_at IS NULL) OR (registered=1 AND issued_at IS NOT NULL)))
    OR (member_number>=11 AND user_id IS NOT NULL AND registered=1 AND reserved_by_user_id IS NULL AND issued_at IS NOT NULL)
   ))
  )
) STRICT;
INSERT INTO member_numbers_next(member_number,user_id,registered,reserved_by_user_id,issued_at)
 SELECT member_number,user_id,registered,reserved_by_user_id,issued_at FROM member_numbers;
DROP TABLE member_numbers;
ALTER TABLE member_numbers_next RENAME TO member_numbers;
UPDATE sqlite_sequence SET seq=max(seq,(SELECT value FROM member_sequence_checkpoint)) WHERE name='member_numbers';
DROP TABLE member_sequence_checkpoint;
CREATE TRIGGER member_numbers_no_delete BEFORE DELETE ON member_numbers
BEGIN
  SELECT RAISE(ABORT, 'Member numbers are permanent');
END;

CREATE TRIGGER member_numbers_immutable BEFORE UPDATE ON member_numbers
WHEN NOT (
 (OLD.retired=0 AND NEW.retired=1 AND NEW.member_number=OLD.member_number AND NEW.user_id IS NULL
  AND NEW.reserved_by_user_id IS NULL AND NEW.registered=1 AND NEW.issued_at=OLD.issued_at
  AND EXISTS(SELECT 1 FROM account_lifecycle l JOIN users u ON u.id=l.user_id WHERE l.user_id=OLD.user_id AND l.state='deleting' AND u.status='disabled'))
 OR (NEW.retired=OLD.retired AND NEW.member_number=OLD.member_number AND NEW.user_id IS OLD.user_id
  AND NEW.registered=OLD.registered AND NEW.issued_at IS OLD.issued_at AND NEW.reserved_by_user_id IS NULL
  AND OLD.reserved_by_user_id IS NOT NULL AND EXISTS(SELECT 1 FROM account_lifecycle l JOIN users u ON u.id=l.user_id
   WHERE l.user_id=OLD.reserved_by_user_id AND l.state='deleting' AND u.status='disabled'))
 OR (
  NEW.retired=OLD.retired AND NEW.member_number = OLD.member_number AND OLD.member_number <= 10 AND OLD.registered = 0
  AND (
    (OLD.user_id IS NULL AND OLD.reserved_by_user_id IS NULL AND NEW.user_id IS NOT NULL
      AND NEW.reserved_by_user_id IS NOT NULL AND NEW.registered = 0 AND NEW.issued_at IS NULL)
    OR (OLD.user_id IS NOT NULL AND NEW.user_id = OLD.user_id AND NEW.reserved_by_user_id = OLD.reserved_by_user_id
      AND NEW.registered = 1 AND NEW.issued_at IS NOT NULL
      AND EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id AND created_at = NEW.issued_at))
  )
))
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
WHEN NEW.retired<>0 OR NEW.registered <> 1 OR NEW.user_id IS NULL OR NEW.reserved_by_user_id IS NOT NULL
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

CREATE TABLE news_articles_next (
  id TEXT NOT NULL PRIMARY KEY
    CHECK (length(trim(id, char(9, 10, 11, 12, 13) || ' ')) > 0),
  title TEXT NOT NULL
    CHECK (length(trim(title, char(9, 10, 11, 12, 13) || ' ')) > 0),
  slug TEXT NOT NULL UNIQUE CHECK (
    length(slug) > 0
    AND slug NOT GLOB '*[^a-z0-9-]*'
    AND substr(slug, 1, 1) <> '-'
    AND substr(slug, -1) <> '-'
    AND instr(slug, char(45) || char(45)) = 0
  ),
  content TEXT NOT NULL,
  excerpt TEXT,
  cover_image_key TEXT
    CHECK (length(trim(cover_image_key, char(9, 10, 11, 12, 13) || ' ')) > 0),
  author_user_id TEXT REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  updated_by_user_id TEXT REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  publication_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (publication_status IN ('draft', 'published', 'archived')),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
  published_at INTEGER CHECK (
    published_at >= 0 AND published_at >= created_at AND published_at <= updated_at
  ),
  CHECK (publication_status <> 'published' OR (
    published_at IS NOT NULL
    AND length(trim(content, char(9, 10, 11, 12, 13) || ' ')) > 0
  )),
  CHECK (publication_status <> 'draft' OR published_at IS NULL)
) STRICT;
INSERT INTO news_articles_next SELECT * FROM news_articles;
DROP TABLE news_articles;
ALTER TABLE news_articles_next RENAME TO news_articles;
CREATE INDEX news_articles_publication_date_idx
  ON news_articles(publication_status, published_at DESC);
CREATE INDEX news_articles_author_user_id_idx ON news_articles(author_user_id);
CREATE INDEX news_articles_updated_by_user_id_idx ON news_articles(updated_by_user_id);
