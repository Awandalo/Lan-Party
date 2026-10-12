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
it is locally validated only, pending review and separate remote approval/verification.

Future schema changes must use new versioned SQL files after separate approval.
Never edit an already-applied migration. Reference-data seeds are reserved for
the planned `0006_seed_reference_data.sql`, whose mappings require review first.
Keep migrations free of secrets and real participant data.

Test and review future migrations locally with explicit --env dev and --local
before considering a remote application. Preserve existing registrations and
review backup/recovery procedures before production use.

The default Wrangler environment targets production. Never execute remote SQL or
apply remote migrations without explicit approval. Confirm the environment,
database name, and UUID before any approved remote operation. Do not apply
migrations automatically during builds, deployments, or CI.

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

The registration tests apply 0001 through 0005 in order to a fresh local D1
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

## Codex execution environment

Normal coding, local tests and local migrations remain sandboxed. On Windows the
Codex sandbox identity cannot read the owner's existing Wrangler OAuth credentials.
Do not copy credentials, create replacement API tokens, change credential permissions
or globally disable the sandbox. For an explicitly authorized remote operation,
request approval for each specific command requiring execution outside the sandbox.
One approval does not authorize other commands. Remote DEV writes require explicit
authorization; production operations require separate explicit approval. Phase 2.7
authorizes local work only and no external execution for remote Cloudflare operations.

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
