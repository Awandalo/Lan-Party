# TODO / To remember

These notes record requested future work. They do not authorize backend,
authentication, storage, or production changes now. See AGENTS.md and PROJECT.md.
`PROJECT.md` defines the current numbered roadmap: Phase 3 authentication/accounts,
Phase 4 administration, Phase 5 events, and Phase 6 News/community.
Phase 3.9 DEV account lifecycle is owner-accepted; reactivation acceptance remains
deferred until the end of Phase 4 Administration with two disposable accounts.
Phase 3.10 is the approved account-polish work; Phase 5 Events follows Administration.
Hosted DEV password authentication, email verification/recovery and optional MFA
are available; PROD activation remains separately gated.
Use the [environment reference in PROJECT.md](PROJECT.md#environment-reference)
for DEV/PROD mappings and website URLs. Cloudflare Git integration handles PROD
deployment from `main`; no local GitHub Actions production deployment workflow is
assumed. Worker deployment and D1 migrations remain separate operations, and
production migrations still require separate explicit owner approval.
Keep additional feature ideas in the unnumbered backlog below until separately
approved. Plan their database needs now; implement migrations with their functionality.

## Phase 2 Database Foundation — complete on DEV and PROD

The owner confirms that migrations `0001` through `0007` have been successfully
applied and verified in both DEV and PROD. Historical DEV milestones below remain
recorded; Phase 2 completion does not imply implemented authentication or APIs.

Unchecked functionality follow-ups below belong to Phases 3–5; they do not expand
Phase 2's database foundation scope.

- [x] Prepare `0001_create_event_structure.sql` for reusable locations, events,
  and multi-day/overnight sessions with constraints and indexes.
- [x] Validate the event schema with fictional data in disposable local D1 storage,
  including foreign keys, deletion restrictions, dates, statuses, and timestamps.
- [x] Apply and verify migration 0001 on Cloudflare DEV after owner approval (Phase 2.3).
- [x] Prepare and locally validate migration 0002 for `name_prefixes` and `users`,
  including original/normalized email fields and preserved historical prefix references.
- [x] Owner confirms migration 0002 is applied and verified on Cloudflare DEV (Phase 2.4).
- [x] Prepare and locally validate migration 0003 for external identities and password
  credential storage, preserving existing event and account records.
- [x] Apply and verify migration 0003 on Cloudflare DEV after approval (Phase 2.5).
- [x] Prepare and locally validate migration 0004 for roles, permissions, user-role
  assignments and role-permission grants, without seeds or privileged assignments.
- [x] Apply and verify migration 0004 on Cloudflare DEV after approval (Phase 2.6).
- [x] Implement and locally validate migration 0005 for registrations and selected
  days, including composite event-consistency FKs and cancellation state constraints.
- [x] Review, apply and verify migration 0005 on Cloudflare DEV after approval (Phase 2.7).
- [ ] Implement authenticated participant registration lifecycle transactions,
  ownership/permission checks, event/day eligibility and minimum-one-day enforcement
  only in a separately approved Worker task. No guest registration or capacity logic.
- [ ] Review full cancellation/re-registration audit requirements before APIs;
  retain selected days on cancellation and exclude cancelled registrations from counts.
- [x] Implement and locally validate `0006_seed_reference_data.sql`: active `user`
  and `admin` roles, exactly thirteen permissions, all thirteen granted to admin,
  zero granted to user, stable UUIDs/timestamps, no accounts or user-role assignments.
- [x] Review, apply and verify migration 0006 on DEV after approval;
  Phase 2.8 RBAC reference data is complete, as confirmed by the owner.
- [ ] Review future `news_editor`/`moderator` roles and least-privilege mappings.
- [ ] Approve a controlled first-administrator provisioning process and audit design.
- [ ] Implement default-deny Worker permission checks, active-role/disabled-user
  rules and protected role assignment only in a separately approved task.
- [ ] Implement reviewed password hashing and
  disabled-account enforcement in future Worker logic.
- [ ] Plan sessions, password reset and credential revocation for Phase 3.
- [ ] Seed the approved prefix catalogue separately; migration 0002 contains no seeds.
- [ ] Implement UUID validation, email normalization/validation, and active-prefix
  selection rules in future Worker APIs when approved; never merge users by email alone.
- [ ] Add server validation for publication readiness, UUIDs, timezones, and
  attendance-date/session alignment when event APIs are approved.
- [ ] Enforce event location visibility in future APIs; authenticated addresses
  must not appear in public responses even when the event is public.
- [ ] Resolve participant registration ownership, privacy, retention, and
  authentication storage before subsequent account/registration implementation.
- [x] Complete Phase 2 database development and apply/verify all seven migrations
  (`0001` through `0007`) on both DEV and PROD, as confirmed by the owner.
- [x] Review and promote Phase 2 through the existing DEV-to-MAIN release workflow;
  PROD database foundation completion is confirmed by the owner.

Phase 1 configuration/infrastructure and Phase 2 database foundation are complete
on DEV and PROD. The owner confirms successful application and verification of
migrations `0001` through `0007` in both environments. Phase 3 Authentication &
Accounts is next; later phases and backlog remain unchanged. Public website
verification remains separate under `RELEASE.md`. Automatic migration execution
remains unauthorized, and existing release approvals and production protections
remain unchanged.

### Phase 2.9 — News Database Foundation

Reviewed, implemented and locally validated. The owner confirms migration 0007
is applied and verified on remote DEV and PROD. Phase 2.9 and the Phase 2 database
foundation are complete in both environments.

- [x] Implement `0007_create_news_articles.sql` for one STRICT `news_articles`
  table, preserving migrations 0001–0006 and introducing no seed content.
- [x] Validate all seven migrations locally, News constraints/lifecycle/indexes,
  existing schemas and RBAC data, foreign keys and database integrity.
- [x] Review and separately approve/apply/verify migration 0007 on remote DEV.

Implemented fields:

| Field | Purpose |
| --- | --- |
| `id` | UUID primary key |
| `title` | Required headline |
| `slug` | Unique URL identifier |
| `content` | Article body |
| `excerpt` | Optional summary |
| `cover_image_key` | Optional image storage reference |
| `author_user_id` | Required foreign-key reference to `users` |
| `updated_by_user_id` | Optional foreign-key reference to `users` |
| `publication_status` | `draft`, `published` or `archived` |
| `created_at` | UTC Unix timestamp |
| `updated_at` | UTC Unix timestamp |
| `published_at` | Nullable UTC Unix timestamp |

Implementation requirements:

- [x] Follow existing SQLite STRICT, application-generated UUID, timestamp and
  foreign-key conventions; preserve author attribution.
- [x] Constrain unique lowercase URL-safe slugs, nonblank titles, published content,
  status/publication-time consistency and timestamp ordering; index listing and
  author/editor lookups without duplicating primary or unique indexes.
- [ ] Enforce draft/archive privacy and public readability of published articles in
  future Worker APIs. Only authorized roles may create, edit, publish or archive articles.
- [ ] Keep image files outside D1 and store references only. Evaluate Cloudflare R2
  when implementing image uploads; do not introduce upload infrastructure yet.

## Phase 3 — Authentication & Accounts

### Phase 3.1 — Authentication Foundation

- [x] Review migrations 0001–0007, existing Worker routes and local tests; reuse
  shared UUID profiles, password/provider credentials and RBAC records.
- [x] Implement local Web Crypto password hashing/verification, opaque token
  generation/digests, expiry validation, configuration validation and safe errors.
- [x] Define shared session/action-token/rate-limiter contracts and pure session
  and verified-email eligibility checks. Phase 3.2 now implements storage adapters;
  distributed rate limiting remains a contract/design awaiting implementation.
- [x] Test foundation primitives in local workerd, including independent crypto
  vectors, password boundaries, malformed records, token purpose/expiry, session
  eligibility and unchanged public API boundaries.
- [x] Complete the existing full migration test suite, TypeScript validation and
  production build for Phase 3.1 finalization: 150 tests passed, including foundation,
  account-rule and migration tests; `npm run typecheck` and `npm run build` passed. Workers Free deployed
  integrated authentication performance and complete auth flows remain unverified;
  see PROJECT.md for the completed standalone experiment and development decision.

### Phase 3.2 — Authentication Database (implemented locally)

- [x] Prepare and locally validate `0008_create_authentication_state.sql`, preserving
  migrations 0001–0007 and all prior records. No remote migration is authorized.
- [x] Confirm required private first/last names and email remain compatible with
  the existing profile schema. Add registration validation and public nickname/UUID projection.
- [x] Implement approved 3–24-character ASCII nicknames, deterministic lowercase
  keys, reserved-name/spacing rules and database-generated uniqueness. Preserve
  capitalization and separate participant cooldown tracking from admin corrections.
- [x] Add and locally validate shared session and single-use verification/reset
  storage, guarded consumption batches, reset/session invalidation, stale-generation
  fencing, concurrency and rollback on incompatible legacy nicknames.
- [x] Close the standalone password investigation and remove temporary benchmark
  infrastructure/artifacts. See PROJECT.md for the single retained final result summary.
- [x] Implement the owner-selected development-only PBKDF2 20k + HMAC pepper
  configuration, versioned records, fail-closed secret handling and explicit legacy compatibility.
- [x] Implement local persistent session and verification/reset services with generation
  fencing, atomic single-use completion, rollback, logout revocation and credential/provider lookups.
- [x] Validate the complete local suite (156 tests), strict TypeScript and production
  build, including fresh databases with migrations 0001–0008 and adapter concurrency/rollback.
- [ ] Verify full integrated DEV authentication/session CPU overhead before public
  authentication approval. No more standalone password benchmarks are planned.
- [x] Reject password credential reassignment in migration 0008 and regression-test
  unchanged ownership/session generation after rejection and legitimate change revocation.
- [x] Implement approved seven-day cookie helpers and session-bound CSRF helpers
  with negative runtime tests. Public-route integration/logout adapters remain unfinished.
- [x] Implement the participant nickname adapter: immediate first change, then
  14-day cooldown; capitalization changes count, exact no-ops preserve state,
  concurrent changes cannot bypass it and administrative corrections preserve state.
- [x] Implement sanitized legacy nickname preflight reporting and require approved
  nickname onboarding in the local event-registration account gate.
- [ ] Obtain owner-approved handling of legacy null/invalid/duplicate nicknames
  and sanitized preflight evidence before any separately approved remote migration.
- [x] Record approved seven-day session/cookie, layered CSRF and D1-based persistent
  rate-limiting designs. Registration, login, verification/resend have local D1
  limits; recovery limits and remote secret/cleanup configuration remain unfinished.
- [x] Integrate local cookie/session login/logout and session-bound CSRF protection.
- [x] Integrate explicit local email-verification confirmation before token consumption.
- [ ] Integrate explicit reset confirmation before token consumption.
  Never mutate through GET requests.
- [ ] Extend distributed rate limiting to recovery when implemented and review hosted delivery quotas.
  Agree hosted thresholds, idle cleanup and superseded-token/reissue behavior before live endpoints.
- [ ] Approve privacy notice, real-name purposes/access, retention/deletion,
  participant requests, backup retention and email-provider processing arrangements.

### Phase 3.3 — Registration (local implementation complete; hosted access disabled)

- [x] Implement the local registration form with required public nickname/private
  names/email, password guidance, pending state and accessible generic feedback.
- [x] Add the default-disabled, loopback-only API with strict Origin/custom-header/
  JSON/body validation and server-side account rules.
- [x] Atomically insert UUID profile, unique canonical nickname and peppered password;
  keep email unverified, do not log in automatically or grant client-supplied privileges.
- [x] Prepare local-only migration 0009 and persistent HMAC-keyed global/IP/email
  registration limits before hashing, atomic concurrency protection and bounded cleanup.
- [x] Verify successful/invalid/duplicate/concurrent registration, storage rollback,
  independent password verification, privacy, configuration gates and limiter behavior.
- [x] Pass all 171 tests, strict TypeScript, production build and diff checks. Check
  the local form in-browser, validation feedback/password clearing, desktop/mobile
  layout and exclusion from production frontend output.
- [x] Obtain owner approval to finalize and push the locally verified Phase 3.3 implementation.
- [ ] Approve hosted enablement, remote 0008/0009 preflight, secrets,
  abuse/idle-cleanup policy and DEV performance separately.

### Login/logout milestone (finalized on dev)

- [x] Add loopback-only/default-disabled email/password login using the existing
  peppered verifier, credential-generation fencing and seven-day D1 sessions.
- [x] Add separate HMAC login limits before crypto, generic missing/disabled/wrong
  credential failures and synthetic verification for missing/disabled accounts.
- [x] Preserve Secure/HttpOnly/SameSite=Lax/Path=/ host-only cookies and integrate
  session-bound CSRF logout with D1 revocation before clearing the cookie.
- [x] Add development-only login/account UI, nickname display, navigation states,
  unauthenticated redirects and reload persistence without browser token storage.
- [x] Test the full fictional registration → login → account → logout browser flow,
  incorrect-password feedback, password clearing and mobile account layout.
- [x] Pass all 185 automated tests, strict TypeScript, production build and diff
  checks; verify hosted endpoint rejection and production bundle exclusion of active
  authentication UI/API calls. Migrations 0001–0009 and deployment configuration are unchanged.
- [x] Obtain owner approval to finalize and push this locally verified login/logout step.
- [x] Commit/push `da9e93df838a1ed57cad3973d77821f4bb6f6307`, verify matching remote
  history, successful GitHub CI and automatic DEV deployment; keep hosted auth disabled.
- [ ] Obtain separate approval before enabling hosted authentication.

### Phase 3.4 — Email verification (committed locally; hosted activation pending)

- [x] Issue digest-only, purpose/email/generation-bound verification tokens after
  new registration, with 24-hour expiry and no token in the ordinary API response.
- [x] Reuse atomic D1 consumption to verify the correct account exactly once;
  protect against replay, expiry, crossover, concurrent confirmation and storage failures.
- [x] Add a shared email transport contract, bounded fictional-only local mailbox
  protected by a third independent secret, and a Resend adapter with fake-HTTP tests.
- [x] Add generic resend with persistent global/IP/email/account limits, authenticated
  CSRF protection, transactional supersession and safe explicit recovery after delivery failure.
- [x] Add development-only verification/secret-protected mailbox pages, immediate
  URL-fragment removal, explicit confirmation and private account verification status/resend UI.
- [x] Verify the full fictional browser flow register → local message → verify →
  login → verified account → reload → logout → unauthenticated redirect, plus mobile layout.
- [x] Pass all 201 automated tests, strict TypeScript, production build and final
  diff checks. Verify the resend key allows a 254-character email plus its 6-character
  prefix, with a registration/resend/verification regression test. Production bundles
  exclude active authentication/verification/mailbox UI and API calls.
- [x] Obtain owner approval to finalize and push locally verified Phase 3.4.
- [ ] Hosted enablement still needs
  remote 0008–0010 approval/preflight, missing secrets, performance, allowlist, abuse/idle
  cleanup, token/provider retention, privacy and delivery/reissue reliability decisions.

Later Phase 3 functionality remains unfinished:

Phase 3.6 password recovery and guarded DEV email integration are locally complete.
Finalization passed all 247 tests (231 application/migration and 16 DNS safety),
strict TypeScript, default/hosted-DEV builds and diff checks. Hosted activation and
real email/integrated CPU verification remain separately approved operations.

- [x] Prepare and locally test a persistent shared email budget and guarded DEV
  transport. Use the single [policy reference](PROJECT.md#hosted-dev-email-policy);
  recipient configuration and hosted activation remain pending.
- [x] Integrate the guarded Resend transport locally for registration verification,
  resends and recovery; deny unapproved registration before writes and enforce the
  shared atomic allowance. Add exact DEV hostname/mode, HTTPS/CSRF and trusted-IP guards.
- [x] Require verified email before login and reject legacy unverified sessions;
  recovery never verifies an address. Add optional DEV-build forms without enabling PROD.
- [x] Configure the hosted frontend flag only in the DEV deployment build step;
  preserve hostname guards and default production previews. Backend activation and
  real email testing remain separate approvals.
- [x] Implement permanent cosmetic member numbers locally: reserved slots 1–10,
  regular allocation from 11, atomic 64-bit issuance, immutable deletion tombstones,
  public nickname display and internal administrator-only new-account provisioning.
- [ ] Review local migration 0011 and compatible code, then separately approve DEV
  application/deployment before auth activation. Approve actual organization account
  identities and reserved slots separately; no accounts or assignments were created.
- [x] Verify the uncommitted local password-recovery flow with focused combined
  regressions, preserving single-use links, generic feedback and session revocation.
- [ ] Review and approve the [hosted DEV integration](PROJECT.md#hosted-dev-integration--implemented-locally-disabled-remotely)
  configuration, migrations, deployment/activation and controlled email test separately.
- [ ] Review and approve the Google-removal PR; Google OAuth is permanently out of scope.
- [x] Owner confirms all DEV data is disposable; no account transition is required.
- [ ] Review/approve 0016 schema cleanup and the exact DEV-only reset SQL, with
  fresh private checkpoints and preservation of metadata, ledger and sending limits.
- [ ] Separately approve DEV Google secret/variable cleanup and Google Cloud client retirement.
- [ ] Separately approve DEV merge/deployment and controlled email/password + MFA acceptance.
- [ ] Decide whether durable security-notification delivery is required; an outbox
  and any schema changes require separate approval.

### Phase 3.8 — MFA Security

Forward roadmap: [PROJECT.md](PROJECT.md#current-phase-3-sequence-and-status).
Earlier Phase 3 task/status records are historical checkpoints; keep their open
decisions without treating them as a fresh remote preflight. MFA DEV implementation
and owner acceptance are complete at dc36b17; #9/#10/#13/#14/#15 are closed.
Historical local-only notes below describe their original checkpoints, not current
DEV availability. No PROD acceptance or new hosted operations are implied.

- [x] Prepare the new Phase 3.8.1 optional-MFA architecture proposal in MFA_DESIGN.md.
- [x] Owner approve MFA design and local Phase 3.8.2 foundations: one authenticator,
  shared provider/session gate, staged recovery codes, key management and migration.
  The new Phase 3.8 MFA name supersedes future Phase 3.9 references; historical
  Phase 3.8 email/GUI headings below retain their original labels.
- [x] Local Phase 3.8.2: prepare migration 0013, reviewed pinned TOTP/QR dependencies,
  AES-GCM/context/key-ring primitives, replay/recovery consumption statements,
  session-bound enrollment preparation and a hard-disabled UI with no MFA API routes.
- [x] Owner approve local Phase 3.8.3 shared login MFA integration.
- [x] Implement local shared password MFA challenges, TOTP/recovery atomic
  completion, persistent failure limits, local acknowledgment/assured replacement,
  challenge UI and Account Security action coordination. See MFA_DESIGN.md for
  verification and the session-replacement policy.
- [x] Owner approve and implement local Phase 3.8.4 disable/regenerate, purpose-bound
  recent-primary/MFA checks, account preservation, timestamp-preserving session
  rotation, security notifications and compact Account Security forms.
- [x] Owner authorize Phase 3.8.5 local security regression and DEV acceptance
  preparation in issue #9. Local review covered 278 distinct auth/security tests,
  strict types, both builds and intercepted browser challenge checks; see
  `docs/MFA_SECURITY_REVIEW.md` for evidence and limitations.
- [x] Q/Owner disposition of [3.8.5 regression #9](https://github.com/Awandalo/Lan-Party/issues/9); accepted and closed.
- [x] **R1 [#13](https://github.com/Awandalo/Lan-Party/issues/13):** owner accepted hosted restricted replacement, single new-TOTP verification and immediate recovery-code display at dc36b17; spent codes remain unusable.
- [x] **R2 [#14](https://github.com/Awandalo/Lan-Party/issues/14):** reviewed recent MFA assurance and independent primary-proof protections; accepted and closed.
- [x] **R3 [#15](https://github.com/Awandalo/Lan-Party/issues/15):** reviewed canonical-DEV-only enrollment gate; accepted and closed.
- [x] **3.8.6 / [#10](https://github.com/Awandalo/Lan-Party/issues/10):** authorized DEV migrations 0013–0016, backed-up keys, CI/deployment and owner hosted MFA acceptance completed; issue closed. Final dc36b17 CI passed 381 tests. Earlier regeneration blockers were corrected.
- [ ] Track any residual retired Google credentials/provider-console cleanup separately; #10 closure does not establish that every external resource was deleted or authorize deletion.
- [ ] Approve pepper rotation/key-version and recovery procedures before public use;
  configure Worker secrets only through a separately approved operation.
- [ ] Integrate the tested participant nickname adapter into authenticated account
  tools. Administrator settings/resets/overrides/corrections remain Phase 4 work;
  ordinary administrative corrections must preserve participant cooldown state.

### Phase 3.9 — Account Lifecycle Management (DEV accepted; reactivation deferred)

- [x] Inspect current account/authentication schema and prepare the state/retention matrix and scoped design in [#16](https://github.com/Awandalo/Lan-Party/issues/16).
- [x] Owner confirm last-active-administrator protection, administrator-initiated 30-minute single-use invitation, password/optional MFA, restricted completion and minimal authorized Users controls.
- [x] Owner approve narrowly necessary member-number/News dependency changes in principle.
- [x] Implement local approved deactivation/reactivation slice: preserve credentials/MFA and private history, erase original private names, mask public identity, revoke sessions/operations, and prevent automatic reactivation.
- [x] Prepare local 0017 lifecycle metadata/operation schema, scoped service/API/UI files and focused deterministic tests; remote migration remains approval-gated.
- [x] Owner confirm anonymous registration totals for completed LAN events, both per event and per day, with no identifying participant links; these are not verified attendance.
- [x] Owner accepts older-backup account resurrection without an identifying deletion registry or automatic deletion replay (2026-10-27); disclose provider-copy and restore limitations accurately.
- [x] Prepare local 0018 anonymous completed-event/day registration totals, anonymous member-number retirement, nullable News attribution and ordered identity/dependent deletion; preserve unrelated roles/content, registrations and numbering integrity. Integrate the reviewed deletion service locally with current proof checks and a separate final confirmation; DEV publication and owner acceptance are recorded in #16; reactivation testing remains deferred.
- [x] Verify local deactivation privacy, last-admin races, restricted reactivation/token replay and MFA, atomic rollback, deletion dependencies and event/day counts using 63 distinct changed-area tests, fictional browser fixtures, TypeScript/build and DEV dry-run. Hosted lifecycle acceptance remains separate.
- [x] Owner authorize scoped local implementation/tests/commits and verified DEV publication with unapplied-migration gates.
- [x] Apply approved DEV migrations 0017/0018 and verify history, integrity and preservation (see #16 migration report).
- [x] Publish and owner-accept the password/MFA → final-warning DEV deletion flow; no identifying deletion registry.
- [ ] At the end of Phase 4, verify administrator-assisted reactivation with two disposable accounts and implemented Users/Roles controls. Do not treat deferred acceptance as tested.
- Administrator suspension, self-service reactivation, automated refunds and future achievements implementation remain out of scope.

### Phase 3.10 — Polish & Fixes (owner-approved focused implementation)

- [ ] [#17](https://github.com/Awandalo/Lan-Party/issues/17): after 3.8/3.9 acceptance,
  triage reproducible UX, accessibility/mobile, error/notification and functional
  defects. Do not duplicate security remediations or lifecycle implementation.
- [x] Owner approve the three scoped #17 implementation batches and DEV publication after affected tests.
- [ ] Complete owner hosted UX acceptance; PROD release remains separately gated.
- [ ] Record the short source Git SHA in each build footer; do not invent release numbers.

### Historical milestone — Authentication email and verification polish (original Phase 3.8)

The following original 3.8–3.8.3 milestone numbers predate MFA numbering. Preserve
their completed evidence and pending review items as history; they do not assign
the new MFA stages or the approved 3.10 scope.

- [x] Add shared branded HTML/plain-text verification and recovery templates, with
  canonical DEV links, escaping, expiry information and no external assets.
- [x] Keep explicit POST confirmation and add accessible verification success copy
  with a prominent login action; preserve token, rate-limit and delivery protections.
- [ ] Confirm Resend click/open tracking is disabled before separately approved
  real-email/client rendering tests. Local fixtures do not establish inbox rendering.
- [x] Remove the temporary ignored DEV reset/retirement investigation tools after
  the owner completed account retirement manually; preserve unrelated recovery data.
- [x] Remove permanent verification/resend links from login and registration forms.
- [x] Show verification assistance after valid credentials for an unverified account,
  preserving authentication, enumeration resistance and abuse controls.
- [x] Show a friendly verification-pending success screen after registration.
- [x] Replace the visible long action URL in HTML emails with a descriptive hyperlink;
  retain the complete fallback URL in plain text.
- [x] Add friendly organizer support copy without inventing contact links; actual
  contact destinations remain an owner decision.
- [x] Owner confirms Gmail and Microsoft 365/Mimecast registration, verification
  and login passed; no additional live email test was performed for this polish.
- [x] Locally polish verification pending/error/success states, remove the main route
  focus outline while retaining control focus indicators, and add a reset-success login action.
- [ ] Owner review the updated hosted DEV screens after separately approved deployment;
  perform the real password-recovery test separately.

### Historical milestone — Final authentication GUI polish (original Phase 3.8.1)

- [x] Add friendly registration-pending and verification-confirmation copy while
  preserving generic responses and explicit token confirmation; keep verified success unchanged.
- [x] Add an accessible account navigation disclosure with nickname/account access,
  clearly disabled future options and the existing secure logout flow.
- [x] Share hidden-by-default Show/Hide password controls across login, registration
  and reset, retaining autofill and exact password input, including Unicode and spaces.
- [x] Simplify recovery to a generic request-confirmation screen, one reset-password
  field using the unchanged API, contextual fresh-link assistance and dedicated success copy.
- [x] Polish login errors, spacing and responsive layouts; locally check keyboard
  navigation, Escape/focus handling, logout failure, visibility and fictional form states.
- [ ] Owner perform the final hosted DEV authentication walkthrough after deployment.
  No live email, account or database operation is part of the local GUI checks.

### Historical milestone — Final GUI cleanup and login-limit investigation (original Phase 3.8.2)

- [x] Put accessible eye/eye-off visibility controls inside the existing password
  fields; preserve names, autofill attributes and password handling.
- [x] Remove account-page logout duplication; retain the secure account dropdown flow.
- [x] Narrow and round the dropdown, adding a 170 ms opening animation with a
  reduced-motion override; retain viewport fit, keyboard focus and disabled placeholders.
- [x] Reproduce cumulative successful-login limits, shared-IP limits and same-password
  reset behavior using three fictional local tests. See PROJECT.md for the existing
  policy and cooldown-reporting limitation; no remote accounts/counters were changed.
- [x] Owner approve precise remaining-cooldown reporting and the revised Phase 3.8.3 policy.
  Do not change login thresholds or clear counters as a testing workaround.
- [ ] Owner review the deployed GUI and Keeper integration in the normal browser;
  no live login/email test is part of this assignment.

### Historical milestone — Login rate-limit improvements (original Phase 3.8.3)

- [x] Implement rolling email+IP confirmed-failure protection and fenced atomic
  pending leases using existing D1 storage; keep success separate from failures.
- [x] Replace shared login hard lockouts with conditional server-validated Turnstile
  challenges and actual retry durations. See PROJECT.md for thresholds and contracts.
- [x] Validate 100 users sharing one IP plus mistakes, unknown accounts, concurrency,
  lease expiry, rollback, replay, provider failures, reset/session compatibility and
  same-password reset using fictional local fixtures; run strict TypeScript/builds.
- [x] Locally check lazy script loading, blocked-script/expiry feedback, explicit
  challenge submission and accurate cooldown presentation with intercepted assets.
- [x] Owner create the DEV widget and configure both Turnstile bindings; read-only
  metadata verified and public sitekey declared in DEV Wrangler configuration.
  See PROJECT.md for required widget settings and pending live validation.
- [x] Owner approve commit/push and automatic DEV deployment after configuration preflight.
- [ ] Verify automatic DEV deployment and live challenge integration without forcing
  shared thresholds or writing remote D1 data; report any test limitation explicitly.

Final Phase 3 milestone — before enabling public registration:

- [ ] Publish participant privacy information: public nickname/attendance, private
  first/last names for administration and addressing attendees, private email for
  account security and essential event communication, authorized access, retention,
  deletion and participant rights/request handling. Obtain outstanding owner policy approval.
- [ ] Include AI-assisted development disclosure and the public
  [GitHub repository link](https://github.com/Awandalo/Lan-Party), reusing the existing
  About/footer backlog. About and Privacy pages are not implemented in this task.
- [ ] Complete final security/privacy review and obtain owner approval before
  enabling public registration or replacing the operational Jotform workflow.

See `PROJECT.md` for approved requirements, implementation boundaries and the
locally prepared migration. Live auth endpoints, email delivery and
remote database changes are not implemented or authorized by Phase 3.1.

## Phase 4 — Administration

- [ ] Implement separately approved Users/Roles administration with backend permission checks.
- [ ] At the end of Phase 4, test the existing reactivation invitation/password/optional MFA flow with two disposable accounts; record acceptance under #16.

## Phase 5 — Events

- [ ] Implement separately approved authenticated event registration and event/participant workflows, preserving privacy and registration totals. Keep Jotform until replacement acceptance.

## Phase 6 — News & Community

- [ ] Add a public news listing and individual article pages after the Phase 2.9
  database foundation is implemented and verified.
- [ ] Provide article creation and editing for authorized Admin/News Editor roles.
- [ ] Support draft, publish and archive workflows, plus a reviewed removal workflow
  for homepage news such as countdowns, practical reminders, and event updates.
  Replace example content with published backend data; decide ordering and dates.
- [ ] Support optional cover images and inline article images.
- [ ] Display author attribution and publication dates.
- [ ] Enforce explicit News RBAC permissions and publication status in the Worker;
  client-side controls are not a security boundary.
- [ ] Decide Markdown versus rich text and prevent XSS when rendering content.
- [ ] Generate slugs and handle collisions in trusted application logic. Preserve
  original publication time on edits; review lifecycle transitions separately from
  current visibility, without adding revision-history infrastructure prematurely.
- [ ] Design authorized R2 image uploads and validate storage keys rather than
  storing binaries or public image URLs in D1.

## Future feature backlog

These ideas retain their agreed requirements but are not assigned new numbered
phases. Dream big. Build small. Expand when needed: deliver maintainable initial
scope, reuse existing systems, and defer additional infrastructure and enhancements.
Plan database requirements here; implement versioned migrations only alongside
separately approved functionality, checking existing numbers and never reusing them.

### Event Pricing, Cost Sharing & Optional Extras

Future feature dependent on Phase 5 registration/attendance durations and Phase 5
event creation and participant management being implemented and tested. Plan it
before participant payments or payment collection. These work packages are backlog
only, not implementation authorization.

#### Cost sharing and minimum attendance

- [ ] Model the organization as non-profit and shared-cost: divide venue rental
  proportionally by registered participant-days. Calculate daily rate as total
  venue rental cost / total registered participant-days, then participant admission
  as daily rate × that participant's registered days.
- [ ] Round each participant's final base admission upward to the nearest €0.50;
  never round the daily rate first. Calculate optional extras separately. Use
  decimal-safe monetary calculations and consistent storage to avoid floating-point
  errors; define safe behavior when there are no registered participant-days.
- [ ] Verify the example: €1,000 venue rental, 20 participants, and 52 combined
  participant-days produce €19.50 for one day and €58.00 for three days.
- [ ] Add a configurable minimum participant count per event, measured in people,
  not participant-days. Keep registration available before the minimum is reached,
  hide calculated admission, and show a friendly explanation that pricing becomes
  available once sufficient participants register.
- [ ] Once the minimum is reached, show estimates based on actual registered
  participant-days and recalculate when registrations or durations change until
  prices lock. Eligible free first-time visitors count toward the minimum; cancelled
  registrations count toward neither the minimum nor the pricing denominator.
- [ ] Distinguish reaching the minimum from formal organizer confirmation. Allow
  manual confirmation below the minimum with an explicit financial-impact warning;
  define the pricing-display behavior of this override during implementation planning.

#### First-time visitor promotion

- [ ] Add an event-level `First-time visitors attend free` setting, disabled by
  default. When enabled, eligible participants receive free base admission only;
  optional extras remain payable.
- [ ] Base eligibility on previous confirmed LAN attendance recorded through the
  website, not previous registrations. Define reliable eligibility verification,
  reasonable duplicate-account abuse prevention, and authorized organizer corrections
  during implementation planning; preserve existing account-linking security rules.
- [ ] Include free visitors' registered days in the pricing denominator and count
  them toward minimum attendance and achievements when applicable. The organization
  covers their waived admission: store the discount and organization-funded amount
  separately for financial reporting.

#### Reusable optional extras

- [ ] Design reusable event extras, initially gaming chair rental, rather than
  hardcoded chairs. Allow future monitors, equipment, meals, and other services.
- [ ] Support name, description, price, optional quantity or availability limit,
  pricing method (per event, per day, or per unit), and event-specific availability.
- [ ] Let participants select available extras during registration. Validate
  quantities and availability server-side; calculate extras separately from base
  admission and include them in the total payable amount, including for free visitors.

#### Estimates and automatic price locking

- [ ] Clearly label pre-lock admission prices as estimates that may change with
  registrations, and distinguish them from finalized prices throughout the website.
- [ ] Add global administrator lock-day/time settings, defaulting to the event's
  second calendar day at 12:00 local event time. Allow per-event overrides and use
  the configured event timezone. Define calendar-day interpretation and handling
  of single-day events and invalid or ambiguous local times during planning.
- [ ] Automatically finalize and persist participant prices at the configured
  moment. Plan reliable server-side execution even when no visitor has the website
  open, within existing Cloudflare Workers/D1 and free-tier constraints; this entry
  does not authorize scheduler infrastructure or configuration changes.
- [ ] Make locking idempotent and safe under repeated execution and concurrent
  registration/cancellation changes. Preserve an auditable lock history; define
  handling when the minimum or organizer confirmation is unresolved at lock time.
- [ ] Do not automatically change other participants' locked prices afterward.
  Handle registrations and cancellations after locking through explicit
  organizer-controlled adjustments.

#### Individual post-lock adjustments

- [ ] Allow authorized organizers to adjust an individual's billable attendance
  days and admission amount after locking, including on day three or after the event.
  Preserve the original locked price and record adjusted amount, difference, reason,
  timestamp, and responsible administrator.
- [ ] Verify the illness example: three-day locked admission €58.00, adjusted to
  one-day admission €19.50, with the organization absorbing the €38.50 difference.
- [ ] Never recalculate or increase other participants' locked admission amounts
  because of an individual adjustment. Track resulting organizational shortfalls.
- [ ] Keep billable-day adjustments separate from actual confirmed attendance used
  for achievements. Support correction of mistaken adjustments with a proper audit
  history rather than overwriting the original adjustment.

#### Financial reporting and participant visibility

- [ ] Add an optional second event-page tab, `Finances`, hidden from participants
  by default. Allow organizers to enable public visibility per event, showing only
  aggregated financial information without individual payment details.
- [ ] Report venue rental, participant contributions, organization-funded first-time
  discounts, optional extras, adjustments, rounding differences, and estimated
  surplus or shortfall. Clearly separate estimated from finalized figures.
- [ ] Keep internal financial information available to authorized organizers when
  the public tab is disabled. Enforce visibility and authorization in backend APIs;
  never expose personal or sensitive financial information publicly.
- [ ] By default, show only the relevant participant admission price and optional
  extras on the public event page; enforce appropriate access to participant-specific
  prices and never expose other participants' charges.

#### Backend, security, and verification

- [ ] Perform authoritative pricing and discount calculations on the backend;
  never trust client-submitted prices or discounts. Validate registration dates,
  attendance durations, quantities, discounts, and adjustment permissions.
- [ ] Protect all financial administration with server-side authorization. Handle
  concurrent registrations and cancellations safely and retain auditable price-lock
  and manual-adjustment histories.
- [ ] Plan schema/storage changes through versioned migrations only when separately
  approved implementation begins. Preserve existing registrations, DEV/PROD
  separation, and Cloudflare Workers/D1 security and privacy conventions.
- [ ] Add automated tests for rounding, minimum attendance, free visitors, extras,
  timezone-aware locking, repeated locks, concurrent changes, cancellations,
  post-lock adjustments, audit corrections, and public/private permission boundaries.

### AI Development Transparency & About Page

Small future frontend enhancement alongside public-page and layout polishing,
not a separate development phase. This backlog entry does not authorize implementation;
preserve existing priorities and reuse existing layout and footer conventions.

- [ ] Add a small, unobtrusive footer section with an `About this project` link
  and a link to the public source repository at
  [GitHub](https://github.com/Awandalo/Lan-Party). Keep it clean, responsive,
  accessible, and consistent with the existing website design.
- [ ] Optionally include the subtle footer line:
  "Built by humans. Assisted by AI. Powered by gamers. 🎮"
- [ ] Plan a simple public `About this project` page accessible through the footer
  without authentication. Briefly explain the website's purpose, its hobby-project
  roots in the gaming community, and where to view its public source code on GitHub.
- [ ] Explain that AI assists with brainstorming, programming, code reviews, and
  development improvements, while project decisions, testing, and deployment
  remain under human control and responsibility.
- [ ] Use a friendly, natural tone matching the website, avoiding formal disclaimers,
  legal terminology, or exaggerated AI claims. Do not imply that AI independently
  operates the website or guarantees its security.
- [ ] Exclude secrets, private infrastructure details, participant information,
  and internal configuration. Do not add pop-ups, consent dialogs, or acknowledgment
  requirements; keep this a small frontend enhancement.

### Gamification — LAN Ranks & Grand-LAN Master

Future feature after event management, registration, and confirmed attendance
tracking are implemented and tested. This backlog entry does not authorize
implementation or assign a new numbered phase.

Permanent LAN ranks:

- [ ] Award LAN Recruit (bronze) after 5 confirmed qualifying LAN attendances,
  LAN Veteran (silver) after 10, and LAN Legend (gold) after 15.
- [ ] Keep earned ranks permanent, even when participants miss future events.
  Display the highest earned rank as a medal alongside the participant's name.

Grand-LAN Master:

- [ ] Award the active Grand-LAN Master title after 15 consecutive qualifying LAN
  attendances. New participants may start a streak at any qualifying event;
  attendance at earlier events is not required.
- [ ] Missing a completed qualifying LAN resets the streak to zero and revokes
  the active title. Participants may regain it with another 15-event streak.
- [ ] Retain historical achievements and each participant's longest streak.
  Missing an event must never revoke permanent ranks.

Event configuration:

- [ ] Add an `Achievements enabled` toggle to event creation and editing,
  enabled by default, and display whether each event qualifies for achievements.
- [ ] Disabled events contribute neither to permanent ranks nor to streaks and
  cannot break an existing streak. Cancelled events and test events excluded from
  achievements do not affect calculations.
- [ ] Require explicit administrative action and recalculation for qualification
  changes made after attendance finalization.

Administration and technical requirements:

- [ ] Make all four thresholds configurable through administrator settings:
  Recruit, Veteran, Legend, and the Grand-LAN Master streak threshold.
- [ ] Calculate achievements server-side from confirmed attendance, not
  registrations, using chronological qualifying event order rather than database IDs.
- [ ] Support authorized administrative attendance corrections and achievement
  recalculation. Preserve earned permanent ranks when thresholds change.
- [ ] Make calculations deterministic and cover them with automated tests,
  including rank thresholds, streak resets and recovery, new participants,
  excluded events, corrections, and threshold changes.
- [ ] Include achievement badges on participant profiles and alongside usernames
  where appropriate, while preserving existing public/private data boundaries.
- [ ] Plan First Time LANner and other fun achievements; define eligibility during
  approved feature planning without speculative tables or APIs.
- [ ] Plan a shared Achievement Showcase for bragging rights: participants may
  select one unlocked achievement to display alongside their permanent LAN rank.
  Reuse it for contribution achievements rather than building another showcase.

Future enhancement:

- [ ] Consider optional manual and secret achievements in later planning, with
  authorized awards and auditable corrections through the shared achievement system.
- [ ] Add a Hall of Fame showing current Grand-LAN Masters, longest attendance
  streaks, and LAN Legends.

### LAN Idea Box — Community Suggestions & Contribution Achievements

Future feature after authentication, participant account tools,
and server-side organizer authorization are implemented and tested. Keep the
initial version private, simple, and practical for a small organizing team.
The stages below belong to this feature, not new repository phase numbers;
existing priorities and completed work remain unchanged. This is backlog planning
only and does not authorize functionality, migrations, or configuration changes.

Initial stage — Private LAN Idea Box:

- [ ] Add an `Idea Box` section to the authenticated participant's account menu or
  settings. Let registered participants submit a title, description, and category
  through a simple form, view their own ideas and current statuses, and read
  organizer responses when provided.
- [ ] Support categories such as Website Features, LAN Event Improvements,
  Games & Tournaments, and Other, covering website, event, and community suggestions.
- [ ] Keep ideas visible only to the submitter and authorized organizers. Enforce
  ownership on the backend so participants cannot access another participant's
  private suggestions through either the frontend or API.
- [ ] Support Submitted (awaiting review), Under Consideration (being evaluated),
  Planned (approved for future work), Implemented (delivered), On Hold (temporarily
  postponed), and Declined (not being pursued).
- [ ] Let organizers update statuses and provide optional explanations visible to
  the submitter. Track status changes and timestamps; keep internal organizer notes
  separate from participant-visible responses.
- [ ] Provide an organizer-only management interface to view ideas, filter by
  status/category, review details, update status, mark ideas implemented, add
  internal notes, and respond to submitters. Support marking submissions valid or
  invalid for achievements and identifying duplicates or spam. Avoid complicated
  approval chains or a ticketing system.

Contribution achievements — dependent on the shared achievement system:

- [ ] Integrate with the shared planned achievement definitions, unlocking logic,
  participant profiles, and showcase where possible. The achievement system is
  still future work: document this dependency rather than implementing it now or
  creating a separate suggestion-specific achievement engine.
- [ ] Plan four permanent achievements: Bright Spark for the first valid submitted
  idea; Idea Machine for five valid submitted ideas; Game Changer when one valid
  idea reaches Implemented; Mastermind when five valid ideas have reached Implemented.
- [ ] Count only genuine, organizer-validated ideas. Duplicate, spam, invalid, or
  rejected/Declined submissions must not contribute to future progress. Each
  qualifying idea counts only once; repeated status changes must not grant duplicate
  progress or achievement awards.
- [ ] Retain an auditable record of eligibility decisions and corrections.
  Define correction handling for already-earned permanent achievements during
  implementation planning, keeping historical decisions distinct from future
  qualifying progress.
- [ ] Reuse the Achievement Showcase and participant-selected bragging rights
  defined in the gamification backlog above.

Deferred enhancement — News integration:

- [ ] After the private stage and the planned News feature are available, let
  organizers link implemented ideas to news articles and let submitters view their
  associated articles. Reuse the planned news foundation rather than rebuilding
  suggestion storage for integration.
- [ ] Allow optional contributor credit only with participant consent. Publishing
  an article must not automatically reveal a private suggestion; review linked
  content and attribution separately. Do not include integration in the initial stage.

Deferred enhancement — Curated public community ideas:

- [ ] Design suggestion status and visibility independently from the start so
  later public curation does not require rebuilding the underlying system. Keep
  suggestions private by default; authorized organizers must explicitly approve
  publication of selected ideas. Implemented status must not make an idea public.
- [ ] Allow contributors to choose whether their username is displayed. Review all
  public content before publication; never expose private organizer notes or
  personal information. Keep public and private API responses clearly separated.
- [ ] Defer the public suggestion board beyond the initial private stage.
  Community voting may be considered later and is not part of the initial scope.

Technical and verification planning:

- [ ] Require authenticated submissions and server-side authorization for every
  read and modification, including organizer management and achievement decisions.
- [ ] Validate and limit input lengths, safely render user-generated content to
  prevent XSS, and introduce proportionate rate limiting and spam protection.
- [ ] Plan versioned Cloudflare D1 migrations only when implementation is separately
  approved. Follow existing React, TypeScript, Workers, D1, privacy, and DEV/PROD
  conventions; avoid unnecessary complexity, dependencies, or external services.
- [ ] Add tests for participant ownership, organizer permissions, status history,
  internal-note privacy, duplicate/spam submissions, eligibility and corrections,
  repeated-status idempotency, duplicate award prevention, and public/private
  response boundaries. Include consent/publication checks when deferred features
  are separately approved.

## Current UI decisions

- Login replaces Admin in navigation. Hosted builds retain the disabled preview;
  development builds have working Login/Account navigation and local logout.
- The temporary /admin redirect has been removed; /login is the shared sign-in entry.
- The obsolete standalone Registration page and /registration route have been removed.
- Registration should eventually start from the selected event page, including day selection.
  Public event registration must not require an organizer login.
- Upcoming/Past buttons filter the event view. Local typed content is a temporary
  frontend boundary, not a database or working administration feature.
- The homepage has a news section between Up next and the three feature cards.

## Future administration work

- [ ] Phase 4 idea: manually assisted account verification with appropriate identity
  checks, backend authorization and audit logging. No bootstrap or verification bypass
  is authorized by this backlog item.

- [ ] Let authorized organizers upload and replace the left/right LAN background photos.
  Support image selection, preview, cropping/position, and removal.
- [ ] Decide storage compatible with the Cloudflare free-tier goal before implementing uploads.
  Validate file type and size on the server, review image rights/participant privacy,
  remove unnecessary image metadata, and enforce upload authorization.
- [ ] Populate event listings from published backend events and distinguish
  upcoming and past events consistently using agreed Netherlands date/time rules.
- [ ] Build individual event pages with registration and attendance day selection,
  without requiring an organizer account.
- [ ] Choose real organizer authentication and server-side authorization before
  enabling login or any administration tools.
- [ ] Add participant account tools at /account to view and adjust only their own
  event signups, and authorized organizer/moderator tools at /manage.
  These future routes are not implemented. Enforce permissions on the backend.
- [ ] Require participant accounts for registration and enforce signup ownership
  when editing. Keep public event registration independent of organizer privileges.
- [ ] Define moderator permissions separately from administrator/organizer permissions
  if moderator roles are added. The Login label does not implement those roles.

## Verification reminders

- Check background photos at wide desktop widths; the central content must stay opaque
  and unchanged. Photos should be hidden where there is no useful side space.
- Test Upcoming/Past controls, empty states, and eventual populated event lists.
- Test keyboard focus, mobile layouts, and disabled login fields.

## Generated background asset

Saved to `public/lan-hall.png` using the built-in image generator. Final prompt:

```text
Use case: photorealistic-natural. Asset type: decorative side background for a personal LAN party website. Wide overhead overview of a large LAN gaming hall reminiscent of a DreamHack LAN gathering, dense rows of desktop gaming monitors, keyboards, computer towers and seated player silhouettes. Almost pitch-black room with only monitors casting cool cyan, blue and occasional muted green light, no overhead lights, realistic candid photographic atmosphere. Rows recede into darkness, foreground computers clear. Wide landscape composition with interesting monitor detail on both outer sides. No text, branding, watermark, readable screen content or recognizable faces. Generate only the photograph, not a webpage.
```
