# D1 migrations

This directory is configured as migrations_dir for both Wrangler environments.
It contains no SQL migrations or application tables yet.

Future schema changes must use versioned SQL files (for example,
0001_create_events.sql). Never edit an already-applied migration; add a new one.
Keep migrations free of secrets and real participant data.

Test and review future migrations locally with explicit --env dev and --local
before considering a remote application. Preserve existing registrations and
review backup/recovery procedures before production use.

The default Wrangler environment targets production. Never execute remote SQL or
apply remote migrations without explicit approval. Confirm the environment,
database name, and UUID before any approved remote operation. Do not apply
migrations automatically during builds, deployments, or CI.
