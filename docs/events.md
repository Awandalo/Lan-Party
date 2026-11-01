# Events — Phase 5.2 Increment A repass

The owner requested the simplified #37 correction and scoped database cleanup in
trusted conversation on 2026-11-01. This replaces the initial A contract. B/C stay
paused until corrected hosted acceptance. No Jotform cutover, real email, uploads,
R2, new dependency or PROD operation.

## Current creation/editing contract

1. Complete an active reusable Location in Administration Locations first.
2. Select it, enter event name, Netherlands-local start/end and event description,
   then Review/Create. Two steps; event options retain Finance and guest limit.
3. The server derives every Netherlands calendar date inclusively from start to
   end, including an end at midnight. 13–15 November means all three dates.
   DST, month/year transitions cannot skip or duplicate dates.
4. The server copies complete venue name/address, instructions/directions, rental
   cents and one positive common capacity. Fence the template revision inside the
   same atomic creation transaction. No client-supplied venue/capacity/rental/days.
5. Snapshot venue/capacity/rental and calendar dates lock at Create. Template edits,
   archive/restore never resync an event. Edit name, description, Finance and guest
   limit explicitly; time edits must derive exactly the same saved dates. A new
   calendar range requires a new event.
6. Duplicate with fresh name/times derives fresh dates and copies the source event
   snapshot/settings with a source revision fence, never today's template. To use
   a corrected template, create from that template instead. Never copy participants,
   attendance, bills, payments, locked prices, gallery or previous audit history.

The owner explicitly removed the per-event guest switch in trusted chat. Only
logged-in responsible members invite accountless guests; others need an account.
Retain the existing positive 1–20 maximum-guests setting, default 1. No #39
ownership/privacy changes or registration activation. Finance uses the template's
copied rental with its existing enable/disable concept; no manual event rental or
extra expense. These are preparation settings, not operational billing.

Search/status filters, explicit Save/Cancel, safe text formatting/preview, static
artwork, central Events Logs and live session/MFA/CSRF/permission/revision/audit
controls remain. No raw HTML, autosave or unsaved warning. Existing bounds remain
200 catalogue records, 31 calendar days/event, 100,000 places/day, €1,000,000 rental
and 8,000 characters each for event description and copied venue instructions.

Locations gains mint hover/keyboard-focus outlines, lighter surface and reduced
motion support. A divider separates list/details, horizontal on small screens.
Location data/RBAC behavior is unchanged.

## Database cleanup

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

## Erroneous Drafts and paused work

Correct the template and create a new event, without resyncing old snapshots or
rewriting locked days. Permanent deletion remains paused with B/C. Its approved
sole business gate is **never any registration history**, not merely no active
rows. An authorized Administrator needs confirmation, integrity and retained audit.
Any past registration forbids permanent deletion; cancellation/retention applies.
There is no independent Finance/payment-history deletion gate. A exposes no delete
endpoint. Publishing/public pages (#38), registration (#39), cancellation/notices
(#39/#41), settlement (#40) and guarded deletion wait for corrected A acceptance.

## Verification and historical evidence

Changed-area tests cover template completeness/revision fences, inclusive/DST dates,
immutable snapshots, removed-input rejection, safe duplicate, permissions/CSRF,
concurrent revisions/replay, audit rollback, populated cleanup preservation,
lossy-conversion rejection, and old-schema gating. Fictional browser fixtures are
UI evidence, separate from local D1 integration and hosted owner acceptance.

Historical first A: `6c4fea3`, 0025 SHA-256
`d525bdf02bba9dcc3c7ed34d0910e3fd369875a9098531ae73a0fe85d68fec2f`,
611 regression + 40 policy/public-UI checks, verified DEV migration/deployment.
This receipt records the superseded iteration, not repass acceptance. See #37 for
current exact-revision checks and handover. Recovery evidence stays private/ignored.