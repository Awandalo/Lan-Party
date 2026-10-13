-- UUID validation and slug generation remain trusted Worker responsibilities.
-- Publication metadata records current state, not a complete revision history.
CREATE TABLE news_articles (
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
  author_user_id TEXT NOT NULL REFERENCES users(id)
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

CREATE INDEX news_articles_publication_date_idx
  ON news_articles(publication_status, published_at DESC);
CREATE INDEX news_articles_author_user_id_idx ON news_articles(author_user_id);
CREATE INDEX news_articles_updated_by_user_id_idx ON news_articles(updated_by_user_id);
