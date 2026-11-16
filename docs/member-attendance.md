# Member attendance history — DEV publication, 2026-11-16

The owner requested replacing the Members → member details attendance placeholder
after finding that a completed live event was excluded from achievements. The
qualification correction was a separate approved one-event PROD operation. The
owner accepted the local history update and authorized its DEV publication and
online test. This publication needs no migration or configuration change and does
not include a MAIN/PROD release.

The existing users.view-protected member detail response now includes attendance:
event title, the member's own finalized reviewed days, the stored venue name and
whether the event qualifies for achievements. Finalization and the scheduled end
must both have passed. Free days count; guest-only, future, unfinalized, cancelled
and other accounts' attendance do not. Excluded/test events still appear as
attendance, labelled Excluded, without awarding badges. Archived completed records
can retain their attendance history. This does not change achievement rules.

The result contains the 100 most recent events ordered by scheduled start, with a
stable event-ID tie-breaker and an explicit additional-history indicator. No prices,
payment state/instructions, guest identities, contact information or achievement
progress are added. Directory summaries remain unchanged. Event/bill/account rows
are never mutated by reads. Older schemas report history unavailable; a real empty
history has its own message. Existing account/access/proof fencing and memory-only
member cache apply to the added detail data.

Manual hosted acceptance: view a member with a completed qualifying/excluded event,
verify the reviewed dates and saved venue, then switch to a different member and
check empty history. Check mobile table scrolling, keyboard access, access loss and
reload behavior. Automated interactive browser verification is unavailable in this
session; fictional Worker/D1 and presentation checks provide programmatic coverage.

Validation: seven new history API/presentation checks pass, including the 100-event
boundary, old-schema behavior, response validation, qualification labels and privacy.
The existing eight member authorization/projection checks and seven member-cache
checks passed with the added detail contract. Strict TypeScript and hosted-DEV
build passed. Initial new fixture failures (invalid empty document and nonexistent
venue column) were corrected without changing application validation or assertions.
The independent achievement investigation passed its eleven existing rule/API
checks. Its one-event repair used five local success/rollback checks plus a fresh
private recovery restore/rehearsal; no public repair endpoint or migration was added.
