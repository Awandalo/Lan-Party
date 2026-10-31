# Phase 4.3 — Roles & Permissions

Owner design: #28 comment 6509442626, directly authorized in trusted chat.
Implementation candidate; remote migration and hosted acceptance are separate operations.
The owner also reconfirmed indefinite audit retention in this conversation.

## Authority and boundaries

The immutable seeded Administrator ID is
`1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7`. A verified active account with an active,
currently assigned genuine Administrator role and no account-lifecycle record has
intrinsic full administration authority. Display names, copied codes, low member
numbers and possession of a protection permission cannot substitute for it.
All other accounts use explicit current grants through active roles.

Only another genuine Administrator can grant/remove Administrator membership.
All self-membership changes are rejected. Security edits to any held role are
rejected, including future assignments; harmless name/description edits preserve
grant timestamps. Built-in User and Administrator definitions are immutable;
Administrator is permanently protected. Phase 4.3 shipped without role deletion;
Phase 4.5's bounded custom-role deletion is documented below.

Delegated `roles.manage` holders manage ordinary, unprotected custom roles.
Protected roles and roles containing protected grants require genuine Administrator
authority for changes and assignments. Protected grants are `users.view`,
`users.manage`, `roles.manage` and the new reserved `roles.protect_admin`.
The latter is a catalogue capability, not a grant of Administrator identity.
It alone unlocks neither role management nor the activity log. Other fixed
catalogue permissions can be delegated; no arbitrary permission-code editor exists.

Member lookup, assignments and effective-permission inspection require `users.view`
as well as role-management authority. Effective permissions are empty for inactive,
unverified or lifecycle-disabled accounts; inactive/future assignments/grants do
not contribute. Roles-only access cannot enumerate members or inspect private email.
New membership requires an active, verified target and active role. Removing an
existing assignment also supports inactive roles/accounts and never reactivates an
account. Account recovery remains outside this UI.

Valid ordinary full sessions suffice for role changes. No recent two-minute
password/MFA proof is required. This deliberately increases the consequence of a
stolen live administrator session: it can perform privileged role actions without
an additional prompt. Existing session expiry, credential generations, revocation,
MFA-at-login/session assurance, CSRF, exact origin and live grant checks remain.
Password, MFA and lifecycle security flows keep their existing fresh-proof rules;
reactivation is unchanged. Optional MFA remains optional.

## Atomic writes and stale editors

### Phase 4.5 — Delete an unassigned custom role

`POST /api/manage/roles` accepts `action: "delete"`, the role ID, reviewed revision,
unique operation ID and `confirmed: true`. The UI places Delete role beside Edit
and requires an explicit modal acknowledgement. Cancel receives initial focus.
Existing `roles.manage`/intrinsic Administrator authority, full-session assurance,
CSRF, origin and revision gates apply; no new grant or fresh-proof policy is added.

The acknowledgement uses the shared switch style. Opening the dialog performs a
fresh, no-store `GET /api/manage/roles/:uuid/deletion` under the same role-management
and session-correlation checks. It returns only an eligibility state, never member
identities/counts. Assigned roles show “Role can't be deleted yet. Please check the
current members.” with the switch and confirmation disabled. Loading, unavailable,
protected and failed checks also disable confirmation. This read does not replace
the transactional assignment check when a deletion is submitted.

Members-view holders see an Assigned members card beneath Permissions, with member
detail links and 20-row cursor pages. It reuses the Members read/cache contract via
`roleId=:uuid&status=all`; all persisted assignments are included, even inactive,
unverified or future ones. The all-state view requires an explicit role filter;
role-filtered cursors bind that role and all other criteria. Existing unfiltered
cursors retain their prior fingerprint. The card exposes the normal approved member
summary fields and requires `users.view` on every server read. It neither fetches
the whole directory nor grants member access to roles-only managers.

Built-in roles, protected roles and roles carrying protected grants are never
deletable, including by Administrators. Any `user_roles` row blocks deletion,
including inactive/unverified members and future/held assignments. Effective member
counts do not establish eligibility. The final role DELETE repeats the no-assignment
and unprotected-role predicates in the guarded revision transaction; FK RESTRICT
also prevents orphan assignments. Only that role's mappings are removed, atomically
with the role and audit event. Audit failure rolls everything back. Missing/stale
roles and replay/conflicts return 409; assigned roles return actionable unassignment
guidance. Authorization/invalid input remain 403/400.

Migration 0022 enables the `role.delete` audit operation. Until present, the
catalogue reports deletion unavailable and direct deletion refuses the request.
The event retains the stable role/actor/operation IDs, deleted flag and removed
permission IDs, with no name/description snapshot. The deleted role's historical
current-label projection becomes unavailable; the deletion action remains readable
and filterable. Existing indefinite private audit retention is unchanged.

After separate owner approval, DEV-only migration 0022 was applied on 2026-10-31
with SHA-256 `8b6bfca989c64c9f81efc0326e1660c7b33a45b01441dacd47f8cf1bc806ca6d`.
Preflight verified exact history through 0021, identity, guards, integrity/FKs and
a private recovery bookmark. Postflight verified 0022, the new constraint, clean
integrity/FKs and unchanged accounts, roles, assignments, mappings, audit aggregates,
sequence and RBAC revision. No hosted role/account deletion was performed.

### Existing transaction contract

Migration 0020 adds protection flags, a global RBAC revision and append-only audit.
It preserves the exact existing owner-bootstrap exception while reconciling reserved
provisioning with genuine intrinsic authority; it creates no new bootstrap route.
Missing migration disables role endpoints with unavailable feedback. Partially
present schema/guards fail closed. Existing Members behavior remains usable with
the prior schema; no automatic migration or remote write is performed.

Every mutation uses a reviewed revision and unique operation UUID. Inside one D1
batch, a guarded revision update rechecks the actor's current full session, actual
authority and credential generation using the database clock. Stale revisions and
failed guards abort the batch. Membership writes recheck target eligibility and
last-admin survival in the same transaction. Lifecycle deactivation/deletion share
the same genuine-admin definition, so cross-action races cannot remove all admins.
Retained permission grants keep their timestamps; edits cannot accidentally make
a future grant current. Audit failure rolls back data and revision changes.

Concurrent unrelated editors can conflict under the single revision. This is an
intentional small-project tradeoff instead of a per-object versioning framework.
Conflicts require reload/review. No automatic mutation retries. After an uncertain
network outcome, inspect the activity log and current state before another save.
Successful saves invalidate session/capability/private caches locally and across
tabs; other browsers still receive current authorization checks on every request.

## UI and API

- `/manage/roles`: bounded catalogue (200 roles, 100 permissions), role definition,
  fixed permission checkboxes, activity/protection controls, review and Save.
- Member detail: role assignment/removal and effective-permission inspection,
  alongside accepted member chips. No profile/status/security editing.
- `/manage/activity`: read-only Role Activity Log, genuine Administrators only.
  Twenty newest records/page with validated decimal sequence pagination.
- GET `/api/manage/roles`: catalogue/mappings and revision.
- GET `/api/manage/users/:uuid/roles`: that member's assignments/effective grants.
- GET `/api/manage/role-activity?before=...`: private successful-change history.
- POST `/api/manage/roles`: create/update a custom role.
- POST `/api/manage/users/:uuid/roles`: assign/remove a membership.

Requests are local/canonical DEV only, with the existing auth environment gate.
Private reads require session-correlation proof and no-store/no-referrer replies;
writes additionally require session-bound CSRF, exact origin and JSON. Bodies are
bounded to 16 KiB, unknown fields/permissions rejected. IDs are validated UUIDs,
codes are immutable lowercase identifiers (2–40 chars), names 1–80 chars and
descriptions 0–400 chars, trimmed and control-character free. Generic denied,
invalid, conflict and unavailable errors do not disclose authentication internals.
No Events/News functionality, #29 reactivation or PROD activation is added.

## Audit and privacy

The owner approved indefinite successful-change retention for security and
accountability. Rows contain operation UUID, time, stable actor ID, operation,
affected role/account IDs, revision and a minimal delta. Permission deltas use
IDs; metadata edits record changed field names, not the values. Creation,
metadata/grant/activity/protection changes and membership addition/removal are
recorded atomically. Even an accepted unchanged save is a recorded role update.
Rejected requests have no successful-change row. No denied-request logging system
or external telemetry service is introduced.

No names, email, credential material, proofs or complete request bodies are stored
in the log. There are no audit foreign keys to deletable accounts, so deletion
does not block or erase history. These stable IDs remain potentially linkable
personal information, not anonymized data. Owner approval is a product retention
decision, not a declaration of GDPR compliance. The private log and updated privacy
notice disclose indefinite retention and survival after account deletion; rights
requests still require individual review. Purpose/necessity and legal retention
justification remain part of the existing final public-use privacy review. No new
specific legal determination is claimed by implementation or fictional DEV tests.

## DEV publication sequence and acceptance

1. Complete local security/migration/UI checks and review the exact candidate.
2. Obtain separate approval for read-only DEV D1 preflight/recovery capture and
   migration 0020 against the verified DEV binding/history; no PROD operation.
3. Capture a fresh Time Travel recovery bookmark and verify schema, built-in
   identity and integrity. Apply only the reviewed migration, verify its guards,
   catalogue and existing account counts without publishing participant data.
4. Publish only the scoped reviewed commit via the normal DEV workflow; verify
   exact revision CI and automatic deployment. Code never applies migrations.
5. Owner tests two approved accounts: genuine Administrator without reliance on
   editable grants, delegated ordinary management, forbidden protected/self changes,
   effective rights, log access, narrow/keyboard flows and revocation. Creating real
   DEV roles/assignments and hosted account actions need their own approved scope.

If migration approval is absent, prepare the review unit and report the blocked
activation rather than claim the role editor is available. A Worker rollback cannot
undo audit retention or schema changes. Recovery/restore is separately authorized;
never erase history or bypass checks to recover access. Keep #28 open for acceptance.

### DEV schema checkpoint — 2026-10-29

Owner separately approved read-only DEV preflight, then explicitly approved applying
unchanged 0019 followed by reviewed 0020. Preflight found DEV at 0018 with the
expected built-in identities and an available genuine Administrator. A fresh Time
Travel bookmark was captured privately outside Git. Both migrations were applied
only to lan-party-dev and verified: migration history ends at 0020, quick_check is
ok, foreign-key checks are empty, account counts are unchanged, Administrator is
protected, roles.protect_admin exists, revision is zero and audit/bootstrap tables
are empty. All seven expected role/audit/reserved-number guards are present.
No account, membership or bootstrap activation was performed. Schema readiness is
not hosted application acceptance; exact-commit deployment and owner tests follow.

### Navigation loading correction — 2026-10-30

Roles reads now use an AuthProvider-owned, eight-entry memory cache. Returning to
Roles renders same-session data immediately while a deduplicated endpoint read
runs alongside route session validation. First visits use a non-interactive
placeholder with reserved editor space; an actual network wait remains necessary
on a cold session. This changes presentation and read coordination, not Worker
authorization, request proofs, mutation conflict checks or database behavior.

Cached catalogue, membership and activity reads are erased on principal/proof or
section changes, validation/read failures, logout and explicit mutation/cross-tab
invalidation. Generation checks fence responses even if transport ignores abort.
Membership reads still require both roles and users sections; activity requires
its own capability. No browser storage, prefetch of private members, optimistic
grants or new database operations are introduced. Same-context refresh preserves
an editor draft when the returned RBAC revision is unchanged; a changed revision
still remounts the editor for review, and saves retain server conflict checks.

The fictional Roles UI fixture supports a bounded `delay` query parameter and
request start/end counters for repeatable before/after navigation checks. It
intercepts all API traffic locally and cannot establish hosted latency or signed-in
acceptance. Broader visual redesign remains a separate owner review.

### Iteration 2 — shared workspace and role administration UX, 2026-10-30

Owner directly authorized Stage A/B implementation after the scope decisions
in #28 comment 6519849448, reviewed successive local annotation passes, then
authorized DEV publication of the resulting fixes. Shared sidebar/navigation, a compact account header and existing dark/mint
tokens now serve both public pages and the wider Administration workspace. Public
content keeps its constrained width. Navigation has one shared destination list;
mobile uses a native modal drawer with Escape, focus containment and route close.

Roles has a searchable list, explicit Edit mode, grouped animated permission
accordions, friendly labels, accessible left-off/right-on switches and a desktop
summary. At narrower widths the summary follows the editor. Creating a role uses
four modal steps; selecting categories filters the configuration UI and never
grants permissions. Review/confirmation and existing server conflict/invariant
checks remain mandatory. Built-in Administrator is described as Full administrative
access rather than as limited by its explicit grants. Existing member assignment
and activity routes remain available.

The catalogue read adds optional `assignedMemberCount` on roles,
returned only when the caller also has current `users.view` authority. The count
is taken in the catalogue's database batch and includes active, verified accounts
without lifecycle state, non-future account updates, active roles and non-future
assignments. It counts memberships, independent of session presence or optional
MFA enrollment. Inactive roles report zero; unauthorized callers receive no field,
not a misleading zero. No identities, new schema, mutation or privacy bypass is
introduced. No server-created/updated dates are invented for the summary.

Run `npm run preview:layout` to build and serve a **fictional local review** on
127.0.0.1:5189. Its Public/Member/Administrator/Role Manager links switch isolated
fixture modes; a tab-local sessionStorage value remembers only the presentation
mode across refresh. No real credentials, identities or authorization state are
stored. The production application does not import this fixture. API calls are
intercepted with fictional responses; the preview server rejects actual API calls
and non-GET requests. Generated assets stay ignored under .wrangler. Rebuild the
running preview with `node scripts/preview-layout.mjs --build-only` after edits,
then reload. This is for layout/annotation and fictional interaction checks, not
live session, provider or deployed backend acceptance.

Owner annotation follow-up: direct editing now has one sticky bottom action bar
with actual dirty-state feedback, Cancel, Review changes and Save changes. The
review dialog requires explicit confirmation without saving; every subsequent
draft edit clears confirmation. Equivalent permission ordering is not a change.
An unchanged edit cannot save, a new editing session clears prior success feedback,
and the summary badge appears only for a real draft difference. Confirmed saves
return to read-only after authoritative revalidation. Account-menu links and
buttons now share independent row styling rather than relying on the old header.
Role switching and ordinary link navigation warn about unsaved edits; reload/close
uses the native beforeunload guard. Browser Back/Forward within the SPA is not
blocked by this bounded guard. No router/history workaround is introduced.

The next owner annotation pass authorizes local activity-log usability and inline
membership improvements. Activity now projects **current** role names and current
nicknames for active accounts without lifecycle state, only behind Administrator
activity access and users.view for member names. Names are not copied into audit
rows. Unknown/deleted/deactivated identities display an unavailable label; IDs and
the original recorded delta remain in expandable technical details. Before/after
tables use only recorded flags, memberships and permission IDs. Historical role
names/descriptions remain explicitly Not retained; this does not change the
indefinite minimal audit policy or reconstruct unavailable values.

Search/date/action filters run on the server before the existing bounded keyset
pagination. Date selection and displayed timestamps explicitly use UTC. Search
matches current labels or technical references; it is bounded to 80 characters
and uses literal matching. Invalid/duplicate query parameters fail closed. These
are owner-requested read-only API changes, not new audit writes or migrations.

Member detail embeds authorized membership controls in its Assigned roles row.
Typing an existing role and pressing Enter stages a pending chip; removing a chip
stages removal. Neither action saves. One membership change is reviewed/saved at a
time through the existing single-operation API, with sticky Cancel/Review/Save
controls. No partial bulk-save behavior, self-change, protected-role bypass or
account reactivation is introduced. Effective permissions remain a current-state
disclosure. The owner reviewed these interactions through the fictional local
preview before authorizing DEV publication.

Final owner annotations authorize DEV publication after fixing stale feedback and
adding activity Collapse all. Feedback now belongs to the originating route and
session generation: it survives same-page validation, clears on navigation or a
confirmed session change, and ignores late setters captured before navigation.
Activity Collapse all sits beside the Details heading and resets expanded records
without changing filters or pagination. Hosted owner acceptance remains separate
from local checks, publication and automatic deployment verification.

### Iteration 4 — focused acceptance corrections, 2026-10-30

Owner authorized building/publishing the corrections in #28 comment 6521731280.
Membership activity explicitly says which role was assigned to or removed from
which member, with labeled Role/Member context in list and expanded details.
Only the existing authorized current labels are used; original IDs/JSON and the
historical-label disclaimer remain. No audit data or retention change is made.

One saved-role icon rule serves the list, heading and summary: genuine built-in
Administrator uses a shield, built-in User uses people, a custom role with one
non-Roles category uses that category's icon, and mixed/empty/Roles-only custom
roles use a neutral grid. Custom protection stays a separate lock badge. Names
and icons confer no authority, and unsaved grant edits do not change the icon.

Owner clarified the reported eyebrow movement occurs switching Home and Events.
Local frame/geometry checks found different intro padding, not animation: at
1280px the labels started at 192.19px versus 157px, and at 390px at 136.19px
versus 117px. Removing Home's extra top inset and matching its hero top padding
to the existing page-section rule aligns both routes at 157px desktop and 117px
mobile. The approved headline, font/line-height, hero bottom padding and existing
reduced-motion policy remain unchanged. No animation was added to mask movement.
