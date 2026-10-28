# LAN Party website

## Purpose and project status

Build a modern, mobile-friendly website for organizing private LAN parties among
friends. It will replace the existing Jotform registration workflow after testing
and owner approval. Jotform must remain operational until that approval is given.

Typically there are two LAN parties per year, occasionally three. Traffic is very
low outside registration periods. Keep the implementation proportionate to this
scale and independent of work infrastructure.

Phase 1 configuration/infrastructure and Phase 2 database foundation are complete
on DEV and PROD. The owner confirms that all seven migrations (0001–0007),
including RBAC reference data and News storage, have been successfully applied
and verified in both environments. This documentation update does not independently
verify PROD migration state or complete the current post-release
public website verification. Phase 3 Authentication & Accounts is the active
development phase. Hosted DEV email/password registration, verification, login/recovery, optional TOTP MFA
and account lifecycle are implemented. Phase 3.9 DEV acceptance is recorded in #16,
with administrator-assisted reactivation deliberately deferred to the end of Phase 4
using two disposable accounts. Phase 3.10 DEV polish was accepted by the owner at `82f7b34`; Phase 3 closeout
and release preparation are tracked in #19.
Phase 4 Administration precedes Phase 5 Events; actual event registration and replacing
Jotform remain future milestones. PROD authentication is separately gated.
Google OAuth is permanently discontinued.

Phase 4.1 Administration navigation is owner-accepted in #26. Phase 4.2 (#27)
adds read-only member browsing/detail behind explicit users.view grants; hosted
owner acceptance remains pending. Role/account mutations belong to #28/#29. See
[the administration contract](docs/administration-foundation.md#phase-42--read-only-members-administration).

`AGENTS.md` contains the permanent development, security, Git, and verification
rules. Requirements below are mandatory. Items labeled as proposals, open
decisions, or future ideas require review and are not immediate requirements.

## Agreed technology

| Area | Decision |
| --- | --- |
| Frontend | React and TypeScript, built with Vite |
| Hosting | Cloudflare Workers Free |
| Backend | Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| Version control | Git and GitHub; public repository |
| Local development | Windows 11 |
| Dependency management | npm |

Prefer free-tier-compatible solutions, avoid unnecessary external services and
paid dependencies, and verify relevant platform limits before production deployment.

## Mandatory functionality

1. A public homepage showing upcoming LAN events.
2. An event calendar showing planned LAN parties.
3. Individual event pages containing event details and registration. Visitors register
   directly through the selected event page; there is no standalone Registration page.
4. Events that can last multiple days.
5. Registration allowing participants to select exactly which event days they attend.
6. A public attendance overview showing registered display names and attendance per day.
7. Daily attendance totals derived from registrations.
8. An organizer administration area.
9. Organizers can create, edit, publish, and close events without changing source code.
10. Event registration data is stored in Cloudflare D1.

## Mandatory security and privacy requirements

- Public visitors can view published events and register for events open to registration.
- Public event registration must not require an organizer account or organizer login.
- Every participant must have a user account. Email/password and
  optional TOTP MFA protect one central profile. Google OAuth is discontinued.
- Organizers require secure authentication and server-side authorization.
- Contact information and other private registration details must not appear in public
  attendance lists or public API responses.
- Registration editing must prevent unauthorized changes.
- Collect only personal information needed to organize LAN events.
- Validate registration input on the server, including whether selected days belong
  to the event and whether registration is open.
- Keep credentials, secrets, real participant data, and production exports out of
  the public repository.
- Separate development and production databases; production changes require approval.
- Consider GDPR requirements because participants are located in the Netherlands.
  Before launch, review data collection, public display-name disclosure, privacy
  information, retention and deletion, and handling of participant requests.
- Document database backup and recovery procedures before production use.

## Design direction

Dream big. Build small. Expand when needed. Start with maintainable functionality,
reuse existing systems, and keep later enhancements separate from initial scope.
Preserve reasonable extension points without speculative tables, APIs, or infrastructure.

- Modern, gaming-inspired appearance with a dark theme as the initial default.
- Responsive desktop and mobile layouts.
- Clear navigation and accessible interfaces.
- Consistent styling across pages, without unnecessary visual complexity.
- A design that remains easy to change during experimentation.

Follow the styling boundaries in `AGENTS.md`: global rules belong in
`src/CSS/main.css`, while page-specific rules belong in matching
`src/CSS/<PageName>_style.css` files.

## Architecture

### Production authentication preparation — 2026-10-27

Owner approved local PROD-specific preparation only. The explicit PROD build/profile
keeps registration and session modes disabled; no credentials, migrations or hosted
activation are included. DEV remains isolated. See the
[activation contract and gates](docs/PROD_AUTH_ACTIVATION.md) for required budgets,
key recovery, exact-target migration sequence and controlled acceptance. Existing
DEV acceptance is reused; PROD registration is not yet accepted or enabled.

### Environment reference

Use this table as the central environment reference for development, deployments
and release verification. `wrangler.jsonc` defines the Worker and D1 mappings;
the default configuration targets PROD and `--env dev` selects DEV.

| Environment | Git branch | Cloudflare Worker | D1 database | Website |
| --- | --- | --- | --- | --- |
| DEV | `dev` | `lan-party-dev` | `lan-party-dev` | https://dev.lan-party.club |
| PROD | `main` | `lan-party` | `lan-party-prod` | https://www.lan-party.club |

- DEV is the testing and development environment. PROD is the publicly accessible
  production environment.
- DEV pushes trigger `.github/workflows/deploy-dev.yml`, which deploys with
  `--env dev`. A merge into `main` is expected to trigger the production Worker
  deployment through Cloudflare Git integration. No production deployment workflow
  is checked into this repository; verify the Cloudflare Git integration
  configuration and actual deployment evidence
  rather than treating the merge itself as proof of deployment.
- Deployments do not automatically apply D1 migrations. Production database
  migrations require separate explicit owner approval; deployment or release
  verification does not grant that approval.
- Custom domains are configured: PROD www is canonical, with apex HTTP/HTTPS and
  HTTP www redirected to HTTPS www (308, path/query preserved). The apex Worker
  binding is retained. DEV is unchanged. Worker aliases are not auth origins.
- The existing health endpoint is `GET /api/health`, defined in `worker/index.ts`
  and routed to the Worker by Wrangler's `/api` and `/api/*` rules. It returns
  HTTP 200 with JSON `{"status":"ok"}` and checks liveness only, independently
  of D1. A successful health response does not verify database migrations or
  frontend behavior. Use [RELEASE.md](RELEASE.md#post-release-housekeeping-separate-explicit-request)
  for post-release verification and reporting.

### Agreed responsibilities

- **Frontend:** React pages and reusable components present events, registration,
  attendance, and organizer interfaces. Shared frontend utilities live in `src/lib/`.
- **Backend:** Code in `worker/` handles API requests, validation, authentication,
  authorization, event management, and database access. Security decisions are
  enforced here rather than relying on browser controls.
- **Database:** D1 stores events and registrations. Versioned migrations live in
  `migrations/`; all queries use parameters.
- **Static assets:** Public assets live in `public/`. Vite produces the frontend
  build for Workers hosting.
- **Public/private boundary:** Public responses contain published event information,
  approved display names, per-day attendance, and totals. Private organizer data
  and registration credentials are restricted to authorized operations.

### Route naming decision

- `/login` is the shared sign-in entry for participants, moderators, and organizers.
- Future `/account` tools will let participants view and adjust their own signups.
- Future `/manage` tools will serve authorized organizers and moderators; backend
  permission checks must enforce access and role boundaries.
- The temporary `/admin` redirect has been removed. `/account` is implemented only
  in local development builds; `/manage`, event-account tools and moderator roles
  remain future implementation work.
- Phase 2.5 requires participant accounts for registration. Organizer privileges
  are separate; secure signup ownership and editing must be enforced by future APIs.

### Proposed implementation shape — review before implementation

- Serve the built frontend and API from the same origin on Cloudflare Workers,
  using static asset serving alongside backend routes. Confirm routing and local
  development configuration during Phase 1.
- Model events, event days, registrations, and selected registration days as
  related records. This would support individual day selection and daily totals
  without storing contact details in public attendance records.
- Use an explicit event lifecycle that distinguishes draft, published, and closed
  registration states. Agree whether closed events remain publicly visible.
- Treat event dates and displayed times consistently in the Netherlands' local
  timezone (`Europe/Amsterdam`), with date-only event days where appropriate.
  Confirm time handling before designing the schema.

These proposals do not define a registration-editing method or API contract.
The approved database and authentication decisions below supersede earlier proposals.

### Approved Phase 2 event database foundation

- `migrations/0001_create_event_structure.sql` defines `locations`, `events`, and
  `event_days`. It was applied and verified on Cloudflare DEV in Phase 2.3.
- IDs are application-generated UUIDs stored as `TEXT`; instant timestamps are
  integer UTC Unix seconds, and attendance dates are valid `YYYY-MM-DD` dates.
- Reusable locations contain addresses. Events select `public` or `authenticated`
  location visibility; future APIs must enforce this without hiding public events.
- Draft events may omit a location. A database check requires published events to
  reference a location, and the foreign key validates its existence. Future APIs
  must also validate publication readiness. Publication states are `draft`,
  `published`, `archived`, and `cancelled`; registration is independently
  `closed` or `open`.
- Event days are `scheduled` (selectable) or `cancelled` (retained for history).
  Sessions may end after midnight. Each event has at most one attendance day per
  local date; `(id, event_id)` is also unique for future composite foreign keys.
- Referenced locations and events cannot be deleted; there are no cascading deletes.
  Callers supply creation timestamps and maintain update timestamps.
- Strict tables and checks enforce types, required fields, allowed values, and
  timestamp ordering. UUID syntax, IANA timezone validation, session/date alignment,
  publication readiness, and access control remain future server validation.
- Local constraint tests live in `worker/tests/event-structure.test.mjs` and use
  Node's built-in test runner with Wrangler's existing Miniflare dependency.
  See `migrations/README.md` for isolated local verification commands.
- Existing DEV/PROD Workers and D1 bindings are preserved. Migration application
  remains separate from builds and deployment automation.

### Approved Phase 2 account profile foundation

- `migrations/0002_create_accounts.sql` adds strict `name_prefixes` and `users`
  tables. The owner confirms it is applied and verified on Cloudflare DEV.
- Prefixes have unique nonempty labels, nonnegative ordering, and active/inactive
  flags. Referenced prefixes cannot be deleted or have their IDs changed; deactivate
  them to preserve existing references. Reference-data seeding is a separate task.
- Users have required first/last names, original email and a unique normalized
  email, optional display name and prefix, and `active`/`disabled` status.
  Email verification defaults to null, with no assumption that verification occurred.
- Required strings reject empty/ASCII-whitespace-only values. Instant timestamps
  use nonnegative integer UTC Unix seconds; updated timestamps cannot precede creation.
- Future Worker APIs generate/validate UUIDs, validate and normalize email addresses,
  maintain timestamps, and allow only active prefixes for new selections. The
  database retains original email casing and compares supplied normalized values.
- Email/password authentication references the existing user profile. Never merge accounts solely because emails match.
- Names and emails are private profile information; the schema does not authorize
  exposing them publicly. Public display-name policy, privacy, retention/deletion,
  and registration ownership must be resolved before registration APIs.
- No credentials, authentication, authorization, role tables, registration APIs,
  or account UI are implemented by this migration. Participant account tools remain
  future work; registration requires a participant account, not organizer privileges.
- `worker/tests/accounts.test.mjs` tests both migrations together with fictional
  data and verifies that existing event schema and records remain intact.

### Approved Phase 2 authentication storage foundation

This records the applied historical schema. Provider storage described below is
retired from application use; see [the removal plan](docs/GOOGLE_REMOVAL.md) for
separately approved physical cleanup.

- `migrations/0003_create_auth_credentials.sql` adds strict external identity and
  password credential tables. It is applied and verified on Cloudflare DEV.
- `users` stores profiles; `user_auth_providers` maps external identities to profiles
  using unique `(provider, identity_namespace, provider_subject)` values. Google
  uses the validated OpenID Connect issuer and subject, never the provider email.
  Multiple explicitly linked identities per user are supported. Account merging
  based solely on matching emails is prohibited.
- Provider codes are nonblank and exclude `password`; only Google is initially
  supported by the historical design, now discontinued. Provider allowlists and trusted issuer/subject validation
  belong to the Worker. Additional providers require separate approval.
- `user_password_credentials` stores at most one current hash per profile. A user
  may have neither method during account setup, either method, or both. Both tables
  restrict deletion and ID changes of referenced users; deletion policy remains open.
- Instants are nonnegative integer UTC Unix seconds. Last login cannot precede
  linking; password timestamps satisfy creation <= password change <= update.
- Future trusted Worker authentication must generate/verify hashes using an
  appropriate algorithm, per-password salts, and explicitly reviewed cost settings.
  Never store plaintext passwords or expose hashes/authentication internals publicly.
- Future login and identity-linking workflows require server-side authentication
  and authorization, reject disabled accounts, and validate UUIDs and identity values.
  This migration does not implement those behaviors or grant permissions.
- Sessions, password reset and credential revocation remain Phase 3 work. No login,
  OAuth configuration, hashing implementation, secrets, sessions or endpoints are added.
- `worker/tests/auth-credentials.test.mjs` validates all three migrations locally
  using fictional identities and deliberately unusable dummy hash-like values.

### Approved Phase 2 roles and permissions foundation

- `migrations/0004_create_authorization.sql` creates STRICT `roles`, `permissions`,
  `user_roles` and `role_permissions` tables. It is applied and verified on Cloudflare DEV.
- Roles group explicit permissions; users may hold multiple roles. Authorization
  must resolve user -> assigned active roles -> granted permission, defaulting to
  deny when no active role grants the requested action. Role names (including
  `admin`) confer no implicit privileges. Disabled users must always be denied.
- Roles have text UUID IDs, unique stable lowercase codes, required display names,
  optional descriptions, boolean activity flags and ordered creation/update timestamps.
  Permission IDs are text UUIDs, codes are unique lowercase `resource.action`
  identifiers without wildcards, descriptions are required and creation is timestamped.
- Junctions use composite primary keys, retain assignment/grant timestamps, and
  optionally reference the assigning user. Every FK restricts deletion and ID changes.
  Composite keys cover forward lookups; reverse FK and assigner lookups have indexes.
- UUID syntax and stable-code management remain future API responsibilities.
  Future trusted Worker logic must enforce least privilege, permission checks on
  every protected action, no public unrestricted assignments, no self-service
  privilege escalation, and authorization of the assigning user. FK metadata
  alone does not prove authorization. Role changes/privileged actions need an
  approved audit design, including revocation history, before APIs are implemented.
- Migration 0004 contains no seeds or administrator account. Reserve reference
  data for `0006_seed_reference_data.sql`: initial `user` and `admin` roles, with
  room for later `news_editor` and `moderator` roles. Review future role-permission
  mappings before additional seeds. The initial mapping is approved below.
  Provision the first administrator through a separately approved controlled
  process; never seed user privileges automatically.
- The planned permission catalogue is `events.create`, `events.update`,
  `events.publish`, `events.cancel`, `events.manage_registrations`, `locations.manage`,
  `users.view`, `users.manage`, `roles.manage`, `news.create`, `news.update`,
  `news.publish`, and `news.archive`. These codes do not authorize implementing APIs.
- The existing documents previously specified separate seeds without a 0006 file
  plan. This approved Phase 2.6 direction now records 0006 explicitly; it does not
  create seed files or authorize intervening migrations.
- Local authorization tests apply 0001 through 0004 to fresh disposable D1 storage,
  preserving existing fictional data. No middleware, endpoints or interfaces are added.

### Approved Phase 2 registration database foundation

- `migrations/0005_create_registrations.sql` creates STRICT `registrations` and
  `registration_days`; it is applied and verified on Cloudflare DEV. Prior migrations
  remain unchanged.
- One durable registration per user/event is enforced by `UNIQUE(user_id, event_id)`.
  User and event references restrict deletion/ID changes. IDs are nonblank UUID text;
  UUID syntax remains future Worker validation. No guest registration is supported.
- Status is `registered` or `cancelled`, defaulting to registered. Timestamps are
  integer UTC Unix seconds with creation <= original registration <= update and,
  when cancelled, registration <= cancellation <= update. Registered records must
  have null cancellation; cancelled records must have a cancellation timestamp.
- Selected days use primary key `(registration_id, event_day_id)`. Both composite
  FKs share `event_id`, referencing registration `(id, event_id)` and event-day
  `(id, event_id)` keys. Cross-event selections are rejected by the database on
  INSERT and UPDATE. All references restrict deletion and key updates.
- Cancellation preserves the registration and selected days as historical intent.
  Future attendance lists/counts must include only registered records and handle
  cancelled event days according to approved lifecycle rules. Selections do not
  establish actual confirmed attendance or achievement eligibility.
- Re-registration reuses the registration ID, preserves `created_at` and original
  `registered_at`, clears current `cancelled_at`, advances `updated_at`, and replaces
  selections atomically. These fields store the current lifecycle state, not a full
  sequence of cancellations/re-registrations; approve separate audit history before
  APIs if that full history is required. No audit system is implemented here.
- Future Worker logic requires an authenticated active participant, a published
  event accepting registrations (including any time window), and at least one valid
  scheduled day. Create the record and selections atomically; updates verify ownership
  or explicit management permission and replace selections transactionally. The
  database cannot guarantee an active record has at least one selected day.
- Future APIs also maintain timestamp consistency, immutable ownership/event identity,
  day eligibility, parameterized queries and privacy boundaries. No endpoints, forms,
  automatic capacity logic, notifications or gamification are introduced.
- Unique user/event keys cover user lookups; event/status and global status indexes
  cover listings. The necessary registration composite unique key supports its FK.
  Selection primary keys cover registration lookups; one reverse composite index
  covers event-day references. No redundant standalone user/registration indexes.

### Approved Phase 2 initial RBAC reference data

- `migrations/0006_seed_reference_data.sql` contains reference-data INSERTs only.
  It is applied and verified on Cloudflare DEV; Phase 2.8 is complete.
  No schema changes or modifications to migrations 0001–0005 are included.
- Seed active roles `user` (User; standard LAN Party participant) and `admin`
  (Administrator; website administration). Seed exactly the thirteen permission
  codes listed in the RBAC foundation above, with explicit grants of all thirteen
  to admin and none to user. No wildcard or implicit role-name authorization.
- Fixed version-four UUID literals are generated in application tooling once and
  checked into the migration so all environments use the same identifiers. Every
  seed timestamp is 1791763200 (2026-10-12 00:00:00 UTC), not execution-time metadata.
- Plain INSERTs intentionally fail on unexpected existing IDs/codes/grants. Wrangler
  migration history governs one-time application; raw SQL is not idempotent. No
  ignore/upsert/replace behavior silently changes customized reference data.
- No users, user-role assignments, prefixes, credentials or future roles are seeded.
  The first administrator account must be authenticated/verified and granted access
  through a separately approved controlled bootstrap process, not this migration.
- Future trusted Worker permission resolution must use active users/roles and
  explicit granted actions with default deny. Ordinary authenticated self-service
  actions require ownership/eligibility checks; an empty administrative permission
  set is not a blanket denial of personal registration actions. No public role
  assignment or self-service privilege escalation is allowed.
- Future `news_editor` and `moderator` roles and least-privilege mappings require
  separate review. SQL resolution tests use disposable fictional profiles only;
  no authentication or authorization endpoint is implemented.
- Phase 2.8 RBAC reference data and Phase 2.9 News database foundation are complete
  on DEV and PROD, as reported by the owner. Future production changes remain
  separately controlled.

### Approved Phase 2.9 News database foundation

- `0007_create_news_articles.sql` adds one STRICT `news_articles` table and is
  reviewed, applied and verified on remote DEV. Phase 2.9 is complete on DEV and
  PROD, as reported by the owner. All applied migrations are immutable; no articles
  are seeded. Future PROD migrations require their own preflight, recovery
  preparation and explicit approval.
- Text UUID IDs and titles reject blank values. Slugs are unique lowercase
  letters/digits/hyphens without leading, trailing or consecutive hyphens. Trusted
  Worker logic will generate/validate UUIDs and slugs and handle slug collisions.
- Required text content may be empty for drafts; published articles require
  nonblank content. Excerpt and cover storage key are optional; a supplied key
  cannot be blank. Keep images outside D1, storing keys rather than binaries or
  public URLs; key validation and an R2 upload workflow require separate design.
- Required author and optional last-editor references point to `users`, restricting
  deletion and ID updates to preserve attribution and editorial accountability.
- Status is `draft` (default), `published` or `archived`. Integer UTC Unix seconds
  enforce nonnegative creation, update >= creation, and creation <= publication <= update
  when present. Published articles require publication time; drafts require null.
  Archived articles may retain original publication time or have never been published.
- `published_at` represents original publication, normally preserved while editing;
  current status determines visibility. Metadata is not a revision or transition
  history. Future Worker logic maintains timestamps and lifecycle transitions.
- A status/publication-date-descending index supports public listings; author and
  editor lookup indexes support references. Primary/slug constraints supply their
  own indexes. Local tests cover all seven migrations, constraints, lifecycle,
  schema/reference-data preservation and integrity.
- Phase 6 must expose only published articles publicly, keeping drafts and archives
  private. Worker-enforced `news.create`, `news.update`, `news.publish` and
  `news.archive` permissions protect editorial actions; browser controls do not
  enforce security. Approve Markdown versus rich text and XSS-safe rendering later.
  No APIs, editors, frontend pages, uploads or revision-history system are added.
- Future feature migrations belong alongside their respective functionality,
  not additional speculative Phase 2 work. Identify requirements during planning,
  check existing migration numbers before assigning the next one, and never reuse
  numbers. DEV and PROD execution remain separate; production requires explicit approval.

## Open architectural questions and recommendations for review

1. **Organizer authentication:** Use the approved shared account/session system
   described below. Decide how organizer access is granted and revoked through
   existing RBAC before building administration endpoints.
2. **Registration editing:** Participant accounts are required by Phase 2.5. Define
   server-side signup ownership checks and the recovery/editing flow before APIs;
   real email delivery and public flows remain unfinished. Local session/reset/revocation
   storage adapters and local login/logout HTTP integration are implemented;
   hosted flows and event authorization integration are still required.
3. **Registration fields and privacy:** Account signup uses the approved nickname,
   first name, last name, email and password fields below. Review any additional event contact fields
   and how participants are informed about public nicknames and selected days.
   Set retention and deletion rules before launch.
4. **Event lifecycle and day changes:** Define closing behavior and how organizers can
   change event days after registrations exist while preserving existing registrations.
5. **Duplicate registrations and abuse:** Agree duplicate handling and proportionate
   server-side protections for the public registration form.
6. **Hosting and operations:** Confirm the Workers static asset and API arrangement,
   local development setup, development/production separation, and backup/recovery
   workflow. Verify current free-tier limits when configuring deployment.
7. **Jotform transition:** Decide whether existing registrations need a controlled
   transfer or whether the replacement starts with a new event. Any real participant
   data involved must stay out of Git. Define and approve the cutover after testing.

## Development roadmap

### Current Phase 3 sequence and status

This is the forward numbering agreed on 2026-10-20. Older milestone headings and
status statements below are historical checkpoints, not fresh hosted verification.
Phase 3.7 and Phase 3.8 DEV acceptance are complete; the owner and Q closed
#9/#10/#13/#14/#15. Phase 3.9 DEV implementation is accepted; reactivation testing is deferred until the end of Phase 4. PROD
authentication and deployment remain separately gated.

| Phase | Current scope and dependency | Status / issue |
| --- | --- | --- |
| 3.8 | MFA Security, including foundations, shared login, management and regression | DEV implementation and owner acceptance complete; [#9](https://github.com/Awandalo/Lan-Party/issues/9) closed; no PROD acceptance implied |
| 3.8.5.1 | R1 restricted replacement and bounded encrypted recovery-code redisplay | [#13](https://github.com/Awandalo/Lan-Party/issues/13) closed after owner hosted acceptance at dc36b17 |
| 3.8.5.2 | R2 recent MFA assurance before sensitive account changes; independent primary proof | [#14](https://github.com/Awandalo/Lan-Party/issues/14) accepted and closed |
| 3.8.5.3 | R3 canonical-DEV-only enrollment gate | [#15](https://github.com/Awandalo/Lan-Party/issues/15) accepted and closed |
| 3.8.6 | Controlled hosted DEV MFA rollout/acceptance | [#10](https://github.com/Awandalo/Lan-Party/issues/10) closed; DEV migrations 0013–0016, key provisioning, deployment and MFA acceptance recorded; residual Google-resource cleanup is separate |
| 3.9 | Account Lifecycle Management | [#16](https://github.com/Awandalo/Lan-Party/issues/16): DEV implementation accepted by owner; anonymous totals and backup-risk decision accepted; reactivation hosted acceptance deferred until the end of Phase 4 |
| 3.10 | Polish & Fixes after account lifecycle readiness | [#17](https://github.com/Awandalo/Lan-Party/issues/17), owner accepted scoped DEV polish at 82f7b34; external cleanup/removal dependencies remain explicit |

Historical email/GUI/login-limit milestones also used 3.8–3.8.3; retain their
original references as history, not new MFA milestones. The former proposal for
“Phase 3.9 MFA” is superseded: 3.9 now means Account Lifecycle Management.
Migration numbers (including 0013) are independent and unchanged. Labels, issue
closure and roadmap placement do not authorize implementation or remote operations.
Detailed pending tasks remain in [TODO.md](TODO.md#phase-38--mfa-security).

### Phase 3.10 — owner-accepted DEV polish (2026-10-27)

Under #17, reuse existing MFA step-up for expired replacement proof, preserving
current account/session checks and separate primary proof. Keep the login recovery
entry point until its specific removal dependency is reconciled; presentation
changes do not remove a security recovery path. Improve generic signup guidance,
valid-method dropdowns, inactive-action visibility, clipboard guidance and stable
per-operation layout. Show the short source Git SHA in the footer, supplied by
CI or the local checkout at build time; it is identification, not a health guarantee.
No backend security changes, migrations or credential changes are included.

Phase 3.7 historical 7/7 owner DEV acceptance recorded in [#19](https://github.com/Awandalo/Lan-Party/issues/19)
is historical evidence, not a requirement to restore discontinued Google support.
Phase 3.9 DEV acceptance excludes the deliberately deferred Phase 4 reactivation
check; Phase 3.10 scoped owner UX acceptance is recorded in the trusted Codex
conversation after #17 report 6444927846. See [closeout inventory](docs/PHASE3_CLOSEOUT.md)
for unpublished work, retained review branches and release blockers.

### Phase 3.9 — approved lifecycle design and sprint boundary

Owner decisions recorded in [#16](https://github.com/Awandalo/Lan-Party/issues/16):
voluntary deactivation retains email, nickname, credentials, optional MFA and linked
registrations privately, overwrites private names and masks public identity as
"Deactivated user". Revoke sessions and outstanding operations; ordinary login must
not reactivate the account. Protect the last active administrator from self-deactivation
or deletion, checking current authorization inside the final write.

Reactivation is administrator-initiated through minimal authorized Users controls:
a 30-minute single-use invitation to the existing address, followed by existing
password and optional MFA verification in a lifecycle-specific restricted flow.
Recollect private names; email possession or an administrator click alone cannot
activate access. Existing active-only session/token guards remain intact.

Permanent deletion removes identity and credentials; preserve member-number non-reuse
without a recoverable account UUID link and make only narrowly necessary News
attribution changes. Completed LAN events retain anonymous registration totals per
event and per day after deletion, with no identifying participant links. These are
registrations, not verified attendance. This owner decision resolves historical-total
retention; actual backup retention/restore handling must still be established before
deletion goes live. Do not promise immediate backup erasure or implement admin suspension.

Owner authorizes scoped local implementation/tests/commits and verified DEV
publication/automatic deployment, provided all outgoing changes are reviewed and
unapplied migrations cannot expose unsafe operations. Approved DEV migrations 0017
(lifecycle/reactivation) and 0018 (deletion dependencies/anonymous totals) were
applied and verified under #16; PROD migrations remain separately gated. Runtime readiness checks reject absent/partial lifecycle
schema; the Account Security controls remain hidden until 0017 is available.
Normal password/MFA authentication is unchanged on the existing 0016 database.

Owner decision (2026-10-27): accept that an older backup restore can restore a
deleted account. Keep no identifying deletion registry or automatic re-deletion
system. The deletion service is deployed behind existing local/DEV
environment and schema gates, with password/optional MFA and a separate final warning.
DEV publication and owner lifecycle acceptance are recorded in #16; reactivation acceptance is deferred until the end of Phase 4 using two disposable accounts. Reactivation consumes its invitation and password/optional MFA proof in
one guarded batch and issues a new fully verified session; it never promotes the
restricted cookie or requires reusing the final recovery code. New sessions use the
advanced account generation; old sessions stay revoked. Reuse existing email
allowlists/budgets and fixed 30-minute invitation/five-minute restricted deadlines.

Migrations, hosted account operations, real emails, live deletion and PROD require
separate approval. Publication alone does not establish hosted lifecycle acceptance.

### Phase 3.1 — Authentication foundation

The current direction is email/password with optional TOTP MFA, reusing the same
UUID accounts, sessions and authorization. Google OAuth is discontinued.

Approved product requirements:

- Account registration collects a nickname, required private first/last names,
  required private email and a password for email/password signup. Preserve
  nickname capitalization and enforce case-insensitive uniqueness in the database.
  Email verification is required before event registration; unverified users may
  log in and request verification again.
- Default participant nickname change cooldown is 14 days. Later administrator
  configuration, authorized overrides and corrections belong to future work.
  Administrative corrections must preserve the participant's existing cooldown.
  Reserve impersonation-prone names such as Admin, Moderator and System. Final
  nickname policy is 3–24 ASCII letters, digits, spaces, underscores or hyphens.
  Reject leading/trailing spaces, doubled spaces and spaces next to underscores
  or hyphens; validation never silently rewrites the submitted display nickname.
  Lowercase ASCII is the deterministic lookup key. Reserved-name comparison also
  removes spaces/underscores/hyphens, rejecting separated Admin/Moderator/System.
  Registration's initial selection does not start the cooldown; the first change
  is immediately permitted. Every successful participant change, including case-only
  edits, starts/restarts 14 days. Exact no-ops and administrative corrections preserve
  the existing cooldown. Phase 4 may later add explicit resets/configuration.
- Passwords require at least 12 characters, support 128 characters and have no
  arbitrary character-class rules. Rate limiting and safe errors are required
  before exposing authentication endpoints.
- Optional TOTP MFA is implemented and owner-accepted on hosted DEV, including
  enrollment, password/TOTP login, one-use recovery codes, regeneration and restricted
  authenticator replacement. Strict two-minute assurance, independent primary proof,
  CSRF, generation fencing and encrypted bounded redisplay remain authoritative.
  Google OAuth is discontinued. See [MFA_DESIGN.md](MFA_DESIGN.md) and the historical
  [security review](docs/MFA_SECURITY_REVIEW.md); later rollout and acceptance receipts
  in [#10](https://github.com/Awandalo/Lan-Party/issues/10) and
  [#13](https://github.com/Awandalo/Lan-Party/issues/13) supersede their earlier
  local-only status. Final accepted DEV revision: dc36b17; CI passed 381 tests.
  Completed DEV migrations, key provisioning and activation do not authorize PROD.
- Resend authentication delivery is integrated on DEV under the existing
  [DEV email policy](#hosted-dev-email-policy), recipient restrictions and shared
  budgets. Existing delivery evidence does not authorize new real-account emails.
- Verification links are single-use and expire after 24 hours. Password reset links
  are single-use and expire after 30 minutes. Recovery responses must be generic;
  a successful reset must invalidate all existing sessions.

Repository assessment and implemented local foundation:

- Migrations 0002/0003 established UUID profiles, normalized email uniqueness,
  verification timestamps and password credentials. Migration 0016 removed retired
  Google provider/OIDC integration. Migrations 0004/0006 provide explicit RBAC grants;
  role names do not confer permissions. Reuse this account/security foundation.
- `worker/auth/passwords.ts` uses native Web Crypto PBKDF2-HMAC-SHA256 with
  20,000 iterations, a random 16-byte salt and a 32-byte derived key, followed by
  HMAC-SHA256 with a separate 256-bit server-side pepper. This owner-approved
  development trade-off is below current password-storage recommendations and is
  not equivalent to the former 600,000-iteration implementation.
  Records use `lp-pbkdf2-hmac-sha256-v2$iterations$salt$verifier`; only the HMAC
  verifier is stored with public algorithm/version/cost/salt metadata, never the
  unpeppered derived key or pepper. Verification honors validated stored costs,
  rejects malformed/unknown versions and uses Workers' native timing-safe comparison.
  Password lengths count Unicode code points (12–128); input is neither trimmed
  nor truncated, and malformed surrogate sequences are rejected.
  Hash and verify require explicit pepper configuration: the future caller passes
  `env.PASSWORD_PEPPER` from a Worker secret containing exactly 64 lowercase hex
  characters (32 cryptographically random bytes). Missing/malformed configuration
  throws a fixed error and cannot enable an unpeppered fallback. Use a different
  secret from CSRF/rate limiting; never store it in D1 or frontend configuration.
  No remote secret is installed by this work. D1-only compromise lacks the pepper;
  compromise of D1 plus the pepper exposes the reduced work factor. Pepper rotation,
  retention/recovery and key-version policy need owner review before public use.
  Legacy `lp-pbkdf2-sha256-v1` records retain their explicit 600k–1m verification
  path and are flagged for upgrade; no stored record is rewritten automatically.
  Hosted legacy iteration-limit errors must be handled as authentication unavailable,
  with controlled recovery, not misreported as an incorrect password. Future
  work-factor upgrades can use stored metadata; no stronger v2 cost is flagged
  for automatic reduction. Runtime guidance: [Cloudflare Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/).
- `worker/auth/tokens.ts` generates random 256-bit opaque tokens and purpose-bound
  SHA-256 digests for sessions, email verification and password reset. Persist
  digests only. Expiry checks reject future, expired or consumed records; digest
  matching alone does not establish single-use consumption or authorize an action.
- `worker/auth/contracts.ts` defines one shared session-store contract, an atomic
  action-token consumption contract and a rate-limiter contract. Pure eligibility
  helpers reject disabled/mismatched/revoked/expired sessions, permit unverified
  account sessions and gate event registration on verification plus an approved
  persisted nickname. Accounts lacking a nickname must complete onboarding. This account
  gate does not replace event eligibility, ownership or RBAC checks. The Phase 3.2
  adapters below implement storage/atomic completion; rate limiting and HTTP
  authentication middleware remain unfinished.
- `worker/auth/config.ts` records approved policy durations and validates explicit
  DEV/PROD, a canonical HTTPS origin and a caller-selected session lifetime bounded
  to one minute–thirty days; the approved default factory selects seven days.
  `worker/auth/errors.ts` provides fixed,
  non-cached public errors and a generic recovery response without internal details.
- `worker/tests/auth-foundation.test.mjs` bundles a test-only fixture in memory
  using Wrangler's existing esbuild/Miniflare dependencies. Tests execute the
  modules in local workerd with the application's compatibility date, including
  independent Node-generated PBKDF2/SHA-256 vectors. No dependencies or public
  routes are added. Health and API 404 behavior remain unchanged.
- `worker/auth/nicknames.ts` validates the approved ASCII nickname policy and
  derives a lowercase key while preserving display capitalization.
  `worker/auth/accounts.ts` validates all five required registration fields,
  generates stable UUIDs and projects public accounts using an explicit allowlist
  containing UUID, nickname and the cosmetic member number. These are helpers, not registration endpoints.
  Private names are nonblank, well-formed strings of at most 100 code points without
  ASCII control characters. Email validation supports common ASCII unquoted
  addresses, preserves original spelling and lowercases the comparison key without
  stripping dots or plus tags. Quoted/internationalized address support remains
  outside this initial helper and requires review if needed.
- `worker/auth/cookies.ts` creates/parses/clears the approved opaque session cookie:
  `__Host-lan_session`, seven-day Max-Age, Secure, HttpOnly, SameSite=Lax, Path=/,
  no Domain. Duplicate/malformed cookies fail closed. Clearing a cookie alone is
  not logout; local HTTP logout now calls the stored D1 revocation service below.
- `worker/auth/csrf.ts` validates exact configured HTTPS Origin, JSON content type,
  `X-LAN-Request: 1` and a session-bound `X-CSRF-Token` for POST/PUT/PATCH/DELETE.
  The token is an HMAC-SHA-256 of the session digest using a separate 256-bit server
  secret independent from the pepper (locally supplied by the domain-separated
  limiter/CSRF secret; remote configuration remains unconfigured). Wrong origin/session/token/header/content
  type and GET/HEAD/OPTIONS are rejected. These are tested helpers, not middleware
  installed on public routes. Anonymous local registration/login enforce exact
  Origin, JSON/custom header and no CORS; hosted pre-login context remains a review
  gate. Verification/reset links must render confirmation and
  consume tokens only after explicit protected POST, never on a GET or link preview.
- `worker/auth/nickname-state.ts` implements the participant update as one guarded
  D1 UPDATE, preventing concurrent cooldown bypass. It validates the nickname,
  requires an active account, preserves exact no-ops and uses a trusted server time.
  The caller must obtain the owner ID from the authenticated session. The legacy
  preflight helper reports missing/invalid/case-duplicate names by UUID/reason only,
  without mutation. Actual conflicting records require owner-approved remediation.

Personal-information purpose and restrictions:

- Nicknames are publicly visible for participant identity and attendance. Real
  first/last names support private participant administration and addressing attendees.
  Email supports login, verification, recovery and necessary event communication.
  Passwords are transient registration input; persist only reviewed salted hashes.
- Public account responses must use the explicit nickname/UUID/member-number projection, never
  raw `users` rows or registration input. Private profiles may be accessed by their
  authenticated owner and organizers with an explicit need and existing authorized
  permissions; role names or possession of a session alone are insufficient.
  Contact details, real names, credential data and token records must not appear in
  public attendance, logs or client-shipped configuration. No profile API exists yet.
- Owner approval is still needed for the privacy notice, precise purposes and
  justification for collecting real names, public nickname/attendance disclosure,
  retention periods for profiles/auth state/events/backups, deletion versus retained
  event history, account anonymization, participant request handling and Resend
  processing arrangements. Existing restrictive FKs preserve history; they do not
  settle privacy/deletion policy. Resolve these before production use.

Phase 3.2 validation at completion: all 156 tests passed (`node --test worker/tests/*.test.mjs`),
including foundation/API, account-rule, migration 0008 and Phase 3.2 adapter tests. `npm run typecheck` and `npm run build`
passed. This verifies primitives in local workerd and existing local migration
constraints, not complete user authentication flows or a deployed CPU budget.

Migration 0008 — implemented and validated locally, not remotely approved:

- `migrations/0008_create_authentication_state.sql` is additive. Migrations 0001–0007
  remain unchanged. Existing required real-name/email fields and all UUID references
  are retained; there is no `users` rebuild or relaxation of personal-name constraints.
- `user_nicknames` is the canonical public nickname source, with one row per user,
  checked display text, database-generated `lower(nickname)` key and a unique key
  constraint. The database enforces the same length/character/spacing/reserved rules.
  New signup must atomically insert the profile, nickname and password credential.
  Legacy users without a display name remain unclaimed; a future API must require
  a nickname before treating onboarding as complete. Do not publish the old
  optional `users.display_name` as a second nickname source.
- Existing non-null `display_name` values are copied unchanged. Invalid, reserved
  or duplicate legacy nicknames cause migration rollback; owner-approved remediation
  and sanitized preflight evidence are required before any remote application.
  The migration does not invent names or inspect/change any remote records.
- Nullable `nickname_changed_at` records the last participant change. NULL means no
  participant change yet, so the first change is immediate. The tested local adapter
  enforces the approved cooldown/no-op/case-only rules atomically. Administrative
  corrections preserve it. Phase 4 settings, cooldown
  reset and moderation overrides are not implemented.
- Migration 0008 creates `auth_sessions` referencing `users`, with unique token digests, creation,
  expiry and revocation timestamps and indexes for user-wide revocation/expiry.
  It creates `auth_action_tokens` referencing `users`, with unique purpose-bound digests,
  explicit verification/reset purpose, creation/expiry/consumption timestamps and
  indexes for user/purpose lookup and expiry. Use STRICT tables, nonnegative UTC
  Unix seconds, application UUIDs where needed and restrictive foreign keys.
- `users.auth_version` provides generation fencing. New sessions/action tokens
  require the current active account version. Password changes/deletion, email
  changes and status changes advance the generation and revoke existing state;
  email changes also clear verification. Session/token identity is immutable and
  revocation cannot be undone. Session eligibility helpers compare generations.
  Migration 0008 also rejects password credential ownership reassignment, including
  reassignment combined with a hash change. Regression tests prove failed moves
  preserve the credential and original sessions/generation; legitimate credential
  changes still advance generation and revoke sessions.
- Action tokens store only unique 64-character hex digests, purpose, generation,
  creation/expiry/consumption/revocation and the bound email for verification.
  TTL constraints enforce 24-hour verification and 30-minute reset links. Consumption
  cannot be repeated or cleared, and rejects stale/revoked/expired state.
- Local tests exercise guarded D1 batches for consumption plus verification or
  password change, using `changes()=1` to gate the next statement on the winning
  consume. Triggers revoke all sessions/action tokens after credential change;
  stale session insertion fails. Mutation failures roll back token use. Concurrent
  attempts have one winner. Phase 3.2 now provides tested storage adapters for
  these recipes. Live recovery flows remain unfinished.
- External-provider authentication is discontinued. Retained provider storage is inert pending separately approved cleanup.

### Final password benchmark and development decision

The final controlled Cloudflare Workers Free experiment on 2026-10-14 measured
PBKDF2-HMAC-SHA256 at 20,000 iterations followed by HMAC-SHA256 with an independent
256-bit pepper, using actual invocation records for the private benchmark Worker.

| Operation | Samples | Median CPU | Worst CPU |
| --- | ---: | ---: | ---: |
| Hash | 9 | 7 ms | 8 ms |
| Verify | 10 | 7 ms | 8 ms |

Baseline CPU was 1 ms (2 ms wall). Hash/verify wall median was 7 ms and worst was
9 ms. All 20 attempts completed successfully without CPU-limit terminations or
verification errors, and all had matched platform telemetry. Only one isolate
was observed, with no observed cold start; full login/session overhead was not
measured. Worst nominal headroom below 10 ms was only 2 ms. Baseline was not
subtracted. The benchmark did not establish comfortable headroom for full auth.

The owner subsequently selected this reduced-cost configuration **for development
only**, accepting its security trade-off. It is not approved for public authentication.
Temporary remote Workers/secrets were deleted and verified; local benchmark
implementation, runners and disposable artifacts have been removed. This concise
summary is the retained evidence. No further standalone password benchmark is planned.
The next performance gate is separately approved integrated DEV authentication
testing, including sessions, abuse controls and realistic runtime variation.

### Phase 3.2 — Authentication Database (implemented locally)

- `worker/auth/database.ts` reads private password credential snapshots using parameterized queries. Credential verification
  must preserve the same auth generation through session issuance. There is no
  automatic email-based linking or OIDC-token validation in this repository layer.
- `worker/auth/sessions.ts` implements the session-store contract, seven-day session
  issuance, current-active-account resolution, individual revocation and user-wide
  generation advancement. Raw session tokens are returned once and only digests are
  stored. Logout-all fences concurrent stale logins as well as revoking existing state.
- `worker/auth/action-state.ts` issues purpose-bound 24-hour verification and
  30-minute reset tokens. Completion uses one guarded D1 batch, binding user, purpose,
  current generation, active status, email and authoritative server time. Reset
  requires an existing password credential; it cannot implicitly add a login method
  to a Google-only account. The credential-change trigger revokes all sessions and
  action tokens. Failed mutations roll back consumption; concurrent use has one winner.
  A low-level `consume` is not reset/verification completion; future flows must use
  the atomic completion methods after explicit protected confirmation.
- Existing TEXT credential storage accepts v2 records. No new migration, table,
  dependency or application route is required; all migrations 0001–0008 are unchanged.
  Migration 0008 remains local and needs separate remote approval, legacy nickname
  preflight/remediation and recovery evidence. Optional MFA remains a later stage.
- Token reissue/supersession, retention/cleanup and delivery policy remain owner
  decisions before endpoints: issuing a token currently leaves other valid tokens
  until expiry or generation revocation. These Phase 3.2 adapters alone send no mail;
  Phase 3.4 adds local transport below. No public flow is enabled.
  These local adapters do not establish full authentication or public readiness.

Approved abuse-prevention design (registration-only local implementation below): use D1 atomic fixed-window
counters before password crypto or email delivery, keyed by HMAC-derived normalized
account/IP identifiers using a separate server secret. Store no raw IP/email in
counter keys or logs. Limit login, signup, resend and recovery separately, apply
generic responses for both existing and missing accounts, avoid permanent account
lockout, and fail closed if enforcement is unavailable. Bound key length/counter
cardinality; expire windows and delete stale rows in capped batches. Registration
now implements these counters locally; other flows remain unfinished. Before hosted
enablement, approve thresholds, retention and idle cleanup execution. No remote
secret, schedule or infrastructure is created. Cloudflare's location-local binding
is supplementary, not a strict global limiter.

### Phase 3.3 — Registration (local only; not enabled on DEV/PROD)

- `/register` has the five required account fields, privacy labels, nickname/password
  guidance, pending state and accessible success/error feedback. Passwords are never
  put in URLs, browser storage or application logs and the form clears them after
  every attempt. The route and link are included only by Vite development builds.
- `POST /api/auth/register` validates exact fields, the existing nickname/name/email/
  password rules and a streamed 4096-byte JSON/UTF-8 body bound. One D1 batch creates
  the UUID profile (email initially unverified), canonical nickname and v2 password
  credential. Database uniqueness wins concurrent email/nickname races; any failure
  rolls back the entire account. There is no implicit login, provider linking or
  role/privilege assignment. Phase 3.4 now attempts local verification delivery
  after a successful creation, as described below.
- The initial local endpoint requires `REGISTRATION_MODE=local-only` AND an HTTP loopback request
  URL. The separately guarded hosted DEV mode is documented below. Missing/malformed
  independent pepper/limiter secrets fail closed, as does unavailable limiter storage.
  Root Wrangler environments and remote secrets remain unchanged. Existing routes
  and health behavior are preserved; hosted access remains disabled until explicitly configured.
- Pre-login request protection requires exact configured loopback `Origin`, JSON,
  `X-LAN-Request: 1` and same-origin Fetch Metadata when supplied. Other methods,
  encoded bodies and query parameters are rejected; no CORS is granted. Registration
  grants no ambient session authority; authenticated logout uses the session-bound
  CSRF integration below. These checks do not replace abuse limits for non-browser clients.
- Migration `0009_create_registration_rate_limits.sql` is prepared and tested ONLY
  locally. Registration uses atomic D1 fixed-window HMAC-keyed counters before password
  hashing: global 30/hour first, IP 5/15 minutes, normalized email 3/hour. These are
  conservative local development defaults requiring owner review before DEV enablement.
  Raw IP/email identifiers are never stored in counters. Global admission bounds new
  IP/email keys to at most 61/hour, including its own key. Windows expire after at
  most one hour; each eligible request deletes at most 100 expired rows. Idle rows
  remain until another request; a reviewed idle-cleanup/retention operation is required
  before public use. No scheduler is created. Hosted client-IP trust/canonicalization
  and IPv6 abuse policy must be reviewed when adding any hosted mode.
- Success and duplicate email/nickname attempts receive the same generic 202 response
  after password hashing. No profile, email, name, password record or token is returned;
  this avoids an explicit account-existence oracle. Storage failures return sanitized
  503, bad inputs 400 and limits 429 without retries. This does not claim constant-time
  network/database behavior. Users are told that existing details may be unavailable.
- Local browser submission through Vite's loopback-only `/api` proxy was verified
  with fictional details and disposable in-memory data, including validation feedback,
  password clearing, title and desktop/mobile layout. All 171 application tests,
  strict TypeScript and the production build passed; production frontend output was
  checked to exclude registration UI and server-secret names. Local setup is in
  README.md. Integrated DEV CPU, privacy approval,
  remote migrations 0008/0009, secrets, abuse policy and explicit hosted enablement
  remain separate gates. The owner approved finalizing the local registration implementation.

### Login/logout milestone — finalized locally

- `POST /api/auth/login` validates exact email/password fields, a bounded JSON body,
  trusted Origin/custom header/Fetch Metadata and the existing password policy.
  Normalized email lookup and PBKDF2 20k + pepper verification reuse the foundation.
  Missing and disabled accounts perform synthetic native 20k verification work and
  receive the same generic 401 as incorrect passwords. This mitigates the obvious
  missing-account timing difference; it does not promise constant-time network/SQL
  behavior. Legacy hash verification remains explicit; no silent hash upgrade or
  password/security policy change is introduced.
- Historical login-limit numbering in this subsection uses 3.8.2/3.8.3 from the
  earlier GUI work, not the current MFA stages. Its recorded deployment/configuration
  evidence is a checkpoint, not authorization for the new MFA rollout.
- Deployed pre-Phase-3.8.3 login policy reuses migration 0009 counters with separate `login` HMAC domain keys:
  global 30/hour, IP 5/15 minutes, normalized account 5/hour, before verification.
  Invalid input consumes global/IP admission. Limits include successful attempts,
  do not permanently lock accounts and fail closed on storage errors. Registration
  limits are unchanged. Each action admits at most 61 keys/hour (122 combined);
  capped expiry cleanup and the outstanding idle-retention/hosted-IP review apply
  to both. The rate-limit secret also signs CSRF proofs using the existing distinct
  `lan-party:csrf:v1` HMAC domain; it remains independent from the password pepper.
  Phase 3.8.2 local investigation confirms these are cumulative admission limits,
  not failed-password counters: success/logout/reset do not clear them. Windows
  align to UTC quarter-hours (IP) and hours (email/global); shared-IP accounts share
  the IP allowance. Action-specific HMAC domains isolate registration, verification
  and recovery from login. A same-password reset still uses a fresh salt, advances
  the authentication generation and revokes previous sessions; a local reproduction
  confirmed subsequent login succeeds when admission remains available. The current
  429 response does not identify the exhausted scope and always sends Retry-After
  3600; the UI's "up to one hour" is an upper bound, not an exact countdown. No
  remote bucket attribution or security-policy change was made by this investigation.
- Phase 3.8.3 is implemented and owner-approved for DEV deployment. It replaces the above login
  policy with five confirmed failures per normalized email + trusted IP in a rolling
  15-minute window. Success adds no failure and does not erase previous failures.
  Unknown/disabled accounts have equivalent counters and synthetic password checks.
  One pending check per pair uses a 30-second lease and up to one second of application
  polling; busy checks return temporary 503/Retry-After 1, not a failure lockout.
  Unique owner records fence stale/double completions, including same-second lease
  reacquisition. D1 batches atomically acquire/finalize reservations; expired checks
  cannot issue sessions. Database uncertainty is not a confirmed password failure.
  Five expiring failure slots provide rolling expiry; Retry-After identifies the
  earliest relevant expiry, and the frontend displays that duration.
- Shared observations at 60 requests/minute (IP or global), 30 failures/15 minutes
  (IP), or 30 failures/hour (global) require Turnstile instead of locking out unrelated
  accounts. Shared windows remain fixed; successful/challenged requests do not refund
  observations. Existing D1 storage uses separate v2 HMAC domains, failure slots,
  pending/owner rows and two deterministic 30-hit volume lanes. No migration is
  needed. Legacy counters and registration/recovery/email limits remain unchanged.
- The challenge script loads only after a challenge response, using Managed mode
  with interaction-only appearance. Tokens stay in memory; login submission remains
  explicit. Expiry, unavailable scripts and provider errors cannot bypass protection.
  No automatic login, Siteverify or widget retries are made. Siteverify must confirm
  success, canonical hostname and action `login` before credential lookup/hashing;
  it uses a five-second timeout and rejects redirects. An atomic SHA-256 token-digest
  fence prevents replay; raw tokens are never stored. Proof cannot bypass pair limits.
- Local tests cover 100 registered users sharing one IP plus ten mistakes, concurrency,
  rolling expiry, stale leases, rollback, replay, provider failures and reset/session
  compatibility. They establish local correctness, not hosted CPU or burst capacity.
  Shared signals can force challenge friction; same-IP targeted denial, challenge-solving
  attacks, high-cardinality storage abuse and Free-tier exhaustion remain risks.
  Database latency can extend wall time. Optional MFA was future
  work at this checkpoint; the current MFA implementation is described in MFA_DESIGN.md. No new account-wide lockout is added.
- **Phase 3.8.3 DEV configuration preflight (2026-10-18):** the owner created the
  widget; read-only inspection confirmed the public `AUTH_TURNSTILE_SITE_KEY`
  variable and encrypted `TURNSTILE_SECRET_KEY` binding on `lan-party-dev`.
  The exact public sitekey is declared in `wrangler.jsonc` under `env.dev.vars`,
  because normal Wrangler deployment replaces dashboard plaintext variables.
  Future sitekey rotation must update this configuration too. Wrangler 4.149.0
  preserves existing encrypted secrets during normal deployment; the GitHub DEV
  workflow uses `wrangler deploy --env dev`. Default PROD configuration is unchanged.
  Widget requirements remain Managed mode for `dev.lan-party.club` only, with
  pre-clearance disabled; binding metadata does not verify widget settings or the
  key pair's live behavior.
  Do not add PROD or the secondary workers.dev hostname. Configure public DEV Worker
  binding `AUTH_TURNSTILE_SITE_KEY` and encrypted secret `TURNSTILE_SECRET_KEY` on
  `lan-party-dev` through the approved secure mechanism; never put the secret in chat
  or Vite variables. Action `login` is set in code; expected hostname comes from
  existing `AUTH_PUBLIC_ORIGIN=https://dev.lan-party.club`. Both bindings are checked
  before hosted login, so deploying without them deliberately makes login unavailable.
  No new frontend build flag is required. Preserve all existing modes and bindings.
  DEV configuration parsing and a local-only packaging dry-run passed. The owner
  approved commit/push, automatic DEV deployment and a minimal live challenge check;
  no forced thresholds or remote D1 writes are authorized for that check. Live
  challenge validation remains pending. Turnstile's browser dependency belongs in the
  planned privacy information. No remote setup or live email/account operation was
  performed during local implementation. See official [widget options](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/)
  and [server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
- D1 creates a fresh seven-day session with a hashed random 256-bit token and the
  credential generation captured before password verification. Generation fencing
  prevents stale credentials issuing a session after a password/status change.
  Successful re-login revokes the presented prior session. The only raw session
  token response is `Set-Cookie: __Host-lan_session=…; Max-Age=604800; Secure;
  HttpOnly; SameSite=Lax; Path=/`; there is no Domain attribute, token URL,
  browser storage or client-readable session-token payload.
- `GET /api/auth/session` validates cookie format/uniqueness, expiry, revocation,
  active account and credential generation. Its explicit response projection is
  only UUID/nickname/member number, a verification-status boolean and a separate session-bound CSRF proof. Private names/email,
  password records and session tokens are excluded. Invalid sessions return 401
  and expire the cookie. All authentication responses are `no-store`, with no CORS.
- `POST /api/auth/logout` requires a valid session, exact trusted request origin,
  JSON/custom header and the existing session-bound CSRF proof, then revokes the D1
  digest before expiring the cookie with matching attributes. Storage failures
  report unavailability instead of claiming logout. GET never mutates D1 authentication state.
- New endpoints additionally require `AUTH_SESSION_MODE=local-only` AND an HTTP
  loopback request URL. Hosted requests receive 404 with that flag; the new explicit
  hosted DEV mode is documented below and is not configured remotely.
  The original HTTPS-only CSRF helper is unchanged in contract; an explicit
  loopback-only variant shares its verification logic for this gated local flow.
  Secure cookie attributes are never weakened for local use. The tested browser
  accepts Secure cookies on loopback. If another browser rejects them, this local
  flow is unavailable there; supporting trusted local HTTPS requires a separately
  reviewed setup/handler change, not removal of cookie protections.
- Development builds provide a working login form, nickname/member-number account page,
  Login/Account navigation states, logout, session restoration on reload and login
  redirects for unauthenticated account visits. Passwords clear after attempts;
  errors have accessible feedback. Production builds keep the disabled login preview
  and omit local registration/account routes and active forms.
- The local browser flow registration → incorrect login → login → account → reload
  → logout → unauthenticated account redirect passed with fictional participants
  and disposable in-memory D1/secrets. Desktop/mobile layout was checked, including
  390 px width without horizontal overflow. Automated route tests cover cookie
  attributes, hashed storage, expiry, revocation, CSRF, limits, generic failures,
  private-data projections and hosted/configuration rejection. No migrations or
  deployment configuration changed. All 185 tests, strict TypeScript, production
  build and diff checks passed, including safe logout storage failure behavior.
  Finalized on `dev` in commit `da9e93df838a1ed57cad3973d77821f4bb6f6307`;
  automatic DEV deployment and GitHub CI passed. Hosted authentication stays disabled.

### Phase 3.4 — Email verification (committed local implementation; hosted access disabled)

- New registrations attempt a purpose-bound 24-hour verification using the existing
  migration 0008 action-token store. Only domain-separated SHA-256 digests, UUID,
  generation, normalized-email binding and timestamps go into D1; raw tokens go
  only to the trusted delivery transport. Duplicate registration does not resend,
  rotate credentials/tokens or reveal an existing account. Delivery/token-issuance
  failure leaves the complete account unverified and keeps the generic registration
  response; explicit resend can recover without recreating the account.
- `POST /api/auth/verify-email` accepts only a UUID and a well-formed token. It
  checks purpose, account/email/generation binding, active status, expiry, revocation
  and single use through the existing atomic consume-and-mark-verified D1 batch.
  Concurrent confirmations have one winner; failures roll back consumption. GET
  cannot consume links. Confirmation neither logs the user in nor grants roles.
- Verification links use `/verify-email#user=…&token=…`. The local frontend captures
  the proof in memory and replaces the history entry with `/verify-email` before
  React/router initialization. Fragments are not sent in HTTP/referrers. An explicit
  confirmation button sends the bounded JSON POST; merely opening a link does not
  verify it. The proof is cleared after an attempt or leaving the page. Reloading
  before confirming loses the proof intentionally; request another email if needed.
  No verification tokens appear in ordinary registration/session/resend responses, DOM text,
  application logs or browser storage. The restricted mailbox response is the
  deliberate development-only exception for obtaining disposable verification links.
- `POST /api/auth/resend-verification` accepts an anonymous normalized email, or
  an authenticated empty-body request with the existing session-bound CSRF proof.
  Unknown/disabled/verified/unverified accounts and delivery failures receive the
  same generic 202. Persistent separate `email-resend` counters enforce global
  30/hour, IP 5/15 minutes, email 3/hour and eligible UUID account 3/hour before
  issuance. Confirmation has separate `email-confirm` global/IP/account counters
  at 30/hour, 5/15 minutes and 3/hour. Rate-limited requests return 429 without
  retries. Across registration/login/resend/confirmation, admission bounds new keys
  to at most 274/hour (61 + 61 + 91 + 61). The shared expiry/idle-cleanup gate remains.
- Replacement revokes outstanding verification tokens and inserts the replacement
  in one D1 transaction, guarded by the current unverified account generation.
  Failed inserts roll back revocation. Failed/uncertain delivery revokes that new
  digest only, with no automatic retry; another deliberate request is required.
  Superseded mail cannot verify an account, even if delivery completion reorders.
- `EmailTransport` has a safe local transport and a prepared Resend REST adapter,
  based on the [official send-email API](https://resend.com/docs/api-reference/emails/send-email).
  Historical email-polish Phase 3.8 adds one shared branded HTML/plain-text template for verification and
  recovery, with canonical DEV action links and no external assets. Verification
  retains explicit POST confirmation, followed by a success page and login action.
  Local Phase 3.8 polish hides resend controls during confirmation, shows a generic
  registration-pending screen, and offers verification help only after a correct
  password for an unverified account (no session issued). HTML uses descriptive
  action links; plain text retains the full URL. Organizer support copy has no
  unapproved contact destinations. The owner confirms Gmail and Microsoft 365/
  Mimecast registration, verification and login passed before this local polish.
  Provider click/open tracking must be confirmed disabled before separately approved
  live template tests; local fixtures do not prove rendering in email clients.
  The Resend adapter uses a bounded request, a digest-derived idempotency key,
  sanitized failures and no retries. Its tests inject fake HTTP; no real email is
  sent. The locally implemented hosted DEV mode now selects its guarded wrapper;
  see the integration and email policy below. The owner completed the Resend
  domain/key setup; the remaining configuration and activation require approval.
- Local mail requires `AUTH_EMAIL_TRANSPORT=local`; its bounded volatile mailbox
  accepts only fictional `.test` recipients and at most 50 messages, purging expired
  messages opportunistically. `/local-mail` retrieves one usable message via a
  POST guarded by a THIRD independent 256-bit `AUTH_LOCAL_MAIL_SECRET`, exact
  Origin/custom header, JSON and no CORS. Retrieval discards superseded D1 tokens
  and removes the returned message from memory; restart loses all mail. The secret
  is manually entered, cleared after retrieval and never shipped in frontend configuration.
  No D1 table stores mail bodies/raw tokens, and no extra infrastructure is created.
- Local verification/mailbox APIs require explicit `AUTH_SESSION_MODE=local-only`, local
  transport AND an HTTP loopback request URL. The mailbox remains exclusively local;
  verification also supports the guarded hosted DEV mode below. Default production
  builds omit authentication forms. Existing local registration setups without a transport issue then revoke
  an undeliverable token and remain unverified; configure the local transport and
  explicitly resend. All authentication/verification responses use `no-store`.
- Account pages now display verified/unverified status and a protected resend
  action for unverified accounts, without exposing private email/names. Unverified
  participants cannot log in; legacy unverified sessions are also rejected. Event signup is unavailable and its future APIs
  must use the existing verified-account eligibility gate plus ownership/event checks.
- No new migration is necessary. Migrations 0001–0009, remote secrets, Wrangler and
  deployment configuration remain unchanged. Migrations 0008/0009 are still local only.
  Browser verification with fictional participants passed register → restricted
  message → explicit verification → login → verified account → reload → logout →
  protected redirect, including mobile verification layout without horizontal overflow.
  All 201 automated tests, strict TypeScript, production build and final diff checks
  passed, including the maximum-length resend email regression. The owner approved
  finalizing this locally verified Phase 3.4 milestone; hosted access remains disabled.
- Owner decisions before hosted use: sender/domain and DEV delivery allowlist;
  delivery quotas, failure/reissue messaging and any durable retry/outbox policy;
  expiry/consumed/revoked-token deletion and provider-log retention; idle limiter
  cleanup and participant retention/deletion/privacy notice. Raw links necessarily
  reach the chosen email provider/mailbox in a future real delivery flow; approve
  its processing arrangements. Current local limits/volatile mail are not a hosted
  reliability or privacy policy. No scheduler, webhook or real-recipient delivery is added.

Remaining release gates: verify integrated DEV password/authentication CPU headroom, review
hosted session/cookie and CSRF integration, abuse policy, recovery enumeration/timing
mitigations, token cleanup and delivery failure handling. Local workerd crypto tests
do not prove a Workers Free deployed CPU budget or complete auth behavior.
The owner-approved development work factor is fixed; further security changes need review.
Local registration, login/logout, email verification, account UI and storage primitives are implemented.

### Phase 3.6 — Password recovery (locally complete; hosted activation pending)

`/forgot-password` and `/reset-password` reuse persistent abuse controls, the
restricted fictional mailbox and guarded DEV Resend transport. Requests return
generic account-neutral feedback. Reset proofs expire after 30 minutes; only
purpose-bound digests are persisted. Atomic consumption/password replacement has
one winner under concurrency, rejects stale/replayed/crossover proofs and revokes
all previous sessions through the existing credential-generation triggers.
Passwords retain the approved 20,000-iteration PBKDF2 plus independent pepper and
12–128-character policy. Recovery does not verify email or grant account permissions.

Finalization checks: 231 Worker/application/migration tests plus 16 existing DNS
safety tests passed (247 total), strict TypeScript, default production and hosted
DEV builds, and diff checks passed. Previously completed fictional local browser
recovery verification is retained; real provider delivery, live hosted browser
behavior and integrated Worker CPU headroom still require controlled DEV testing.
Migrations 0001–0009 and deployment configuration remain unchanged; 0010 is new
local preparation only. No hosted activation or remote migration is included.

### Permanent cosmetic member numbers — local migration 0011

Every account keeps its existing UUID identity and gains a public permanent member
number. Regular allocation starts at 11. Slots 1–10 are reserved for organization
members; three are planned, with no accounts or actual assignments created here.
Numbers never grant roles or permissions. Public account projection includes only
UUID, nickname and decimal-string `memberNumber`; private names/email stay private.
The account page renders `Nickname #0011`, with minimum four digits and no truncation.

`0011_create_member_numbers.sql` adds a STRICT append-only issuance ledger and
transactional account-insert triggers. SQLite INTEGER PRIMARY KEY AUTOINCREMENT
serializes concurrent allocation, retains the high-water mark and fails closed at
SQLite's signed 64-bit limit. D1 reads cast numbers to TEXT; JSON and formatting
never pass through JavaScript Number. Existing accounts backfill by ascending
`created_at`, then UUID, all starting at 11; no organization status is inferred.
Failed account transactions roll back allocation. Issued rows cannot be changed,
deleted, replaced or recycled; nickname/role changes do not affect them.

The ledger deliberately has no FK to the deletable account: it retains the original
UUID, issue time and (for reserved provisioning) actor UUID as immutable tombstones,
without names, email or credentials. Existing account FKs and deletion restrictions
are unchanged. This is not an account-deletion implementation; pseudonymous ledger
retention must be covered by the eventual privacy/deletion policy before public use.

`createOrganizationAccount` is an internal, unexposed provisioning adapter. It
requires a current verified administrator session, an active admin role AND explicit
`users.manage` permission, rechecked atomically while claiming an unused slot and
creating the normal profile/nickname/password credential. It assigns no roles,
does not verify email and sends no mail. Only new accounts can receive a reserved
number; existing issued numbers cannot be exchanged. A future HTTP wrapper must
add normal CSRF/request protection. No admin API or UI is introduced now.
It requires an already provisioned administrator; the existing separately approved
first-administrator bootstrap is not replaced by a low member number or special bypass.

Before hosted activation: approve/review this local change, apply 0011 to DEV only
after a fresh preflight/recovery checkpoint, deploy compatible code, and separately
approve any actual organization identities/slot mapping and controlled provisioning.
No remote migration, assignment, deployment or Git operation is authorized here.
Local validation: 97 focused member-number, registration/login, account projection,
verification, recovery, hosted-DEV and RBAC tests passed, plus strict TypeScript,
default/hosted-DEV builds and diff checks. Reserved-field denial and 0011's strengthened
REPLACE protection were verified with focused reruns. Unrelated suites and browser
flows were not repeated; this does not verify hosted operation with 0011.

### Hosted DEV email policy

- [Resend Free currently advertises](https://resend.com/pricing) **3,000 emails/month
  and 100/day**. These provider/account limits may change and require account-level
  verification; they are not the application's testing allowance.
- The owner-approved default is **60 provider-send attempts per UTC day**, shared
  by registration verification, verification resends and password recovery. Reserve
  atomically before delivery; failed/uncertain attempts count, with no refunds or
  automatic retries. Exhaustion prevents further sends. Local fictional mail is separate.
- Only a separately recorded owner approval may add **5–10 attempts for one specific
  UTC day**. It never raises the permanent default. **No extension is approved or
  seeded.** There is no limiter-disable or arbitrary daily-limit configuration.
- Missing/empty/invalid recipient allowlists must deny hosted registration before
  account creation and deny provider sending. No recipients are configured by this task.
- Local preparation in `worker/auth/dev-email.ts` validates the canonical origin
  `https://dev.lan-party.club`, sender `noreply@auth.lan-party.club`, explicit
  `AUTH_ENVIRONMENT=dev`, `AUTH_EMAIL_TRANSPORT=resend`, Worker-secret `RESEND_API_KEY`,
  and a JSON-array `AUTH_DEV_RECIPIENT_ALLOWLIST` (keep private addresses out of Git).
  Hosted registration reuses its recipient check before account creation.
- `AUTH_EMAIL_PROVIDER_DAILY_LIMIT` and `AUTH_EMAIL_PROVIDER_MONTHLY_LIMIT` must be
  explicit positive, operator-verified allocations, no higher than advertised Free
  limits. Lower account limits/remaining quota and other account users must be
  accounted for; a sending-only key cannot independently inspect account usage.
  These values cannot raise the internal allowance. Provider rejection still fails
  safely without retry; no successful delivery is inferred from budget admission.
- New **local-only migration 0010** stores aggregate daily attempts and separately
  referenced dated approvals, without recipient data. It enforces atomic daily and
  calendar-month admission. It is not applied remotely; migrations 0001–0009 stay
  unchanged. Retain current-month counts so cleanup cannot reset the monthly cap.
- The guarded transport is integrated locally across verification, resends and
  recovery. Deployment, activation and real email tests each require separate approval.

### Hosted DEV integration — implemented locally, disabled remotely

The backend requires `AUTH_ENVIRONMENT=dev`, `REGISTRATION_MODE=hosted-dev` and
`AUTH_SESSION_MODE=hosted-dev`, with `AUTH_EMAIL_TRANSPORT=resend` and canonical
`AUTH_PUBLIC_ORIGIN=https://dev.lan-party.club`. Only that exact HTTPS hostname
is accepted. PROD and workers.dev aliases receive 404; unset modes remain disabled.
No Wrangler configuration, remote binding or secret is changed by this implementation.

Registration checks the private allowlist before creating an account. Denied
recipients receive generic feedback without account creation. All provider sends
use the single budget policy above. Unverified accounts cannot log in or retain
usable sessions; password recovery does not verify an address. Anonymous verification
resend remains available from the login page. Secure/HttpOnly/SameSite cookies,
exact-origin JSON/custom-header checks, session-bound CSRF, persistent abuse limits
and fail-closed trusted client-IP handling apply. Provider errors remain sanitized;
no retries, token logging or new cleanup/retention behavior is introduced.

Frontend forms require a DEV build using public `VITE_AUTH_MODE=hosted-dev` plus
the exact DEV hostname at runtime. This is presentation configuration, not access
control; backend gates are independent. Default production builds omit active auth
forms. The fictional mailbox remains local development only in both frontend/backend.
The DEV deployment workflow sets this flag only on its frontend build step; CI and
production build commands retain the default. Backend modes remain unset, so the
hosted forms show unavailable-service feedback until separately approved activation.

Offline tests use disposable D1 databases and an intercepted provider transport;
they cover registration, verification, login/logout, recovery, session revocation,
allowlist denial, shared-budget exhaustion and environment boundaries. They do not
establish real email delivery, deployed CPU headroom or live hosted browser behavior.

Remaining owner-approved operations: inspect/backup DEV and preflight legacy accounts;
approve migrations 0008–0010 individually with their dependencies; configure private
test recipients, verified provider allocations, independent `PASSWORD_PEPPER` and
`AUTH_RATE_LIMIT_SECRET`; review the DEV build/configuration and deployment sequence
with auth disabled first, then separately approve activation and controlled email
testing. No such operation is authorized by local development. Privacy/retention and
final public security review remain release gates; MFA remains optional for all roles.

Before approved activation, capture a current DEV recovery point/export and Worker
version, recheck pending migration order, and retain sanitized evidence privately.
On failure, disable both auth modes and withdraw DEV forms via the approved release
process; preserve account/session/budget data. Worker rollback does not undo D1
migrations. Database restore or destructive schema rollback needs separate approval;
never erase sending counters to regain allowance.

The later integrated test uses one approved allowlisted fictional participant and
a small fixed, sequential/no-retry plan: register/verify, rejected unverified login,
login/session/logout, resend and forgot/reset with old-password/session rejection.
Reserve every provider attempt under the shared allowance. Collect actual platform
CPU/wall/outcome records for each auth route, including crypto, D1, CSRF and delivery
overhead; do not substitute browser elapsed time or rerun isolated hash benchmarks.
Stop on missing telemetry, CPU-limit errors, unexpected mail, session/privacy failures
or exhausted allowance. No email, telemetry setup or activation occurs in this task.

Read-only DEV preflight (2026-10-17): `lan-party-dev` binds database
`a3c4cea6-ceb7-43b8-b9b7-b374726b35b4`. Migration history confirms 0001–0007;
0008–0010 are pending. `quick_check` is `ok`, foreign-key checks are empty and
there are no existing users or legacy nickname conflicts. A Time Travel bookmark
is available; refresh/capture recovery evidence immediately before any approved
migration. Only ASSETS, DB and RESEND_API_KEY bindings are present. Authentication
mode/origin/allowlist/provider allocations and pepper/rate-limit secrets still need
separately approved DEV configuration. DEV HTTPS/health respond 200; the disabled
session API responds 404. Resend domain/key readiness is owner-confirmed; actual
account allocation, delivery and integrated platform telemetry remain unverified.

No public registration/login, verification, reset or delivery flow is marked complete.
No remote database access, manual deployment or provider configuration is authorized
by this local implementation.

### Authentication methods — owner decision, 2026-10-25

Google OAuth is permanently discontinued after the final hosted freshness test
returned `fresh-proof-unavailable`. Reintroduction requires an explicit owner reversal.
The deployed DEV application supports email/password and optional TOTP MFA with one-use
recovery codes. Password changes require the current password and, when enabled,
fresh LAN Party MFA. Recovery never creates a first password or bypasses MFA.
See [the removal and data-cleanup plan](docs/GOOGLE_REMOVAL.md).

The owner confirms all DEV data is disposable; no Google-only account transition
is required. Forward migration 0016 was applied and verified on DEV under #10. A disposable
DEV reset was a separate proposal, not an instruction to run it now. DEV source
and secret-name audit at #17 found no Google runtime/configuration references or
Google-named secret bindings; provider-console retirement remains unverified and
separately approval-gated. Migration history and immutable member allocation
are retained. See the cleanup plan for exact operations and stop conditions.

### Final Phase 3 milestone — required before public registration

Publish participant privacy information describing public nickname/attendance and
the approved purposes for private first/last names (participant administration and
addressing attendees) and private email (account security and essential event
communication). Document authorized access, retention, deletion and participant
rights/request handling, with owner approval of unresolved policy details.
Include a concise AI-assisted development disclosure and a public link to
[Awandalo/Lan-Party](https://github.com/Awandalo/Lan-Party), reusing the existing
About/footer backlog rather than creating another page system. These pages are
not implemented by Phase 3.1. Complete a final security/privacy review and explicit
owner approval before enabling public registration or replacing Jotform.

### Overall roadmap

| Phase | Scope | Completion expectations |
| --- | --- | --- |
| 1 | Project foundation, tooling, and basic frontend | Complete: React, TypeScript, Vite, npm, folder conventions, safe ignore/configuration examples, and responsive frontend basics established; types and build validated. |
| 2.1–2.7 | Database foundations: events, accounts, authentication, authorization, registrations | Complete on DEV and PROD (owner-reported); migrations 0001–0005 form the foundation. Functionality remains separate future work. |
| 2.8 | Initial RBAC reference data | Complete on DEV and PROD (owner-reported); migration 0006 supplies reference data. No accounts or role assignments created. |
| 2.9 | News database foundation | Complete on DEV and PROD (owner-reported); migration 0007 supplies News storage. Current post-release website verification remains separate; see the environment reference above and RELEASE.md. |
| 3 | Authentication and account functionality | Implement reviewed authentication, sessions and account tools with secure ownership and permission checks; verify login and recovery behavior. |
| 4 | Administration | Implement authorized event and participant management, publication and registration lifecycle tools; verify every backend permission boundary. |
| 5 | Event registration functionality | Implement authenticated registration, selected-day attendance durations, cancellation/editing and attendance views/totals; verify server validation, persistence and privacy boundaries. |
| 6 | News and community features | Implement News after its database foundation, with authorized editing/publication and private drafts; keep additional future features in the backlog until separately approved. |

Security, behavior testing, accessibility, privacy decisions, and backup/recovery
readiness apply throughout development. Phase 3 authentication and server-side
authorization must protect registration and Phase 4 administration when introduced.
Production deployment and custom-domain setup remain separately approved operational
work, not an automatic consequence of completing a phase. Verify deployed behavior
and obtain owner approval before replacing Jotform.

Production data/schema changes and Codex deployments require explicit approval.
Commit/push only within AGENTS.md's Normal development push authorization or its
existing documentation policies; otherwise obtain explicit approval. Compilation
and builds are necessary checks
but must be accompanied by relevant behavior tests and documented manual checks.

## Future ideas — possible enhancements only

These are not immediate requirements and must not be implemented without approval:

- Gamification and achievements: permanent ranks, Grand-LAN Master/streaks, First
  Time LANner, participant-selected showcase, optional manual/secret achievements,
  and a possible Hall of Fame.
- Event pricing/cost sharing: minimum attendance, estimates, locking, adjustments,
  first-time promotions, extras, and optional financial transparency.
- LAN Idea Box: private suggestions and organizer review, shared contribution
  achievements, and later consent-aware News integration/public curation.
- Public website improvements: AI transparency, About This Project, and footer links.
- Additional participant account tools beyond the required registration identity.
- Waiting lists or participant capacity limits.
- Event announcements.
- Registration confirmation emails.
- Event reminders.
- Additional organizer tools.
- Calendar subscriptions.
- Improved attendance statistics.

`TODO.md` retains the detailed feature requirements and dependencies. These ideas
do not add numbered phases or authorize premature migrations. The initial Idea Box
is private; public suggestions, voting, and News integration are later enhancements.


### First-owner PROD bootstrap — approved local candidate

The owner approved a one-time #0001 bootstrap on 2026-10-27; this narrowly extends
the existing administrator-only organization-member provisioning rule for a zero-
account PROD database. It requires the exact trusted PROD build, explicit bootstrap
mode, privately configured owner email and a separate private setup capability.
The existing password and email-verification flow remains authoritative; no role
is assigned until successful one-time email verification. Concurrent claims are
serialized and failed account creation rolls back the receipt/ledger claim.
Migration 0019 adds a permanent consumed receipt, clears email at completion and
removes its account link on normal approved deletion. Other reserved numbers,
normal allocation at #0011 and all existing MFA safeguards remain unchanged.
PROD modes remain disabled. Remote migration, code publication/protected merge and
activation remain separate execution gates. Details and rollback are in
[PROD activation](docs/PROD_AUTH_ACTIVATION.md#first-owner-bootstrap--local-candidate-not-activated).
