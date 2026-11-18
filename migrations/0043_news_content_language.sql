ALTER TABLE news_articles ADD COLUMN language TEXT NOT NULL DEFAULT 'nl'
  CHECK (language IN ('nl', 'en'));
