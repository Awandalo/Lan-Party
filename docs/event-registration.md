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

## Connected registration — owner-authorized DEV implementation, 2026-11-03

The owner accepted the hosted simulator, requested real event integration and
authorized DEV publication/activation in this conversation. The separate demo
remains fictional. Real registration now belongs on each published event's page;
organizers use Administration → Events → select event → Participants to open or
close registration and review the shared member-card presentation. No registrations
on behalf of members, actual attendance, Finance, PROD or Jotform cutover.

The existing three-step wizard calls /api/event-registration/EVENT_ID for the
signed-in member only. /api/event-participants/EVENT_ID requires the existing
events.manage_registrations permission (genuine Administrator follows existing
RBAC). Cancellation through Overview retains events.cancel and typed confirmation.
Participants counters show confirmed members plus guests for each date; Total
counts unique confirmed people and separately shows participant-days. Counters
filter the cards; Show all days resets. Guest email is absent from the organizer
projection; guest identity and waiting details never enter the member roster.
Ordinary members receive only their own private party plus confirmed member names
and dates. Deactivated member names are masked. Anonymous users retain public
availability but receive no registration/roster projection.

Migration 0029 adds a private draft per durable foundation registration, normalized
person/day places and group sequence, operation receipts and notification outbox.
Existing registrations/days backfill without identity changes. Pure allocation
policy is shared with the accepted simulator; the Worker validates shapes, bounds,
UUIDs, normalized email, days and guest limits independently of the browser.
Every mutation fences the event revision, current publication/open/end state,
live verified session/MFA and effective permission within its D1 batch. The batch
also writes places, member-day compatibility projection, audit and notices. Stale
or replayed requests fail without partial writes. Requests are bounded at 32 KiB;
successful mutations are limited to 20 per actor per ten minutes, separate from
authentication counters. At 1,000 durable member parties, new parties require
organizer review rather than an untested large-event expansion.

Account deletion uses the same allocator inside its existing guarded transaction:
private guest data cascades; released places promote fitting groups while open.
Completed member and guest totals survive only as anonymous aggregates. Managed
event completion uses its actual end time, retaining legacy completion behavior
for the older schema. Dates/deletion remain permanently locked by registration
history, including after account removal. No existing account role/grant changes.

Create/edit/cancel/promotion enqueue one notice per responsible member per
operation. Existing local/DEV transport, canonical URLs, recipient allowlist and
shared provider budget remain authoritative. A notice links to the event and asks
the member to review current status; it contains no guest identities or contacts.
Delivery starts only after commit. State moves pending → attempting → sent/failed;
failure never reverses places. Already attempted/uncertain sends are not retried
automatically. The existing daily DEV maintenance may claim at most ten pending
operations missed before the request task started; no new schedule is created.
No real-recipient provider test was authorized/performed for this handover.

Owner separately approved migration 0029 and connected DEV activation. It applied
only 0029 to lan-party-dev (a3c4cea6-ceb7-43b8-b9b7-b374726b35b4) after a fresh
Time Travel bookmark and ignored local recovery export. History was exactly
0001–0028 before, exactly 0001–0029 after. Sixteen preservation comparisons of
non-secret state/credential counts were unchanged; quick_check is ok and foreign
key checks empty. Three controls were seeded; registrations, places, operations
and notifications remain empty. Recovery evidence is private under .wrangler.
The previous Worker remains compatible. Restore requires its own authorization;
rolling back code alone does not undo schema. No PROD operation occurred.

Verification includes real local D1 concurrency/replay, session/generation/closure/
RBAC commit-window races, MFA, first-fitting groups, protected confirmations,
independent guests, duplicate-email privacy, audit rollback, migration preservation,
notification failure and real account deletion/promotion/anonymous retention.
The broad run passed 672/673; its one legacy publication fixture was corrected to
explicitly run against pre-0029 schema, then all five publication tests passed.
Subsequent changed-area tests include shared-card rendering and retention; reuse
unchanged successful security evidence. Strict types and default/DEV builds pass;
DEV has the existing advisory main-chunk warning. Default build omits the ten LAN
images. Local browser verified actual Worker/D1 create/reload, independent guest
days, manager counters/cards and day/reset filtering using isolated fictional
accounts. Exact-head CI, deployment and hosted acceptance follow publication.
Keep #39 open for the owner's real DEV review; do not treat the demo acceptance
as server-backed acceptance.

Local follow-up: owner requested a second registration control in Overview's
Actions menu. Reopen registration / Close registration uses the same existing
Participants endpoint, session/CSRF proof and revision checks; the Participants
button remains. Hide it without events.manage_registrations or for Drafts,
terminal/ended/legacy events; disable it during saving and surface failures.
Keep this follow-up local and uncommitted for review; no hosted event changes.
Verification: 16 focused menu/presentation checks and strict types/build pass.
The new test initially assumed a plain-text button instead of the menu's existing
label span; that test defect was corrected without changing menu behavior.
Fictional local browser checks verify open → close → reopen labels, status refresh,
and keyboard reachability. Existing server guards retain their verified behavior;
no backend/schema changes or broad regression rerun is needed for this UI follow-up.

Further local owner requests: add space between the own-registration panel and
Edit/Cancel controls; replace plain results with a shared visual summary in the
real event view and fictional preview. Each person has an independent selected-day
confirmation percentage/progress, status heading, day-count pill and day cards.
Confirmed, mixed and waitlisted states stay distinct; retain full DD-MM-YYYY dates
and waiting-group positions. Percentage means confirmed selected days, never
actual attendance or the proportion of the full event selected by the member.

Split the real member event into Event details (/events/ID) and Your registration
& crew (/events/ID/registration), with event context links and page navigation.
The first contains description, venue, availability and the registration entry;
successful registration transitions to the second with own status and the crew.
The crew page carries a validated day filter; Show all days clears it. Browser
navigation/reload preserve the view. The crew initially renders 24 cards with
Show more members, avoiding an initially unbounded list for a large membership.
The Worker serves the new view's shell with the existing anonymous event metadata
and canonical base-event URL; unpublished events remain hidden. No new API,
migration, account permission, configuration or remote effect is introduced.

Verification: 58 focused rendering/navigation/metadata/menu/model checks and strict
types/default/DEV builds pass; the new summary test's case-sensitive HTML attribute assumption
was corrected to the case-insensitive HTML contract. Isolated fictional local
Worker/D1 browser checks cover register-from-details, transition to confirmation,
context navigation, browser Back/Forward, day filter/reset and reload persistence. Measured 20px above
the Edit/Cancel buttons and no horizontal overflow at the tested desktop width.
Real-device/mobile review remains an owner check. All follow-ups remain local,
unstaged/uncommitted and unpublished alongside the earlier Actions-menu change.
Local alignment follow-up: keep the same cover image on both event views. Browser
measurement confirms identical 352px image height and navigation document position
(696px) at the tested viewport; TypeScript passes. No new tests or broader rerun
for this conditional-image removal. Preserve the owner's open local form and keep
all work unpublished.
Local coherence follow-up: add the standard separator above Choose your LAN days
after venue directions. Keep the Event submenu visible on the signed-in Events
catalogue as two disabled, non-navigable items with an Open an event hint; opening
an event enables the corresponding links. Events stays active throughout its
detail/registration routes, while Home remains an exact match. Browser confirms
disabled items have no href, become enabled after opening the event, and the
availability separator is 1px with 24px inner spacing. Twenty-seven focused
navigation/presentation/privacy tests plus TypeScript/build pass. No full security
suite repeated for these frontend-only changes. All edits remain local/unstaged.

Local selection follow-up: unregistered members can toggle day-card borders on
Event details. These temporary choices prefill step 1, remain editable there and
are discarded on reload or successful save. Registering without picking cards
starts with empty day choices. The existing three-step flow and server allocation
rules remain unchanged, including selectable full days for waitlisting.
Saved registrations show a status banner on Event details instead of selected
borders. Edit registration opens saved days for explicit changes; card clicks
never silently remove existing places. Banner wording distinguishes confirmed,
partly confirmed and waitlisted member places. Crew filtering now lives only on
Your registration & crew, with date buttons and All days / Show all days reset.
Verification: strict TypeScript/build and five focused crew/summary rendering
checks pass. Actual local Worker/D1 browser walkthrough verified card prefill,
changing preselected days, all three steps, save, saved-day editing, crew filter
and reset, empty direct registration and reload clearing. The fictional test
registration was cancelled afterward; hosted DEV/PROD and real email were untouched.
No full regression rerun for these frontend-only changes. All local edits remain
unstaged, uncommitted and unpublished for owner review.

Final owner review approved DEV publication of these follow-ups on 2026-11-03.
The crew filter now sits directly below Who is coming, without the extra
Who is coming on heading or bottom reset; All days is the single reset.
Forty-four changed-area checks and strict types/default/DEV builds pass. Local
browser verified the relocated filter/reset and no duplicate controls. Reuse the
earlier real Worker/D1 flow evidence; exact-head CI and hosted verification follow
publication. No migrations, infrastructure, permissions, PROD or provider actions
are included. Temporary local review servers/assets will be cleaned after DEV
verification, preserving private recovery evidence. Keep #39 open for DEV review.

Local owner correction on 2026-11-03: retained anonymous attendance must not occupy
physical seats. Registration/day/unique-person counters and public remaining places
now exclude deleted-account aggregates; historical review retains them separately.
A new account receives no restored reservation or queue priority. See the occupied-
seat correction in [attendance review](attendance-review.md). Twenty-eight focused
checks, types/build and local browser verification cover this local-only follow-up.
