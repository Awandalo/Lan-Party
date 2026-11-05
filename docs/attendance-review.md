# Phase 5.5 A — attendance review

Owner authorized step 1 of #40 locally on 2026-11-03. No commits, DEV push,
remote migration, PROD change or real email delivery. The accepted sequence is
attendance review, permanent event finalization, then explicit payment emails.
Planner alone will be sufficient for finalization in B; that action is not built
in A. Latest #40 deltas and the trusted owner clarifications supersede its older
enable-Finance, extra-cost, subsidy and post-lock-correction ideas.

## Local review

The ignored `.wrangler/attendance-review-browser.mjs` launcher serves an isolated
real Worker/D1 fixture on `http://127.0.0.1:5190`, proxying Vite on port 5175.
It seeds a fictional ended event, members, independent guest days and two deleted
accounts. Select the event under Administration → Events → Participants →
Attendance review. This is disposable local state, retained across page reloads
but reset when the launcher restarts. No production/DEV account is used.

Review days selects any event dates actually attended, including dates missing from the original booking. Zero
dates removes that person from reviewed attendance, preserving original registration
history and independent guests. Before finalization, removed dates can be restored
with a reason. Corrections require the event to have ended and registration closed;
the review can explicitly close still-open registration after the event ends.
These after-event attendance corrections do not add live registrations or override a live waitlist.

Current participant/day totals use the review overlay and exclude anonymous history.
Original registrations, public capacity and Who is coming remain registration
projections in A, while ended-event manager counters/cards use reviewed dates; final historical attendance/billing projections belong to B.
No member bills, permanent finalization, Paid/Unpaid, provider integration or
payment emails are included. The main Finance tab remains a later-step placeholder.

## Permission and privacy contracts

Planner actions map to the existing explicit `events.manage_registrations` grant,
not a role name, creator or email address. Pay/Free and payment instructions require
that grant plus the new explicit `finance.manage` permission, or the existing
Administrator override. No existing role receives a new grant automatically.
Finance-only accounts cannot enter the review. Planner-only responses omit the
complimentary flags, instructions and Finance audit entries.

Pay is the default. Free changes what the future bill will charge; it never removes
retained days from the divisor. Instructions allow an HTTPS tikkie.me URL and/or
bounded plain text for bank transfer details. No URL is fetched, QR generated or
payment initiated. Instructions remain organizer-only until B exposes final bills.

Every successful change requires a reason and creates a private event-scoped audit
entry with actor/time, affected person and before/after days or Pay/Free state.
Instruction audit does not copy bank details. Account deletion clears target
identity from review audit and cascades private review/person data, while retaining
only anonymous exclusion/day counters and a deleted-account count. Existing
registration anonymous totals remain intact. These counters prevent deletion from
putting an excluded no-show back into the divisor. Preexisting legacy anonymous
person totals are not labelled as an exact deleted-account count.

## Schema and transaction boundaries

Local-only migration `0030_create_attendance_review.sql` adds the permission,
review overlay, instruction settings, private audit and anonymous review counters.
It preserves existing registrations, places, party drafts and role assignments.
Do not edit prior migrations or apply 0030 remotely without separate authorization.
The new endpoint fails closed when its schema is unavailable; existing registration
endpoints remain compatible with 0029.

Reads and commits enforce live session/MFA, permission and revision checks. Mutations
also enforce origin/proof/CSRF, bounded input, person/event ownership, idempotency
and change limits. Revision increment, review update and audit commit in one D1
batch. Audit failure rolls back the entire change. No notification is enqueued.

## Verification

Ten real local D1 review tests cover individual/all-day removal/restoration,
independent guests, unchanged registration history, permission combinations,
end/closed restrictions, invalid/out-of-event/cross-person dates, Tikkie validation,
concurrent/replayed writes, live session/grant revocation, origin/CSRF, audit rollback,
real account deletion and anonymous exclusions. Migration tests verify populated
row/grant preservation and full rollback before retry on a deliberately failed
local migration. Each fixture checks quick_check and foreign keys.

The first broad run passed 675 of 689 tests. Fourteen failures were test defects
from the reviewed migration manifest stopping at 0029 and the old permission
count of 14. The manifest now names 0030, and the count asserts 15 plus the exact
new permission and absence of automatic grants. All 28 affected email/registration/
compatibility tests pass. The final full regression run passed all 692 tests with no failures or skips.
TypeScript/default build pass. Browser checks verify real local
save/reopen, Free without denominator change, instruction save, deleted-account
labels and Planner-only restrictions. Real device/accessibility acceptance remains
an owner check; dialog cancel focus restoration was checked in the local browser.

No staging, commit, push or hosted operation has occurred. Keep #40 open for local
owner review and later B/C work.

## Local occupied-seat correction — 2026-11-03

Owner clarified that deleted accounts must not occupy physical seats. Participant
registration counters, unique-current-person totals and public remaining places
now count only current confirmed registrations. Anonymous retained attendance is
kept separately for historical review/Finance; it no longer reserves seats.
Deletion already releases live places and promotes fitting waiting groups while
registration is open. A newly created account has no inherited reservation: its
registration joins the normal queue if full, and promotes when space becomes
available. This change does not add account restoration or alter deactivation.

Twenty-eight changed-area registration/publication/review tests and strict types/
build pass, including ended-event deletion releasing public capacity while keeping
anonymous history, and deletion → existing waitlist promotion → new account waits
→ cancellation promotes the new registration. The first new fixture attempted an
email change that correctly invalidated its session; the fixture was corrected to
use a fresh test account without that unrelated credential change. Reuse the prior
692-test security/schema run for unaffected areas. Local server restarted to load
the backend projection correction; disposable fictional state resets. No remote
changes, staging or publication.

## Local minimum-progress counter — 2026-11-03

Owner requested the final Participants counter to show progress toward the event's
configured minimum in full-event equivalents. Sum current confirmed participant-days
and divide by the number of event days, without first rounding individual people.
Thus 2 + 2 + 3 across three days is 7 / 3 = 2.33; one person on all three days counts
as 1, and a single day counts as one third. Confirmed guests count; waiting and
deleted-account history do not. Preserve unique-person and participant-day totals
as secondary text. The ring measures the exact ratio against the configured minimum,
clamped at 100%; only the displayed equivalent rounds to two decimal places. The
minimum-reached predicate compares integer participant-days with minimum × event
length. Clicking the counter still resets the day filter. This is a progress display,
not a change to physical seat allocation or the future Finance rate calculation.

Use the existing managed-event minimum passed to Participants, so no new endpoint,
backend restart, database write or migration is needed. Seven presentation checks
and strict TypeScript/build pass; browser verified 2.33 and the reset action. Reuse
unaffected allocation/security evidence. All work remains local and unstaged.

## Local attendance-refresh and missed-day correction — 2026-11-04

Owner reported that changing reviewed days did not update the registration/minimum
counter, and requested the ability to add a missed event day. The manager view now
loads the current saved review after event end/registration closure and applies it
to day counters, cards, unique-current-person totals and minimum progress. Reads
must agree on revision. Unrelated review/auth/network failures never silently fall
back to old dates; only the explicit missing-review-schema result supports 0029
compatibility. Owner/person keys are combined so guest ID collisions cannot mix
parties. Anonymous history is excluded from these counters and displayed separately.

All event days are offered in Review days, including previously unselected or
waitlisted dates. Correcting actual attendance is allowed only after end with
registration closed, under the existing Planner grant. Store removed and added
dates as an overlay; preserve original bookings and audit every correction. The
local-only 0030 migration also preserves added-day anonymous totals on account
deletion and clears audit target identity for every removed registration. No new
live reservation or automatic waiting-list override is created by a retrospective
attendance correction. B must fence all review writes once permanently finalized.

Twenty focused tests pass, including saved removals/additions feeding refreshed
manager counters, ownership separation, waiting→attended presentation, stale and
failed reads, missed-day persistence and anonymous deletion preservation. Strict
types/build pass. The current local fixture was preserved before its necessary
backend reload: attendance choices, complimentary settings, payment instructions,
review history and event minimum were restored to the new fixture identities.
Nothing is staged, committed or published. The final broad run passed all 698 regression tests after the 0030 trigger extension.
Local browser verified add-day/save → counters 6 participant-days / 2 equivalents,
then restored the owner’s choices → 5 participant-days / 1.67. Saved owner edits
and review history remain available in the running local fixture.

## DEV publication preparation — 2026-11-05

The owner accepted local A and authorized its DEV publication, then separately
approved migration 0030 and verification on lan-party-dev. Earlier local-only
statements above describe their original checkpoints. B/C and PROD remain excluded.

Only 0030 was pending and applied, after a fresh Time Travel bookmark and private
SQL recovery export. History is now exactly 0001–0030, quick_check is OK and foreign
keys have no violations. The export was restored into isolated local SQLite and
all 47 preexisting tables compared with hosted rows: only the expected Finance
permission was added; accounts, credentials, roles/grants, event and registration
data were preserved. New review/settings/activity tables are empty. Recovery
evidence remains ignored and private; no remote restore was performed.

Wrangler file execution returned a script summary rather than query rows, and
multiline command arguments returned only the final query. The migration applied
before that preservation-parser mismatch was resolved; it was not reapplied.
The final comparison uses the pre-migration export and single-line read queries.
SQLite export restore required foreign-key enforcement disabled during import
because of table ordering; quick_check and foreign_key_check both passed afterward.

Final review corrected day filtering to include retrospectively added attendance
while keeping removed original days accessible for restoration. Local browser
verified adding a missing day, selecting that filter and seeing the participant;
then restored the owner's attendance choices. All 20 focused checks and the hosted-
DEV frontend build/strict types pass. Reuse the unchanged 698-test broad backend/
schema regression; exact-head CI supplies the publication regression. Existing
Vite chunk-size warnings remain; no dependency or configuration change was made.

DEV handover: Administration → Events → select event → Participants → Attendance
review. Correct attendance only after the event ends and registration is closed.
Administrator can use Pay/Free and instructions; other staff need the explicit
Planner + Finance grants. No test email or hosted attendance write is needed for
bounded deployment verification. Owner performs the hosted edit/save acceptance.
Keep #40 open for later permanent closure/bills and manual payment/email stages.
