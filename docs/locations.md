# Locations — Phase 5.1 Increment A

Owner authorized Increment A implementation and publication to DEV on 2026-11-01,
using [issue #36](https://github.com/Awandalo/Lan-Party/issues/36)'s reviewed deltas.
Phase 4.6 was accepted and closed; this reuses the existing Administration shell.

## Delivered candidate

`/manage/locations` provides name/city search, Active (default), Archived and All
filters, name-only creation, explicit Save/Cancel editing and archive/restore.
Structured address, practical instructions, capacity and default rental are optional
on templates. Rental uses nonnegative integer euro cents; capacity, if supplied,
is positive. Complete address generates an HTTPS Google Maps directions link;
an allowlisted HTTPS Google Maps URL can override it. No Maps API is used.
The list is bounded to 200 templates, including archived templates. There is no
hard-delete action. Text is rendered as plain text, not HTML.

`locations.manage` authorizes reads and writes, including the Locations tab under
Administration Logs (`/manage/location-activity`). Existing genuine Administrator
semantics apply; editable role names confer no access. No grants or roles are
automatically created. The location log records create/update/archive/restore,
time, actor and changed field names; it does not duplicate old addresses or
instructions. Readers see current venue/actor nickname labels, not actor IDs or
private profiles. Permanent account deletion clears the actor foreign key while
preserving the venue and action. Final public retention/privacy review remains
required before production use.

Every API request validates environment, live verified session, session correlation
proof and permission. Mutations require same-origin JSON and CSRF, bounded request
bytes and validated fields. Writes repeat session, MFA and permission predicates
within a transaction, guard a per-location revision and commit audit atomically.
Stale changes and replayed operation IDs roll back; uncertain outcomes instruct
the user to reload/check logs, without retries. Private reads are no-store and
provider-owned caches clear/fence late replies on session/authorization changes.
Increment A remains local/canonical DEV only.

## Iteration 2 — UI and route titles

Owner authorized implementing [#36](https://github.com/Awandalo/Lan-Party/issues/36)'s
iteration-2 scope and publishing to DEV on 2026-11-01. Add Location now uses three
steps: Location details, Additional information, Review & Create. Name alone is
required; empty optional rental defaults to zero. Back preserves the draft; Next
and Enter advance without saving; only explicit Create commits it. Editing keeps
the existing single-form Save/Cancel flow. No autosave or unsaved-change warning.

The selected venue has responsive information columns, a generic pin/directions
link in the second column, and a separated right-aligned Edit/Archive-or-Restore
footer. The redundant detail-card log shortcut is removed; Administration → Logs
→ Locations remains the audit destination. URL generation/override validation,
server authorization, API contracts, audit, schema and snapshot behavior are unchanged.

Administration document titles now follow the actual rendered, access-checked page
heading instead of a separate PROD-excluding title map. Members, member details,
Locations and Logs keep appropriate titles after navigation/refresh. Restricted,
disabled or unknown routes retain their real restricted/not-found view and title;
this does not enable routes or bypass permission checks. The correction is prepared
on DEV; production requires its normal separately approved source promotion.

Changed-area verification: 23 tests covering Locations HTTP/D1 behavior,
presentation/title contracts, session validation and frontend environment boundaries;
strict TypeScript and default/hosted-dev builds pass. The first new presentation
test counted only HTML list elements having attributes; corrected the test to count
all three steps, preserving its three-step assertion. No security assertion weakened.
The existing hosted-dev bundle-size warning remains.

Fictional local browser checks cover name-only and populated creation, Enter/Back,
review, optional rental, invalid Maps/negative rental, explicit edit Save, Escape
cancellation/focus return, archive/filter/restore, central Logs, permission loss and
320px/390px layouts without horizontal overflow. Direct Members/member-detail links,
refresh, Back/Forward, valid Locations/Logs, unknown-route and restricted titles were
checked. The member detail fixture supplies only the data needed for route/title
checks; its unimplemented auxiliary role transport is not claimed as full member
functional acceptance. No hosted fixture mutation, database/provider/storage or
PROD operation was performed. Owner hosted acceptance remains pending.

## Migration and publication

### DEV execution receipt — 2026-11-01

The owner separately approved applying only 0024 to DEV with recovery preflight and
schema/integrity verification. Source: `1bbc703b54b4ae583788b219e8f07eae0b4b5a17`.
SHA-256: `ae9d640f93d5d3ed3deafcb29626ef954d70cff2cd60155e9243c51a93f1de43`.
Verified the existing Cloudflare identity and exact DEV database binding; 0001–0023
were recorded and only 0024 was pending. A fresh Time Travel bookmark is kept in
ignored local evidence, not the public repository. The migration succeeded once;
no error-10000 retry was needed. Postflight: 0024 recorded, no pending migrations,
four metadata columns, nullable address fields, log/replay guard and original
event/location foreign key present; quick_check ok and foreign_key_check empty.
Locations/events/days/registrations/selections remain zero, matching preflight.
No hosted account/grant/venue mutation or PROD operation was performed.

Read-only postflight initially hit Windows multiline argument truncation; SQL-file
mode returned only an execution summary. Single-line query mode then returned all
nine actual result sets. No migration was retried. These tooling diagnostics do
not substitute for the successful schema/integrity results above.

Application CI/deployment succeeded for 1bbc703; anonymous Locations/log APIs deny
with 401/no-store, home/asset/health return 200 and the asset contains that build.
Local coverage: 588 regression cases passed initially; the explicit reviewed
migration-history list then gained 0024 and all 12 blocked cases passed. Its 14
owner-bootstrap dependents also passed. TypeScript, default/DEV builds, 37 policy
and three public UI checks passed. Fictional browser checks cover creation/edit,
decimal rental, generated Maps link, archive/restore, Logs-only navigation, access
revocation, 320px editor and 390px log layout, plus Escape cancelling without save.
No external Maps navigation was needed. Hosted authenticated CRUD/persistence and
owner acceptance remain pending. The existing DEV bundle-size warning remains.

### Procedure and compatibility

`0024_create_location_management.sql` rebuilds `locations` to permit null address
fields, preserving existing IDs and values. It adds capacity, rental cents,
directions URL, revision and a separate activity table. Event, event-day and
registration records stay intact. Execute as one migration transaction; local
populated fixtures cover foreign keys and full rollback.

Code can deploy before migration: Locations navigation stays hidden and an
authorized direct API request returns 503 until the complete schema is present.
Other Administration sections remain available. Deployment does not apply D1
migrations. Remote application needs separate approval.

Before an approved DEV migration, verify exact database/Worker/source, current
migration history (0001–0023 expected), fresh recovery bookmark/export and candidate
checksum. Check existing location values fit the new bounds; stop on divergence
or incompatibility. Apply only 0024 to `lan-party-dev`, then check migration history,
quick_check, foreign_key_check, unchanged existing location/event/day/registration
data and new schema. Do not publish exports. No PROD/configuration/permission changes.
Preserve data on failure; restore needs its own approval and Worker rollback does
not undo D1 migration. Error 10000 follows AGENTS.md's bounded retry rule.

## Deferred boundaries

Increment B includes attachments, private storage, quotas, cleanup and emergency
withdrawal; R2 subscription/billing is not approved. Approved future logical caps
are 50 MB per template and independently per event snapshot, website budget 2.5 GB
split DEV 500 MB / PROD 2 GB. Images JPEG/PNG/WebP ≤5 MB and PDFs ≤10 MB.
These requirements are recorded, not implemented as unused tables/settings.

Issue #37 adds event-owned snapshots and publication validation. Published events
will require full structured address and positive capacity. Template edits and
archive/restore must not alter snapshots; archived venues need explicit review
before publishing a draft. Duplication copies the source snapshot. This increment
does not create snapshots, public location pages, event CRUD or file downloads.
Keep #36 open until its selected increments and acceptance are complete.

## Verification

`node --test worker/tests/locations.test.mjs` covers Worker/D1 CRUD, permissions,
CSRF/proofs/origin/validation, concurrent revisions, replay/audit rollback, numeric
log pagination, old-schema gating and populated forward migration. The Locations
integration in `account-lifecycle.test.mjs` runs real deletion at schema 0024 and
checks actor anonymization without removing venues.

Use `/worker/tests/fixtures/locations-ui.html` on local Vite for fictional browser
checks. Transport is intercepted: UI evidence, not a database integration test.
Check name-only creation, edit/cancel, decimal rental, generated directions,
archive/restore filters, logs, keyboard/mobile layout and access revocation.
After migration and approved DEV test scope, verify persistence across reload,
manager/admin versus ordinary member/signed-out API denial, expired sessions,
stale edits, archive/restore and Locations logs. No real venue/contact data or
hosted mutations are included without applicable approval.
