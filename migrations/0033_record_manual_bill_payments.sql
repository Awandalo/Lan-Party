-- Manual payment tracking changes only Paid/Unpaid, never locked bill amounts.
CREATE TABLE event_bill_payment_activity (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 operation_id TEXT NOT NULL UNIQUE,
 event_id TEXT NOT NULL REFERENCES event_finalizations(event_id) ON DELETE RESTRICT,
 bill_id TEXT NOT NULL REFERENCES event_bills(id) ON DELETE RESTRICT,
 actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 was_paid INTEGER NOT NULL CHECK(was_paid IN (0,1)),
 paid INTEGER NOT NULL CHECK(paid IN (0,1) AND paid<>was_paid),
 occurred_at INTEGER NOT NULL
) STRICT;
CREATE INDEX event_bill_payment_activity_event ON event_bill_payment_activity(event_id,sequence);
