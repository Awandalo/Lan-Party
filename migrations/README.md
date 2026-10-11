# D1 migrations

This directory is configured as migrations_dir for both Wrangler environments.
`0001_create_event_structure.sql` creates locations, events, and event days.
It has been validated locally only; remote application requires owner review.

Future schema changes must use versioned SQL files (for example,
0002_create_accounts.sql). Never edit an already-applied migration; add a new one.
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
node --test worker/tests/event-structure.test.mjs
```

The tests apply this migration to a fresh local D1 simulator supplied by the
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
