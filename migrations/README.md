# D1 migrations

This directory is configured as migrations_dir for both Wrangler environments.
`0001_create_event_structure.sql` creates locations, events, and event days and was
applied and verified on Cloudflare DEV in Phase 2.3. It must not be edited.
`0002_create_accounts.sql` creates name prefixes and user profiles; it is locally
validated only and requires review/approval before remote application.

Future schema changes must use versioned SQL files (for example,
0003_create_auth_credentials.sql). Never edit an already-applied migration; add a new one.
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
node --test worker/tests/accounts.test.mjs worker/tests/event-structure.test.mjs
```

The account tests apply 0001 followed by 0002 to a fresh local D1 simulator supplied by the
installed Wrangler dependency, using fictional data and no remote bindings.
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
- Password and Google identities will reference `users` in future migrations;
  credentials, permissions, registrations, and automatic merging are not included.
- No reference data is seeded. The planned separate prefix catalogue is: Mr., Mrs.,
  Apache Helicopter, Pastafarier, TechnoViking, NPC, LAN Legend, and Chaos Goblin.
- First/last names and emails remain private. Approve public display-name handling,
  retention/deletion, and guest registration rules before using profiles in APIs.
