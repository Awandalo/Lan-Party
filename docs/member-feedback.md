# Member feedback — Phase 4.6 (#44)

Owner-approved build assignment: #44 body updated 2026-10-31T16:30:34Z.
DEV publication is authorized in the Codex conversation. Remote migration and
retention activation require the separate exact-migration approval below; PROD
and public invitation remain excluded. No new accounts or role grants are needed.

## Contract

The header bug icon beside Sign out opens private My Requests. Only active,
verified full-session accounts can submit/read/reply to their own requests.
The Administrator inbox uses the genuine built-in Administrator predicate; no
new permission or delegated grant. Decisions and progress are independent. Member
replies lock at Completed/Closed; administrators can reopen. All replies are
member-visible. Immutable original text/messages support follow-up corrections.

Three feature tables are necessary: feedback_requests, feedback_events and
feedback_reads. Read rows separate each viewer AND member/administrator audience,
so one administrator cannot clear another's unread items or their own member dot.
Thread changes/history/counters are transactional; operation IDs reject changed
replays and allow explicit retry of the same submission. Private content is never
stored in browser storage or sent to GitHub automatically.

Manual GitHub handoff starts with a blank technical scaffold, not copied member
text. Only an explicit acknowledgement unlocks copy/open of the exact edited
preview. GitHub opens at the fixed new-issue page with no private URL parameters;
publication is manual. Recording/replacing a strict repository issue URL is audited
and revision-guarded. The site cannot verify publication, sync status or guarantee
cross-system duplicate prevention. Public content has a separate lifetime.

## Retention and deletion

Completed/Closed records a closure timestamp; switching between closed states or
later closed-thread activity does not reset it. Reopening clears it. Every read
and mutation excludes records at 30 days after closure even before cleanup.
Authenticated feature access schedules background purge of up to 500 expired
threads with Worker `waitUntil`, after foreground queries. It does not wait for
physical deletion before returning the response. The existing
03:00 UTC DEV maintenance trigger additionally drains up to 20 batches of 500;
there is no new cron, infrastructure or configuration flag. Cleanup remains
active when session UI is disabled. Thus physical cleanup
normally follows the 30-day cutoff within one daily cycle (up to 24 hours), with
bounded catch-up for exceptional backlogs. No closed body remains accessible
past its cutoff. No messages are archived elsewhere by this feature.

Foreign-key cascades remove a permanently deleted member's threads, conversation
and reads inside the existing account deletion transaction, even with feedback UI
unavailable. Administrator identity in remaining events is SET NULL, with no name
snapshot. Deactivation blocks access via normal session resolution but preserves
requests. Existing privacy warning prohibits secrets/personal details. Free text
may still need owner-assisted privacy handling; automatic redaction is not claimed.

Backups/Time Travel can restore deleted feedback/accounts. Existing DEV recovery
policy retains no identifying deletion replay register; do not claim erasure from
all backups or automatic post-restore reconciliation. A restoration needs separate
approval and privacy review. No PROD retention/launch approval follows from DEV.

## Limits and security

Five new requests/account/UTC day; ten replies/account/UTC hour. Additional
feedback-only buckets: creates 20/IP/hour and 100/global/hour; replies 60/IP/hour
and 500/global/hour. Existing HMAC secret/storage is reused with separate feedback
key domains, without changing authentication thresholds. Only expired limiter
rows receive existing-style bounded cleanup. No raw IP is persisted.

Titles: 120 Unicode characters, descriptions: 5,000, replies: 2,000; multiline
plain text allowed. Body byte cap 32 KiB. Safe React rendering, parameterized SQL,
no-store responses, CSRF/origin/session-correlation and final session/Administrator
SQL guards apply. No extra MFA/recent-proof ceremony is introduced.

## Migration / rollout checkpoint

Only migrations/0023_create_member_feedback.sql is proposed. SHA-256:
`ca0c4032cfa50427fba432f7a769c47d4e8543fc6847191c3b00661bbd11b417`.
It adds the three tables, indexes and immutability guards; existing accounts,
roles, assignments and prior audit history are untouched. Scoped Git attributes
preserve its reviewed LF bytes. No permission seed or account mutation.

The explicit reviewed-history list in
`worker/tests/helpers/migration-history.mjs` must be updated with each reviewed
migration. Email-budget and rollout-compatibility tests intentionally reject
unreviewed, missing or renamed files; run these consumers when adding migrations.
The initial 5f4cbe2 CI run passed 558/570 tests; its 12 failures shared this stale
0022 history list. Adding the reviewed 0023 entry fixed all 12 locally without
changing application code, migration bytes, security assertions or limits.

After approval: verify DEV identity lan-party-dev / a3c4cea6-ceb7-43b8-b9b7-b374726b35b4,
clean history through 0022, sole pending 0023, integrity/FKs, aggregate protected
state and recovery bookmark. Stop on drift. Apply only the approved file, verify
schema/guards/integrity and preserved aggregates, then continue the authorized
DEV publication. Existing scheduler gains the approved feedback cleanup at that
publication; migration alone activates no public routes or external service.
Rollback normally disables the compatible feature code while preserving additive
schema/data; never automatically DROP tables or rewind the whole database.

## Verification / handover

The follow-up [private-page loading optimization](private-page-loading.md) covers
Members, Roles and Feedback caching, intent prefetch, request-local query savings,
security boundaries and the distinction between local and hosted timing evidence.

146 selected integration/regression tests and strict TypeScript/hosted-dev build
passed. Focused evidence includes
ownership/admin boundaries, immutable messages, closed/reopen retention, per-viewer
unread races, replay and transactional rollback, pagination, validation/rate limits,
real account deletion integration, daily cleanup and keyboard/mobile UI. DEV owner
acceptance needs two distinct approved existing accounts. No hosted test account
or provider action is performed without its applicable authority. #44 stays open.
## DEV migration execution (2026-10-31)

Owner separately approved the exact migration and retention activation in the
Codex conversation. DEV preflight was clean through 0022 and 0023 was the sole
pending migration; a recovery bookmark is captured privately under ignored
.wrangler. Applied the unchanged reviewed file. Postflight: history through 0023,
quick_check OK, no foreign-key violations, all 184 prior schema objects unchanged,
and existing user/role/assignment/grant/audit aggregates and RBAC revision preserved.
The new feature tables remain empty; no hosted test request or account was created.

The initial sandbox command could not access existing Wrangler files. Outside
the sandbox, existing sign-in worked without reauthentication. Wrangler file mode
returned only a summary and the Windows npx wrapper truncated multiline SQL; the
preflight was completed with direct Node Wrangler command mode and single-line
read-only SQL before any migration. No error-10000 retry was needed.

Local browser evidence uses fictional intercepted transports: mobile submission,
member read-only closure, admin review, explicit export gating, fixed GitHub URL,
unread acknowledgement and sign-out cleanup. Main frontend bundle is about
503 kB minified with a separate 14 kB Feedback chunk; Vite emits a non-blocking
size warning. No threshold was changed. CI/deployment and owner acceptance remain
recorded in #44; local evidence does not establish hosted two-account acceptance.
