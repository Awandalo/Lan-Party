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

### Local DEV-recipient feedback correction — 2026-11-08

After DEV publication the owner reported a generic "Finalization could not be
confirmed" message from the payment dialog. Read-only DEV evidence shows zero
send records and unchanged email-budget rows. A non-allowlisted guest reproduces
the uncaught policy exception before claims/provider calls; the old Finance route
mapped that exception to its generic finalization error. The actual secret
allowlist was not read or changed, so this identifies the reproduced error path
rather than claiming access to its configured contents.

The local correction validates all eligible DEV recipients in the preview, shows
a clear recipient/settings block reason and disables Send/Retry while blocked.
Direct send requests return a specific 403 before claiming rows or contacting the
provider; successful/uncertain prior outcomes are not rechecked for resending.
No recipients are silently skipped or substituted and the allowlist remains
enforced. The owner's instruction to leave both existing emails unsent remains.

Validation: 25 payment/policy/template checks and strict TypeScript/build pass,
including a hosted-origin test against disposable D1 proving zero claims, revision
changes, quota usage or provider attempts for a denied guest. Unchanged full
754-case CI evidence is reused for unaffected code; this correction is local and
unstaged, with no new migration/configuration, commit/push or external send.
Suggested commit: `fix(events): explain blocked DEV payment recipients`.

The isolated local browser fixture on port 5195 verifies the real hosted-policy
preview handler with a deliberately unapproved fictional guest: addresses remain
visible, the explicit block reason appears and Confirm is disabled. No send was
clicked. Original local test state and hosted DEV remain unchanged. Proposed
commit body: "Explain DEV recipient/settings denials before payment-email sending
and return a specific 403 without claims or provider attempts. Verify 25 focused
checks, strict types/build and the disabled-send browser state; no policy changes
or real email sends."

The owner accepted the local feedback correction and explicitly authorized its
DEV publication for another online test on 2026-11-08. This supersedes its
local-only publication limit above. Reuse the unchanged 25 focused tests,
types/build and browser evidence; verify exact-commit CI, DEV deployment and the
hosted disabled-send preview after publication. No migration/configuration,
recipient allowlist changes, real email sends or PROD changes are included.

### Payment email branding — local, 2026-11-08

The owner confirmed a hosted payment email arrived, then reported that it lacked
the layout used by existing account emails. The payment HTML previously consisted
of plain paragraphs. It now reuses the existing self-contained LAN / PARTY shell:
dark background/card, mint branding, consistent typography and footer. The final
total is highlighted and payable member messages with a saved URL get a mint
Open payment request button. Bank-only instructions retain their line breaks.
Guest and free messages retain their informational/no-payment wording and have
no payment button. Plain-text content, amounts, privacy, send guards and stored
delivery outcomes are unchanged; successful email sends are not reset or resent.

The common shell is extracted into `worker/email-layout.ts`. The authentication
template uses that same shell with byte-identical output for all 17 valid
DEV/PROD purpose examples against source revision
`f328cd3246429f6360a0c38f1a52a34c35de8dd3`; invalid destinations still reject.
The registration-notification branch is unchanged. An isolated comparison helper
initially needed its TypeScript loader corrected; the comparison then passed.

Validation: 35 focused payment/auth-template/policy/provider checks pass, followed
by 10 final template checks after tightening the payment-button condition to the
fixed payable-member paragraph. Strict frontend/Node/Worker TypeScript passes.
Browser checks cover the actual member, guest and free HTML with fictional data;
no payment link was opened. Broader unchanged CI/security evidence is reused
because this change affects rendering only and authentication output is identical.
Frontend bundling is unaffected; real Gmail/Outlook/mobile rendering and another
external send were not performed.

Local HTML preview: `http://127.0.0.1:5197/`, with `/guest`, `/free` and `/bank`
variants. All source changes remain unstaged; no commit/push, database/settings
change or resend is included. Suggested commit:
`style(email): share LAN Party branding with payment messages`.
Body: "Reuse the existing branded email shell for final payment information,
highlight totals and style the validated payment action. Preserve guest/free
semantics and byte-identical authentication messages; validate templates, delivery
policy, strict types and local HTML previews without resending email."

The owner accepted the branded local preview and explicitly authorized DEV
publication for online testing on 2026-11-08. This supersedes its local-only
publication limit above. Reuse unchanged local checks; verify exact-commit CI and
the automatic DEV deployment. Hosted checks are read-only and do not reset send
records or resend successful messages. Actual email-client rendering remains
owner acceptance; no migrations, settings, permissions or PROD changes are included.

### Owner acceptance — 2026-11-09

The owner confirmed the delivered branded payment email renders correctly and
accepted the Finance part in conversation. This is hosted owner evidence for the
member email layout; it is not a new provider send, resend or PROD approval.


### Phase 5 hosted acceptance and release preparation — 2026-11-09

The owner accepted all completed hosted Phase 5 flows, including branded email
rendering and the final empty-registration finishing test at DEV `117d99a`.
Exact DEV CI passed all 767 regression tests; deployment served Worker
`edcedc99-1313-4c16-963b-3f6d3b50d91c`. #35, #38, #41 and #43 were closed;
#37, #39 and #40 were already closed. Attachments (#36) and gallery/social (#42)
remain deferred. This acceptance does not apply migrations or activate PROD; see
[the isolated release plan](PHASE5_RELEASE.md).
