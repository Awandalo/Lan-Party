CREATE TABLE news_article_reactions (
  id INTEGER PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES news_articles(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reaction TEXT NOT NULL CHECK (reaction IN ('thumbs-up', 'heart', 'smile', 'laugh', 'cry', 'angry')),
  UNIQUE (article_id, user_id)
);

-- Anonymous rows are kept for article totals after account deletion.
CREATE INDEX news_article_reactions_user_idx ON news_article_reactions(user_id);
