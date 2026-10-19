# Optional account MFA — Phase 3.8.1 proposal

Status: architecture approved in principle; Phase 3.8.2 foundations implemented and
tested locally. Remote migrations, keys, activation, push and deployment are not approved.
The owner reports Phase 3.7 manual DEV acceptance passed 7/7. MFA is optional for
every role, one active TOTP authenticator per UUID account, shared across password
and Google login. No SMS, email OTP, trusted devices or automatic support bypass.

The owner's new Phase 3.8 MFA numbering supersedes earlier references to future
Phase 3.9 MFA. Existing Phase 3.8 email/GUI/rate-limit headings describe historical
work; preserve them rather than renumbering those records.

## Existing integration and enforcement

- `worker/auth/http.ts` verifies passwords and directly issues sessions.
- `worker/auth/google.ts` issues sessions for linked Google sign-in and new-account
  completion, and replaces sessions after Google linking and first-password setup.
- `worker/auth/sessions.ts` is the common issuance/storage/resolution boundary.
  Extend this boundary, not separate provider-specific MFA implementations.
- `auth_version` already fences stale credentials, sessions and action tokens;
  its triggers clear recent primary-authentication proofs. Preserve this behavior.
- `auth_recent_authentication` in applied migration 0012 explicitly constrains
  `assurance_level=1` and `mfa_verified=0`. Keep it as primary-authentication proof;
  do not pretend these fields support MFA or edit that migration.
- Existing reset completion requires a local credential, atomically consumes its
  purpose-bound token, updates the password and revokes sessions. Keep it separate
  from MFA and from Google-only first-password creation.
- Reuse exact-origin/JSON/custom-header checks, HttpOnly cookies, CSRF HMACs,
  persistent rate-limit leases, Turnstile, guarded notifications and the shared
  60-attempt email budget. Account Security already has inline action switching.

Create one shared primary-authentication completion service: either issue a normal
session for an account without MFA or create a restricted MFA transaction. Every
provider uses it. Harden session creation itself against issuing an MFA account's
session without a server-authorized proof. Session resolution must independently
require matching MFA assurance for an enabled factor: even an accidentally inserted
unassured session must not authorize an account/API/RBAC operation.

Google linking and first-password session replacements must preserve assurance only
from their exact already-MFA-authenticated caller, at the expected next generation;
never infer MFA from Google claims or an old session. Transfers preserve original
verification times rather than manufacturing fresh step-up proof. New Google accounts have no
enrolled factor; completion still uses the shared gate. Google reauthentication must
support fixed, server-bound MFA settings return actions, not arbitrary redirect URLs.

## Migration 0013 (prepared locally, never remotely applied by this work)

0013 is now prepared as `0013_create_account_mfa.sql`. It preserves STRICT, UUID, timestamp,
foreign-key and immutable-identity conventions. No existing account is enrolled.

| Structure | Minimum state |
| --- | --- |
| `auth_totp_factors` | One row per user; unique factor UUID, encrypted secret/nonce/key ID, enabled timestamp, monotonically advancing last accepted TOTP step, active recovery-set ID. Fixed algorithm/digits/period constraints. |
| `auth_mfa_transactions` | Random token digest; user, auth generation, factor/set revision, purpose, phase, browser binding, optional initiating session digest; primary method/time, expiry, attempt/proof state; encrypted pending enrollment secret; digest of one-time acknowledgment capability where required. |
| `auth_mfa_recovery_codes` | User, random set ID, unique code verifier, created/consumed timestamps. Active set selected only through the active factor; staged sets cannot authenticate. |
| `auth_session_mfa` | Session digest PK/FK, user/generation, factor revision, completion time, TOTP/recovery method; separate recent step-up timestamp where required. Primary-authentication metadata for pending-login completion must be preserved. |

Phase 3.8.3 may add a constrained fixed `return_action` to OIDC reauthentication state if needed to
preserve the existing password-setup return and the new MFA management returns.
Index user/expiry lookups and recovery verifiers. Uniqueness must prevent multiple
active factors and conflicting live management transactions per account/session.
Generation changes invalidate pending MFA transactions and staged acknowledgments;
they do not erase active factors or unused recovery codes. Preserve old session
assurance for auditing or discard it with revoked sessions; never accept it afterward.

Use supported guarded D1 batches. Consume proof, CAS-update replay state/code,
consume the transaction, insert the session and its assurance atomically. Assert
intended RETURNING rows; rollback the whole batch on failed guards, not partial
success. Match user status, expected generation, factor revision, browser/session
binding, purpose and expiry inside the write, not only in a preceding SELECT.
Expire pending contexts semantically on every use; clear encrypted temporary secrets
on cancellation/consumption and remove expired transactions and their staged code
sets with bounded local-to-request cleanup. Do not add scheduled infrastructure.

## TOTP, encryption and dependencies

Propose HMAC-SHA-1, six digits, 30-second steps, fresh 160-bit random secret and
Base32 otpauth provisioning, issuer `LAN Party`. Use nickname/member number for
the app label instead of legal names/email. Accept current step plus at most one
step either way, with no automatic skew expansion. CAS `last_accepted_step` rejects
reuse across all login/management transactions. A consumed future step can require
waiting for the next code; report this without exposing factor/account details.

Encrypt pending and active secrets with Web Crypto AES-256-GCM, fresh 96-bit nonce
per encryption and a 128-bit tag. Authenticate format version, environment, user,
factor/transaction ID and purpose as AAD; changing context requires re-encryption.
Use separate environment-specific Worker secret `MFA_ENCRYPTION_KEYS` (versioned
256-bit key ring) and public `MFA_ACTIVE_KEY_ID`. Never reuse PASSWORD_PEPPER,
AUTH_RATE_LIMIT_SECRET, OAuth or Resend keys. Missing key/decryption failure denies
MFA authentication/management; never treat unreadable state as MFA disabled.

Keep a private recoverable key backup before enrollment. Rotation: install old+new
keys, switch new writes, re-encrypt in separately approved guarded batches with new
nonces, verify every row, retain old keys for the database recovery/backup window,
then retire them explicitly. Lost keys cannot reconstruct authenticator secrets;
compromised keys require an incident/re-enrollment plan, not just re-encryption.
D1-only disclosure exposes ciphertext and random-code verifiers; D1 plus Worker
keys exposes factors. TOTP remains phishable; this is not phishing-resistant MFA.

Candidate dependencies: otplib async TOTP with its Web Crypto plugin and required
Base32 module; browser-only `qrcode` canvas rendering. Review exact versions,
licenses, transitive dependencies, advisories, returned matched-step semantics and
local Workers compatibility before approval/install. These are candidates, not an
audit claim. Never call an external QR service or load crypto via a CDN. Do not
write a new OTP algorithm. Reuse native Web Crypto for AES-GCM/randomness/hashing.

## State machines and acknowledgment safety

Enrollment (10-minute maximum, session/generation bound):

1. Recent primary authentication (propose two minutes) -> encrypted pending secret.
2. Display QR/manual key only in the initiating authenticated browser, no-store.
3. Valid TOTP -> stage recovery verifiers and return plaintext codes plus a random
   acknowledgment capability exactly once. Store only its digest. Still disabled.
4. User acknowledges saving the displayed codes -> atomic activation, expected
   generation advance, revocation of old sessions, replacement MFA-assured caller
   session and new CSRF proof. Record the enrollment TOTP step as already used.

Never make acknowledgment available before codes were returned/displayed. Keep
codes only in component memory until confirmed success; no local/session storage.
If the code response is lost, reload loses the capability, or setup expires/cancels,
MFA stays disabled; discard pending state and restart with new secret/codes. If the
activation response is lost, the user already acknowledged receipt and can sign in
with the authenticator/recovery codes. Do not activate implicitly or retry writes.
Expiry must also bound proof freshness; stale proof requires reauthentication.

Login (five minutes, non-sliding):

`primary verified -> pending MFA -> valid TOTP/recovery proof -> full session`

The pending token is a separate random 256-bit HttpOnly/Secure/SameSite cookie,
stored only as a digest, with explicit purpose and independent CSRF binding. It is
not an auth_sessions record and cannot access account, events, admin or normal APIs.
Bind it to the initiating browser, account generation and factor revision; don't
bind it rigidly to an IP (networks can change). New attempts/cancellation supersede
old context; expiry or security changes require primary login again. Only the
atomic successful completion issues a fresh normal session and clears pending state.

## Recovery codes, throttling and management

Propose ten independent 128-bit random recovery codes, grouped Base32 for copying.
Normalize only code separators/case. Store domain-separated SHA-256 verifiers bound
to user and random set ID; high entropy makes password-strength hashing unnecessary.
Never store plaintext codes or encrypt them for later redisplay. Atomic redemption
marks exactly one unused code consumed and completes the same MFA transition.
Use the same input budget for TOTP and recovery codes, not a separate bypass pool.

Propose five confirmed failures per challenge and per user+IP per 15 minutes, plus
ten per account per 15 minutes against distributed guessing. New challenges do not
reset account limits. Count failures, not pending concurrent checks or successes;
reserve attempts atomically with expiring leases, bounded waiting and Retry-After.
Four wrong attempts followed by a valid fifth can succeed. Reuse the D1 counter
table's existing <=30 constraint with new HMAC namespaces, not existing login keys.
Shared-IP/global signals trigger Turnstile rather than an all-user lockout. MFA
challenges require successful primary proof first. A primary-compromised attacker
can still cause account-specific cooldowns; no permanent lock or automatic reset.

Disable/regenerate: require recent primary authentication AND fresh LAN Party MFA
proof (propose two minutes), not a session or inbox alone. Accept TOTP or an unused
recovery code so authenticator loss with saved codes remains recoverable. Existing
recent session assurance may authorize only within the explicit freshness policy;
otherwise perform purpose-bound step-up. Consuming codes/proofs uses atomic guards.

Regeneration stages and displays a new set, then requires acknowledgment before
atomically switching the active set; old remaining codes work until that commit,
then none do. An interrupted display must not destroy the current usable set.
Management commits advance auth_version, revoke other sessions/pending contexts,
and rotate the proven caller at the expected generation with appropriate assurance.
Disabling removes the factor only after proof; its replacement session is primary-
authenticated. Regeneration retains TOTP replay history. Losing both factors and
codes has no automatic recovery; any future manual process needs separate approval.

Password change/reset retains the factor and recovery set, revokes sessions as
today, and requires MFA at the next login. Linked-method changes/add-password must
also require the existing account's MFA session and fresh MFA step-up (propose two
minutes); neither enables a bypass. Apply the same extra MFA freshness requirement
to authenticated password changes, preserving their existing current-password check.
Email recovery remains proof-bound replacement only, with MFA still required at login.

Extend existing guarded security notifications for enable, disable and regeneration
only after successful commits. Shared allowlist, daily 60-attempt budget and no
retries remain; notification failure is static/sanitized and never undoes a security
change. No outbox is proposed. Log outcome/category only; no OTP, secret, QR URI,
recovery code, raw cookie, provider payload or private profile. Exclude setup/challenge
pages and bodies from analytics, caching and error payloads; no third-party QR fetch.

## Stages, tests and rollout approvals

1. **3.8.1:** approve this design, schema, thresholds, libraries and key ownership.
2. **3.8.2:** local primitives, migration/enrollment/staged recovery codes; no hosted
   enrollment until the shared login and resolver gates below are complete.
3. **3.8.3:** shared login gate, pending cookies, atomic proof redemption and session
   assurance; cover all existing session replacements and protected routes.
4. **3.8.4:** disable/regenerate, step-up, notifications and Account Security action UX.
5. **3.8.5:** complete security regressions, browser checks and owner DEV acceptance.

Test RFC vectors; independent authenticator interoperability; AES tamper/context/key
failure; skew/replay/concurrency; code entropy/single-use; lost display/ack responses;
expiry/cancellation; lease recovery/throttling; all password/Google/session creation
paths; pending-state account/admin denial; CSRF; generation races; reset retaining
MFA; last-method protections; notifications/budget failures; non-MFA regression;
mobile, focus and accessibility. Use fictional fixtures/intercepted transports only.
Run strict TS/builds and full auth/security regressions before DEV rollout; migration
compatibility against populated 0012 belongs to the new migration's local tests.
Check integrated CPU/reliability locally; no standalone password benchmark restart
or claim of Free-tier headroom before measured integrated evidence.

After separate approvals: recoverable DEV migration 0013 first, backed-up DEV keys,
complete MFA-aware code with enrollment off, CI/DEV verification, then separately
authorized enrollment/live testing. A mode switch may disable new enrollment, but
must never bypass challenges for existing factors. Once anyone enrolls, do not roll
back to pre-MFA code: it would bypass MFA. Recover through MFA-aware fixes/fail-closed
affected logins, preserve database/key recovery evidence, never auto-disable factors
or automatically restore the whole database. No PROD rollout is approved.

## Primary references

- RFC 6238: https://www.rfc-editor.org/info/rfc6238/
- OWASP MFA guidance: https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
- Workers Web Crypto: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
- otplib async/Web Crypto support: https://otplib.yeojz.dev/guide/getting-started
- Local QR rendering: https://github.com/soldair/node-qrcode

## Phase 3.8.2 implementation findings and remaining gates

- `mfa-crypto.ts` uses native random bytes/AES-GCM and otplib asynchronous SHA1 TOTP.
  Pending and active envelopes use different AAD contexts and fresh nonces. Key-ring
  IDs select independent 256-bit keys; missing/wrong keys and tampering fail closed.
  Ten codes encode 16 random bytes each; only context-bound SHA-256 verifiers persist.
- Pinned direct versions: `@otplib/totp`, `@otplib/plugin-crypto-web` and
  `@otplib/plugin-base32-scure` **13.5.0**, `qrcode` **1.5.4**, dev-only
  `@types/qrcode` **1.5.6**. Otplib core/HOTP/URI resolve to 13.5.0; @scure/base to
  2.4.0. OSV checked all 37 candidate package versions before installation with no
  findings; the installed lockfile's npm audit reports zero vulnerabilities. These
  checks are time-specific evidence, not an independent security audit. The 36 new
  runtime packages have MIT (29) or ISC (7) licenses; types are MIT. QR's Node CLI/PNG
  dependencies are present in the lockfile; the frontend uses its browser canvas entry.
- `mfa-enrollment.ts` prepares session/browser/generation-bound setup, staging,
  cancellation and guarded activation SQL. Recovery verifiers are staged once;
  failed/expired/lost displays cannot activate. Activation SQL is exercised only by
  isolated fictional test entrypoints. It revokes old sessions atomically, but **no
  production caller invokes it** and no replacement MFA login is implemented yet.
- `MFA_LOGIN_INTEGRATION_READY` and `MFA_ENROLLMENT_AVAILABLE` are hard false.
  There are no `/api/auth/mfa/*` application handlers. Normal Account Security does
  not render the new component; even the standalone local preview cannot enable MFA.
  Final acknowledgment, assured-session replacement, management notifications and
  fixed Google return actions remain deferred to their approved future stages.
- Enrollment validation reuses the existing expiring atomic reservation primitive
  with an isolated synthetic account identity: five confirmed failures per account
  in 15 minutes, including across enrollment restarts. Pending checks/successes do
  not spend failures; a correct fifth attempt after four mistakes succeeds. This
  provisioning-only bound does not alter password login. The broader challenge/IP/
  account policy described above belongs to Phase 3.8.3 login integration.
- Existing session creation now refuses active MFA accounts, including password,
  Google and replacement callers; resolution independently checks matching session
  assurance. Thus seeded MFA fixtures fail closed until Phase 3.8.3. No silent session
  upgrade exists. A wholly pre-0013 schema remains compatible because no factor can
  exist; a partially present MFA schema fails closed. Schema changes are not cached.
- Runtime tests use supported D1 `quick_check` plus `foreign_key_check`;
  `integrity_check` was rejected by local D1. No remote checks were performed.
- UI QR/key/codes stay in component memory and are cleared on phase changes,
  cancellation, expiry or unmount. No persistent browser storage, external QR
  generation, secret logging or actual emails are used.

Remaining approval: local Phase 3.8.3 shared login challenge and final enrollment
integration; no push/deployment or remote migration/key configuration is implied.
