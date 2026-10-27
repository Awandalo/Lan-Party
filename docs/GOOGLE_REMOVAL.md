# Google OAuth retirement — DEV execution proposal

## Phase 3.10 reconciliation — 2026-10-27

Current DEV source at the #17 baseline `8f7f325` has no reachable Google/OAuth
references in `src/`, `worker/auth/`, package dependencies, Wrangler configuration
or deployment workflows. Applied migrations and dated review receipts remain
intentional history; do not rewrite them. Migration 0016 was applied under #10;
this audit does not repeat remote schema tests or authorize a database reset.

Read-only `wrangler secret list --env dev` returned no Google-named secret
bindings. Only names/types were inspected; no values were read or changed.
Source configuration contains no Google vars. Dashboard-only configuration and
the Google Cloud OAuth client were not independently inspected in this round.
Any residual provider-client retirement requires separate owner authorization;
do not delete domain verification, privacy configuration or unrelated resources.

The dated execution proposals below are historical plans, not outstanding approval
or authorization to repeat previously completed migrations/reset operations.


## Decision and current state

On 2026-10-25 the owner permanently discontinued Google OAuth. Reintroduction
requires explicit reversal. The owner subsequently confirmed **all existing DEV
data is disposable**; no Google-only account transition or preservation is required.
This does not approve executing the destructive files, merging, deployment or
credential deletion. PR #24 remains the review vehicle; PROD stays untouched.

The application removal retains email/password, optional TOTP MFA, one-use recovery
codes, Turnstile, strict freshness, CSRF/origin/session/generation checks, atomic
reservations, password validation, notifications and sign-out rules. Google UI,
routes, callbacks, claims, signup/linking, first-password setup, provider-only
rotation and dependency are removed. Password management uses
`/api/auth/security/{methods,reauth-password,change-password}`.

## Smallest safe database option

Keep the existing D1 resource, UUID and binding. Do not delete/recreate the database
or reapply 0001–0015. A resource rebuild adds binding/history/reseeding work and is
unnecessary. Prepare two distinct files, never a DEV wipe in the shared migration chain:

1. `migrations/0016_remove_google_oauth.sql` is a forward schema cleanup. It drops
   `user_auth_providers`, `auth_oidc_transactions` and `auth_password_setup`,
   including their indexes. It rebuilds five **transient** password/MFA tables with
   password-only primary-method constraints, removes `oidc_state_digest` and the
   unused rotation purpose, and recreates their existing security indexes/triggers.
   It revokes all sessions, invalidates in-flight MFA/primary/recovery operations
   and erases inactive staged verifiers. It preserves users, passwords, active
   encrypted factors and active/spent recovery-code verifiers, RBAC, ledger,
   events/registrations/news and budgets. Existing factor protection is not disabled.
2. `scripts/sql/reset-dev-data.sql` is a separately approved **DEV-only operational
   reset**, outside automatic migrations. Its explicit 20-table DELETE list removes
   disposable accounts/passwords, sessions/actions, MFA factors/codes/operations,
   role assignments, nicknames/prefixes and event/location/registration/news data.
   It retains static roles/permissions/grants, immutable member-number tombstones
   and AUTOINCREMENT sequence, email budgets/extensions and rate-limit records.
   No Cloudflare/internal metadata, migration-history table, schema object or
   unrelated table is deleted. A fresh account receives the next unused member
   number, not a promised #0011. Original account emails become available again.

The migration is applicable only after explicit environment-specific approval;
even without the optional DEV reset, it signs everyone out and ends temporary
recovery windows. Historical migration names remain in history by design; the
live schema must have no retired provider/OIDC objects, columns or allowed methods.

## Gates and exact proposed order — not executed

Use the reviewed PR revision, installed project Wrangler and existing approved
Windows authentication. Resolve one existing Node executable, use the review
worktree as cwd, and verify the source files/checksums before any write. Commands
below use PowerShell variables pointing to that executable and
`node_modules/wrangler/bin/wrangler.js`. No new tokens, permissions or credentials.

### P — independent review, then explicit merge AND automatic DEV deployment approval

Q reviews the revised PR, migration/reset SQL and local evidence. Approve both
merge into dev and its automatic DEV deployment explicitly. **Deploy code first:**
the Google-free Worker works with both old and cleaned schema, whereas the old
Google Worker cannot safely use the cleaned schema. The deployment does not apply
migrations. Verify CI, active Worker revision, homepage/login/health, old API 404s
and required non-Google binding metadata. No hosted account tests yet.

### DB — exact migration and destructive-reset confirmation

Approve the exact two files and their impact. Establish an owner-controlled quiet
window; this is a maintenance operation, not an authorization bypass. Read-only
preflight commands (all explicitly DEV):

```powershell
& $node $wrangler d1 info lan-party-dev --env dev --json
& $node $wrangler d1 migrations list lan-party-dev --env dev --remote
& $node $wrangler d1 execute lan-party-dev --env dev --remote --json --command "SELECT name,COUNT(*) AS copies FROM d1_migrations GROUP BY name ORDER BY name; PRAGMA quick_check; PRAGMA foreign_key_check;"
```

Require name `lan-party-dev`, UUID `a3c4cea6-ceb7-43b8-b9b7-b374726b35b4`,
jurisdiction `eu`, 0001–0015 once each and **only 0016 pending**, integrity ok and
no FK violations. Inspect names/counts only: no account details, factors or codes.
The owner's all-DEV-disposable confirmation establishes retention scope; any
unexpected application table/resource or source/config mismatch still stops execution.
Record quota/rate/ledger/static-reference baselines; leave their values untouched.

Immediately before EACH write, capture a fresh Time Travel checkpoint privately:

```powershell
$checkpoint = & $node $wrangler d1 time-travel info lan-party-dev --env dev --json
# Check exit status; retain and validate JSON in a private owner recovery file
# outside Git, logs, chat and GitHub. Do not print the bookmark.
```

Stop if capture/private retention cannot be verified. Proposed writes, separately
from the read commands above:

```powershell
& $node $wrangler d1 migrations apply lan-party-dev --env dev --remote
# Verify 0016 once, cleaned schema, quick_check=ok, FK check empty and preservation.
# Capture/privately retain a second fresh checkpoint immediately before reset.
& $node $wrangler d1 execute lan-party-dev --env dev --remote --file scripts/sql/reset-dev-data.sql
```

After reset verify all 20 targeted tables empty; retained history/ledger/sequence,
RBAC, email budgets and rates unchanged; schema unchanged from post-0016; integrity
ok and FK check empty. No account creation/email send is part of DB gate.

### C — DEV-only configuration/credential cleanup

After the Google-free Worker is confirmed active, separately approve removal of
DEV `GOOGLE_CLIENT_SECRET` and any surviving plain `GOOGLE_AUTH_MODE`/
`GOOGLE_CLIENT_ID` settings. Check names/presence only; do not retrieve secret values.
The exact proposed secret operation is:

```powershell
& $node $wrangler secret delete GOOGLE_CLIENT_SECRET --env dev
& $node $wrangler secret list --env dev
```

Secret deletion can publish a new Worker version; that DEV configuration deployment
must be included in Gate C approval. Plain vars are already removed from source;
if dashboard remnants survive, remove only those two names through the DEV Worker
settings after explicit approval, preserving every other binding. Verify MFA key
bindings, password/rate secrets, Turnstile and Resend names remain present and health
is normal. Do not regenerate/remove MFA keys or touch Keeper.

Prepare owner-performed Google Cloud retirement: in project `lan-party-512015`,
open Google Auth Platform → Clients; verify `LAN Party - DEV` and its exact known
public client ID with the DEV callback. After separate client-deletion approval,
delete only this OAuth client. Do not delete the project, domain verification,
branding, privacy policy or any PROD/other client. Do not request/capture its secret.

### T — separate fresh-account and email authorization

Owner chooses an approved allowlisted test recipient and enters credentials, TOTP
setup/proof and recovery codes privately. Budget one verification email plus only
the necessary approved security notices; no automatic resends. Test registration
→ explicit email confirmation → password login → Security → MFA enrollment/ACK →
password + TOTP login → one-use recovery login/replay rejection → regeneration and
lost-authenticator replacement if included in that explicit scope. Verify stale
primary proof prompts for password, pre-MFA context cannot access Account Security,
spent codes never become reusable, fresh UUID/member allocation and no Google UI/API.
An event registration remains unavailable in the current app; no completion claim
or new event feature is part of this cleanup.

## Failures and recovery

Stop on auth/identity/jurisdiction/source mismatch, unexpected pending migrations,
missing checkpoint, any write error/uncertain outcome, unexpected schema/data,
quota/ledger change, FK or integrity failure, failed CI/deploy/health or security
regression. No blind retry, automatic restore, forward repair or credential fallback.
Read-only diagnostics do not authorize a repair. Preserve sanitized evidence and
seek owner decision. Restore the relevant private checkpoint only with separate
owner approval; Time Travel rolls back **the whole database**, including intervening
legitimate work. Keep the quiet window. Code rollback must remain Google-free and
MFA-aware (the application-removal commit supports old/new schema); never silently
reactivate Google or roll authentication back to pre-MFA code after enrollment.

Cloudflare documents [migration rollback and commands](https://developers.cloudflare.com/d1/wrangler-commands/)
and [foreign-key enforcement](https://developers.cloudflare.com/d1/sql-api/foreign-keys/).
Installed Wrangler help was checked; no unsupported jurisdiction flag, explicit
BEGIN/COMMIT or foreign_keys=OFF is proposed. Schema/reset atomic rollback is tested
locally; no hosted execution/result is claimed before the relevant approval gates.
