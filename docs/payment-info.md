# Simple payment information — local review

Owner authorization, 2026-11-08: proceed with #41 (formerly #40C) and #38, keeping the scope small. #40 is accepted and closed. This increment remains local for owner review; no DEV publication, remote migration, PROD activation or real email sending is included.

Send payment info sits beside Save payment instructions in Attendance review. It becomes available after finalization and uses saved instructions. Saving never sends. Planner plus Finance, or Administrator, can preview the exact recipient addresses and messages, then confirm sending. A missing optional payment link/bank instruction produces an honest contact-the-organizer fallback.

The member receives the immutable final daily rate, selected days after organizer corrections, individual member/guest amounts and combined total. Each guest receives only their own days/share and responsible-member context, with no separate payment demand, payment instructions or other participants' details. Complimentary attendance remains free. Dutch money/date formatting is shared with the website.

Migration `0035_record_payment_info_emails.sql` adds only a per-bill/recipient claim, outcome, attempt, operation and provider receipt. It stores no email address or message copy. Atomic claims and live authorization prevent duplicate/concurrent sends. Accepted messages cannot be resent; confirmed failures require a deliberate retry. Uncertain outcomes remain blocked for investigation. Small sequential chunks use the existing DEV allowlist/budget and mail transport; there is no scheduler, composer, webhook or automated payment processing. PROD transport rejects this new purpose pending separate activation.

#38 now uses one crew view for upcoming and past events. Explicit organizer additions/removals override member day selections, while untouched days retain registered confirmation. It does not infer physical attendance/no-shows or require finalization. Only signed-in members see member names/days; guest identities, contacts and waitlisted days stay private.

Local checks use fictional disposable D1 databases and intercepted `.test` recipients. The first integration run exposed a fixture-only nickname INSERT column mismatch; explicit column names fixed it before the seven integration cases passed. Template/transport checks, broader regressions, compilation/build and browser acceptance are recorded with the local handover. Real provider acceptance and hosted permission/mobile checks remain separate from this local evidence.

Verification: the full regression run passed 738/751 and exposed 13 migration-inventory prerequisite failures, all caused by the missing explicit 0035 inventory entry. After adding that entry, the affected suites and a new DEV payment-policy case passed 14/14. The final payment integration suite passed 9/9, including two additional chunking/audit-rollback/lifecycle cases. Together the unchanged successful results and focused corrections cover all 754 current regression cases; the complete suite was not blindly rerun. CI policy/public UI/monitor checks passed 62/62, and strict TypeScript/Vite build passed. The browser verified saved-action placement, member/guest previews and Escape returning focus; the review event remains unsent. No real-provider acceptance or mobile-device verification was performed.

Local handover: `http://127.0.0.1:5194/manage/events` → Fictional payment info LAN → Participants → Attendance review → Payment instructions. The disposable review server intercepts all fictional email delivery. The existing local test website/state is preserved. All source changes remain unstaged, with no commit/push. Proposed commit: `feat(events): add simple final payment emails`; body: "Preview and explicitly send locked member/guest payment information with bounded duplicate guards. Apply organizer day corrections to the member-only crew view. Verify local mail policy, integrity, authorization, regression and browser checks; hosted delivery remains pending."

Owner checks: preview a finalized bill with corrected days; inspect the member and guest messages; confirm the fictional send and reopen to see accepted outcomes with no resend button. Close/Escape should restore focus. Verify crew day corrections without finalization and confirm normal members cannot access the payment preview.

## DEV publication authorization — 2026-11-08

The owner accepted the local payment-email flow and explicitly authorized its DEV
commit/push and final online testing. This supersedes the local-only publication
limit above. The owner also requested a real email test; its exact finalized DEV
event, recipient scope and actual message preview must be established before a
provider send. Normal DEV publication does not cover remote migration 0035, whose
separate exact-target approval is pending. No PROD, permission/configuration
changes, event finalization, mass email or Jotform cutover is included.

Fresh read-only DEV preflight confirms history through 0034 and the correct Worker
database binding. A private hashed recovery export restores locally; all 55 existing
tables/rows match before and after applying 0035 to the restored copy, with integrity
and foreign keys passing. This is preparation evidence, not a remote application
or provider-delivery claim. Existing unchanged runtime tests/build/browser evidence
remain valid; exact-commit CI and focused hosted checks follow publication.

### Approved DEV migration receipt — 2026-11-08

The owner separately approved migration 0035 for `lan-party-dev` only. It is now
applied after the fresh recovery export, verified local restore, unchanged-row
preflight and Time Travel checkpoint. All 55 existing tables/rows and schema
objects are preserved; the new send-guard table is empty, history is through 0035,
quick integrity and foreign-key checks pass. Bills and permissions are unchanged.
The owner requested a real test to their own address; the existing finalized event
also includes a guest with a different address. No provider send has occurred;
the full actual recipient preview requires owner review before that send.
