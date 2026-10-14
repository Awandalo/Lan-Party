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
development phase, with Phase 3.2 persistent authentication services next.
No registration or News APIs or authorization middleware are implemented.
Phase 3.1 now contains local, tested authentication primitives and contracts;
registration, login, persistence, email delivery and Google sign-in remain unfinished.

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
- Every participant must have a user account. Traditional email/password and
  optional Google login will share one central profile with multiple login methods.
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

### Environment reference

Use this table as the central environment reference for development, deployments
and release verification. `wrangler.jsonc` defines the Worker and D1 mappings;
the default configuration targets PROD and `--env dev` selects DEV.

| Environment | Git branch | Cloudflare Worker | D1 database | Website |
| --- | --- | --- | --- | --- |
| DEV | `dev` | `lan-party-dev` | `lan-party-dev` | https://lan-party-dev.servok.workers.dev |
| PROD | `main` | `lan-party` | `lan-party-prod` | https://lan-party.servok.workers.dev |

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
- Custom domains may be introduced later; do not assume one exists.
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
- The temporary `/admin` redirect has been removed. `/account` and `/manage` are
  reserved names, not implemented routes. Account interfaces and moderator roles
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
- Password and Google authentication must eventually reference the same user
  profile. Never automatically merge accounts solely because emails match.
- Names and emails are private profile information; the schema does not authorize
  exposing them publicly. Public display-name policy, privacy, retention/deletion,
  and registration ownership must be resolved before registration APIs.
- No credentials, authentication, authorization, role tables, registration APIs,
  or account UI are implemented by this migration. Participant account tools remain
  future work; registration requires a participant account, not organizer privileges.
- `worker/tests/accounts.test.mjs` tests both migrations together with fictional
  data and verifies that existing event schema and records remain intact.

### Approved Phase 2 authentication storage foundation

- `migrations/0003_create_auth_credentials.sql` adds strict external identity and
  password credential tables. It is applied and verified on Cloudflare DEV.
- `users` stores profiles; `user_auth_providers` maps external identities to profiles
  using unique `(provider, identity_namespace, provider_subject)` values. Google
  uses the validated OpenID Connect issuer and subject, never the provider email.
  Multiple explicitly linked identities per user are supported. Account merging
  based solely on matching emails is prohibited.
- Provider codes are nonblank and exclude `password`; only Google is initially
  supported by future APIs. Provider allowlists and trusted issuer/subject validation
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
   email delivery, sessions, password reset and revocation are not implemented yet.
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

### Phase 3.1 — Authentication foundation

The approved direction is email/password first, then Google OpenID Connect using
the same UUID accounts, sessions and authorization. Never automatically link an
external identity to an account solely because email addresses match.

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
  the existing cooldown. Phase 5 may later add explicit resets/configuration.
- Passwords require at least 12 characters, support 128 characters and have no
  arbitrary character-class rules. Rate limiting and safe errors are required
  before exposing authentication endpoints.
- Resend Free is selected for future delivery, but is not configured. Introduce a
  replaceable email-service interface when delivery is implemented, store keys in
  Cloudflare secrets and prevent DEV from sending to arbitrary real recipients.
- Verification links are single-use and expire after 24 hours. Password reset links
  are single-use and expire after 30 minutes. Recovery responses must be generic;
  a successful reset must invalidate all existing sessions.

Repository assessment and implemented local foundation:

- Migrations 0002/0003 already provide UUID profiles, normalized email uniqueness,
  nullable verification timestamps, one password credential per account and unique
  external `(provider, identity_namespace, provider_subject)` mappings. Migrations
  0004/0006 provide explicit RBAC grants; role names do not confer permissions.
  Reuse these records rather than introducing another account system.
- `worker/auth/passwords.ts` uses Web Crypto PBKDF2-HMAC-SHA-256 with 600,000
  iterations, a random 16-byte salt and a 32-byte result. Versioned records include
  the algorithm and cost. Verification bounds stored costs to 600,000–1,000,000,
  rejects malformed records and uses Workers' native timing-safe comparison.
  Password lengths count Unicode code points (12–128); input is neither trimmed
  nor truncated, and malformed surrogate sequences are rejected.
  This cost follows [OWASP guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html);
  runtime APIs follow [Cloudflare Web Crypto documentation](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/).
- `worker/auth/tokens.ts` generates random 256-bit opaque tokens and purpose-bound
  SHA-256 digests for sessions, email verification and password reset. Persist
  digests only. Expiry checks reject future, expired or consumed records; digest
  matching alone does not establish single-use consumption or authorize an action.
- `worker/auth/contracts.ts` defines one shared session-store contract, an atomic
  action-token consumption contract and a rate-limiter contract. Pure eligibility
  helpers reject disabled/mismatched/revoked/expired sessions, permit unverified
  account sessions and gate event registration on verification plus an approved
  persisted nickname. Accounts lacking a nickname must complete onboarding. This account
  gate does not replace event eligibility, ownership or RBAC checks. No persistent
  session store, token consumption transaction, rate limiter or middleware exists.
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
  containing only UUID and nickname. These are helpers, not registration endpoints.
  Private names are nonblank, well-formed strings of at most 100 code points without
  ASCII control characters. Email validation supports common ASCII unquoted
  addresses, preserves original spelling and lowercases the comparison key without
  stripping dots or plus tags. Quoted/internationalized address support remains
  outside this initial helper and requires review if needed.
- `worker/auth/cookies.ts` creates/parses/clears the approved opaque session cookie:
  `__Host-lan_session`, seven-day Max-Age, Secure, HttpOnly, SameSite=Lax, Path=/,
  no Domain. Duplicate/malformed cookies fail closed. Clearing a cookie alone is
  not logout; the future adapter must revoke its stored D1 digest.
- `worker/auth/csrf.ts` validates exact configured HTTPS Origin, JSON content type,
  `X-LAN-Request: 1` and a session-bound `X-CSRF-Token` for POST/PUT/PATCH/DELETE.
  The token is an HMAC-SHA-256 of the session digest using a separate 256-bit server
  secret, which remains unconfigured. Wrong origin/session/token/header/content
  type and GET/HEAD/OPTIONS are rejected. These are tested helpers, not middleware
  installed on public routes. Pre-login forms need a separate short-lived CSRF
  context when implemented. Verification/reset links must render confirmation and
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
- Public account responses must use the explicit nickname/UUID projection, never
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

Local validation: all 150 tests passed (`node --test worker/tests/*.test.mjs`),
including foundation/API, account-rule and migration 0008 tests. `npm run typecheck` and `npm run build`
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
  corrections preserve it. Phase 5 settings, cooldown
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
  attempts have one winner. These recipes validate storage compatibility; persistent
  service adapters and live recovery flows are still not implemented.
- Existing Google identity storage is sufficient; no new Google identity table is
  required. Later OIDC validation, state/nonce/PKCE and explicit linking still need
  separate implementation and provider configuration.

Password benchmark: seven warm and three fresh-runtime samples per operation in
local workerd measured median hash/verify process CPU of 140.625/156.250 ms;
worst warm CPU was 156.250/171.875 ms. This is owned-process CPU, not Cloudflare
per-invocation billing. Compared with the documented Free 10 ms CPU/request limit,
the local evidence suggests the current design is unsuitable; edge suitability
is not measured or approved. Keep the 600,000-iteration algorithm unchanged pending
owner review of hosting/algorithm alternatives. See the
[benchmark methodology, measurements and alternatives](worker/benchmarks/README.md).

Password hashing and Workers Free compatibility are explicitly deferred to a
separate owner decision. This security finalization does not change the PBKDF2
implementation, iteration count, algorithm, dependencies or benchmark configuration,
and does not deploy a benchmark. Free compatibility remains unresolved.

Approved abuse-prevention design (not implemented): use D1 atomic fixed-window
counters before password crypto or email delivery, keyed by HMAC-derived normalized
account/IP identifiers using a separate server secret. Store no raw IP/email in
counter keys or logs. Limit login, signup, resend and recovery separately, apply
generic responses for both existing and missing accounts, avoid permanent account
lockout, and fail closed if enforcement is unavailable. Bound key length/counter
cardinality; expire windows and delete stale rows in capped batches with a defined
retention deadline. The later adapter must reject expired counters as state, perform
opportunistic cleanup and document a bounded scheduled cleanup if idle leftovers
cannot otherwise meet the deadline. No counter table, secret, schedule or infrastructure
is created here. Cloudflare's location-local binding is supplementary, not a strict
global limiter. Thresholds, exact retention and cleanup execution need implementation
review alongside this functionality.

Remaining release gates: resolve password hosting/CPU suitability, implement persistent
session/cookie and CSRF integration, distributed rate limiting, recovery enumeration/timing
mitigations, token cleanup and delivery failure handling. Local workerd crypto tests
do not prove a Workers Free deployed CPU budget or complete auth behavior.
Do not weaken password cost to fit limits.
No registration, login, verification, reset, email delivery or Google flow is marked
complete. No remote database access, deployment or provider configuration is authorized
by this foundation work.

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
| 4 | Event registration functionality | Implement authenticated registration, selected-day attendance durations, cancellation/editing and attendance views/totals; verify server validation, persistence and privacy boundaries. |
| 5 | Administration | Implement authorized event and participant management, publication and registration lifecycle tools; verify every backend permission boundary. |
| 6 | News and community features | Implement News after its database foundation, with authorized editing/publication and private drafts; keep additional future features in the backlog until separately approved. |

Security, behavior testing, accessibility, privacy decisions, and backup/recovery
readiness apply throughout development. Phase 3 authentication and server-side
authorization must protect registration and Phase 5 administration when introduced.
Production deployment and custom-domain setup remain separately approved operational
work, not an automatic consequence of completing a phase. Verify deployed behavior
and obtain owner approval before replacing Jotform.

Production data/schema changes and Codex deployments require explicit approval.
Do not commit or push automatically. Compilation and builds are necessary checks
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
