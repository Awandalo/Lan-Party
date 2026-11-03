# Phase 5.4 (#39) — local first-increment review

Owner authorized preparing the local website using the accepted sequence on
2026-11-03. Keep this round local: no commits/pushes, remote migrations, hosted
deployment, real accounts or actual email delivery. Requirements are #39's current
per-day/group deltas plus #37's derived calendar dates and history locks. Guest
invitations are consistent, bounded by the event guest limit, with no enable switch.

## First review artifact

Run `npm exec -- vite --host 127.0.0.1 --port 5175 --strictPort` and open
`/worker/tests/fixtures/registration-ui.html`. The development-only entry imports
the reusable registration wizard; the production app does not import this entry,
the test controls or the allocation simulator. It refuses non-loopback/non-dev use.
All preview state is fictional browser memory and resets on reload. It makes no
API requests, writes no D1 state and sends no messages. Switching fictional viewers
is a test convenience, not authentication or authorization.

The preview covers:

- Three-step member days → optional guest names/emails/individual days → review.
- Guest days default from the member's selection, then can differ, including a
  day without the responsible member. At least one member day is required.
- Per-day confirmed counts and waiting groups. Newly requested same-day people
  wait together; existing confirmed places and retained waiting positions survive
  additions. Promote the first fitting group, preserving skipped queue positions.
- Editing/removing guests/days, confirmed whole-registration cancellation,
  cancellation losing priority, and re-registration at the back of the queue.
- Generic duplicate guest-email rejection after trim/case normalization, no
  disclosure of another responsible member. Only active registrations reserve email.
- Close/reopen, ended/cancelled event simulation and rejection of capacity below
  confirmed headcount. Closed registration is view-only; no exception queue.
- Own registration details, confirmed-member-only attendance presentation, and
  no identities in the signed-out presentation. No guest rows in Who is coming.
- Per-viewer fictional notification records, clearly marked not sent.

Use **Load waitlist example** to load Alice and a guest confirmed, Bob and a guest
waiting (three places per day). Switch to Alice and cancel the whole registration;
switch back to Bob to see promotion. Reset to test the full wizard from empty.
Try a guest email twice, independent guest days, editing/removing guests, closing
registration, reducing capacity, signing out, mobile width and Escape/Cancel.

## Limits and remaining implementation

This is a UI/rules simulator for owner review, not completed #39 or a server-backed
registration system. A pure model transition/revision check does not establish D1
atomicity, concurrent-request safety, privacy or session/permission enforcement.
The existing foundation tables still only cover member registrations/days; no new
migration was created or applied in this increment.

After local flow review, implement the accepted sequence behind real Worker APIs:

1. Design/version the smallest schema extension for guests, per-person/day states,
   queue groups, durable operation/audit records and notification handling. Preserve
   foundation rows, registration history, day locks and account deletion/retention.
2. Add authenticated self-service reads/writes with live verified-session/MFA,
   CSRF/origin/proof, input bounds, ownership, idempotency and publication/open/end
   checks. Event Planners must not create registrations for other members.
3. Enforce counts, first-fitting promotion and preservation within actual D1
   transactions; extend public capacity and member attendance projections together.
   Test concurrent registration, cancellation/promotion, stale/replayed operations,
   account/session changes, closure races and privacy on real local D1 fixtures.
4. Add authorized manual registration controls and audited event cancellation with
   retained records. Extend existing deletion/date gates, not bypass them.
5. Use the established local mailbox/provider abstraction for one notification to
   each responsible member, covering create/update/cancel/promotion. Delivery failure
   must never undo a committed registration. Provider delivery remains separately
   authorized; the current notification list is not an email-delivery implementation.

Historical actual attendance/Finance remains #40; Gallery is excluded from launch.
No DEV publication or Jotform cutover is authorized by this first local increment.

## Verification

Strict TypeScript/build pass. Ten allocation-model tests cover independent days,
all-or-nothing groups, first-fitting/skipped order, protected confirmations, release
and promotion, cancellation/re-registration order, email normalization, closed/end
states, capacity rejection and stale revisions/unchanged input after rejection.
Ten existing event presentation tests pass. These are model/UI-adjacent checks;
server, database, transport, authentication and real email tests remain necessary.

Browser walkthrough verified the wizard, different guest days, mixed confirmed/
waitlisted results, changing fictional viewers, cancellation confirmation followed
by group promotion, close/reopen and prefilled mobile editing. The tested 390px
viewport had equal 375px document client/scroll widths. Real devices and assistive
technology remain owner checks. Keep #39 open until its full required work passes.

## Local presentation iteration — 2026-11-03

Owner requested DD-MM-YYYY display dates throughout the wizard, recap, own results
and member list. Canonical ISO day keys and allocation rules stay unchanged.
Availability now uses calendar/day cards with locally generated circular LAN
artwork, remaining capacity and overnight times: the first day uses event start
until midnight; middle days 00:00–midnight; the final day 00:00–event end. This
fixture uses 18:00 start and 20:00 end. Single-day display uses start–end.

Ten distinct local images and their built-in imagegen prompt set are under
[fixture artwork](../worker/tests/fixtures/lan-art/README.md). Assignment is random
on mount and stable across edits. Images are decorative, with empty alt text.

Who is coming now uses responsive member cards: initials avatar, display name,
explicit achievement placeholders (Coming later), and confirmed-date chips. No
achievement logic or invented earned badges. Member-only presentation still omits
guests, contacts and waitlisted days; signed-out presentation omits the roster.

Twenty-two focused tests and strict TypeScript/build pass; new assertions cover
display date formatting, unchanged canonical keys and midnight/single-day labels.
Browser checks verified day cards, stable image assignment across capacity edits,
loaded local thumbnails, confirmed-only member cards and 390px layout with equal
client/scroll width. Keep all work local and uncommitted for owner review.

Local day-filter follow-up: clicking a day card filters Who is coming to only
members confirmed on that date, with only the matching date chip shown. The
selected card has a mint border and an accessible pressed state; keyboard buttons
control the roster region. An announced date/count describes the active filter.
Show all days follows the last member card, also appears for an empty filtered
result, and restores all confirmed dates. Registration selections and allocation
state are unchanged. Guest-only attendance and waiting members never enter the
roster. Viewer changes/reset clear the filter; signed-out users cannot use the
member filter. A regression covers guest-only, waitlisted, matching and reset
cases plus unchanged model state. Thirteen focused tests and build pass; browser
checks confirmed selection, date chips and reset. Keep local/unpublished.

## Authorized DEV preview publication — 2026-11-03

Owner explicitly requested pushing the accepted local preview for hosted DEV tests.
This supersedes the local-only publication restriction for this reviewed demo,
not the remaining Worker/D1/email requirements. The separate route is
/preview/registration on canonical DEV (or local development). It is clearly
labelled fictional, resets on reload, and has no registration API/persistence.
Actual event registration remains unavailable. No database migration, server
endpoint, credential/permission change, provider call or Wrangler configuration
change is included.

The reusable preview page/model now live in src/pages/RegistrationPreview.tsx and
src/lib/registration-preview-model.ts; old fixture entries remain local adapters.
Vite bundles all ten existing LAN images with hashed URLs for this lazy DEV page.
Default and hosted-prod builds exclude the page chunk and LAN images. A domain/
environment regression covers canonical DEV, localhost/IPv6, production, apex,
Workers alias, lookalike domains and non-loopback HTTP origins. Hosted acceptance
checks must describe simulator behavior, not claim D1 concurrency or real accounts.

Twenty-five focused tests pass (thirteen simulator, ten presentation, one preview
gate and one existing auth-mode test), plus strict TypeScript and default/DEV/PROD
builds. Reuse unchanged prior fictional browser flow/layout evidence. Normal
exact-head CI and bounded hosted tests follow publication; #39 remains open.
