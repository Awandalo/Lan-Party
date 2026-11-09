-- Attendance corrections preserve the original registration and its day history.
INSERT INTO permissions(id,code,description,created_at) VALUES
 ('0df3c205-00b2-4b46-aefd-45e637ff26ef','finance.manage','Manage event complimentary places and payment instructions.',unixepoch());
-- No automatic role grants. Administrators retain their existing explicit override.
CREATE TABLE event_attendance_review (
 registration_id TEXT NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
 person_id TEXT NOT NULL,
 removed_days TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(removed_days) AND json_type(removed_days)='array'),
 added_days TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(added_days) AND json_type(added_days)='array'),
 complimentary INTEGER NOT NULL DEFAULT 0 CHECK(complimentary IN (0,1)),
 PRIMARY KEY(registration_id,person_id)
) STRICT;
CREATE TABLE event_payment_instructions (
 event_id TEXT PRIMARY KEY REFERENCES event_management(event_id) ON DELETE CASCADE,
 payment_url TEXT NOT NULL DEFAULT '' CHECK(length(payment_url)<=2048),
 instructions TEXT NOT NULL DEFAULT '' CHECK(length(instructions)<=2000)
) STRICT;
CREATE TABLE event_review_activity (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 operation_id TEXT NOT NULL UNIQUE,
 event_id TEXT NOT NULL REFERENCES event_management(event_id) ON DELETE CASCADE,
 actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 registration_id TEXT REFERENCES registrations(id) ON DELETE SET NULL,
 person_id TEXT,
 person_name TEXT,
 action TEXT NOT NULL CHECK(action IN ('attendance','complimentary','instructions')),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 300),
 detail TEXT NOT NULL CHECK(json_valid(detail)),
 occurred_at INTEGER NOT NULL
) STRICT;
CREATE INDEX event_review_activity_event ON event_review_activity(event_id,sequence);
-- Anonymous counters only: account deletion must not undo a reviewed exclusion.
CREATE TABLE event_review_anonymous (
 event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
 excluded_people INTEGER NOT NULL DEFAULT 0 CHECK(excluded_people>=0),
 added_people INTEGER NOT NULL DEFAULT 0 CHECK(added_people>=0),
 deleted_accounts INTEGER NOT NULL DEFAULT 0 CHECK(deleted_accounts>=0)
) STRICT;
CREATE TABLE event_review_anonymous_days (
 event_day_id TEXT PRIMARY KEY REFERENCES event_days(id) ON DELETE RESTRICT,
 excluded INTEGER NOT NULL DEFAULT 0 CHECK(excluded>=0),
 added INTEGER NOT NULL DEFAULT 0 CHECK(added>=0)
) STRICT;
CREATE TRIGGER event_review_identity_removed BEFORE DELETE ON registrations
BEGIN
 UPDATE event_review_activity SET person_id=NULL,person_name=NULL WHERE registration_id=OLD.id;
END;
CREATE TRIGGER event_review_account_removed BEFORE DELETE ON registrations
WHEN OLD.status='registered' AND EXISTS(SELECT 1 FROM event_management m JOIN events e ON e.id=m.event_id
 WHERE m.event_id=OLD.event_id AND m.ends_at<=unixepoch() AND e.publication_status IN ('published','archived'))
 AND (EXISTS(SELECT 1 FROM event_registration_places WHERE registration_id=OLD.id AND state='confirmed')
 OR EXISTS(SELECT 1 FROM event_attendance_review WHERE registration_id=OLD.id AND json_array_length(added_days)>0))
BEGIN
 INSERT INTO event_review_anonymous(event_id,excluded_people,deleted_accounts)
 SELECT OLD.event_id,count(*),1 FROM
 (SELECT p.person_id FROM event_registration_places p LEFT JOIN event_attendance_review v
 ON v.registration_id=p.registration_id AND v.person_id=p.person_id
 JOIN event_days d ON d.id=p.event_day_id
 WHERE p.registration_id=OLD.id AND p.state='confirmed' GROUP BY p.person_id
 HAVING count(*)=sum(CASE WHEN EXISTS(SELECT 1 FROM json_each(coalesce(v.removed_days,'[]')) WHERE value=d.attendance_date) THEN 1 ELSE 0 END)
 AND max(json_array_length(coalesce(v.added_days,'[]')))=0) WHERE 1
 ON CONFLICT(event_id) DO UPDATE SET excluded_people=excluded_people+excluded.excluded_people,deleted_accounts=deleted_accounts+1;
 UPDATE event_review_anonymous SET added_people=added_people+(SELECT count(*) FROM event_attendance_review v
 WHERE v.registration_id=OLD.id AND json_array_length(v.added_days)>0 AND NOT EXISTS(
 SELECT 1 FROM event_registration_places p WHERE p.registration_id=OLD.id AND p.person_id=v.person_id AND p.state='confirmed')) WHERE event_id=OLD.event_id;
 INSERT INTO event_review_anonymous_days(event_day_id,added)
 SELECT d.id,count(*) FROM event_attendance_review v JOIN json_each(v.added_days) j
 JOIN event_days d ON d.event_id=OLD.event_id AND d.attendance_date=j.value
 WHERE v.registration_id=OLD.id GROUP BY d.id
 ON CONFLICT(event_day_id) DO UPDATE SET added=added+excluded.added;
 INSERT INTO event_review_anonymous_days(event_day_id,excluded)
 SELECT p.event_day_id,count(*) FROM event_registration_places p JOIN event_days d ON d.id=p.event_day_id
 JOIN event_attendance_review v ON v.registration_id=p.registration_id AND v.person_id=p.person_id
 WHERE p.registration_id=OLD.id AND p.state='confirmed'
 AND EXISTS(SELECT 1 FROM json_each(v.removed_days) WHERE value=d.attendance_date)
 GROUP BY p.event_day_id
 ON CONFLICT(event_day_id) DO UPDATE SET excluded=excluded+excluded.excluded;
END;
