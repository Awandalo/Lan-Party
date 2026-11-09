-- Extend the durable member registration foundation; retain its identities/history.
CREATE TABLE event_registration_control (
 event_id TEXT PRIMARY KEY REFERENCES event_management(event_id) ON DELETE CASCADE,
 sequence INTEGER NOT NULL DEFAULT 0 CHECK(sequence>=0)
) STRICT;
INSERT INTO event_registration_control(event_id) SELECT event_id FROM event_management;
CREATE TRIGGER event_registration_control_create AFTER INSERT ON event_management
BEGIN
 INSERT INTO event_registration_control(event_id) VALUES (NEW.event_id);
END;
CREATE TABLE event_registration_parties (
 registration_id TEXT PRIMARY KEY REFERENCES registrations(id) ON DELETE CASCADE,
 draft TEXT NOT NULL CHECK(json_valid(draft) AND json_type(draft)='object')
) STRICT;
CREATE TABLE event_registration_places (
 registration_id TEXT NOT NULL REFERENCES event_registration_parties(registration_id) ON DELETE CASCADE,
 event_id TEXT NOT NULL,
 event_day_id TEXT NOT NULL,
 person_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('confirmed','waitlisted')),
 queue_sequence INTEGER NOT NULL CHECK(queue_sequence>=0),
 PRIMARY KEY(registration_id,event_day_id,person_id),
 FOREIGN KEY(registration_id,event_id) REFERENCES registrations(id,event_id) ON DELETE CASCADE,
 FOREIGN KEY(event_day_id,event_id) REFERENCES event_days(id,event_id) ON DELETE RESTRICT
) STRICT;
CREATE INDEX event_registration_places_day ON event_registration_places(event_id,event_day_id,state);
-- Existing member-only selections remain confirmed; cancelled selections stay historical.
INSERT INTO event_registration_parties(registration_id,draft)
 SELECT r.id,json_object('days',json((SELECT json_group_array(attendance_date) FROM
 (SELECT d.attendance_date FROM registration_days rd JOIN event_days d ON d.id=rd.event_day_id
 WHERE rd.registration_id=r.id ORDER BY d.attendance_date))),'guests',json('[]')) FROM registrations r;
INSERT INTO event_registration_places
 SELECT r.id,r.event_id,rd.event_day_id,r.user_id,'confirmed',0 FROM registrations r
 JOIN registration_days rd ON rd.registration_id=r.id WHERE r.status='registered';
CREATE TABLE event_registration_operations (
 operation_id TEXT PRIMARY KEY,
 event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
 actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 action TEXT NOT NULL CHECK(action IN ('save','cancel','open','close','capacity','cancel-event')),
 occurred_at INTEGER NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>=0)
) STRICT;
CREATE TABLE event_registration_notifications (
 id TEXT PRIMARY KEY,
 operation_id TEXT NOT NULL REFERENCES event_registration_operations(operation_id),
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','attempting','sent','failed')),
 created_at INTEGER NOT NULL,
 UNIQUE(operation_id,user_id)
) STRICT;
CREATE INDEX event_registration_operations_actor ON event_registration_operations(actor_id,occurred_at);
-- Account deletion cascades private guest/contact data and fences overlapping saves.
CREATE TRIGGER event_registration_removed BEFORE DELETE ON registrations
BEGIN
 INSERT INTO anonymous_event_registrations(event_id,total)
 SELECT OLD.event_id,count(DISTINCT p.person_id) FROM event_registration_places p
 JOIN events e ON e.id=p.event_id JOIN event_management m ON m.event_id=e.id
 WHERE p.registration_id=OLD.id AND p.person_id<>OLD.user_id AND p.state='confirmed'
 AND OLD.status='registered' AND e.publication_status IN ('published','archived') AND m.ends_at<=unixepoch()
 HAVING count(DISTINCT p.person_id)>0
 ON CONFLICT(event_id) DO UPDATE SET total=total+excluded.total;
 INSERT INTO anonymous_day_registrations(event_day_id,event_id,total)
 SELECT p.event_day_id,OLD.event_id,count(*) FROM event_registration_places p
 JOIN events e ON e.id=p.event_id JOIN event_management m ON m.event_id=e.id
 WHERE p.registration_id=OLD.id AND p.person_id<>OLD.user_id AND p.state='confirmed'
 AND OLD.status='registered' AND e.publication_status IN ('published','archived') AND m.ends_at<=unixepoch()
 GROUP BY p.event_day_id
 ON CONFLICT(event_day_id) DO UPDATE SET total=total+excluded.total;
 UPDATE event_management SET revision=revision+1 WHERE event_id=OLD.event_id;
END;
