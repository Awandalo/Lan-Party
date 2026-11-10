-- Editorial audit metadata only; article bodies and historical names are not copied.
CREATE TABLE news_activity (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 operation_id TEXT NOT NULL UNIQUE,
 article_id TEXT NOT NULL,
 actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 action TEXT NOT NULL CHECK(action IN ('create','update','publish','unpublish','delete')),
 payload_digest TEXT NOT NULL CHECK(length(payload_digest)=64),
 occurred_at INTEGER NOT NULL CHECK(occurred_at>=0)
) STRICT;
CREATE INDEX news_activity_article_idx ON news_activity(article_id,sequence);

-- A new assignable role, not an assignment to any existing member. Conflicts fail.
INSERT INTO roles(id,code,name,description,is_active,is_protected,created_at,updated_at)
VALUES('708e77b5-2bab-4b66-8be4-600000000001','news_editor','News Editor','Create, edit, publish and unpublish News.',1,0,unixepoch(),unixepoch());
INSERT INTO role_permissions(role_id,permission_id,granted_at)
SELECT '708e77b5-2bab-4b66-8be4-600000000001',id,unixepoch() FROM permissions
WHERE code IN ('news.create','news.update','news.publish','news.archive');
