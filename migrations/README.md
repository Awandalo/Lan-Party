# D1 migrations

This directory is configured as migrations_dir for both Wrangler environments.
`0001_create_event_structure.sql` creates locations, events, and event days and was
applied and verified on Cloudflare DEV in Phase 2.3. It must not be edited.
`0002_create_accounts.sql` creates name prefixes and user profiles; the owner
confirms it is applied and verified on Cloudflare DEV. It must not be edited.
`0003_create_auth_credentials.sql` creates external identities and password
credential storage. It is applied and verified on Cloudflare DEV and must not be edited.
`0004_create_authorization.sql` creates roles, permissions and their junction tables;
it is applied and verified on Cloudflare DEV and must not be edited.
`0005_create_registrations.sql` creates registrations and selected attendance days;
it is applied and verified on Cloudflare DEV and must not be edited.
`0006_seed_reference_data.sql` inserts initial roles, permissions and admin grants;
it is applied and verified on Cloudflare DEV (Phase 2.8 complete) and must not be edited.
`0007_create_news_articles.sql` creates the News article table; it is reviewed,
applied and verified on remote DEV and must not be edited. Phase 2.9 and the
Phase 2 database foundation are complete on DEV and PROD, as confirmed by the owner.
The owner confirms migrations 0001–0007 are applied and verified in both environments;
the DEV milestones below are retained as historical records. No articles are seeded.
A MAIN merge/Worker
deployment does not apply D1 migrations; follow `RELEASE.md` and obtain separate
production preflight, recovery and migration approval.

Future schema changes must use new versioned SQL files after separate approval.
Never edit an already-applied migration. Initial reference data is defined in
0006 with the approved mapping; future reference data and mappings require review.
Keep migrations free of secrets and real participant data.

Test and review future migrations locally with explicit --env dev and --local
before considering a remote application. Preserve existing registrations and
review backup/recovery procedures before production use.

The default Wrangler environment targets production. Never execute remote SQL or
apply remote migrations without explicit approval. Confirm the environment,
database name, and UUID before any approved remote operation. Do not apply
migrations automatically during builds, deployments, or CI.

## Authentication state (0008) — local review only

`0008_create_authentication_state.sql` is prepared and tested locally. It has not
been applied to remote DEV or PROD. Existing migrations 0001–0007 remain immutable.
Use `PROJECT.md` for current account requirements and environment mappings.

- `users` retains required private first/last names and email, existing UUIDs and
  references. Only `auth_version` is added, defaulting to zero; no table rebuild.
- `user_nicknames` has one row per user, preserved display capitalization and a
  generated lowercase ASCII key with database uniqueness. Length is 3–24; allowed
  characters are ASCII letters, digits, spaces, underscores and hyphens. Leading,
  trailing, doubled and separator-adjacent spaces are rejected, as are reserved
  Admin/Moderator/System variants with separator differences.
- Existing non-null display names are copied unchanged. Null names remain
  unclaimed. Invalid/reserved/duplicate names abort the entire migration and
  preserve previous records; never invent or overwrite names to make it pass.
  New signup must atomically create the profile, nickname and password credential.
  `user_nicknames` is the canonical nickname source, not legacy `users.display_name`.
- `nickname_changed_at` tracks participant changes; corrections can preserve it.
  NULL allows the first change immediately. The tested participant adapter enforces
  14 days after each change, counts case-only edits and preserves exact no-ops.
  Public account routes and Phase 5 settings/admin storage remain unfinished.
- `auth_sessions` and `auth_action_tokens` use application UUIDs, unique hex token
  digests, current-account auth generations, constrained timestamps, restrictive
  user FKs and user/expiry indexes. Tokens also have verification/reset purpose,
  consumption and the verification email binding. No raw token is stored.
- Verification tokens expire after 24 hours and reset tokens after 30 minutes.
  Identity fields cannot be changed; consumption is single-use and revocation final.
  Password changes/deletion, normalized-email changes and status changes advance
  the account generation and revoke state. Email changes also clear verification.
  New sessions cannot use an old generation after reset. Trusted adapters must
  capture the generation alongside credential verification and preserve that
  generation when issuing sessions; re-reading the new version after verifying
  an old password would defeat the concurrency fence.
- Password credential ownership is immutable: migration 0008 rejects a `user_id`
  reassignment before any accompanying credential change can advance generations.
  Regression tests cover moves with and without hash updates, preservation on
  rejection and continued revocation on legitimate credential changes.
- Local tests demonstrate guarded `D1Database.batch()` recipes: conditional token
  consumption followed immediately by an account/credential mutation gated with
  `changes()=1`. Failed mutations roll back consumption and concurrent attempts
  have one winner. These are compatibility tests, not production adapters.
  Before exposing flows, adapters must bind the presented token's digest and
  purpose/user/current version and use an authoritative server timestamp.
- Credential deletion advances generation using the profile's current timestamp;
  any future deletion adapter must first maintain `users.updated_at` in the same
  transaction so revocation audit timestamps describe the actual operation.

Verification commands:

```powershell
node --test worker/tests/authentication-state.test.mjs worker/tests/account-rules.test.mjs
node --test worker/tests/*.test.mjs
```

Tests start disposable local D1 databases, apply 0001–0007, preserve fictional
profiles/credentials/identities/registrations/News/RBAC records, then apply 0008.
They cover generated nickname keys, case collisions, invalid fields, STRICT/FKs,
timestamps, TTL, reset and verification races, rollback and state invalidation.
Wrangler's migration runner also successfully applied all eight migrations in
fresh isolated local storage. No remote schema or data was accessed.

Before remote consideration, obtain separate approval plus sanitized existing-name
preflight/remediation and backup/recovery evidence. Unclaimed profiles need an
approved onboarding rule; privacy, retention and deletion decisions remain open.

## Event schema decisions

- UUID generation and validation remain future Worker API responsibilities.
  Required timestamps are UTC Unix seconds;
  callers maintain `updated_at`, which must not precede `created_at`.
- Tables are `STRICT`. Timestamps must be integers and nonnegative; registration
  closing must follow opening when both are supplied. Empty descriptions are allowed.
- Event-day statuses are `scheduled` and `cancelled`. A cancelled day is retained
  for history and must not be selectable through future registration APIs.
- Attendance dates must be real calendar dates in `YYYY-MM-DD` format. Sessions
  can finish on the next day; date/session timezone alignment remains API validation.
- Unique keys prevent duplicate slugs and duplicate attendance dates within an
  event. `(id, event_id)` supports future registration-day composite foreign keys.
- Location/event foreign keys restrict deletion and ID changes. Events may have a
  null location while drafting. Published events require a non-null location via
  a database check, and the foreign key validates that it exists. Other publication
  readiness rules remain future API validation.
- `location_visibility` is `public` or `authenticated`, defaulting to `public`.
  This records policy only; future APIs must enforce address visibility separately
  from event visibility. Country codes are two uppercase letters; valid country
  codes, UUID syntax, IANA timezones, and slug normalization need API validation.
- The unique attendance-date index also covers event-day lookup by event; only
  location lookup and publication filtering receive additional explicit indexes.

## Repeatable local verification on Windows

Install locked dependencies with `npm ci`, then run from the repository root:

```powershell
node --test worker/tests/*.test.mjs
```

The News tests apply 0001 through 0007 in order to a fresh local D1
simulator supplied by the installed Wrangler dependency, using fictional data and
no remote bindings. Existing event/account test suites remain independently runnable.
They assert foreign-key enforcement is active. The simulator is disposed after
the run. No additional test framework or dependency is installed.

To also verify Wrangler migration discovery and application with the existing
configuration, use a new ignored storage directory for every run:

```powershell
$eventSchemaState = Join-Path (Get-Location) ('.wrangler/event-schema-' + [guid]::NewGuid().ToString())
$env:WRANGLER_SEND_METRICS = 'false'
$env:WRANGLER_LOG_PATH = Join-Path (Get-Location) '.wrangler/logs'
npx wrangler d1 migrations apply lan-party-dev --env dev --local --persist-to $eventSchemaState
npx wrangler d1 execute lan-party-dev --env dev --local --persist-to $eventSchemaState --command 'PRAGMA foreign_keys; PRAGMA foreign_key_check;'
```

Both commands explicitly select local storage. Never remove `--local` for routine
verification. The unique storage path isolates this run from normal development
state; it may be retained for inspection and is ignored by Git. This procedure
does not authorize application to Cloudflare DEV or PROD.

## Account schema decisions

- Both new tables are `STRICT`, with application-generated UUIDs stored as text.
  UUID generation/validation and email syntax/normalization are future Worker API
  responsibilities. Required strings reject empty and ASCII-whitespace-only values.
- `name_prefixes` contains `id`, unique `label`, `sort_order` (default 0), `is_active`
  (default 1), `created_at`, and `updated_at`. Ordering is nonnegative; flags are 0/1.
- `users` contains `id`, required `first_name`/`last_name`, optional `display_name`
  and `name_prefix_id`, required `email` and unique `email_normalized`, optional
  `email_verified_at`, `status` (default `active`), `created_at`, and `updated_at`.
  Only `active` and `disabled` statuses are accepted. Verification defaults to null.
- Store original email casing in `email`. The unique comparison uses the supplied
  `email_normalized` value; the database does not lowercase or normalize emails.
  Agree the API normalization policy before implementation; do not strip provider
  dots/plus tags or automatically merge accounts solely because emails match.
- All timestamps are nonnegative integer UTC Unix seconds. Callers maintain update
  timestamps, which must not precede creation. Authentication is not implemented.
- The optional prefix FK restricts deletion and ID changes. Inactive prefixes remain
  valid historical references; future APIs must filter new choices to active prefixes.
  `users_name_prefix_id_idx` covers prefix lookups; unique constraints supply their
  own indexes, so no duplicate email/label indexes are added.
- Password and Google identities reference `users` through migration 0003;
  authentication workflows, permissions, registrations, and automatic merging are not included.
- No reference data is seeded. The planned separate prefix catalogue is: Mr., Mrs.,
  Apache Helicopter, Pastafarier, TechnoViking, NPC, LAN Legend, and Chaos Goblin.
- First/last names and emails remain private. Approve public display-name handling,
  retention/deletion, and participant registration ownership before using profiles in APIs.

## Authentication schema decisions

- `user_auth_providers` has text UUID `id`, required `user_id`, `provider`,
  `identity_namespace`, `provider_subject`, integer `linked_at`, and nullable
  integer `last_login_at`. Required identifiers reject empty/ASCII-whitespace-only
  values. `(provider, identity_namespace, provider_subject)` is unique across users.
- Multiple external identities may reference one profile. `user_id` has a lookup
  index; the composite unique constraint supplies its own identity index.
- The provider code excludes `password`, which belongs only in the password table.
  Codes otherwise remain extensible; future Worker APIs initially allow only Google
  and validate/canonicalize its trusted OpenID Connect issuer and stable subject.
  Storage acceptance does not establish that an issuer/provider is trusted.
- `user_password_credentials` has text `user_id` as primary/foreign key, required
  nonblank text `password_hash`, and required integer `password_changed_at`,
  `created_at`, `updated_at`. The primary key enforces one current credential and
  covers user lookups without a redundant index.
- Both tables are STRICT and restrict deletion/ID updates of referenced users.
  No cascades, seeds, OAuth secrets or tokens are introduced. Accounts may have no
  method during setup, Google only, password only, or both.
- Timestamps are nonnegative UTC Unix seconds. `last_login_at >= linked_at` when
  present; `created_at <= password_changed_at <= updated_at` for passwords.
- Future Worker responsibilities: UUID/identity validation, explicit authenticated
  and authorized linking, no merging by email, rejecting disabled users, private
  handling of authentication internals, and appropriate per-password salted hashing
  with an explicitly reviewed algorithm and cost configuration. The database
  cannot establish that a string is a secure hash; dummy fixtures are not credentials.
- Profiles remain separate from identity mappings and password hashes. Future
  sessions/authentication workflows, password reset and revocation are Phase 3 work.
  Every participant requires an account; organizer privileges remain separate.

## Authorization schema decisions

- Roles group explicit actions represented by permissions. Users receive permissions
  through `user_roles` and `role_permissions`; multiple roles per user are supported.
- `roles`: text UUID `id`, unique lowercase `code` (letter first, then letters,
  digits or underscores), nonblank `name`, optional `description`, 0/1 `is_active`
  defaulting to 1, nonnegative integer `created_at`, and `updated_at >= created_at`.
  Role codes are stable API identifiers; future management logic must preserve them.
- `permissions`: text UUID `id`, unique lowercase `resource.action` `code` with one
  dot and letter-first segments, nonblank `description`, and nonnegative integer
  `created_at`. Segments allow digits/underscores after the initial letter; wildcards
  are rejected. No vague access levels or implicit administrator bypass exist.
- `user_roles`: required `user_id`, `role_id`, nonnegative integer `assigned_at`,
  nullable `assigned_by_user_id`; primary key `(user_id, role_id)`. All three FKs
  restrict deletion and ID updates. Nullable assigner supports controlled provisioning;
  populated metadata does not establish the assigner's authorization.
- `role_permissions`: required `role_id`, `permission_id`, nonnegative integer
  `granted_at`; primary key `(role_id, permission_id)`. Both FKs restrict deletion
  and ID updates. All four tables are STRICT; identifiers reject blank values.
- Primary and unique constraints supply their own indexes. Add only reverse FK
  lookup indexes `user_roles_role_id_idx`, `user_roles_assigned_by_user_id_idx`,
  and `role_permissions_permission_id_idx`; first-column lookups use composite keys.
- The Worker must default to deny, require explicit permissions, ignore inactive
  roles, reject disabled users, enforce least privilege, and authorize all assignments.
  Neither an `admin` role name nor frontend state grants access. No public unrestricted
  assignment or self-service privilege escalation is permitted. UUID validation and
  audit/revocation history are future approved API/design work, not implemented here.
- No reference data or user privileges are seeded in 0004. Reserve initial `user`
  and `admin` roles for 0006; later `news_editor`/`moderator` remain possible.
  Provision the first administrator via a separately approved controlled process.
- Planned permissions for 0006 are: `events.create`, `events.update`, `events.publish`,
  `events.cancel`, `events.manage_registrations`, `locations.manage`, `users.view`,
  `users.manage`, `roles.manage`, `news.create`, `news.update`, `news.publish`,
  `news.archive`. The proposed catalogue is unchanged; mappings require owner review.
- Prior documents called for separate seeds but contained no explicit 0006 plan.
  Phase 2.6 records that plan without creating a seed migration. No middleware,
  authentication endpoints, administrator interfaces or frontend changes are included.

## Registration schema and lifecycle

- `registrations`: text UUID `id`, required `user_id`/`event_id`, `status` default
  `registered` (or `cancelled`), integer `registered_at`, nullable integer
  `cancelled_at`, required integer `created_at`/`updated_at`. Required IDs reject
  empty/ASCII-whitespace-only values. `UNIQUE(user_id, event_id)` survives cancellation.
- Instants are nonnegative UTC Unix seconds. Enforce creation <= registration <=
  update, and registration <= cancellation <= update when cancellation is present.
  Registered rows require null cancellation; cancelled rows require a timestamp.
- `registration_days`: required nonblank text `registration_id`, `event_id`,
  `event_day_id`, nonnegative integer `selected_at`, composite primary key
  `(registration_id, event_day_id)`. Both tables are STRICT and contain no seeds.
- Composite FKs `(registration_id, event_id)` -> `registrations(id, event_id)` and
  `(event_day_id, event_id)` -> `event_days(id, event_id)` ensure both parents share
  the same event. The new registration composite UNIQUE key is necessary despite
  its globally unique ID; 0001 already supplies the day composite key. No prior
  migrations are changed. All FKs use RESTRICT for deletion and key updates.
- Indexes: `registrations_event_status_idx`, `registrations_status_idx`, and
  `registration_days_event_day_event_idx`. Unique user/event and selection primary
  keys cover forward user/registration lookups; avoid duplicate standalone indexes.
- New registrations require an authenticated active user, published/open event,
  valid registration window and at least one scheduled eligible day. No guest
  registration. Future Worker code creates both records and selections atomically.
- Day updates verify ownership or `events.manage_registrations` as appropriate,
  replace selections transactionally, and never leave an active registration empty.
  Composite FKs complement these checks; the minimum-one-day rule is not a DB CHECK.
- Cancel by retaining the record/selections, setting status/cancellation/update time.
  Preserve selections as historical attendance intent; public attendance counts must
  filter registered records and enforce event-day eligibility. Intent is not confirmed
  attendance. No automatic capacity calculation or achievement behavior is added.
- Re-register with the same ID, original registration/creation timestamps, cleared
  current cancellation timestamp and advanced update time. Replace selections in the
  same atomic batch/transaction. Full cycle history is not captured by these current
  state fields; review future audit records before APIs if required. No audit system
  is introduced. Local tests verify rollback when replacement includes an invalid day.
- UUID validation, timestamp maintenance, immutable registration owner/event,
  authorization, privacy and lifecycle eligibility remain future Worker responsibilities.
  No registration endpoints, notifications, frontend forms or capacity management.

## Initial reference data (0006)

- Reference-data INSERTs only; no schema changes. Active roles: `user` / User /
  Standard LAN Party participant, and `admin` / Administrator / Website administration.
- Exactly thirteen permissions: `events.create`, `events.update`, `events.publish`,
  `events.cancel`, `events.manage_registrations`, `locations.manage`, `users.view`,
  `users.manage`, `roles.manage`, `news.create`, `news.update`, `news.publish`,
  `news.archive`. Admin receives all thirteen explicit grants; user receives none.
- Entity IDs are fixed application-generated version-four UUID literals. Their
  values in 0006 are authoritative and reproducible across environments; never
  replace them with SQLite-generated IDs. Role and permission IDs are globally unique.
- All role creation/update, permission creation and grant timestamps use the fixed
  constant 1791763200 (2026-10-12 00:00:00 UTC). This is reference-data metadata,
  not the time of deployment; Wrangler records actual migration application time.
- Use plain INSERTs, with no OR IGNORE/REPLACE or upsert. Migration history tracks
  one-time application; manually re-executing the raw seed must fail on conflicts.
  Unexpected custom IDs/codes/grants require review, not silent overwriting. Local
  tests confirm conflicting custom roles/permissions preserve their data and leave
  no partial seed records when the atomic batch fails.
- No users, user_roles, prefixes or credentials are seeded. `news_editor` and
  `moderator` are deferred. First-administrator provisioning requires a separately
  approved controlled process with identity verification, authorization and audit.
- Future Worker logic must resolve explicit permissions through user_roles and
  role_permissions, reject disabled users/inactive roles, and default to deny
  when no permission is granted. A role named admin does not itself grant access.
- Ordinary authenticated participants use server-enforced ownership checks for
  personal actions; administrative permissions do not replace those checks or
  authorize unrestricted self-service assignments. No auth endpoints are implemented.
- The focused tests temporarily use disposable fictional users to check permission
  resolution, then remove those fixtures. This is not account provisioning.

## News article schema and lifecycle (0007)

- One STRICT table: required text UUID `id`, nonblank `title`, unique `slug`,
  required `content`, optional `excerpt`/`cover_image_key`, required `author_user_id`,
  optional `updated_by_user_id`, `publication_status` defaulting to draft, required
  integer `created_at`/`updated_at`, and nullable integer `published_at`.
- Slugs contain only lowercase a-z, digits and hyphens, without leading/trailing
  or consecutive hyphens. SQL rejects invalid slugs rather than normalizing them.
  UUID validation, slug generation/collisions and timestamp maintenance belong to
  future trusted Worker logic. Blank checks follow existing ASCII whitespace rules.
- Drafts may have empty content and require null publication time. Published
  articles require nonblank content and publication time. Archived articles may
  retain publication time or be archived without ever being published. Instants
  are nonnegative UTC Unix seconds; update and publication cannot precede creation,
  and a non-null publication time cannot follow the last update.
- Original publication time normally survives edits and archiving. Status controls
  current visibility, independently of whether publication happened in the past.
  Current metadata is not a revision/transition history; preservation on edits and
  permitted transitions remain API responsibilities. Reverting to draft requires
  clearing publication time; review that history tradeoff before implementing APIs.
- Both user foreign keys use RESTRICT on deletion and ID updates, retaining author
  attribution and last-editor accountability. They do not establish authorization.
- `news_articles_publication_date_idx` covers status and descending publication
  time; author/editor lookup indexes support references. Primary/slug constraints
  supply their own indexes; no redundant indexes or article seeds are added.
- Optional cover keys reject blank values and STRICT text rejects binary values.
  Keep images outside D1: future API key validation must reject public URLs, and
  uploads require a separately designed authorized R2 workflow. No uploads added.
- Phase 6 Worker APIs must expose only published articles publicly, keep drafts
  and archives private, and require explicit `news.create`, `news.update`,
  `news.publish` and `news.archive` permissions for protected actions. Browser
  controls are not access control. Decide Markdown versus rich text later and
  prevent XSS when rendering. No editor, frontend, API or revision system added.
- `worker/tests/news-articles.test.mjs` applies all seven migrations locally,
  validates constraints on INSERT/UPDATE, publication lifecycle, restrictive
  references, indexes and preservation of all existing schemas and RBAC data.

## Codex execution environment

Normal coding, local tests and local migrations remain sandboxed. On Windows the
Codex sandbox identity cannot read the owner's existing Wrangler OAuth credentials.
Do not copy credentials, create replacement API tokens, change credential permissions
or globally disable the sandbox. For an explicitly authorized remote operation,
request approval for each specific command requiring execution outside the sandbox.
One approval does not authorize other commands. Remote DEV writes require explicit
authorization; production operations require separate explicit approval. Completion
of Phase 2 on DEV does not authorize any additional remote operation.

For sandboxed local Wrangler validation, set these process-only variables in a
dedicated PowerShell session before the local commands above:

```powershell
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.wrangler/sandbox-config'
$env:WRANGLER_LOG_PATH = Join-Path (Get-Location) '.wrangler/logs'
$env:WRANGLER_SEND_METRICS = 'false'
```

This uses ignored workspace storage for Wrangler preferences/logs, without copying
OAuth credentials or changing the checked-in configuration. Close that session
after validation; do not use this isolated configuration for remote operations.
