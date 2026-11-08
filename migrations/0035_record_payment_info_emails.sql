-- Minimal per-final-bill send guard. No recipient/contact/message copy is stored.
CREATE TABLE event_payment_info_emails (
 bill_id TEXT NOT NULL REFERENCES event_bills(id) ON DELETE RESTRICT,
 recipient_key TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('sending','sent','failed','unknown')),
 attempt INTEGER NOT NULL CHECK(attempt>0),
 operation_id TEXT NOT NULL,
 provider_id TEXT,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(bill_id,recipient_key)
) STRICT;
