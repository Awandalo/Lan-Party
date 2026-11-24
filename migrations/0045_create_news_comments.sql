ALTER TABLE news_articles ADD COLUMN comments_open INTEGER NOT NULL DEFAULT 0 CHECK (comments_open IN (0, 1));
ALTER TABLE news_articles ADD COLUMN comments_revision INTEGER NOT NULL DEFAULT 0 CHECK (comments_revision >= 0);

CREATE TABLE news_comments (
  id TEXT PRIMARY KEY NOT NULL,
  article_id TEXT NOT NULL REFERENCES news_articles(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  body TEXT CHECK (body IS NULL OR json_valid(body)),
  state TEXT NOT NULL DEFAULT 'visible' CHECK (state IN ('visible', 'deleted', 'removed')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at INTEGER NOT NULL,
  edited_at INTEGER,
  recovery_until INTEGER,
  CHECK ((state = 'visible' AND body IS NOT NULL AND recovery_until IS NULL)
    OR (state = 'deleted' AND body IS NULL AND recovery_until IS NULL)
    OR (state = 'removed' AND ((body IS NULL AND recovery_until IS NULL)
      OR (body IS NOT NULL AND recovery_until IS NOT NULL))))
) STRICT;
CREATE INDEX news_comments_page_idx ON news_comments(article_id, created_at DESC, id DESC);
CREATE INDEX news_comments_author_idx ON news_comments(author_id, created_at);
CREATE INDEX news_comments_recovery_idx ON news_comments(recovery_until) WHERE recovery_until IS NOT NULL;

CREATE TABLE news_comment_moderation (
  id INTEGER PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES news_articles(id) ON DELETE CASCADE,
  comment_id TEXT REFERENCES news_comments(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('redact', 'remove', 'restore', 'open', 'close')),
  reason TEXT,
  occurred_at INTEGER NOT NULL
) STRICT;
CREATE INDEX news_comment_moderation_expiry_idx ON news_comment_moderation(occurred_at);
CREATE INDEX news_comment_moderation_comment_idx ON news_comment_moderation(comment_id, id DESC);
CREATE INDEX news_comment_moderation_article_idx ON news_comment_moderation(article_id);
CREATE INDEX news_comment_moderation_actor_idx ON news_comment_moderation(actor_id);

INSERT INTO permissions(id, code, description, created_at)
VALUES ('92c0fbda-dc93-415a-b9a0-759faee76370', 'news.moderate_comments', 'Moderate News and Poll comments and manage discussion threads.', unixepoch());
INSERT INTO roles(id, code, name, description, is_active, is_protected, created_at, updated_at)
VALUES ('cc6f05ad-6bce-4dea-9aa8-34933fa10f00', 'news_moderator', 'News Moderator', 'Moderate News and Poll comments and manage discussion threads.', 1, 0, unixepoch(), unixepoch());
INSERT INTO role_permissions(role_id, permission_id, granted_at)
VALUES ('cc6f05ad-6bce-4dea-9aa8-34933fa10f00', '92c0fbda-dc93-415a-b9a0-759faee76370', unixepoch());
