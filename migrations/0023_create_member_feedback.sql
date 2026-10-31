-- Phase 4.6: private feedback. Remote application requires separate approval.
CREATE TABLE feedback_requests (
 id TEXT PRIMARY KEY NOT NULL,
 owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 creation_id TEXT NOT NULL,
 creation_hash TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('bug','feature')),
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
 description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 5000),
 decision TEXT NOT NULL DEFAULT 'pending' CHECK(decision IN ('pending','yes','no','maybe')),
 progress TEXT NOT NULL DEFAULT 'new' CHECK(progress IN ('new','under_review','planned','in_progress','completed','closed')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 github_number INTEGER CHECK(github_number>0 AND github_number<=2147483647),
 closed_at INTEGER,
 created_at INTEGER NOT NULL DEFAULT(unixepoch()),
 updated_at INTEGER NOT NULL DEFAULT(unixepoch()),
 UNIQUE(owner_id,creation_id),
 CHECK((progress IN ('completed','closed'))=(closed_at IS NOT NULL))
) STRICT;
CREATE INDEX feedback_owner_page ON feedback_requests(owner_id,created_at,id);
CREATE INDEX feedback_inbox_page ON feedback_requests(created_at,id);
CREATE INDEX feedback_expiry ON feedback_requests(closed_at);
CREATE TABLE feedback_events (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 request_id TEXT NOT NULL REFERENCES feedback_requests(id) ON DELETE CASCADE,
 actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 actor_kind TEXT NOT NULL CHECK(actor_kind IN ('member','administrator')),
 kind TEXT NOT NULL CHECK(kind IN ('created','reply','triage','github_link')),
 notification TEXT NOT NULL CHECK(notification IN ('member','administrator','none')),
 body TEXT,
 delta TEXT,
 operation_id TEXT NOT NULL,
 operation_hash TEXT NOT NULL,
 occurred_at INTEGER NOT NULL DEFAULT(unixepoch()),
 UNIQUE(request_id,operation_id),
 CHECK(body IS NULL OR length(body)<=2000)
) STRICT;
CREATE INDEX feedback_event_page ON feedback_events(request_id,sequence);
CREATE INDEX feedback_event_unread ON feedback_events(request_id,notification,sequence);
CREATE TABLE feedback_reads (
 request_id TEXT NOT NULL REFERENCES feedback_requests(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 audience TEXT NOT NULL CHECK(audience IN ('member','administrator')),
 seen_sequence INTEGER NOT NULL CHECK(seen_sequence>=0),
 PRIMARY KEY(request_id,user_id,audience)
) STRICT;
CREATE TRIGGER feedback_request_identity BEFORE UPDATE OF id,owner_id,creation_id,creation_hash,kind,title,description,created_at ON feedback_requests
BEGIN
 SELECT RAISE(ABORT,'Feedback submission is immutable');
END;
CREATE TRIGGER feedback_event_content BEFORE UPDATE OF sequence,request_id,actor_kind,kind,notification,body,delta,operation_id,operation_hash,occurred_at ON feedback_events
BEGIN
 SELECT RAISE(ABORT,'Feedback history is immutable');
END;
CREATE TRIGGER feedback_event_actor BEFORE UPDATE OF actor_id ON feedback_events
WHEN NEW.actor_id IS NOT NULL OR OLD.actor_id IS NULL
BEGIN
 SELECT RAISE(ABORT,'Feedback actor can only be anonymized');
END;