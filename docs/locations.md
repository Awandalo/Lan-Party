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

## Migration and publication

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
