-- Polls reuse News publication, content, editorial permissions and audit.
CREATE TABLE news_polls (
 article_id TEXT PRIMARY KEY REFERENCES news_articles(id) ON DELETE CASCADE,
 mode TEXT NOT NULL CHECK(mode IN ('single','multiple')),
 closed INTEGER NOT NULL DEFAULT 0 CHECK(closed IN (0,1)),
 locked INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0)
) STRICT;
CREATE TABLE news_poll_options (
 poll_id TEXT NOT NULL REFERENCES news_polls(article_id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 120),
 sort_order INTEGER NOT NULL CHECK(sort_order BETWEEN 0 AND 7),
 PRIMARY KEY(poll_id,id), UNIQUE(poll_id,sort_order), UNIQUE(poll_id,label)
) STRICT;
CREATE TABLE news_poll_ballots (
 poll_id TEXT NOT NULL REFERENCES news_polls(article_id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL CHECK(revision>=1),
 updated_at INTEGER NOT NULL CHECK(updated_at>=0),
 window_started_at INTEGER NOT NULL CHECK(window_started_at>=0),
 changes INTEGER NOT NULL CHECK(changes BETWEEN 1 AND 60),
 PRIMARY KEY(poll_id,user_id)
) STRICT;
CREATE TABLE news_poll_selections (
 poll_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 option_id TEXT NOT NULL,
 PRIMARY KEY(poll_id,user_id,option_id),
 FOREIGN KEY(poll_id,user_id) REFERENCES news_poll_ballots(poll_id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(poll_id,option_id) REFERENCES news_poll_options(poll_id,id) ON DELETE CASCADE
) STRICT;
CREATE INDEX news_poll_selections_option_idx ON news_poll_selections(poll_id,option_id);
CREATE TRIGGER news_poll_first_ballot AFTER INSERT ON news_poll_ballots
BEGIN
 UPDATE news_polls SET locked=1 WHERE article_id=NEW.poll_id;
END;
CREATE TRIGGER news_poll_single_choice BEFORE INSERT ON news_poll_selections
WHEN (SELECT mode FROM news_polls WHERE article_id=NEW.poll_id)='single'
 AND EXISTS(SELECT 1 FROM news_poll_selections WHERE poll_id=NEW.poll_id AND user_id=NEW.user_id)
BEGIN
 SELECT RAISE(ABORT,'Single choice poll');
END;
CREATE TRIGGER news_poll_mode_locked BEFORE UPDATE OF mode ON news_polls
WHEN OLD.locked=1 AND NEW.mode IS NOT OLD.mode
BEGIN
 SELECT RAISE(ABORT,'Poll question and choices are locked');
END;
CREATE TRIGGER news_poll_question_locked BEFORE UPDATE OF title ON news_articles
WHEN NEW.title IS NOT OLD.title AND EXISTS(SELECT 1 FROM news_polls WHERE article_id=OLD.id AND locked=1)
BEGIN
 SELECT RAISE(ABORT,'Poll question and choices are locked');
END;
CREATE TRIGGER news_poll_options_locked_update BEFORE UPDATE ON news_poll_options
WHEN EXISTS(SELECT 1 FROM news_polls WHERE article_id=OLD.poll_id AND locked=1)
BEGIN
 SELECT RAISE(ABORT,'Poll question and choices are locked');
END;
CREATE TRIGGER news_poll_options_locked_delete BEFORE DELETE ON news_poll_options
WHEN EXISTS(SELECT 1 FROM news_polls WHERE article_id=OLD.poll_id AND locked=1)
BEGIN
 SELECT RAISE(ABORT,'Poll question and choices are locked');
END;
CREATE TRIGGER news_poll_options_locked_insert BEFORE INSERT ON news_poll_options
WHEN EXISTS(SELECT 1 FROM news_polls WHERE article_id=NEW.poll_id AND locked=1)
BEGIN
 SELECT RAISE(ABORT,'Poll question and choices are locked');
END;
