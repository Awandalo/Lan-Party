# Phase 5.5 B — permanent event closure and member bills

The owner accepted A and authorized B locally on 2026-11-05, preserving the
accepted working flows with only bounded UI cleanup. That initial local scope did not authorize publication or remote operations.
The subsequent DEV authorization and migration verification are recorded below.
The accepted A follow-ups and local migration 0031 remain in the working tree.

## Workflow

Administration → Events → select event → Finance shows a staff-only closure
preview. The event must be published, ended, registration closed and have at least
one retained participant-day. The existing `events.manage_registrations` grant
(Planner), or Administrator, is sufficient; creator status and role names are not
authority. Finance permission is not required to close. The preview shows costs,
divisor, daily rate and combined bills. Confirmation requires the exact event name
and explicit acknowledgement that closure is permanent. No deadline or automatic
closure applies, and closure sends no email.

Once closed, attendance, Pay/Free, payment instructions, event inputs, capacity,
rate and bills cannot be edited/reopened/repriced through the application. The
Finance view displays the locked result; Attendance review stays available as a
read-only view. Duplication remains available, creating a separate unfinalized
event from the venue snapshot. Original registration history is preserved.

On Your registration & crew, a member sees only their own finalized bill, member
and guest lines, retained dates, locked rate, total, payment instructions and
read-only Paid/Unpaid. Before closure the member endpoint returns no prices or
instructions. A signed-in account without a bill receives no financial inputs.
Free-only bills show No payment due. Paid defaults to Unpaid; the manual status
switch and reviewed payment emails remain C, without any provider integration.

## Pricing and anonymous history

Use integer cents and `ceil(rentalCents / (participantDays * 50)) * 50`.
Only venue rental is charged. Reviewed person-days belonging to accounts still
present at permanent closure form the divisor. Waitlisted days do not count unless the
organizer explicitly records them as retrospective attendance in A. Complimentary
days stay in the divisor; those lines cost €0 and their share is not redistributed.

Example: €300 / 18 person-days rounds up to €17 per day. Pay attendance of 1/2/3
days costs €17/€34/€51. A responsible member with two days and a guest with one
day has one €51 bill. An exact €15 rate stays €15; €0 rental yields €0 with a
nonzero divisor. Zero retained days blocks closure.

Deleted accounts do not reserve seats or count toward current minimum progress.
The owner's local-review correction on 2026-11-05 defines permanent closure as
the cutoff: accounts deleted beforehand, including their guests, contribute no
days or bills to the new calculation. Anonymous history remains preserved in A,
but is never added to this divisor. Accounts deleted after closure lose their
identifying bill details while the already locked rate, divisor and totals remain
unchanged. This supersedes the initial B interpretation of historical-day pricing.
Example: €300, five retained live person-days and two deleted historical days uses
five days and a €60 daily price, not seven days and €43. Deleted identities are
never reconstructed or reassigned to a newly created account.

## Persistence, privacy and boundaries

Local migration 0032 follows 0031 and adds immutable `event_finalizations` and
`event_bills`. It grants no permissions and changes no existing registration rows.
Closure increments the event revision, verifies current session/MFA and Planner
authority, end/registration state and absence of prior finalization, then records
inputs, combined bills and event audit in one D1 batch. A concurrent review or
closure loses the revision race; replay cannot generate a second bill. An audit
failure rolls back the complete operation. GET preview performs a final authority
and revision check; writes enforce origin, session proof, CSRF and bounded input.

Database triggers protect financial snapshots and locked inputs. Account erasure
is an explicit exception for identity only: bill owner and line identities are
removed, the closure actor reference can become NULL, and locked money/day totals
survive. There are no guest contact/email copies in bills. A newly created account
cannot inherit a deleted account's bill. No self-service bill mutation endpoint
exists. Final accounting corrections remain outside the website; C may change
manual Paid/Unpaid only. Production retention/recovery decisions remain subject
to existing project privacy and release review; no new purge policy is implied.

## Verification and local review

Twelve new checks cover worked rounding and combined bills, complimentary days,
Planner-only closure, end/closed/name/zero-day validation, stale and concurrent
closure, operation replay, immutable inputs, live revocation, audit rollback,
deletion cutoff, member privacy, account/actor deletion and migration
rollback/preservation. Final changed-area billing/registration checks: 28 pass.
Presentation checks plus finalization privacy checks: 20 pass. Strict types and
build pass. Local browser verified preview → named confirmation → locked result,
read-only review/Pay-Free and the responsible member's own combined bill.

The broad run passed 713 of 714 tests. One existing TOTP lifecycle test failed
with a local workerd/Undici TCP ECONNRESET, not an application assertion. Inspection
found no changed authentication implementation; the complete isolated lifecycle
suite then passed all 49 tests without edits, skips or weakened assertions. This
is consistent with a local test-runtime transport failure, not proof that such
failures can never recur. Reuse the unaffected broad results and successful
focused results; no retry loop or unrelated authentication rewrite was added.
Earlier preparation corrections were a Worker TextDecoder option, migration
trigger formatting required by the fixture parser, and escaped test SQL strings.

The ignored port-5192 fixture restores a copy of the existing fictional attendance
choices/history and supports the full B flow. Port 5191's accepted A/capacity
fixture is left alone. B's disposable fixture is restarted after agent browser
checks so the owner receives an unclosed event. Restart resets its closure/bills
only; existing A preservation evidence is not overwritten. No hosted mutation,
provider delivery, remote migration or Git publication was performed.

Local review follow-up: the owner confirmed the two Not found reports came from
port 5191's older A backend while its Vite frontend already contained B. Port 5192
is the B fixture; no application error was hidden and no hosted change was needed.
Staff person cards now use compact profile/day styling and a two-column grid when
space permits, retaining full three-day timelines without internal clipping at
the reviewed desktop width. Narrower cards/events can scroll the day strip locally.
The adjustment affects staff Participants/Attendance review only; public crew cards
remain unchanged. CSS build and browser layout checks pass; unchanged functional
and security evidence above was reused rather than repeating suites for CSS.

The owner's next local presentation pass replaces the long organizer bill cards
with collapsed member groups: member name and combined total stay visible, and
expansion shows separate member/indented guest rows with inline type badges, day
counts and amounts. There is no rate/day column. A separate calculation footer
explains payable days × locked rate, complimentary days at €0, and the combined
total. Erased bills retain their anonymous label/amount without inventing a
breakdown. Native details/summary provides keyboard-operable disclosure and the
existing website colours/hover/focus styling are retained. Three presentation
checks, strict types/build and local browser collapsed/expanded inspection pass.
No calculations, endpoints, permissions, migrations or member bill flow changed;
prior functional/security evidence remains applicable. Changes remain local.

Permanent-closure acknowledgement now uses the existing shared SwitchInput,
aligned beside its shortened label on one desktop line, with natural wrapping
on narrow screens. Native required validation and fieldset disabling are retained.
Both shared-switch contract checks, strict types/build and local browser inspection
pass. No closure was submitted for this presentation check.

The deletion-cutoff correction passes 22 focused finalization/review tests and
strict types/build. It includes the reported seven → five-day case (€300 / 5 =
€60), stale-preview rejection when an account is deleted, zero-live-day rejection,
and unchanged locked totals after post-closure deletion. The unused anonymous-day
pricing field was removed from unpublished migration 0032; existing anonymous
history remains intact. The unclosed local fixture's latest attendance settings,
payment instructions and review history were preserved before its backend reload.
No remote migration, hosted write, commit or push occurred.

## DEV publication authorization and migration verification — 2026-11-05

The owner accepted the local result and explicitly authorized publishing the
reviewed A follow-ups and B to DEV for final internet testing. Separately approved
migrations 0031 and 0032 were applied only to lan-party-dev
(a3c4cea6-ceb7-43b8-b9b7-b374726b35b4). A fresh private recovery export was restored
locally with all 52 existing table contents matching, integrity OK and no foreign-key
violations. A fresh D1 time-travel checkpoint preceded application. Postflight
confirmed migration history through 0032, all existing rows/grants preserved,
new finalization/bill tables empty and operational capacities left at their
original defaults. Recovery evidence remains private under .wrangler; no remote
restore was performed.

Publication checks: 51 focused finalization, review, registration and presentation
tests pass; strict TypeScript, hosted-DEV build and DEV deployment dry run pass.
Earlier broad results and the isolated 49-test lifecycle pass above are reused;
normal CI will run broader checks for the published revision. Hosted owner
acceptance remains pending. No hosted attendance edits, closure, payment emails,
PROD changes or Jotform cutover are part of bounded deployment verification.

## Local finishing-flow rework — 2026-11-06

The owner approved a simpler closing flow and manual payment switches, with local
review only and explicitly no push. Overview now provides Finish event after the
event ends. A single dialog leads through Attendance → Bills → Confirm. Step 1
reuses attendance/Free review and explicitly closes registration if still open;
step 2 shows payment instructions and combined bill previews; step 3 requires the
exact name and permanent-action acknowledgement before Finalize event & publish
bills. Opening/navigating the wizard alone performs no mutations. Saved attendance
changes remain saved if the wizard is cancelled. Unsaved instruction edits block
step navigation and require explicit discard to close. Registration close/reopen
remains separately labelled in Actions. Permanent closure rules, end-time gate,
pricing, deletion cutoff and immutable inputs are unchanged.

After finalization, expanded member groups show Payment received for staff with
Planner plus finance.manage, or Administrator. Off means Unpaid, on means Paid;
the switch covers the whole responsible member/guest bill. Zero bills say No
payment due, erased bills cannot be changed, and members still have a private
read-only view of their own bill. No email, bank/provider action or automated
reconciliation is added.

Local-only migration 0033 adds a payment audit table, with IDs/old and new flags,
actor reference and time, without copying member names/contact details or granting
permissions. Changing status uses session/MFA/Planner/Finance checks at commit,
event revision fencing, unique operation IDs and one atomic status/audit batch.
The locked amounts, attendance and price remain immutable; failed audit rolls back
the update. Old schemas retain B reads and closure but cannot mutate payments.
No DEV/PROD migration, configuration, commit or publication is authorized.

Verification for this local rework: all 726 regression tests pass, including
manual payment authorization, session/generation/role revocation at commit,
replay/concurrency, immutable amounts, failed-audit rollback, zero/erased bill
rejection, migration preservation/rollback and own-bill privacy. Four bill
presentation tests pass, including the switch placement and pending state.
Strict types/build pass. The first focused run exposed a test bundler fixture
missing its CSS loader after importing the shared switch; adding that fixture
loader resolved it without changing runtime behaviour or weakening assertions.
Browser verified all three steps, nested attendance-dialog cancellation, dirty
instruction navigation protection, named permanent confirmation, finalized view,
Paid persistence across reload and correction back to Unpaid. These browser
checks used disposable fictional data only. The local fixture was then restarted
from the original saved attendance/settings/history so the owner receives an
unfinalized event on port 5192. Vite on 5175 is its required asset dependency.
Actual mobile-device checks and hosted acceptance have not run for this rework.
Nothing is staged, committed, pushed or remotely migrated.

Suggested commit when publication is later authorized:
feat(events): simplify finalization and track manual payments

Local review adjustment — 2026-11-06: the owner removed event-name typing from
the final wizard step. The permanent-action switch is now the sole visible
confirmation and directly enables the final button; turning it off disables
the button again. Native required validation and pending-state disabling remain.
The existing request still carries the displayed event title internally for its
server-side consistency check; authorization, revision fencing and all permanent
closure guards are unchanged. No backend reload, migration or hosted change is
needed, preserving the current local test session.

## Local bank payment-request links — 2026-11-06

The owner approved replacing Tikkie-specific wording with Payment request URL
and Open payment request. Exact HTTPS hosts now support Tikkie/ABN AMRO
(tikkie.me and www.tikkie.me), Rabobank (betaalverzoek.rabobank.nl), bunq
(bunq.me), ASN Bank (diensten.asnbank.nl), SNS (diensten.snsbank.nl) and
RegioBank (diensten.regiobank.nl). Queries/fragments are preserved, including
Rabobank request IDs and fragment-based bank links. No arbitrary subdomains,
userinfo, alternate ports, HTTP, whitespace or backslash forms are accepted.
An empty link still supports instructions-only bank transfers. Existing
permissions, bill privacy/locking and manual payment status are unchanged.
No provider call, request creation, payment, redirect following or recipient
verification is performed. No migration is needed. ING is supported on www.ing.nl only for the legacy
/particulier/betaalverzoek/ routes and current /de-ing/payreq route. Direct
read-only browser inspection of the official legacy page confirmed its redirect
to the current Betaalverzoek flow; without a request identifier ING displayed
its expected missing-request message. Arbitrary ING pages such as login links
are rejected. Do not infer support for every Dutch bank.

Official format sources reviewed on 2026-11-06:

- [Tikkie FAQ](https://tikkie.me/vraag-en-antwoord) and [Dutch banking security guidance](https://www.veiligbankieren.nl/veiligheid-betaalproducten/betaalverzoek/) for the www form.
- [ING payment-request entry](https://www.ing.nl/particulier/betaalverzoek/index.html), observed redirect to [current flow](https://www.ing.nl/de-ing/payreq) on 2026-11-06. No real request or payment was opened.
- [Rabobank payment requests](https://www.rabobank.nl/particulieren/service/betalen-en-opnemen/betaalverzoek-betalen).
- [bunq payment links](https://help.bunq.com/articles/how-can-i-request-funds-through-the-app).
- [ASN Bank QR/payment links](https://www.asnbank.nl/asn-app-en-asn-online-bankieren/veilig-bankierennew/veilig-betalen-met-qr-codes.html).
- [SNS payment requests](https://www.snsbank.nl/particulier/service/mobiel-bankieren-bij-sns/betaalverzoek-in-de-sns-app.html).
- [RegioBank payment requests](https://www.regiobank.nl/service/online-bankieren/betaalverzoek-in-de-regiobank-app.html).

Verification: 30 focused real Worker/D1 review/finalization checks pass, including
complete-link preservation for each supported host, deceptive URL rejection with
no partial writes, instructions-only saves and existing authorization boundaries.
Strict types/build pass. Unchanged broader evidence (726 tests) is reused rather
than repeating authentication/payment status suites for this bounded URL change.
The active fictional fixture's attendance/settings/history was preserved before
its backend reload. Everything remains local, unstaged and uncommitted; no DEV/PROD
change, email or real payment was performed.

The owner additionally requested ING and a question-mark help control beside
Payment request URL. ING's legacy/current routes are now allowlisted and covered
by real Worker/D1 acceptance/rejection checks (11 review checks pass after adding
ING). The Rabobank URL also survives finalization into the locked private bill
(1 focused finalization check passes). A labelled question-mark button opens a
keyboard-operable dialog with seven provider entries, full-format examples, app
copy/share instructions, optional open-amount guidance and manual-status wording.
Closing help keeps the finishing wizard and unsaved form values intact. Strict
types/build pass. No provider requests or actual payments were tested.

Browser acceptance of the help control: clicking ? opens the provider/format
help; closing it returns to the same Bills step and focuses the ? button. An
unsaved fictional ING draft remained intact through open/close, then was cleared
back to its original empty value without saving. The help is left open on the
local handover tab for owner review. No actual bank link or payment was followed.

Local wording cleanup — 2026-11-06: the owner requested one Payment instructions
heading and explicit optionality. The Bills step now keeps only the accordion
title, marked optional. Both link and instructions may be empty; payment can be
arranged entirely outside the website and proceeding needs no instructions save.
An unchanged form has its Save button disabled and hides the change-reason field;
a real edit still requires its existing audit reason. Help explains the same
optionality. This changes only local presentation; server rules and saved data
remain unchanged.

Local finance cleanup — 2026-11-06: calculation and account-deletion notes now
live behind a question-mark help beside the Finance heading. All / Paid / Unpaid
filters occupy their former position above the bill groups, with matching existing
selected/hover styles and counts. Payment filters become available after
finalization; drafts stay under All. Zero-value bills have no payment due and
appear under All only. Changing the received switch updates the active list after
the save; neither filtering nor opening help changes locked totals. The two help
controls share one accessible dialog/focus component. No backend, schema, provider
or remote operation changes.

Filter verification: 5 focused bill presentation/filter checks pass, including
positive paid/unpaid bills, zero-value exclusion, empty results, live status
reclassification and preservation of source data. Strict types/build pass.
Read-only local browser checks on the owner's finalized event verified Paid's
empty result, both Unpaid bills, All restoration, helper content and focus return.
No attendance, finalization or payment status was changed during these checks.
Earlier backend/security results remain applicable; no full regression repeat
was needed for this frontend-only change. Nothing staged or published.

Local shared-button feedback — 2026-11-06: the owner requested a consistent
95% press-and-spring effect for all buttons. Global CSS now scales enabled native
buttons, button-style links, disclosure summaries and explicit button-role/input
controls while pressed, then returns with a short spring easing. Existing hover
colours, focus indicators and separate transforms remain intact; CSS scaling does
not shift the layout. Disabled/aria-disabled controls are excluded, and the effect
is enabled only when reduced motion is not requested. No JavaScript, backend,
database or remote changes are involved.

Local disclosure motion — 2026-11-06: the owner requested 350ms ease-out for
expanding bill cards, alongside the shared button press effect. Native bill
details now animate their content height on opening/closing with the same easing
on the chevron. Browsers without intrinsic-size interpolation keep native instant
disclosure; reduced-motion users get no height/chevron animation. No JavaScript
state, bill values, filters or payment operations change.

Motion verification: strict types/build pass. Local browser opening/closing
checks pass; computed styles confirm bill content uses 0.35s ease-out and
button/disclosure triggers retain their separate 0.28s spring-scale transition.
No bill or attendance data changed. Existing functional/security checks were
reused for these CSS-only changes. Nothing staged, committed or pushed.

Local search layout follow-up — 2026-11-06: the owner reported a flicker when
submitting an empty search with All events. The status paragraph previously grew
from zero height during loading, moving the catalogue and selected preview, then
collapsed. It now reserves one line and distinguishes initial loading from a
background update. The existing authorized read cache already retains catalogue
data during refresh; it is unchanged. The results container exposes aria-busy,
while errors and authorization failures keep their existing handling. No query,
authority/cache scope, backend, database or remote changes.

Search verification: 12 existing cache/prefetch checks pass, including retained
data during refresh and clearing on authorization/transport failure. Strict
types/build pass. Repeated empty All-event searches in the local browser kept
the selected preview and catalogue at the same measured position (offset 436px),
with a stable 27.1875px feedback line instead of the original 0px idle height.
No backend test repeat was needed for this layout-only adjustment.

Local Participants tab handoff — 2026-11-06: switching to Attendance review
previously unmounted the full registration pane before its fresh GET completed.
The short loading pane shrank the document and clamped the scroll position.
The switch now reads review data while keeping Registrations visible, then mounts
the review with that just-validated response. No hidden duplicate pane or enduring
cache is introduced. The prefetched result is scoped to the same event/session/
administration context, aborted on context change/unmount, and reused only for
the first render. Later edits/reloads still fetch normally; authorization/read
failures clear the old data and show the error. No backend or layout overhaul.

Tab-handoff verification: 12 participant attendance/presentation checks and
strict types/build pass. Local browser switches in both directions retained
scrollY 596 and the submenu top at 288.890625px; Attendance review also retains
keyboard focus after its request completes. No attendance, payment or hosted
state changed. No full backend regression repeat was needed for this scoped
frontend handoff; existing server authorization evidence remains applicable.
Everything remains unstaged and local.

Local Participants cleanup — 2026-11-06: Registrations now keeps the daily
counters and event minimum, with names/dates/statuses in a collapsed
“Registrations & waiting list” roster instead of duplicate person cards.
Day counters filter the compact rows; All days resets that selection. Guest
labels and waiting-list positions remain visible when expanded. Detailed
timelines and corrections remain in Attendance review. Registration/capacity
controls are grouped and hidden for ended or cancelled events.

Verification: 14 focused roster, attendance projection and registration
presentation checks pass, plus strict types/build. Local browser checks cover
collapsed/expanded rows, day selection/reset, absent ended-event controls and
switching to/from the unchanged detailed review. Waiting positions are covered
with fictional presentation fixtures; the current browser event has no waiting
registrations. No full backend regression repeat for this frontend-only cleanup.
No staging, commit, push, hosted changes or database writes.

Local follow-up: the anonymous former-account summary now sits inside the collapsed Review history disclosure. Its counts and dates are preserved. Strict types/build and local browser collapsed/expanded checks pass; no backend changes or regression rerun were needed. Still unstaged and unpublished.

Local overview cleanup — 2026-11-07: Finish event is a secondary button beside Edit event, replacing the large overview callout and explanation. Existing Planner, published/unfinalized, managed-record and event-end gates remain; a disabled future-event button retains a short availability tooltip. Seven overview/action checks and strict types/build pass. The local browser verified the new row and opening/closing the existing wizard without writes. Finance retains its existing entry point. No backend suite repeat for this presentation change; nothing staged, committed or pushed.

Local follow-up — 2026-11-07: removed the duplicate Finish event callout from Finance, its unused callback and callout CSS. Overview is now the single wizard entry point. Strict types/build and local Finance browser verification pass; the wizard and backend are unchanged, so their existing evidence is reused. All changes remain unstaged and unpublished.

## DEV publication authorization and migration 0033 — 2026-11-07

The owner accepted the local iteration, authorized publication to origin/dev and separately approved applying only 0033_record_manual_bill_payments.sql to lan-party-dev (a3c4cea6-ceb7-43b8-b9b7-b374726b35b4). This supersedes historical local-only limits above. PROD, payment emails, permissions/grants and event finalization/data changes remain excluded.

Fresh private recovery export and SHA-256 were captured. The D1 local import encountered table-order foreign-key resolution; a local SQLite restore with foreign keys disabled during import, reenabled for verification, reproduced every row in all 54 existing tables and passed integrity/foreign-key checks. Local application of 0033 also passed. Immediate DEV preservation and migration hashes were rechecked before applying exactly the sole pending migration. History is now through 0033; all existing schema/rows/grants are unchanged, the new audit table is empty, and integrity/foreign-key checks pass. Private evidence stays ignored under .wrangler/payment-0033-dev. Read-only identity error 10000 succeeded on the single identical retry after the required 60-second wait; no write was attempted before that recovery.

Publication checks: 44 focused finalization/payment/bank-link/overview/roster/bill tests and 41 policy/public-UI/auth-mode checks pass. Strict types/build and DEV Wrangler dry run pass. Earlier successful full regression and local wizard/payment/browser evidence is reused for unchanged boundaries; normal exact-commit broader CI and hosted read-only verification follow the push. The last UI changes remove duplicate notices/callouts, retain one Finish event entry beside Edit event, and move former-account summaries inside Review history. No hosted event is finalized, no payment switch is changed, and no emails are sent by these verification steps. Final hosted owner acceptance remains pending.
