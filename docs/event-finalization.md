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
