-- Existing/test events remain excluded; the application opts new events in.
ALTER TABLE event_management ADD COLUMN achievements_enabled INTEGER NOT NULL DEFAULT 0 CHECK(achievements_enabled IN (0,1));
CREATE TRIGGER event_achievement_qualification_locked BEFORE UPDATE OF achievements_enabled ON event_management
WHEN NEW.achievements_enabled IS NOT OLD.achievements_enabled
 AND EXISTS(SELECT 1 FROM event_finalizations WHERE event_id=OLD.event_id)
BEGIN
 SELECT RAISE(ABORT,'Finalized achievement qualification is locked');
END;

-- Awards derive from immutable finalized member-attendance facts. Store only
-- the member's optional showcase choice, never duplicate bills/names/history.
CREATE TABLE member_achievement_showcase (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 selected_code TEXT CHECK(selected_code IN ('first-lan','full-weekend','silver','lan-recruit','legendary')),
 revision INTEGER NOT NULL CHECK(revision>=1),
 updated_at INTEGER NOT NULL CHECK(updated_at>=0)
) STRICT;
