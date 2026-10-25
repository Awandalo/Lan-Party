# Google OAuth discontinuation — review candidate

On 2026-10-25 the owner permanently discontinued Google OAuth after the final
hosted DEV confirmation returned `fresh-proof-unavailable`. Reintroduction requires
explicit owner reversal. This PR targets DEV; it authorizes no merge or deployment.

## Application changes

- Email/password is the only primary authentication method. Optional TOTP MFA,
  one-use recovery codes, conditional server-verified Turnstile and existing email
  verification/password recovery remain. No account merging or automatic password
  creation is introduced.
- Google buttons, signup/linking, callback/exchange/claim validation, browser flow
  state and provider dependency are removed. Former Google API paths return 404.
- Password confirmation/change move to `/api/auth/security/`, preserving origin,
  CSRF, session/generation, atomic failure allowances, Turnstile, fresh MFA write
  guards, password validation, notification and password-change sign-out behavior.
- Fresh primary proof for enrollment, regeneration and replacement must be password
  proof. Legacy provider pending challenges/operations cannot create fresh authority.
- Secrets or provider data are never read by the removal process.

## Schema and data — separate approval required

No database rebuild, SQL migration, remote query or data deletion is performed.
Migrations 0001–0015 remain byte-for-byte unchanged. Removing a provider does not
require rebuilding the entire database or losing UUIDs, member history, passwords,
MFA factors, recovery codes, sessions, roles, registration or email budgets.

Existing `user_auth_providers` mappings and `auth_oidc_transactions`/
`auth_password_setup`, their indexes/triggers and legacy enum values are retained
as inert historical storage. `auth_recent_authentication` is shared password/MFA
infrastructure and MUST remain. The obsolete `oidc_state_digest` column on restricted
recovery is not used by the application. Strict legacy schema accepts old provider
values, but runtime sensitive-action guards accept password proof only.

Before rollout, obtain owner approval for a small DEV-only aggregate account audit:
identify passwordless accounts and affected sessions/operations without exporting
personal data. Agree an explicit transition (or disposal of approved fictional DEV
accounts). Do not silently set passwords, turn a provider session into password
proof, bypass MFA or grant recovery through matching email. Normal password recovery
continues to require an existing local credential. Affected users without a usable
method require administrator assistance, not an automatic recovery bypass.

For complete physical cleanup, separately review a new forward migration (next
number must be rechecked), targeted deletion of obsolete mappings/transactions,
removal of obsolete indexes/tables and trigger reconstruction preserving shared
password-assurance cleanup. Tightening CHECK enums/removing referenced columns may
require rebuilding individual shared tables; do not improvise this during rollout.
Migration proposal, fresh private recovery checkpoint, exact DEV target and execution
approval are separate gates. Revoke affected sessions/operations explicitly before
rollout; old ordinary sessions are not automatically revoked by changing code.

## Configuration cleanup and release gates

The candidate removes Google public vars from Wrangler and local examples; all
other bindings, including Turnstile and MFA keys, remain. Existing encrypted
`GOOGLE_CLIENT_SECRET` may survive deployment. Its DEV removal, dashboard-variable
cleanup and Google Cloud client revocation require separate explicit operational
approval. No remote config is changed by this PR; PROD is untouched.

Review exact PR base/head and account-transition findings before approving DEV
merge. A merge/push to dev automatically deploys. Verify actual deployed version,
health, password login, stale-primary reauthentication, TOTP/recovery login,
last-code replacement, code regeneration, notifications and expired/replayed proof
rejection using private owner-controlled hosted testing after approval. Stop for
unknown account impact or failing safeguards. Do not use pre-MFA code as rollback
after factor enrollment; any fallback must retain MFA enforcement. Rolling back
this removal must not silently reactivate the discontinued provider.

Historical migration constraints and dated security review receipts remain evidence,
not current Google setup/activation instructions. New current privacy guidance is
in [PRIVACY.md](PRIVACY.md); no PROD privacy page is changed by this DEV PR.
