-- Preserve existing events' email behavior; record an explicit choice at closure.
ALTER TABLE event_finalizations ADD COLUMN skip_payment_emails INTEGER NOT NULL DEFAULT 0 CHECK(skip_payment_emails IN (0,1));
CREATE TRIGGER event_finalization_email_choice_locked BEFORE UPDATE OF skip_payment_emails ON event_finalizations
WHEN NEW.skip_payment_emails IS NOT OLD.skip_payment_emails
BEGIN
 SELECT RAISE(ABORT,'Event payment email choice is permanent');
END;
