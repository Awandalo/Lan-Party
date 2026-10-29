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
Administrator is permanently protected. There is no role hard-delete API.

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
