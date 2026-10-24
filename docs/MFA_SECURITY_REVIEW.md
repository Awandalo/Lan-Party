# Phase 3.8.5 — local security regression and DEV acceptance preparation

## Phase 3.8.6 clean integration / hosted-recovery preparation — 2026-10-22

Owner directly authorized local integration/testing only. The isolated candidate's
detached base is current remote dev `30a290dda147a92ab519d8c1c69a4846b6a8e090`.
Reviewed MFA application/dependency/migration/test deltas through R3 `d330e66` were
applied without merging divergent histories. Remote governance, communication,
monitor, workflow and release files remain unchanged. No commit/push, remote
migration, secret/key change, hosted account operation or deployment occurred.

The owner confirms Q reviewed R2-F1 corrective evidence and accepted R3 at the
static level. Earlier reported 127 tests were TechDevie's executions, not Q reruns.
R1-F1 static acceptance remains recorded on #13. This new candidate and hosted
recovery extension require independent review; #9/#10/#14/#15 remain open.

Restricted recovery now uses the shared canonical DEV gate in its handler,
availability hint, Google initiation and Google callback. Its HTTP crypto context
matches the eligible environment (`dev` or retained local loopback `local`). No R1
deadlines, proof/CSRF checks, atomic reservations/writes, replay rules, generation
fences, account-access restrictions or schema/key formats were relaxed.

Browser-specific boundary: only a state/browser-bound validated Google callback
can accept cross-site GET navigation metadata to the exact callback path, requiring
navigate/document when cross-site metadata is present. Mutations remain same-origin.
Origin/forwarded/header/build/hostname/key gates remain in force. Tests reject wrong
provider subject, callback replay, cors/empty metadata and spoofed forwarded/origin
headers. This is not proof of real hosted Google/Cloudflare header behavior.

Executed on this integrated candidate: **330 tests passed**. The broad affected
27-file authentication suite passed 329/329, including 12 environment/recovery tests;
the separate exact-published-Worker compatibility test passed 1/1. Coverage includes
existing R1/R2 races, rollback, expiry, lost responses, authentication generation,
primary/MFA freshness, normal login, Google, registration/verification/reset,
authorization, conditional challenge, email budgets/templates/Resend runtime and
UI gating. Unrelated event/news/reference-data/DNS suites were intentionally omitted.

New DEV tests demonstrate last-code replacement, DEV-bound encryption (local AAD
rejected), old factor/set invalidation, exactly ten fresh codes, bounded same-set
redisplay/replay rejection, ACK erasure, no restricted-to-normal session promotion,
fresh normal login using a newly issued recovery code, stale-primary refresh without
deadline extension, and Google-only lost-start bootstrap through Secure HttpOnly
Lax cookies. The default/wrong-build/alias/PROD/configuration matrix denies all eight
restricted routes. The original core R1 adversarial suite also passed unchanged.

The compatibility fixture loads every Worker source from immutable remote dev
using read-only Git object access. With a fictional verified account created before
0013/0014, both migrations preserve users, credentials/providers, nickname, member
ledger/sequence, email budgets and rate-limit rows; original-code login/session,
zero-factor state, foreign keys and quick_check pass afterward. It uses disposable
local D1 only and is not approval to migrate a live database or roll back enrolled MFA.

Strict TypeScript, default and hosted-DEV Vite builds, actual Wrangler DEV dry-run
packaging and whitespace checks passed. Existing installed dependencies were reused
through a local node_modules junction; package/lockfile contents match the reviewed
source. No dependency was installed or upgraded. Local browser fixtures show explicit
backend approval enables setup, denial hides controls, and outage offers safe sign-in
feedback, all with zero mutations. No remote provider, real account or email was used.

Initial new test failures were fixture defects: simulated future proof conflicted
with SQLite's real-clock session guard; Miniflare rewrote navigation mode to cors;
the compatibility snapshot used the wrong email-budget table name. Corrected only
the fixtures and reran the affected tests, then the broad affected suite passed.
The test transport alone restores explicit fictional Host/navigation headers;
production does not trust fixture headers. Temporary fictional diagnostics were
removed. No outstanding failure or hidden skip is claimed.

Remaining gates: independent exact-candidate review; fresh live Worker/routes/D1
UUID/EU jurisdiction and schema/history/key-presence checks; approved 0013/0014
application with a fresh private checkpoint; separately approved backed-up DEV
keys; approved commit/publication and automatic deployment; separately scoped
hosted browser/account/email acceptance. CI and deploy remain independent workflows,
so the exact candidate's required tests must pass before an approved dev push.
After enrollment, any fallback must retain MFA enforcement and decryptability;
never automatically restore D1 or roll back to pre-MFA code. The build marker is
configured target identity, not runtime attestation. Event registration remains
unimplemented and is a separately authorized milestone, not part of this candidate.

## R3 local eligibility implementation — 2026-10-22

Publication addendum: the owner subsequently authorized committing the 16 R3 files
and publishing them on a separate review branch. The implementation/evidence below
records the pre-publication state; remote dev/main publication and hosted activation
remain unauthorized. Review R3 against the exact R2-F1 base, not as a wholesale
integration of the branch's inherited history.

Issue #15's bounded local implementation was explicitly authorized in Codex. The
current base is R2-F1 `ea8d7762515aa38c9c893fcf632c829c666d5e04`; R3 is uncommitted
and unstaged. The remote review base is 16 ahead/6 behind remote dev, with 57 changed
files in that comparison, so it is not a wholesale integration candidate. Remote dev
remains `30a290dda147a92ab519d8c1c69a4846b6a8e090`. Unrelated governance/monitor/DNS work
is preserved. No remote configuration, account, migration, activation or deployment
was performed.

The fail-closed management gate and exact configuration/host matrix are documented
in `MFA_DESIGN.md`. The DEV-only build marker is independent of request headers and
runtime flags; default/mismatched bundles deny all nine management routes even with
otherwise DEV runtime settings. It does not intrinsically attest the actual Worker
or bound database: trusted deployment configuration must be checked again at #10.
R1 restricted replacement remains local-only and is an explicit hosted-rollout gap,
not silently enabled by this R3 change.

Verification: **127 affected tests passed** (119 existing Google/MFA/R1/R2, plus eight
R3 tests containing the host/configuration/build matrices). The strengthened exact
Wrangler database-name check passed again. TypeScript, default/hosted-DEV Vite builds,
and actual `wrangler deploy --dry-run --env dev` packaging passed. Packaging names
the DEV D1 binding and embeds the expected marker; it does not attest remote routing.
No migration changed; no separate migration/integrity suite was rerun. Broader shared
authentication regressions were run because route eligibility and crypto context
cross security boundaries. Unrelated event/news/DNS suites were omitted.

R3 tests cover missing/wrong build identity, all DEV prerequisites, key availability,
default/PROD config, alias/preview/protocol/port/forwarded-header rejection, compiled
frontend flags, malformed/unavailable backend confirmation, every protected route,
canonical DEV enrollment → password/Google MFA login → step-up → disable with DEV
ciphertext, pending-session denial and CSRF. Default/mismatched builds still require
and complete password/Google MFA login while refusing management. Provider requests
are intercepted and emails fictional; no external send takes place.

Initial fixture failures were corrected: the installed TypeScript API did not expose
the attempted JSONC parser (the test now uses Wrangler's own read-only parser); the
fixture omitted its worker-local password and required hosted Turnstile bindings;
Miniflare rewrites Host to its internal loopback listener even for synthetic HTTPS
URLs. Test-only transport normalization restores the explicitly supplied fixture
Host, preserving forged-host negative cases. Application guards were not weakened.
Final runs have no outstanding failure.

Actual local browser fixture: backend denial shows factor status but no setup,
management or step-up controls; explicit backend approval shows setup; outages show
unavailable feedback; all cases record zero mutations. Fixture:
`worker/tests/fixtures/mfa-environment-ui.html`. This is not real hosted routing,
Google/Resend/Turnstile acceptance or remote-account testing. Exact live binding,
route, migration/key readiness, release integration and real-browser acceptance
remain separately authorized #10 work. Q independent review remains required.

## R2-F1 — Q review follow-up, 2026-10-22

Owner authorization is recorded in #14 comment `6349210582` and confirmed in Codex.
This correction is for isolated review publication only. Remote dev/main, migrations,
configuration, hosted MFA and deployment remain unchanged and separately gated.

1. **Fixed — atomic primary proof.** OAuth linking now checks the exact primary
   method/timestamp and user/session/generation inside its D1 batch. The database
   clock checks future timestamps, expiry and Google's stricter 120-second window.
   A regression leaves the proof record unchanged and waits for the actual database
   clock to cross the boundary after precheck, before executing the write. Separate
   tests change proof age/method/generation and retain independently fresh MFA.
2. **Confirmed — local D1 atomicity.** The matrix below exercises the actual local
   workerd/D1 batch and its `changes()` assertions. No database migration changed.
3. **Fixed UX / known limitation — lost response.** An uncertain response disables
   the form and offers a normal-login link, with no automatic retry. Discarding a
   successful response still revokes the old session and spends a recovery code;
   this security tradeoff remains. A runtime test completes normal password + TOTP
   login afterwards, verifies the code stays spent and credentials remain intact.
4. **Fixed cleanup / confirmed — stale callback.** Only the callback that claimed a
   link can consume its failed exchange, erase verifier/nonce and expire the OAuth
   cookie. Stale-MFA/primary redirects keep the existing valid session, grant no new
   authentication and cannot link on replay. A return-page hint never restarts OAuth.
5. **Known release gate.** The review branch includes divergent prerequisite history
   and is not a wholesale merge candidate for remote dev. A remote-dev-based release
   candidate, complete publication review and rollout approval remain separate work.

| Failure / binding point | Local runtime evidence |
| --- | --- |
| Lease expired before proof | `step-up preserves CSRF/origin, rejects invalid code and an expired lease without spending recovery proof`: no proof consumed or source revoked |
| First insert: `auth_sessions` | `each session insert failure ...`: injected SQL ABORT and zero-row IGNORE each roll back code consumption/source revocation |
| Second insert: `auth_session_mfa` | Same test, both failure modes; new session rolls back and original session/assurance remain |
| Third insert: `auth_recent_authentication` | Same test, both failure modes; new session/assurance roll back and original recent-primary row remains |
| Concurrent TOTP / recovery step-ups | One winner per source session; consumed proof cannot replay on the replacement session |
| Replacement proof binding | Exact replacement digest/user/generation/method/original primary time/expiry checked; MFA row joins the new session and original factor |
| Lost entire step-up response | Old cookie rejected; repeated old-source request is `401 session_required`; code stays spent; normal primary + TOTP login succeeds |
| Stale linking callbacks | No provider/generation mutation; consumed exchange, erased verifier/nonce, expired cookie and callback replay rejection verified |

Focused verification: 53 Google/R2 tests passed (36 Google and 17 R2), plus three
affected Google/R1 recovery tests. The expanded replacement-binding test passed
again after adding its assertions. Existing unaffected evidence is retained below;
there is no claim that all suites were rerun. Strict TypeScript and default and
hosted-DEV builds pass. No new failing check was encountered in this correction.

Browser evidence uses intercepted fictional responses: stale-MFA return performs
zero link requests before and after explicit step-up; uncertain submission sends
one step-up request, disables retry, clears the code and offers normal login; the
link reaches the fictional login destination. Stale-primary return shows feedback
with zero OAuth starts. The reproducible fixture is
`worker/tests/fixtures/mfa-assurance-ui.html` (serve with local Vite). This is separate
from real hosted Google/D1/Turnstile acceptance, which was not run. Unchanged schema/
integrity and unrelated suites were omitted under targeted-testing policy.

## R2 local implementation — 2026-10-22

Issue #14's owner-authorized correction adds strict two-minute LAN Party MFA guards
to password add/change and Google link/unlink, including the actual D1 write.
Expired proof returns a focused step-up without a credential mutation. Explicit
local-only TOTP/recovery step-up rotates the source session atomically and preserves
the original primary proof time. See `MFA_DESIGN.md` for the current model.

The historical R2 findings below describe the pre-fix code. Local implementation
does not constitute independent security acceptance or hosted validation; #14/#9
remain open. No migration, remote account, secret or deployment was changed.

Verification: 116 distinct affected MFA/Google/recovery tests passed across targeted
batches (102 existing and 14 new R2 tests). The first combined run exposed two
historical gap expectations and one invalid fixture expiry; those were corrected
and affected tests rerun. A later Turnstile fixture used a too-short fictional
secret; its correction and challenge/replay regression passed. No outstanding
test failure remains. Strict TypeScript and default/hosted-DEV Vite builds passed.
Workerd fixtures cover all four writes, expiry between precheck and write, session/
generation fencing, TOTP concurrency/replay, recovery rollback/lease failure,
primary-proof age preservation, CSRF/origin and conditional single-use Turnstile.
The browser fixture uses intercepted fictional responses: no prompt/mutation on
load, explicit step-up success/failure, no automatic mutation retry, cleared input,
keyboard focus and a 375px layout without horizontal overflow. This is not hosted
browser/D1 acceptance or real Google/Turnstile/email testing. Unrelated suites and
standalone migration/integrity reruns were omitted because schema is unchanged.

R1 follow-up: issue #13's owner-approved Option B is now implemented locally with
additive migration 0014; see `MFA_DESIGN.md` for its exact state/expiry/crypto model.
The historical findings below remain evidence for the pre-fix ordinary-login path.
R1 stays open for independent review; R2 freshness, R3 hosted gating and #10 rollout
remain unresolved/separately gated. No remote migration, activation or push occurred.

R1-F1 local correction (issue #13, owner approval 2026-10-20): successful status
now restores only the existing validated recovery/browser binding as HttpOnly
SameSite=Lax cookies. Initial, expired, cancelled and foreign contexts do not
bootstrap cookies. Pending-cookie lifetime ends at the fixed recovery deadline
plus the possible 300-second display window; committed-cookie lifetime ends at
the actual fixed display deadline. Status/repeated start cannot slide deadlines,
redeem another code, create an operation or issue an ordinary session. Original
R1 commit `9d66b17` is preserved; correction requires independent review.

Regression first failed against the original code (no status Set-Cookie), then
passed after correction. Four added tests cover complete start-response loss,
status-only resume, Google-only signed callback and replay, original-cookie expiry,
foreign/old/cancelled contexts, fixed expiry and unchanged code counts. The local
workerd tests use a cookie-selection model enforcing Strict/Lax, safe top-level
navigation and Max-Age rules; this is not actual Chromium or hosted Google
acceptance. If original cookies expire before bootstrap and no recovery cookies
were received, status still fails closed with the existing sanitized unavailable
response (503). No browser proof is weakened to recover that lost context.

R1-F1 verification: 102 affected recovery/MFA/Google tests passed (including the
four new regressions), strict TypeScript, default/hosted-DEV Vite builds and Worker
dry-run packaging passed. An initial Wrangler log-path permission warning was
resolved for the local dry-run; no deployment occurred. Existing unrelated tests
and migrations were not changed; full unrelated suites/live services were omitted.

R1 local evidence: 239 distinct automated tests passed across affected-area batches,
including 24 new recovery tests. The initial migration-history fixture omission and
synthetic-clock/redirect fixture issues were corrected and affected checks rerun;
no outstanding failure remains. Strict TypeScript, default/hosted-DEV Vite builds,
Wrangler local dry-run packaging and diff checks passed. Browser checks used a
fictional intercepted transport: no mutation on load, explicit start/setup/switch/
reveal/ACK, cleared setup, accessible labeled controls and a 375px constrained layout
without horizontal content overflow. This is not an integrated hosted browser/D1
acceptance or screen-reader certification. Unchanged event/news/seed/DNS suites and
live accounts/email/Google/Turnstile tests were intentionally omitted. Existing
Google/MFA regression-file working changes were exercised but preserved outside R1.

Review date: 2026-10-20. Assignment: [issue #9](https://github.com/Awandalo/Lan-Party/issues/9).
**Local regression passed with policy/rollout blockers; hosted acceptance is pending.**
No application security policy, migration, deployment configuration or remote data
was changed by this review. Optional MFA still applies equally to every role.

Roadmap disposition: parent [#9](https://github.com/Awandalo/Lan-Party/issues/9)
remains open; R1, R2 and R3 are pending **3.8.5.1 [#13](https://github.com/Awandalo/Lan-Party/issues/13)**,
**3.8.5.2 [#14](https://github.com/Awandalo/Lan-Party/issues/14)** and
**3.8.5.3 [#15](https://github.com/Awandalo/Lan-Party/issues/15)**. These preparing
issues do not authorize implementation. **3.8.6 [#10](https://github.com/Awandalo/Lan-Party/issues/10)**
is the separately gated hosted DEV rollout. Later 3.9 lifecycle / 3.10 polish are
planning-only; see [the forward roadmap](../PROJECT.md#current-phase-3-sequence-and-status).

## Traceability and scope

The tracked tree was clean on `dev` at review start, apart from the four explicitly
excluded untracked DNS files. Verified these local ancestors in order:

| Commit | Scope |
| --- | --- |
| `3f8cfb7466a67d5243570267b278ebe53c422839` | MFA foundations/enrollment |
| `d38a5357154463b4b1e08e637936e285fb8fb5d8` | Shared login/enrollment integration |
| `94830cb137eb26474e4108f63eaec696cb3fc829` | Management/recovery |
| `a9568d53fe7ac42133e8205ed87711b95a41ecd8` | Unrelated accepted notification monitor |

Migration `0013_create_account_mfa.sql` SHA-256:
`486842dd9f81b5bf9a15873b2dffe0822d3efbe97e7074100f03b758b96c7dde`.
It adds four STRICT tables, proof/phase/identity/replay constraints, indexes and
generation revocation, plus the fixed OIDC `return_action` column. It enrolls no
accounts. Migrations 0001–0012 are unchanged relative to pre-MFA `80b649f`.
No remote migration history or account data was queried in this assignment.

Reviewed issuance/resolution, password/Google entrypoints, enrollment/management,
crypto/key handling, rate limits, frontend challenge/setup/management state and
the schema against `MFA_DESIGN.md`. Ordinary issuance rejects enabled factors;
resolution independently requires matching account generation/factor assurance.
Password and Google complete through the same pending gate. Provider `amr`/`acr`
claims do not satisfy LAN Party MFA. A pending context is not a normal session.

## Test matrix

All PASS rows below refer to local fictional workerd/D1 or intercepted frontend
fixtures, not hosted acceptance or a claim of exhaustive security assurance.

| Area | Result | Evidence |
| --- | --- | --- |
| Password, Google-only/combined login and provider MFA claims | PASS | `mfa.test.mjs`, `google.test.mjs`; primary success remains pending |
| Session issuance/resolution, stale/revoked/generation/factor mismatch | PASS | MFA, auth database, foundation and login suites; unassured sessions rejected |
| Pending context restrictions and supersession | PASS | Added session/status/enrollment/management/logout denial and supersession regression |
| Fresh session transfer after linking/password setup | PASS for existing policy | Exact next generation; original proof timestamps retained; stale transfer requires new challenge |
| RFC TOTP, six digits, 30 seconds, ±1 step, replay and concurrency | PASS | Existing independent RFC expected values plus CAS/rollback tests |
| AES-GCM key/context/tamper failures and rotation key IDs | PASS | Wrong/missing key, changed environment/user/purpose/ID fail closed |
| Ten recovery codes, one-time display, set/user binding, concurrent redemption | PASS | Context-bound verifiers; failed atomic batches preserve proof/session state |
| Enrollment expiry/cancel/lost display/acknowledgment race | PASS | No implicit activation; generation/session/browser bound |
| Disable/regenerate, explicit confirmation and fresh purpose-bound proof | PASS | Two-minute primary/proof guards; single acknowledgment winner; injected failure rollback |
| Interrupted regeneration preserves active set | PASS with recovery caveat | Spent proof stays spent; last-code case reproduced below |
| Account/UUID/member/credentials/providers/roles preservation | PASS | Populated migration/management tests and existing RBAC regressions |
| Password reset and change preserve MFA | PASS with freshness caveat | Reset invalidates sessions/pending state; next login still requires MFA |
| Challenge/user+IP/account limits, lease expiry and Turnstile | PASS | Correct fifth attempt after four failures; pending checks are not confirmed failures; shared-IP regression retained |
| Non-MFA registration/login/verification/recovery and last-method protection | PASS | Broader auth/security batch, including existing 100-user shared-IP tests |
| Notifications/budgets/sanitized failures | PASS | Intercepted transport only, post-commit notices, shared limits/no retry |
| Local browser challenge UX | PASS | Invalid code, cleared input, recovery switching/focus, refresh, cancel, expiry and uncertain network feedback |
| Real authenticator, hosted Google/password+MFA, mail delivery | NOT RUN | Requires separate approved hosted rollout/test |
| Production/recovery restore/integrated platform CPU | NOT RUN | Outside scope; no Free CPU-headroom claim |

The broad batch passed **277 tests**. One later added password-change policy test
and affected Google/MFA tests passed separately: **278 distinct tests covered**.
No failing test was concealed; tests documenting current policy are not assertions
that the policy discrepancy is resolved. No application-runtime fix was made.

Reproduction commands (PowerShell; existing dependencies only):

```powershell
$reviewTests = Get-ChildItem worker/tests -Filter '*.test.mjs' |
  Where-Object { $_.Name -notin @('event-structure.test.mjs', 'news-articles.test.mjs', 'registrations.test.mjs', 'reference-data.test.mjs') } |
  ForEach-Object FullName
node --test --test-concurrency=2 @reviewTests
node --test --test-name-pattern='Google-only and combined accounts share MFA|password changes retain MFA|expired MFA assurance|last recovery code' worker/tests/google.test.mjs worker/tests/mfa.test.mjs
npm run typecheck
npx vite build --outDir .wrangler/mfa-phase385/default-build
$env:VITE_AUTH_MODE = 'hosted-dev'
npx vite build --outDir .wrangler/mfa-phase385/hosted-dev-build
Remove-Item Env:VITE_AUTH_MODE
git diff --check
```

Strict TypeScript and both builds passed. Unrelated event/news/registration-schema
and seed suites were omitted; no files in those areas changed. The auth tests
apply migrations to disposable local D1, including populated-0012 compatibility,
foreign-key checking and `quick_check`. No unrelated remote checks were repeated.
Build output and sanitized test logs remain ignored under `.wrangler/mfa-phase385/`.
The browser fixture uses the real challenge component with intercepted responses,
not an integrated browser-to-D1 end-to-end claim. Existing unchanged enrollment/
management/mobile evidence from 3.8.3–4 is reused; no new screen-reader or mobile
device certification is claimed. The temporary Vite server was stopped afterward.

## Findings and required owner decisions

### R1 — last-code recovery dead end (availability: medium)

Reproduced with fictional accounts:

1. Nine codes already spent; the tenth completes login. Management then requires a
   distinct unused proof. The last code cannot be replayed, and no codes remain.
2. An already authenticated owner spends the last code to stage regeneration, then
   loses the one-time display/acknowledgment. Cancellation retains the old active
   set, but its last code is spent. The unacknowledged new set cannot authenticate.

Both fail closed. With a lost authenticator there is no usable self-service factor;
password reset/email possession cannot repair this. No silent policy relaxation.

Options for owner approval:

- **Keep distinct proofs:** minimal code change, but explicit warnings and early
  regeneration guidance are needed; loss/exhaustion remains unrecoverable through
  self-service. Warning alone cannot repair an already exhausted account.
- **Recommended functional follow-up:** a narrowly scoped recovery continuation
  after primary authentication plus one recovery redemption. Bind a short-lived,
  one-time server capability to the exact session/generation/factor and selected
  management purpose, require explicit confirmation, and never extend its life or
  replace it with inbox/session-only proof. This intentionally relaxes distinct
  login/management codes. Lost display/acknowledgment recovery must be designed
  explicitly; a single-use continuation alone does not solve interrupted issuance.
- **Allow saved-code acknowledgment after lost display:** would need securely
  recoverable staged codes or another deliberate restart/confirmation policy. That
  changes the current hash-only/one-time-display model; not a small automatic fix.

Choose the strict warning-only policy or approve a scoped continuation design
before hosted enrollment. No email/support/Google-only MFA bypass is proposed.
[OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
emphasizes securing recovery and factor changes against session-only takeover.

### R2 — account-change freshness differs from the design (security/policy: medium)

`MFA_DESIGN.md` calls for fresh MFA before linked-method/password changes. Current
`google.ts` permits some mutations on an already MFA-authenticated session after
fresh primary proof; stale MFA triggers a new challenge for a replacement session
instead of preventing the preceding mutation. The existing stale first-password
test deliberately codifies this Phase 3.8.4 behavior. The added regression also
reproduces password change with MFA proof older than 120 seconds: password changes,
old sessions revoke, factor/recovery set remain, and subsequent login requires MFA.
This is not a demonstrated primary-only login bypass, but it does not meet the
stricter pre-mutation freshness statement.

Recommend enforcing the original policy: recent MFA must be checked **before and
inside** guarded password/add/link/unlink writes. Add a fixed, purpose/session-bound
step-up or require a new full primary+MFA login; primary reauthentication alone must
not refresh MFA time. Owner must confirm this behavior/UX versus explicitly accepting
the documented weaker mutation policy. Do not silently replace the existing tested
policy during this review. Treat this as a gate before hosted enrollment.

### R3 — hosted enrollment/management is deliberately absent (rollout blocker)

`mfa-http.ts` permits enrollment/management only on literal loopback with
`AUTH_SESSION_MODE=local-only` and local transport. Frontend enrollment additionally
requires Vite development mode and loopback. Provisioning keys/migration and pushing
the current code cannot enable hosted enrollment. A separately approved, narrowly
DEV/canonical-origin-gated implementation and tests are needed; do not weaken these
guards or pretend a dashboard variable already exists for activation.

## Approval-gated DEV sequence (not executed)

1. Resolve R1/R2 and approve any small follow-up implementation. Review exact code,
   lockfile and migration hash; do not push the unreviewed local commit chain.
2. Separately authorize fresh DEV-only identity/schema/history/integrity preflight:
   Worker/database `lan-party-dev`, UUID `a3c4cea6-ceb7-43b8-b9b7-b374726b35b4`, EU,
   canonical origin `https://dev.lan-party.club`. Confirm only 0013 is pending and no
   manually enrolled factors or conflicting schema. Stop on any discrepancy.
3. Immediately before authorized migration, capture a fresh private Time Travel
   bookmark, privately record the exact DEV recovery command and verify availability.
   Cloudflare documents `wrangler d1 time-travel info <database>` and destructive
   restore; confirm installed EU/environment flags before execution. Free retention
   is documented as seven days, so retain an owner-approved encrypted backup where
   longer coverage is required. Never publish bookmarks or database contents.
4. With separate approval, apply only 0013 through the established DEV workflow.
   Verify history, expected tables/constraints/return column, preserved accounts/
   credentials/providers/member/RBAC records, foreign keys and supported health
   checks. Stop on failure, no automatic restore.
5. Separately authorize independent random AES-256 keys. Privately back up
   `MFA_ENCRYPTION_KEYS` and set `MFA_ACTIVE_KEY_ID`; neither belongs in Git/frontend.
   Preserve pepper/rate-limit/Google/Resend keys. Validate key IDs and fail-closed
   behavior without printing values. Rotation retains old+new keys until all rows
   and recovery windows are covered; re-encryption requires another approved task.
6. Separately approve push/automatic DEV deployment of reviewed MFA-aware code,
   with new enrollment still off. Verify exact-SHA CI, active version, secret names,
   canonical/secondary hostname restrictions, no-MFA login and health. No manual
   deployment is authorized by this document.
7. Separately approve R3 hosted gating/enrollment activation and controlled account/
   email testing. Check real authenticator interoperability, password and Google
   login, pending-only denial, recovery, session revocation and notifications. Use
   approved disposable participants; avoid exhausted counters or unnecessary mail.
8. Collect integrated private-Worker invocation outcomes/CPU/wall-time for complete
   password+MFA and Google+MFA requests under separately approved controlled testing.
   Do not equate local elapsed test time with platform CPU or restart hash benchmarks.

Recovery reference: [Cloudflare Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).
Once any factor is enrolled, **never roll back to pre-MFA code**. Keep an MFA-aware
last-known-good release; disable new enrollment while preserving challenge gates,
or fail affected authentication closed and fix forward. Worker rollback does not
undo D1. Restore only with explicit approval and data/key-window impact review;
never automatically erase factors or restore over newer participant activity.

No DEV acceptance, production readiness, external penetration test or Free-tier
CPU suitability is claimed by these local results.

## Local no-timer regeneration correction — 2026-10-24

Authorized by issue #10 comment 6384552935 and the owner's direct Codex approval.
Design source: owner decision 6382704846 and accepted plan 6382757425. This is local
implementation/verification evidence, not independent review or hosted acceptance.

Migration 0015 and the dedicated regeneration service separate operation lifetime
from strict proof freshness. No operation deadline is stored. Server-atomic explicit
reveal returns plaintext once, with verifiers only in storage; activation retains
DB-clock primary/MFA freshness, exact session/generation/factor binding and one-winner
set/session mutation. Original login/enrollment/disable and restricted replacement
expiry policies remain intact. Incorrect MFA proof does not clear the revealed view;
only an actual session-required response invokes session-loss handling. Encryption
key availability is checked before reveal and activation. Uncertain reveal is not
resubmitted; uncertain activation requires explicit read-only status inspection.

Changed-area coverage comprises 104 distinct test cases across executed batches and
targeted correction reruns: 45 MFA, 18 assurance/Google, 12 environment, 28 restricted
recovery, 1 historical rollout compatibility. All observed failures were resolved:
the MFA fixture needed migrations 0014/0015; Google was enabled only in its new
reauthentication scenario; compatibility now expects 15 migrations; session expiry
is seeded without mutating immutable assurance. Failed preliminary fixture runs are
not presented as green. No tests skipped, softened, or retried without a correction.

Actual local browser checks used MfaRegeneration with entirely fictional intercepted
transports: explicit hidden-until-reveal, selection/manual copy, denied clipboard,
controlled one-day clock advancement without hiding codes, stale proof and incorrect
code retaining the same list, continuation, unmount/return abandonment, and uncertain
reveal/activation without resubmission. The browser Google-tab API was intercepted;
it is not a real OAuth acceptance result. Separately, workerd tests validate signed
Google reauthentication, wrong-subject rejection, unchanged original session and
same-set activation. Real provider/tab behavior remains owner-hosted acceptance.
Strict TypeScript and hosted-DEV/default builds passed. Full unrelated local suites
were omitted; normal full CI remains a publication prerequisite.

Limits: browser close cancellation is best-effort; session validity and fresh proof
remain server requirements. Clipboard/OS history and owner-saved copies cannot be
wiped by the application. Last recovery proof remains consumed on abandonment.
The additive remote migration needs its own exact-target approval/checkpoint before
publication. No remote schema, deployment, secrets, accounts, recovery codes, emails
or PROD state changed during this implementation. Existing passed hosted enrollment
and password/Google TOTP evidence is retained; recovery Gate T remains paused.

A different live session, even for the same account, cannot adopt a pending reveal.
An explicit terminal response clears the old view and refreshes account context;
wrong MFA codes remain ordinary proof failures and do not discard the displayed set.

## Hosted regeneration failure and local UI correction — 2026-10-24

Issue #10 comment 6387546649 records the owner's failed hosted attempt and full
Gate T stop. This supersedes the GO-to-test handoff at 6385491838. Published
7b1c17b's 411 passing CI tests/deployment health remain evidence for that revision,
not hosted recovery acceptance. No new codes were reported revealed or activated;
UI cancellation text is not independent evidence of the remote database state.

Reproduced with fictional local integrated MfaManagement/MfaRegeneration state:
1. Start with stale primary proof returns 428 before an operation token exists.
   Successful inline password confirmation hid the only panel because visibility
   depended on operation-or-primaryRequired, leaving no explicit continuation.
2. Regeneration was marked active only after a successful start. While still at
   the initial primary prompt, Disable remained selectable and could open the old
   management confirmation alongside the regeneration prompt. Existing standalone
   regeneration coverage did not exercise this parent/child interaction.
3. The new form lacked the fieldset used by Account Security's input styles,
   causing the narrow default input and uneven controls.

The local correction tracks the engaged workflow from its first click through
cancel/success, independently of receipt creation. Password confirmation retains
one panel and offers explicit Continue to authenticator; Google continuation also
works before token creation. Both request the normal guarded start, without an
automatic mutation retry. Actual operation-bound MFA proof still enables Reveal;
no browser state substitutes for server authorization. Competing management is
unavailable during regeneration, and the old panel/focus handler cannot compete.
Dedicated component CSS/fieldset styling provides full-width labeled controls,
step headings and loading/disabled feedback, with shorter instructions.

Verification: 13 targeted regeneration tests passed, including a new workerd test
showing that regeneration proof does not refresh ordinary MFA assurance or permit
an unrelated Google disconnection. Strict TypeScript and hosted-DEV build passed.
Actual fictional integrated-browser checks reproduced the original two defects,
then passed password/Google initial continuation, wrong-code/Reveal gating,
cancel/restart, one-panel enforcement, same-set stale-proof continuation, explicit
activation, clipboard-denial fallback, uncertain reveal/activation and status-only
recovery. A 360px fixture container had one panel, a 240px input and no panel
horizontal overflow. This is narrow-container evidence, not a real mobile-device
or live Google/clipboard-provider acceptance result. The actual AccountSecurity,
AuthProvider and MfaSettings tree also passed: switching from password settings
clears the old form, primary/MFA confirmation reaches enabled Reveal, and switching
to another account action clears the code view with one confirmation panel.
No unrelated local suites or
remote database checks were repeated; no worker, schema, key or provider changes.

No confirmed authorization crossover was found in the scoped local paths. Existing
codes legitimately spent as proof remain spent; the owner's actual remote state
was not inspected or changed. Keep Gate T blocked until exact-diff review, separate
owner publication approval, green CI/DEV verification and renewed hosted-test
approval. This local correction has not been committed, pushed or deployed.
