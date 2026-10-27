# Production account activation — local preparation

Owner authorized local implementation/tests and a local commit on 2026-10-27.
No push, PR, deployment, migration, secret provisioning, account creation or public
activation is authorized. Cloudflare traffic/bot-policy review remains deferred.

## Target and current evidence

Canonical PROD origin: https://www.lan-party.club. Worker: lan-party; D1:
lan-party-prod, UUID 9fbe3402-c26b-45fd-be67-71775e5e6a3e. The apex redirects to www;
retain its Worker binding. Do not redirect HTTPS www again or accept apex/aliases
as authentication origins. DEV remains https://dev.lan-party.club on its separate
Worker/database and existing deployment workflow.

Read-only dashboard inspection on 2026-10-27 confirmed migrations 0001–0007,
quick_check=ok, no foreign-key violations and zero users. PROD Worker runtime
variables/secrets and build variables were empty; DB points to the exact PROD UUID.
Wrangler's read-only D1 info failed with authentication error 10000; dashboard
reads succeeded. Resolve supported execution access before any migration, without
expanding credentials/permissions implicitly. Evidence must be refreshed at execution.

## Prepared, default-disabled contract

The default Wrangler build remains authentication-ineligible on PROD. The explicit
future --env prod profile supplies the reviewed Worker/D1 build identity and exact
origin, but sets REGISTRATION_MODE=disabled and AUTH_SESSION_MODE=disabled. It
contains no credentials, email allocations or public frontend activation flag.
The existing default Cloudflare deploy command does not select this new profile.
No build/deploy setting was changed remotely.

Future activation requires a reviewed PROD bundle, AUTH_ENVIRONMENT=prod,
AUTH_PUBLIC_ORIGIN=https://www.lan-party.club, AUTH_EMAIL_TRANSPORT=resend and
explicit hosted-prod modes. VITE_AUTH_MODE=hosted-prod is presentation-only and
requires the exact HTTPS www origin; backend authority is independent. Missing,
wrong or cross-environment combinations deny access. DEV flags cannot enable PROD.
MFA uses a distinct prod encryption context; existing dev/local ciphertext remains
unchanged and cannot be decrypted as prod even with the same key material.

Reuse existing password/email verification, session revocation, CSRF, abuse limits,
Turnstile challenge thresholds, strict MFA proof freshness and one-use recovery.
No new schema or security thresholds are introduced. Local mailbox access stays
loopback-only. Production links use www; DEV transport still rejects PROD links.

Required future private bindings (never put values in Git/logs/chat):
PASSWORD_PEPPER and AUTH_RATE_LIMIT_SECRET (independent 32-byte hex values),
RESEND_API_KEY, TURNSTILE_SECRET_KEY, MFA_ENCRYPTION_KEYS and MFA_ACTIVE_KEY_ID.
The keyring retains its existing JSON key-ID to 32-byte hex-key format; the active
ID must exist. Use independent PROD keys, privately backed up outside the repo.
Public AUTH_TURNSTILE_SITE_KEY must match a widget authorized for www; preserve the
existing hostname/action/replay verification. Do not copy DEV credentials.

Email uses the existing provider adapter and atomic D1 allowance. Required explicit
AUTH_PROD_EMAIL_DAILY_LIMIT (1–60) and AUTH_PROD_EMAIL_MONTHLY_LIMIT (positive, no
higher than provider allocation) are separate from AUTH_EMAIL_PROVIDER_DAILY_LIMIT
and AUTH_EMAIL_PROVIDER_MONTHLY_LIMIT. No values are selected/configured here.
The adapter supports the existing reviewed ceilings of 100/day and 3000/month;
operators must verify actual available/shared-account quota before setting them.
All account email purposes share the PROD DB budget; failed/uncertain attempts
count and are never automatically retried/refunded. DEV allowlist behavior is
unchanged; explicit PROD mode accepts validated public recipients. Missing/invalid
email allocation denies registration before account creation. Sender remains
noreply@auth.lan-party.club; sender deliverability and allocation need verification.

## Short execution sequence and separate approval gates

1. Review the local exact commit and focused evidence. Publication/PR/main merge
   and automatic production deployment each retain their existing gates.
2. Refresh target/history/integrity, confirm recovery retention and capture a fresh
   private Time Travel checkpoint immediately before separately approved migration.
   Apply existing 0008–0018 sequentially, unchanged, preserving history. No account
   reset is needed for zero users; zero users does not authorize deleting event data.
   Verify final history, integrity and foreign keys; never automatically retry an
   uncertain migration or restore/repair on failure.
3. Separately approve PROD secret/Turnstile/email configuration with private recovery
   storage and explicit budgets. Check metadata/presence only in public evidence.
4. Separately approve deployment of the reviewed code/profile with modes still off.
   Confirm active revision, exact D1 binding, default-denied routes, HTTPS www,
   apex redirects and unchanged DEV. Do not run migrations in build/deploy scripts.
5. Explicitly approve enabling hosted-prod modes/frontend and one controlled real
   account acceptance before inviting general users. Test email registration,
   verification once/expired link denial, unverified-login rejection, login/logout,
   reset revocation, optional TOTP enrollment/login/recovery, CSRF/cookie and
   cross-origin denial. Keep credentials/codes private; no provider emails occur in
   local tests. Public privacy/controller identification and current account wording
   require launch review before real public collection; do not claim resolved legal
   identification merely from the public-facing organizer name.

Normal self-service member numbers still start at #0011. Reserved #0001–#0010 do
not confer roles and are not automatically assigned to the first registrant. If
Member #1 means reserved #0001, approve its existing controlled provisioning path
separately; do not manipulate the issuance ledger or bypass administrator checks.

## Stop and recovery

Stop on target/source/schema mismatch, missing secure checkpoint/keys, failed
security test, uncertain write, unavailable delivery, or failed canonical routing.
For signup/delivery problems disable new registration first; retain established
sessions/login where safe. For authentication incidents disable session routes as
needed under owner authority. Do not roll enrolled users back to pre-MFA login,
discard keys or undo schema automatically. Restores require separate approval and
can resurrect deleted accounts and roll back spent codes/session state. Preserve
keys and select an MFA-aware compatible fallback. Retain existing deletion/backup
risk disclosure; no new deletion registry or automatic restore reconciliation.

Local preparation is not hosted acceptance. Full CI/release checks remain mandatory
at eventual publication; do not repeat unrelated suites during this local step.

## Local verification receipt

The focused seven-file regression run passed 106 tests with zero failures/skips:
prod-auth, auth-ui-mode, email-template, hosted-dev, mfa-environment,
dev-email-budget and mfa. They exercise synthetic local D1 and intercepted provider
calls only. The final production-build DEV-isolation refinement was followed by
15 affected checks: 14 passed initially; the remaining fixture incorrectly assumed
Miniflare would preserve a missing platform IP. The existing direct missing-IP
assertion remains; after correcting that fixture assumption the affected check
passed. Earlier preparation caught and corrected an additional DEV-only email
template origin guard and test-fixture conversion errors. No failure was hidden or
security predicate relaxed.

Strict TypeScript and default production build passed; separate local opt-in
hosted-prod and existing hosted-dev frontend builds passed. No full application
suite, remote checks, real emails or hosted accounts were exercised in this step.
Existing unrelated database/schema, lifecycle and UI acceptance remains previous
evidence, not newly verified PROD acceptance. Actual sender, widget, keys, migration
runner and controlled browser acceptance remain execution-stage gates.


## First-owner bootstrap — local candidate, not activated

Owner authorized implementation/tests and release preparation on 2026-10-27.
PROD remains disabled. The owner also authorized the scoped commit and release PR
preparation. Migration 0019 and the protected PROD merge each require
separate approval. No private owner email, setup code or credentials belong in Git.

The ordinary route still starts at #0011. A dedicated opt-in uses the existing
registration form at /register#owner-setup (the fragment contains no secret).
PROD_OWNER_BOOTSTRAP_MODE=enabled restricts PROD signup to the exact normalized
PROD_OWNER_BOOTSTRAP_EMAIL plus a separate 32-byte lowercase-hex
PROD_OWNER_BOOTSTRAP_TOKEN entered privately in the masked form field. Store both
private values as Worker secrets; never put the token in a URL, screenshot or log.
The token prevents an outsider who knows the email from choosing the first owner's
password. It does not replace password hashing or normal email verification.
DEV/local cannot enter this path. Missing/invalid private configuration denies
signup; an unrecognized mode never falls back to ordinary registration.

0019 adds one immutable singleton receipt and extends only the existing reserved
ledger admission guard for a zero-account first-owner claim of #0001. No roles or
accounts are seeded. One D1 batch claims the receipt/slot and creates the normal
profile and password record; failures roll back all of them. Zero accounts also
means no eligible administrator. Concurrent requests have one winner. All other
reserved numbers retain the administrator/users.manage guard. Pending signup has
no privileges, verified email or authenticated session.

The existing single-use, purpose-bound email verification transaction performs
verification, the seeded administrator role assignment and receipt completion
atomically. A missing/disabled admin role or missing users.manage mapping aborts
verification rather than consuming proof without granting the reviewed role.
The owner gets the existing explicit seeded administrator permissions, not a new
role or implicit power derived from the member number. Existing password, CSRF,
rate limits, sessions, Turnstile and optional MFA are unchanged.

The receipt clears its email on completion. Normal approved permanent deletion
clears the UUID during the existing deleting transition and leaves only consumed
state/timestamps. It can never be deleted, replaced or reopened. It is not a
restore replay/deletion registry. Restoring an earlier database can roll back this
receipt and all authentication state; the existing owner-approved restore risks
remain, and restoration/repair is never automatic. Existing Time Travel retention
is finite; retain the current private key recovery material independently.

Release order: review local diff/tests and publish the disabled candidate for PR
review. Before activating setup, separately approve/apply exact migration 0019
through the existing target/history/integrity/private-checkpoint procedure in each
approved environment. Missing 0019 does not affect ordinary DEV or disabled PROD.
The protected MAIN merge and PROD deployment remain separately gated. Deploy with
--env prod --keep-vars and modes disabled. Verify all prior six secrets/ten public
settings/DB binding survive. Only after another activation approval, provision the
private bootstrap email/code, set bootstrap mode enabled and the two auth modes to
hosted-prod, and build the frontend with VITE_AUTH_MODE=hosted-prod. Verify owner
signup, normal email verification, #0001, administrator permission and optional MFA
privately. Do not open ordinary public signup until completion is verified; then
an explicit configuration decision can disable bootstrap mode for regular #0011+
registration and retire the setup secret. Leaving bootstrap enabled after completion
fails closed for all further signup. Existing signup never silently upgrades a
pending or ordinary account to #0001.

Rollback: disable registration first and sessions as required; remove frontend
activation if needed. Preserve schema, issued number/receipt and keys. Never
renumber/recycle #0001, fabricate an admin session or restore the database as an
activation rollback. Pending email delivery is recovered only with explicit resend;
uncertain signup/email writes are not automatically retried.


### Local bootstrap verification

The final bootstrap fixture uses a test-only adapter: it first requires the real
transport Host to be a loopback listener, then restores the fixture-supplied Host.
It never rewrites the request URL, Origin or forwarded claims. Application code
is unchanged. Explicit negative cases retain hostile Host/origin/forwarded denial.
The final lifecycle test covers the verified first owner's last-administrator
protection, normal authenticated deletion with a second synthetic administrator,
identity scrubbing, and refusal to reopen bootstrap even with zero accounts.
Earlier direct-service fetch exploration hit Miniflare's bridge-origin checks;
that approach was discarded rather than weakening the application guard.
Other same-candidate focused evidence (email verification/expiry, lifecycle,
member ledger, email budgets, DEV/PROD isolation and compatibility) is reused;
no unrelated full suite or remote accounts were exercised.
