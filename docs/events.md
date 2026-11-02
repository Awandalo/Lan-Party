# Events — Phase 5.2 A, B and C

The owner requested the #37 repass and scoped DEV cleanup, then explicitly revised
A again on 2026-11-01: allow correcting dates before any registration, expose guarded
Administrator deletion, remove Finance enablement, add a minimum event headcount
and a Word-like editor, and restore three wizard pages. These trusted instructions
supersede earlier date/deletion locks. A was then accepted and B authorized below.
No Jotform cutover, real email, uploads, R2 or PROD operation.

## Current creation/editing contract

1. Complete an active reusable Location in Administration Locations first.
2. Select it, enter event name, Netherlands-local start/end and event description,
   then Next to Attendance & guests (guest limit and minimum participant headcount),
   then Review/Create on page 3. Finance enablement is removed.
3. The server derives every Netherlands calendar date inclusively from start to
   end, including an end at midnight. 13–15 November means all three dates.
   DST, month/year transitions cannot skip or duplicate dates.
4. The server copies complete venue name/address, instructions/directions, rental
   cents and one positive common capacity. Fence the template revision inside the
   same atomic creation transaction. No client-supplied venue/capacity/rental/days.
5. Snapshot venue/capacity/rental locks at Create. Template edits/archive/restore
   never resync an event. Explicitly edit name, description, guest limit and minimum
   event headcount. Dates may change before any registration; overlapping day IDs
   stay stable and days are regenerated atomically. The first registration locks
   dates permanently, including after cancellation or later row removal.
6. Duplicate with fresh name/times derives fresh dates and copies the source event
   snapshot/settings with a source revision fence, never today's template. To use
   a corrected template, create from that template instead. Never copy participants,
   attendance, bills, payments, locked prices, gallery or previous audit history.

The owner explicitly removed the per-event guest switch in trusted chat. Only
logged-in responsible members invite accountless guests; others need an account.
Retain the positive 1–20 maximum-guests setting, default 1. Minimum participants
means a whole-event headcount target (1–100,000, default 1), not minimum days per
person. It causes no automatic cancellation, closure or scheduling. No #39
ownership/privacy changes or registration activation. Finance enablement is removed
from UI/API/schema. The owner's future payment flow is simple: organizer explicitly
closes at their chosen time (usually days after the final event day), calculating
the final day price and each member/guest total;
Paid/Unpaid is manually toggled on registered members in the attendees workflow.
No scheduled closure, payment provider, automatic paid detection or reconciliation.
This A iteration records that intent; it does not implement #40 settlement.

Search/status filters, explicit Save/Cancel, safe text formatting/preview, static
artwork, central Events Logs and live session/MFA/CSRF/permission/revision/audit
controls remain. No raw HTML, autosave or unsaved warning. Existing bounds remain
200 catalogue records, 31 calendar days/event, 100,000 places/day, €1,000,000 rental
and 8,000 characters each for event description and copied venue instructions.

Events now uses the same mint hover/keyboard-focus outline, lighter surface,
reduced-motion support and responsive list/details divider as Roles and Locations.
A toolbar provides bold, italic, underline, strike, three heading levels, paragraph,
bullet/numbered lists, HTTP(S) links, simple tables, and undo/redo. Tiptap 3.32.2 MIT
packages are pinned and lazy-loaded only when editing; runtime npm audit is clean.
See the [React setup](https://tiptap.dev/docs/editor/getting-started/install/react)
and [table documentation](https://tiptap.dev/docs/editor/extensions/nodes/table).

The Worker rebuilds a strict JSON document allowlist, bounded to 8,000 text
characters, 800 nodes, depth 12 and 48,000 serialized characters; request body is
bounded to 64 KiB. Tables are rectangular, up to 20 rows/10 columns, without merged
cells, arbitrary styling, scripts, embeds or event attributes. Links permit HTTP(S)
without credentials. React renders safe nodes, never arbitrary HTML. Existing
plain/limited-markup descriptions remain readable and convert when edited; no bulk
description rewrite or raw-HTML API compatibility is introduced.

## Previous cleanup — 0026 (historical)

Applied 0025 remains unchanged as mandatory history. Forward migration
`0026_simplify_event_snapshots.sql` moves uniform managed day capacity to one event
capacity, physically removes `event_days.capacity` and
`event_management.guests_enabled`, and enforces immutable snapshot values.
Previously zero guest limits become 1 for the approved consistent rule. The
conversion guard is dropped in the same batch; no obsolete runtime write path or
deprecated payload compatibility remains.

Missing/mixed managed capacities or unmanaged nonempty capacity data abort rather
than guessing. Preserve event/day IDs, actual saved dates, registration links,
composite foreign keys, audit and snapshot values. No regeneration of old
noncontiguous days: such events need explicit review/recreation. Initial DEV
inspection found zero events/days/registrations/event logs; recheck before applying.

Existing Phase 2 day-instant columns remain foundation data. New records use actual
Netherlands midnight boundaries (23/24/25-hour UTC spans), not redundant descriptive
event times. Editing event hours does not rewrite saved day dates/boundaries.

The owner's cleanup request includes this scoped DEV operation. Publish the new
Worker first: its event routes safely return 503 until 0026 exists. Verify exact
DEV identity, only 0026 pending, fresh private recovery bookmark/export and unchanged
event data before applying. Verify removed columns, common capacity/guards, unchanged
record counts, quick-check and FK-check afterwards. No reset or event deletion.

## Current migration 0027 and deletion safety

`0027_correct_unregistered_events.sql` physically removes `finance_enabled`,
adds the minimum headcount and a permanent registration-history bit, and rebuilds
Events audit so deletion retains its event reference/title and existing sequence.
The bit is seeded from current registrations and marked on every future insert or
move. It cannot be reset; database triggers block deletion/date changes once set.
No registrations existed in DEV at inspection; the current owner event is preserved.

An authorized Administrator may delete a managed event only with exact-name
confirmation, current revision/live authority and no registration history. Delete
its days/management/event in one atomic audited transaction. No separate Finance
or payment-history gate exists. Former registrations still forbid deletion even
if all active counts and later registration rows are empty. No automatic deletion
or retry is performed. Uncertain outcomes require log/reload review.

Fresh recovery/history/schema/integrity checks precede DEV migration, with a private
row-by-row comparison of preserved event/day/management/audit fields afterwards.
Publish the schema-gated Worker first, apply only 0027, then verify actual revision,
removed fields, history/audit guards and integrity. Applied history is immutable;
old-Worker rollback alone does not restore schema compatibility. Recovery requires
its applicable authority. No owner event is deleted during migration or acceptance.

A was accepted at `aabf376` on 2026-11-01. The owner then authorized B below.

## Verification and historical evidence

Changed-area tests cover template completeness/revision fences, inclusive/DST dates,
immutable snapshots, pre-registration date correction, safe duplicate, permissions/CSRF,
concurrent revisions/replay, audit rollback, populated cleanup preservation,
lossy-conversion rejection, and old-schema gating. Fictional browser fixtures are
UI evidence, separate from local D1 integration and hosted owner acceptance.

Historical first A: `6c4fea3`, 0025 SHA-256
`d525bdf02bba9dcc3c7ed34d0910e3fd369875a9098531ae73a0fe85d68fec2f`,
611 regression + 40 policy/public-UI checks, verified DEV migration/deployment.
This receipt records the superseded iteration, not repass acceptance. See #37 for
current exact-revision checks and handover. Recovery evidence stays private/ignored.

## Increment B — approved DEV publication and public view

Publish and unpublish require events.publish; ordinary Draft/published edits require
events.update; cancellation requires events.cancel. Existing session proof, CSRF,
origin, live account/MFA/role authority, revision, replay and atomic audit fences
apply. Lifecycle actions require exact-name confirmation. Archived source templates
require explicit saved-venue review before publication. Immutable snapshots and
permanent registration-history date/deletion rules remain in force.

Migration 0028 adds is_listed default 0 and extends retained audit operations.
Existing events stay private. Unpublish preserves publication_status=published,
closes registration and hides collection/direct detail URLs; republish is explicit.
Cancellation is terminal, hides the event and closes registration. Any registration
history prevents cancellation until #39/#41 can deliver participant notices; it
also continues to prevent permanent deletion. No restore is implemented.

Public /api/events and /api/events/:id are enabled only locally/canonical DEV.
Only listed, managed, Published events appear. Upcoming includes ongoing events;
past events remain public archives until hidden. The homepage requests exactly
one next upcoming event. Public responses contain allowlisted event fields and
aggregate remaining capacity per date; no participant identities, contacts, rental,
creator, audit or role data. Registered foundation rows count; cancelled rows do
not. #39 must extend counts atomically for its future guest/waitlist model.

Anonymous projections omit authenticated-only venues, even with a cookie. Detail
venue access requires a valid verified session and matching session proof. Reads
are no-store, have no side effects, and use a single SQL projection to avoid a
visibility change between event and attendance reads. Frontend detail responses
are fenced by event/account/session context; anonymous collection reads omit
credentials. Description rendering uses A's safe allowlisted document renderer.

Public detail uses default LAN artwork, Netherlands dates, remaining places,
venue/directions, prepared WhatsApp sharing and Copy Link. No message is sent.
Reference: [WhatsApp click-to-chat](https://faq.whatsapp.com/5913398998672934).
No registration control or attendee list is exposed; registration stays closed.
Public and management buttons retain the existing hierarchy, mint hover/focus,
lighter surfaces and responsive dividers. No new dependencies or services.

Apply only approved 0028 on DEV after recovery export/Time Travel checkpoint,
exact pending migration/history and integrity preflight. Compare every existing
event/day/management/audit/registration row and allocated sequence afterwards;
only is_listed=0 and migration ledger advancement are expected. Preserve private
recovery evidence. No actual owner event is published as a test. Worker rollback
alone does not undo schema; recovery requires its own applicable authorization.

Verification covers lifecycle/permission/proof/replay/revision/audit rollback,
private venue fencing, public identity exclusion, cancelled-row counts, hidden
URLs, past/upcoming selection and populated migration rollback/preservation.
Fictional browser checks are separate from actual hosted owner acceptance.
Registration #39, notices #41, settlement #40, uploads, Jotform cutover and PROD
remain excluded. Keep #37 open for owner acceptance and subsequent increments.

DEV migration receipt (2026-11-01): approved 0028 applied after a fresh checkpoint,
export and unchanged preservation preflight. SHA-256:
`33d921163a0f0d40f0e9ce3ba57a0c7f5455d7d849d6a2140e44bd3c568252d8`.
Both existing events and all five days were preserved, together with management
snapshots, audit rows/sequence, zero registrations, accounts/roles/location counts.
All managed events remain hidden. Integrity/foreign keys passed; no temporary
tables remain. See #37 for exact publication/deployment and owner acceptance.

## Increment B touch-ups — 2026-11-02

Trusted owner instruction covers the three #37 corrections as one DEV handover.
When Up Next contains an event, Home omits the hero Explore Events CTA, uses a
prominent View event button and retains Browse all events. No-event/error states
retain useful full-list navigation. Home, list, detail and share metadata use one
shared reference to the existing public LAN artwork with descriptive alt text.
The dark/mint layout, hover/focus behavior and responsive stacking remain.

The existing Worker uses HTMLRewriter on event detail GET/HEAD responses, leaving
the SPA shell and scripts intact. Initial HTML contains an escaped title,
description, canonical link, Open Graph and Twitter tags with absolute canonical
event/image URLs. Description is bounded plain text from the safe event document;
no venue, account, participant or management data is queried for metadata. Only a
managed, listed Published event receives event-specific metadata. Cookies, session
proof and user agent never upgrade the projection. Draft, unpublished, cancelled,
archived and unknown IDs return identical generic metadata with 404/noindex;
unavailable schema/database returns a generic 503. Query strings are excluded from
canonical URLs. HEAD has no body, and all transformed responses are no-store with
static validators removed so publication changes cannot reuse a shell 304.

The owner separately approved adding only `/events/*` to
`env.dev.assets.run_worker_first` in wrangler.jsonc. This ensures navigations and
crawlers reach the Worker before SPA asset fallback; default/PROD routing stays
unchanged. No new resource, permission, service, migration or upload is introduced.
See [Cloudflare SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/),
[HTMLRewriter](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/)
and [Open Graph](https://ogp.me/) for the supported mechanisms.

Focused integration checks cover anonymous initial HTML, escaping, one title/meta
description, preserved app shell, query/trailing-slash canonicals, private/unknown
fallback (including owner cookies), publication visibility changes, conditional
requests, HEAD, representative WhatsApp/Facebook/Twitter/browser user agents,
description bounds, image reference and PROD/alias exclusion. Frontend checks cover
both Home states and shared artwork; browser checks cover desktop/mobile layout.
Hosted checks must inspect initial HTML without JavaScript, redirect behavior and
anonymous image access. No actual share or external preview-debugger submission
is needed: WhatsApp owns rendering and cached cards, so preview appearance and
cache refresh cannot be guaranteed. The share link stays user-initiated.

No publication/data write is performed during hosted verification. Reuse prior B
lifecycle/auth evidence and normal exact-head CI; owner hosted acceptance remains
separate. C, registration, email, Jotform cutover, storage and PROD stay excluded.

## Stage C — destructive boundary closeout, 2026-11-02

The owner proceeded to C in trusted conversation, accepted the existing B layout
and WhatsApp-preview limitation, and requested one accompanying Home adjustment:
Browse all events becomes the existing secondary button style, with only that
button pushed to the right of the action row. View event retains its position.
Mobile wrapping, mint hover/focus, artwork and metadata remain as delivered in B.

C's planned Administrator-only deletion was brought forward into the A correction
at aabf376. Do not duplicate it or invent a new settlement feature. C verifies the
existing exact-name confirmation, live genuine-Administrator authority, operation
dedupe, revision fence, atomic delete/audit and no-registration-history business
gate across Draft, published and cancelled events. Deleting an eligible published
event removes it from public API/HTML views immediately; old URLs become generic
404 responses. Source Locations and durable audit identity/title remain intact.
The confirmation explains that public links stop working. Administrators see an
explicit reason when registration history makes deletion unavailable.

Compatibility correction: a retained anonymous_event_registrations or
anonymous_day_registrations row is evidence of past registration even when no
identifying registration remains and an older event's registration_recorded bit
is zero. Account deletion retains these aggregate rows. Use one internal history
predicate for catalogue eligibility and the date-change, deletion and cancellation
preflight/live transaction guards. Do not delete anonymous history, infer no past
registrations from an active count of zero, or add an independent Finance gate.
The existing permanent bit, registration triggers and foreign keys remain intact;
no schema migration, backfill or hosted data mutation is introduced.

New D1 integration coverage checks all eligible lifecycle states, public API/HTML
removal, source-location/audit retention, either anonymous aggregate independently,
date/cancellation rejection and real registration-vs-deletion ordering. Existing
tests retain genuine-vs-delegated authority, CSRF, exact confirmation, past-history
permanence, stale revisions and audit-failure rollback. Account-lifecycle tests
cover the retention source. Browser checks use fictional data and do not authorize
deleting real hosted events. Normal CI and read-only hosted DEV checks precede
handover; owner functional acceptance remains separate.

This completes the currently implementable C deletion boundary for review, not
all Phase 5 integrations. Organizer event closure, day pricing and final bills
remain #40, separate from registration closure and publication. Registration #39,
participant-bearing cancellation/notices #41, uploads, Jotform cutover and PROD
remain outside this task. Keep #37 open for acceptance/dependency follow-up.

## Final Overview GUI pass — 2026-11-02

The owner accepted C's hosted functionality and authorized #37's final GUI cleanup
and DEV handover. One left-aligned Actions button replaces standalone Delete,
Duplicate, Cancel and Publish/Unpublish controls. Current permissions/state still
determine entries; history-blocked deletion/cancellation show disabled explanations.
View public page and the mint Edit button remain visible at the right. Selection
opens the same existing exact-name/destructive/publication/cancellation dialogs;
no API, backend, database, permission or confirmation logic changes.

The compact dark menu uses mint hover/keyboard focus, subtle elevation and a short
opacity/transform reveal. It opens below the trigger when space permits, above
when needed, and constrains height/width on narrow screens. Closed content is
inert and hidden from the accessibility tree. Enter/Space click activation,
ArrowDown/ArrowUp opening/navigation, Home/End, Escape, Tab and outside dismissal
are supported. Escape and dialog cancellation return focus to Actions; choosing
an operation restores the trigger before the original dialog takes focus. Stable
event identity preserves the trigger across revisions. Reduced-motion CSS removes
menu and chevron transitions/transforms. No new dependency or portal service.
Reference: [WAI menu-button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/).

Overview / Participants / Finance is a restrained section preview in event details.
Overview alone contains existing content and the action footer. Participants and
Finance are disabled, labelled Coming later; there are no fake panels, member
lists, payment controls, routes, APIs or grants. They remain #39/#40 work.

Focused UI contracts cover Draft/published/terminal states, current permissions,
disabled history actions, public-view/Edit hierarchy and unavailable future
sections. Existing event mutation/security checks remain valid. Fictional browser
checks cover arrow wrapping, Home/End, Escape and confirmation focus return,
outside dismissal, history explanations and 390px/320px menu bounds. Served
reduced-motion rules are inspected; actual OS reduced-motion and authenticated
hosted visual/functional acceptance remain owner checks. Normal exact-head CI,
build and read-only hosted deployment evidence precede handover.

Keep #37 open. Its closure gate is the owner's acceptance of this final DEV pass,
followed by a completion note; neither this implementation nor passing CI closes
the issue or authorizes PROD. No migrations, hosted data writes, provider actions,
registration/Finance implementation, new storage or infrastructure are included.
