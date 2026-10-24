# Optional account MFA — Phase 3.8.1 proposal

## Phase 3.8.6 integration candidate — local only

The owner authorized a clean candidate based on remote dev
`30a290dda147a92ab519d8c1c69a4846b6a8e090`, retaining its governance/communication
history and only the reviewed application dependencies through R3 `d330e66`.
R3 static acceptance is recorded in #10; prior local-only statements below are
historical checkpoints. This candidate is not committed, published or activated.

Restricted recovery now uses the same canonical-DEV eligibility gate as management,
including its availability hint and Google recovery initiation/callback. Recovery
setup, replacement and encrypted redisplay select the same `dev` crypto context;
loopback continues to use `local`. Restricted contexts never become ordinary sessions.
All deadlines, proof freshness, code consumption, transaction guards and notices
retain the reviewed R1 policy. No migration or key format changes are needed.

Only the state/browser-bound, cryptographically validated Google callback permits
cross-site fetch metadata for a GET navigation to the exact callback pathname with
`Sec-Fetch-Mode: navigate` and `Sec-Fetch-Dest: document`. Management/recovery API
mutations still reject cross-site requests; Origin and forwarded-header checks remain
mandatory where supplied. Missing fetch metadata retains existing callback compatibility;
the OAuth state, nonce, PKCE and bound provider subject remain authoritative.

Local synthetic navigation fixtures are not hosted browser evidence. Deployment must
verify actual Worker/routes/D1 identity, migrations 0013/0014, backed-up keys and
binding preservation, then separately authorize real browser/account/email tests.
The DEV build marker cannot attest live infrastructure. Do not enable hosted
enrollment until the enforcing code, schema, keys and recovery path are ready.
After enrollment, rollback must preserve MFA enforcement and decryptability;
pre-MFA rollback or automatic D1 restoration is forbidden. #9/#10/#14/#15 stay open.

## R3 — canonical DEV eligibility, locally implemented (issue #15)

Owner authorized local edits/tests on 2026-10-22. No commit, push, remote binding,
migration or hosted activation is authorized by this implementation.

`mfaManagementEnvironment` gates enrollment, management and R2 step-up, and supplies
`status.enrollmentAvailable`. Login challenge/completion are deliberately outside
this management gate, so an existing factor cannot be bypassed or locked out solely
because management eligibility is unavailable.

| Context | Management eligibility |
| --- | --- |
| HTTP loopback + local-only sessions + local transport | Existing local behavior preserved |
| Exact canonical HTTPS DEV + trusted DEV bundle + all DEV configuration below | Eligible, subject to normal session/primary/MFA/CSRF/rate-limit checks |
| Default/PROD bundle, absent or wrong compiled target | Denied even if runtime variables are copied from DEV |
| PROD, preview, workers.dev alias, other port/protocol/hostname | Denied |
| Missing/wrong DEV environment, canonical origin, hosted session mode, Resend transport or usable MFA key ring | Denied |
| Conflicting Host/Origin/protocol, Forwarded or X-Forwarded-Host, cross-site request | Denied; proxy claims never establish identity |

The DEV-only Wrangler `define` is a build-time identity containing the configured
Worker name `lan-party-dev` and DEV D1 UUID. The default configuration supplies no
identity. Existing `AUTH_ENVIRONMENT=dev`, exact `AUTH_PUBLIC_ORIGIN`, hosted session
mode, Resend transport and valid keys are independent runtime prerequisites. No
new runtime activation toggle or secret is introduced. `X-Forwarded-Proto=https`
is compatible; contradictory protocol headers are rejected. The default Worker
and its PROD D1 configuration are unchanged.

Wrangler's [environment configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
supports environment-specific build substitutions; the installed schema confirms
`define` is not inherited into other named environments. Local checks bind the
literal marker to the exact DEV Worker/D1 configuration, and actual DEV dry-run
packaging confirms substitution. This is trusted deployment-configuration identity,
**not a runtime attestation of the actual Worker name or D1 UUID**: an operator who
deploys the DEV artifact/configuration to another Worker or swaps its binding can
defeat that operational assumption. #10 must independently verify the actual Worker,
route and D1 identity, reject overrides, and stop on mismatches before publication.
Request headers and dashboard variables cannot change the compiled marker.

Enrollment/management/step-up now use `dev` AES-GCM context on hosted DEV, and retain
`local` context on loopback. The UI permits only local development or a hosted-DEV
build at the canonical origin, then requires explicit backend availability. Denial,
malformed status or outage offers no active MFA settings/step-up controls. The
existing factor remains enforced on login regardless of presentation availability.

R1 restricted replacement and `challenge.recoveryAvailable` remain local-only;
this assignment does not authorize expanding that separate recovery surface. Hosted
activation must explicitly resolve this limitation under #10, not assume all R1
functionality became hosted-eligible. All real email/account testing stays gated.

Rollout recommendation: independently review this local diff; separately authorize
isolated review publication and a clean remote-dev-based integration candidate.
Never merge the divergent R2 review branch wholesale. Before #10 deployment verify
exact Worker/D1/routes, pending migrations and a fresh private recovery checkpoint,
key backup/configuration and existing email controls, and test the exact candidate.
Only after explicit rollout approval publish through the existing DEV workflow;
verify deployed version/health/negative hosts and perform separately approved real
browser acceptance. Stop on any identity, migration, key, CI, health or auth-boundary
failure. Worker rollback does not restore D1 or unenroll accounts; never roll back
to code incapable of enforcing already-enrolled MFA. Restoration requires its own
approval; do not automatically restore or remove factors.

## R2 — local credential-mutation assurance (issue #14)

R2-F1 review correction: the OAuth linking transaction also binds the exact
primary-proof method, timestamp, user/session and generation, rechecking expiry
using the database clock (Google strictly younger than 120 seconds; password's
existing 300-second proof lifetime). MFA remains an independent guard. A claimed
failed link consumes its OAuth transaction, clears verifier/nonce and expires its
browser cookie; competing/replayed callbacks cannot cancel the claimed exchange.
Stale primary proof returns a Security-page explanation without restarting OAuth.
An uncertain step-up response disables in-place retries and offers explicit normal
login; authentication still requires primary proof plus MFA and never refunds a code.

Owner authorized local implementation on 2026-10-22; independent review and hosted
acceptance remain pending. No new migration or remote configuration is required
by this correction. R3 and rollout #10 remain separately gated.

- Password add/change and Google link/unlink require LAN Party MFA proof strictly
  younger than 120 seconds for enrolled accounts, both before work and inside the
  guarded credential/provider transaction. The database clock rejects a proof that
  expires during hashing or OAuth. Proof is bound to the current user, live session,
  factor and authentication generation. Google provider MFA does not satisfy it.
- Non-enrolled accounts (including the pre-0013 schema) retain existing primary
  authentication rules. Partial MFA schema still fails closed. Existing primary
  proof requirements are additional to MFA and are not extended by step-up.
- Opening Account Security does not request a code. A protected action with stale
  MFA returns `428 mfa_required`; an expired Google link callback returns to Security
  with that presentation hint, without linking. An explicit local-only step-up
  accepts TOTP or an unused recovery code through existing throttles and conditional
  Turnstile verification. The source session is the one-use browser binding.
- Step-up atomically consumes/advances the proof, revokes that source session and
  issues a new session/CSRF with fresh MFA, retaining the original primary proof
  time. Guard failures roll back all three changes. It does not change credentials,
  factors, generation, other sessions or recovery sets. A lost successful response
  can require signing in again; no automatic retry or recovery-code refund occurs.
- The UI clears submitted passwords/codes, refreshes the rotated session and asks
  the user to select the intended action again. It never automatically replays a
  credential mutation. Existing mutation-specific sign-out/rotation and last-method
  protections are unchanged. The step-up endpoint retains the literal local gate;
  this implementation does not authorize or enable hosted MFA.

## R1 Option B — owner-authorized local implementation (issue #13)

This section supersedes the earlier R1 decision-pending language for the new
replacement path only. Existing ordinary recovery-code login and management keep
their distinct proofs; a last-code warning points users to restricted replacement
before spending their last code on a normal login. Optional MFA remains role-neutral.

- Local-only `/api/auth/mfa/recovery/` and the existing `/mfa` page provide explicit
  start, setup, primary refresh, commit, protected reveal, ACK, cancel and status.
  Hosted recovery/enrollment remains unavailable; R2/R3 and hosted #10 are separate.
- Fresh primary login creates the existing pending MFA context. One unused recovery
  code is atomically redeemed to create a unique browser/user/source/factor/set/
  generation-bound operation with a fixed five-minute deadline. The source pending
  login is consumed without issuing a session. Lost start responses can query the
  stable operation and resume without another redemption. Closing before commit
  clears staging but never refunds the spent recovery code.
- New TOTP possession and primary proof younger than two minutes are checked before
  and inside the guarded D1 switch. Atomic replacement deletes old factor/code
  authority, creates exactly ten new verifiers, advances generation and revokes
  existing sessions. SQL assertions turn zero-row guards into statement errors so
  the batch actually rolls back. There is no old-factor fallback after success.
- Code ciphertext uses existing AES-GCM keys with a distinct versioned purpose and
  authenticated environment/user/operation/new-factor/set/next-generation/browser/
  source/display-expiry context. Plaintext is never persisted. The fixed five-minute
  display window starts at commit, separately from the recovery deadline.
- Commit returns no codes. Each explicit reveal requires fresh primary proof and a
  non-replayed TOTP from the new authenticator, returning the same ten codes. ACK
  clears ciphertext and repeated ACK is non-sensitive within the surviving context.
  An authorized response already in flight cannot be recalled by a later ACK.
  Expiry rejects access even before bounded request-driven cleanup runs; D1 backups
  may retain ciphertext and keys are not automatically destroyed/rotated.
- Recovery cookies are HttpOnly, host-scoped, Secure outside loopback and SameSite=Lax
  to support the Google callback. Every mutation independently requires exact origin,
  CSRF and custom request headers. Normal pending/session cookies retain their policy.
  Password refresh checks the existing credential. Google refresh binds a normal
  validated state/nonce/PKCE transaction server-side to the restricted operation and
  exact linked subject; it cannot issue a session, link an identity or use email as
  ownership proof. Refresh never extends either deadline.
- Completion requires a fresh normal primary + new-MFA login. Lost display/context
  after a committed switch can use the new authenticator for normal login and code
  regeneration. Loss of the last code and browser context before commit remains a
  possible self-service dead end; no email/support/password-only MFA bypass exists.
- Replacement notification uses the existing guarded, budgeted mail path only after
  commit. Sanitized notification failure never reverses replacement. No automatic
  delivery or mutation retry. Local fictional mail and intercepted Google/Turnstile
  fixtures only; no live-account/real-email or hosted acceptance is claimed.

Additive migration 0014, focused workerd/D1 tests and intercepted browser fixtures
cover this implementation; migrations 0001–0013 remain unchanged. Independent review,
local commit approval conditions and separate remote rollout gates remain in force.

Status: architecture approved; Phase 3.8.2–4 foundations, shared login, local
enrollment and MFA management implemented locally. Remote migrations, keys, hosted
activation, push and deployment are not approved.
Phase 3.8.5 local review/preparation is now owner-authorized in issue #9; see
[MFA_SECURITY_REVIEW.md](docs/MFA_SECURITY_REVIEW.md) for local evidence and
unresolved recovery/freshness/hosted-gating decisions. No policy relaxation or
hosted acceptance is implied.
The owner reports Phase 3.7 manual DEV acceptance passed 7/7. MFA is optional for
every role, one active TOTP authenticator per UUID account, shared across password
and Google login. No SMS, email OTP, trusted devices or automatic support bypass.

The owner's new Phase 3.8 MFA numbering supersedes earlier references to future
Phase 3.9 MFA. Existing Phase 3.8 email/GUI/rate-limit headings describe historical
work; preserve their original numbering as history. The current forward sequence
is [PROJECT.md](PROJECT.md#current-phase-3-sequence-and-status): 3.8 MFA Security,
3.9 Account Lifecycle Management, then 3.10 Polish & Fixes; the latter two are
planning only, not implementation authority.

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

Google linking and first-password session replacements must originate only
from their exact already-MFA-authenticated caller, at the expected next generation;
never infer MFA from Google claims or an old session. The local implementation uses
a server-authorized transfer for those replacements only when the exact caller's
MFA proof is within two minutes; otherwise a new MFA challenge is required.
Original MFA and primary-authentication times are preserved; an account
change does not manufacture fresh Google/password proof. New Google accounts have no
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
5. **3.8.5 / [#9](https://github.com/Awandalo/Lan-Party/issues/9):** local security
   regressions, browser checks and DEV acceptance preparation. The original stage
   included hosted acceptance; the forward roadmap now separates that into 3.8.6.
   Pending follow-ups: **3.8.5.1 R1 [#13](https://github.com/Awandalo/Lan-Party/issues/13)**,
   **3.8.5.2 R2 [#14](https://github.com/Awandalo/Lan-Party/issues/14)** and
   **3.8.5.3 R3 [#15](https://github.com/Awandalo/Lan-Party/issues/15)**. All are
   preparing, with no implementation/activation approval from roadmap placement.
6. **3.8.6 / [#10](https://github.com/Awandalo/Lan-Party/issues/10):** controlled
   hosted DEV rollout and acceptance only after #9 disposition, remediation gates
   and separate operational approvals. No PROD rollout is included.

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

The statements above describe the Phase 3.8.2 checkpoint. Phase 3.8.3 supersedes
its disabled integration gates as follows.

## Phase 3.8.3 local integration

- Password, Google signup/sign-in and Google linking/first-password replacement
  use `completePrimary`. No-factor accounts retain normal sessions; enabled-factor
  accounts receive a five-minute, non-sliding, digest-only `login` transaction.
  The ordinary session store still refuses MFA accounts, and all session resolvers
  independently require current factor/generation assurance.
- Separate pending and browser cookies are HttpOnly/SameSite=Strict, Secure and
  `__Host-` prefixed on HTTPS. Explicit loopback-only cookie names support local HTTP.
  Pending CSRF uses a separate domain and the existing HMAC middleware. Pending
  state grants no account/protected access; cancellation, expiry, supersession and
  generation changes require primary login again. Bounded request cleanup removes
  expired login transactions; no scheduler is introduced.
- TOTP CAS or one recovery verifier, transaction verification/consumption, session,
  MFA assurance and primary-proof metadata commit in one D1 batch. The active
  reservation owner/lease is checked inside the guarded proof mutation. Missing
  keys fail closed even for recovery-code completion. Codes are never logged.
- Existing D1 counters now also support account-serialized MFA leases: five
  confirmed failures per challenge and user/IP, ten per account, all sliding
  15-minute windows. Pending/successful checks spend no failures; account/pair keys
  survive challenge restarts. Existing shared abuse signals require server-verified
  Turnstile without bypassing these limits. An attacker with primary credentials
  can still cause a temporary account-specific cooldown; no permanent lock exists.
- Enrollment start/verify/cancel/activate HTTP handlers require literal loopback,
  local-only session mode, local transport, a full verified session, CSRF and recent
  primary proof. Hosted enrollment remains 404, independently of frontend flags.
  Acknowledgment atomically enables the factor, advances generation, revokes old
  sessions and creates an assured replacement plus a new CSRF binding. Lost code
  displays cannot activate; lost activation responses recover through normal MFA
  login. Existing migration 0013 suffices; no migration file was changed.
- `/mfa` supports authenticator/recovery input, explicit cancellation, expiry,
  generic errors, accurate cooldowns and conditional Turnstile. Requests are never
  automatically retried. Local Account Security aligns MFA below Connected accounts;
  switching unsubmitted actions clears setup material, while submitted actions lock
  switching. Setup needs primary proof within two minutes; sign in again if stale.
  Disable/regenerate, purpose-bound fresh management step-up and management
  notifications remain Phase 3.8.4; no such actions are exposed here.
- Local workerd tests cover both providers, replacement generations, recovery,
  replay/concurrency/rollback, interrupted acknowledgment, browser/CSRF bindings,
  missing keys and limits. Browser fixtures cover input clearing, code acknowledgment,
  cancellation/focus and a 360px frame without overflow. No remote CPU headroom,
  real authenticator interoperability or hosted behavior is claimed by these tests.
- Verification: 187 distinct authentication/security tests passed across focused
  batches, including the existing 100-user shared-IP scenario, RBAC, storage,
  recovery and hosted-DEV regressions. Strict TypeScript, default and hosted-DEV
  builds, local Worker dry-run packaging and diff checks passed. Unrelated event,
  news and DNS suites were omitted because their code/schema were unchanged.

The preceding section records the Phase 3.8.3 checkpoint. Phase 3.8.4 supersedes its
deferred management and conservative replacement-challenge behavior below.

## Phase 3.8.4 local management

- Local-only `/api/auth/mfa/manage/{start,verify,finish,cancel}` requires an existing
  MFA-authenticated session, CSRF, exact origin and a current factor/generation.
  Disable/regenerate transactions bind the session, browser, purpose and original
  primary proof. Both primary and purpose-specific MFA proof must be within two
  minutes, enforced inside guarded writes. Google reauthentication supports only
  the fixed `mfa` return choice, never an arbitrary return URL.
- Disable requires a fresh TOTP or unused recovery code, then an explicit separate
  confirmation capability. One D1 batch consumes that capability, advances the
  generation, revokes sessions/transactions, removes the factor and code sets and
  creates a primary-authenticated replacement. It never deletes/changes credentials,
  Google mappings, account identity, member ledger, roles or participant history.
  Re-enrollment creates a new secret/factor. Existing sign-in methods remain usable.
- Regeneration stages ten hashed verifiers and returns raw codes plus an acknowledgment
  capability once. Only acknowledgment switches the active set, advances generation,
  invalidates old sessions/codes and issues an assured replacement. Cancellation,
  expiry, a lost display or failed acknowledgment preserves the active set. A recovery
  code used as the step-up proof is spent immediately and remains spent on cancellation;
  TOTP replay state likewise never rolls back simply because the user cancels.
- Existing account/IP/challenge failure limits, expiring atomic leases and conditional
  Turnstile also protect management checks. A fresh login proof is not reused for an
  unrelated management action. Users may need the next authenticator step or an unused
  recovery code. No support/email bypass, automatic retries or automatic restoration.
  This strict purpose separation also means recovery-code login and a subsequent
  management action need distinct unused codes. With a lost authenticator, spending
  the last code on login leaves no management proof; spending the last code on an
  interrupted regeneration can likewise exhaust recovery. Retain spare codes. Any
  relaxation or specially scoped recovery continuation needs an explicit owner
  decision during Phase 3.8.5; no silent bypass is implemented.
- Session replacements after linking/first-password creation can transfer recent
  assurance from the exact proven caller at exactly the next generation. An internal
  runtime-only authority marker prevents client-shaped objects authorizing a transfer.
  Original MFA/primary timestamps remain unchanged. Stale proof uses the normal MFA
  login challenge. Enrollment/regeneration replacements also retain the actual TOTP /
  management verification time rather than claiming the acknowledgment is new proof.
- Unapplied migration 0013 now allows assurance timestamps before session creation
  while rejecting future proof timestamps. Primary and MFA proof may occur in either
  order, both no later than issuance. It also adds a constrained OIDC `return_action`
  (`password` default, or `mfa`), preserving existing transactions. Migrations 0001–0012
  remain unchanged. No remote database has received these local changes.
- Account Security uses compact enabled/disabled rows, inline forms, explicit disable
  confirmation and saved-code acknowledgment, primary reauthentication assistance,
  action switching, focus and input clearing. Expired/uncertain requests never claim
  success or automatically retry. Raw codes remain memory-only and user-selectable.
- Enable/disable/regenerate notifications extend the existing guarded security-mail
  path only after successful commits. They contain no action secrets and use the same
  allowlist, sender, atomic 60-attempt UTC-day allowance/provider limits and no retries.
  Sanitized failure logging never reverses a completed security change; no outbox.
- Focused workerd tests cover account preservation for password-only, Google-only and
  combined accounts, code/TOTP replay, interruptions, concurrent acknowledgment,
  rollback, generation races, missing keys, CSRF, notifications and unchanged auth.
  Browser fixtures cover compact rows, switching, acknowledgment, input clearing,
  reauthentication assistance, focus and mobile overflow. Live authenticator,
  hosted management and integrated CPU/reliability remain unverified.
- Verification: 245 distinct targeted authentication/security tests passed across
  the management and regression batches, including guarded mail/budget handling,
  registration/verification/recovery, RBAC and the shared-IP login scenario. Strict
  TypeScript, default/hosted-DEV builds and local Worker packaging passed. Unrelated
  event/news/DNS suites were omitted; no live accounts, emails or remote tests were used.

Next approvals after the authorized Phase 3.8.5 local review: recovery and
pre-mutation freshness decisions and hosted-gating/manual acceptance; separately any
push/DEV deployment, fresh DEV recovery/migration 0013, independent backed-up MFA
keys, and hosted enrollment/controlled account and email tests. No PROD rollout.

## Owner-approved no-regeneration-timer correction (2026-10-24)

Issue #10 comment 6384552935 authorizes local implementation/testing and eventual
DEV publication, with a separate explicit gate for remote migration 0015. The
no-timer decision in comment 6382704846 supersedes earlier 600-second regeneration
proposals; it does not change login/enrollment/disable expiry or proof freshness.

Migration 0015 adds `auth_mfa_regeneration_operations` only. It has no operation
expiry or plaintext/ciphertext storage. It binds one pending operation per account
to its original session, generation, factor and active set. Normal session expiry,
revocation and account/factor changes still invalidate authority. New authorized
starts abandon the preceding pending operation; terminal rows are pruned in bounded
batches. No age-based cancellation, lease renewal or scheduled infrastructure exists.

The state machine is prepared -> revealed -> activated, or cancelled. Preparation
requires current primary authentication and an existing MFA session. Actual MFA
proof is purpose-bound and required before reveal. Reveal atomically claims its
single response, inserts ten verifiers and returns plaintext only after the batch
commits. A lost response cannot re-reveal. Codes stay in current-view memory only;
selection, blur, switching apps and waiting never hide them. Copy is user-triggered.
Explicit saved acknowledgment and activation retain fresh primary and MFA proof
(strictly less than 120 seconds at the DB-clock write boundary). Stale proof prompts
real reauthentication without replacing the displayed pending set. Timestamps are
never refreshed merely because a receipt or codes were read.

Password confirmation uses the existing verifier/limiter. Google confirmation opens
a user-requested separate tab using the existing subject/state/nonce/PKCE flow. The
original view sends no code or regeneration receipt to it; Continue securely asks
the server about proof on the exact original session. A changed account/session is
not silently adopted. Actual new TOTP/recovery proof refreshes only the operation's
proof record, not ordinary session assurance. Final session replacement records the
actual new primary/MFA evidence after the atomic set switch and generation change.

Refresh, original-view navigation, pagehide, bfcache restoration, explicit cancellation
and session-invalid responses discard plaintext and receipts. Cancellation on leave
is best-effort; browser close cannot guarantee remote cleanup. Server authority still
requires the original live session and fresh proof; one-time reveal prevents a second
display. An in-flight activation is never automatically replayed. An uncertain result
blocks another activation until an explicit operation-status check; a confirmed
activation can be recognized using the receipt under the authenticated next generation.

The old set stays active until activation, except any code spent as legitimate proof.
Cancellation/revocation cleanup deletes only inactive staged verifiers. A last code
spent as proof is never refunded; restricted lost-authenticator replacement keeps its
separate existing policy. Exactly the winning activation invokes the existing budgeted,
allowlisted security notification; delivery failure does not reverse the committed set.

Remote migration, publication/deployment and hosted recovery acceptance remain distinct
states. No hosted recovery result is established by this local implementation. Do not
roll back to pre-MFA authentication after enrollment or replace encryption keys.
