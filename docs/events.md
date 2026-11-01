# Events — Phase 5.2 Increment A

The owner approved #37's preliminary plan, implementation and DEV publication in
trusted conversation on 2026-11-01. This increment is private Draft management,
not completion of Phase 5.2 or activation of public publishing/registration.

## Contract

- Search/status filters, selected-event preview and Create/Edit/Duplicate actions
  reuse Administration navigation and central Events Logs.
- Attendance dates are selected explicitly and lock immediately, including Drafts.
  Start/end are separately editable descriptive UTC instants, entered/displayed in
  Europe/Amsterdam. Ambiguous/nonexistent daylight-saving times are rejected.
- Capacity is positive per selected date, with no event-wide headcount cap.
  Reductions cannot undercut current confirmed registrations; #39 must extend
  that guard for its guest/waitlist model before enabling registrations.
- Select an active Locations template, copy its text fields, then complete venue
  name, street/number, postal code, city and uppercase two-letter country code.
  The snapshot belongs to the event. Template edits/archive/restore cannot change
  snapshots; editing a snapshot cannot change its template.
- Duplicate requires a new name, times and selected dates. It copies the snapshot
  and preparation settings into a new Draft, with closed registration, revision 0
  and one new audit entry. Source revision must match. An archived source template
  does not invalidate the copy; publishing later needs explicit venue review.
- Never copy registrations, attendance, bills, payments, locked price, history or
  gallery. No registration transfer, restore or repricing workflow is implemented.
- Description uses a small text grammar for headings, emphasis, lists and HTTP(S)
  links with preview. React renders text/elements; raw HTML remains escaped.
  No HTML injection, editor dependency, cover upload, R2 or paid storage. Existing
  `lan-hall.png` provides decorative default art.
- Integer euro-cent rental, Finance enablement and guest enablement/max are
  preparation settings, not operational billing/registration. No extra expense.
- Defensive initial bounds: 200 catalogue records, 31 dates/event, 20 guests/member,
  100,000 places/day, €1,000,000 rental, 8,000 characters each for description and
  venue instructions. Review extensions if actual project use reaches these bounds.

`events.create` permits create/duplicate; `events.update` permits managed Draft
editing across all creators. Existing event permissions allow private event/log
reads. Creator grants no authority. Log actor display names require `users.view`.
Existing origin/CSRF/session-proof/no-store controls apply. Mutation batches repeat
live session/MFA/permission checks, fence revisions, deduplicate operation IDs and
roll back on failed guards or audit. Unknown outcomes require reload/log review,
not automatic retries. Explicit Save/Cancel; no autosave or unsaved warning.

## Migration and rollout

`0025_create_event_management.sql` adds nullable legacy day capacity, one management
record per newly managed event (venue/timing/settings/creator/revision), Events
activity and selected-date lock triggers. Insert days before their management row
in one atomic batch. For new rows, legacy day `starts_at/ends_at` carry descriptive
creation-time event instants; they never generate dates or represent daily sessions.
The management row owns current event start/end; later edits leave those legacy
day instants unchanged. Existing event/day/registration IDs and values are preserved.
No invented venue/capacity backfill: legacy records appear read-only pending review.
Creator/audit actor references become null on account deletion.

DEV 0024 is prerequisite. Without 0025, authenticated event routes safely return
503 without writes; unrelated Administration works. The owner separately approved
DEV 0025 with fresh recovery/preflight and integrity verification. Migration and
code publication are separate; PROD application/activation is excluded.

DEV 0025 was applied and verified on 2026-11-01. Source SHA-256:
`d525bdf02bba9dcc3c7ed34d0910e3fd369875a9098531ae73a0fe85d68fec2f`.
Existing record counts stayed unchanged, new management/activity tables were empty,
all three date guards existed, quick-check returned `ok` and FK-check was empty.
Recovery export/bookmark and detailed evidence remain private in ignored files.

## Verification

`event-management.test.mjs` covers API/D1 contracts, permissions, session correlation,
CSRF, field/date validation, immutable dates, snapshots/duplication, concurrency,
replay/audit rollback, populated migration/FK preservation and old-schema failure.
`event-presentation.test.mjs` covers safe formatting, timezone boundaries and
Events-only Logs/cache invalidation. Historical migration files remain unchanged;
the explicit migration-history fixture now includes 0025.

Initial broad verification found the expected missing history entry, one simulator
ECONNRESET and an existing login test crossing the minute-long volume window.
The entry was added. Only that login fixture now scopes/restores the Worker clock
for its 61 observations; production predicates/thresholds/assertions are unchanged.
Focused checks passed, followed by all 611 regression tests at concurrency 4 and
40 policy/public-UI checks. TypeScript and hosted-DEV build passed. Record later
exact-commit CI/deployment evidence and hosted acceptance separately in #37.

`/worker/tests/fixtures/events-ui.html` intercepts all transport with fictional
in-memory data. Browser checks cover creation/review/Back, locked-date editing,
copied venue/settings, formatted preview and duplication. This is UI evidence,
not D1/provider acceptance. Owner hosted acceptance remains pending.

Additional browser checks verified Escape/focus return, Events-only central Logs
and correct title, access revocation removing private content, 390px preview and
320px editor. Narrow wizard actions wrap. No hosted test records were created.

## Following increments

Publish/unpublish/public visibility integrate with #38. Registration open/close/
reopen and participant cancellation integrate with #39/#41. Cancellation must
unpublish, cancel active confirmations/waitlists, stop promotions, retain history
and durably record notices; delivery failure cannot undo it. No restore is approved.
Closure/final settlement is #40, distinct from registration closure/publication.
Administrator-only erroneous/test deletion needs history guards. Jotform cutover,
real email and PROD operations remain excluded.
