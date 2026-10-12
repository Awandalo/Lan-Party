# LAN Party website

## Purpose and project status

Build a modern, mobile-friendly website for organizing private LAN parties among
friends. It will replace the existing Jotform registration workflow after testing
and owner approval. Jotform must remain operational until that approval is given.

Typically there are two LAN parties per year, occasionally three. Traffic is very
low outside registration periods. Keep the implementation proportionate to this
scale and independent of work infrastructure.

The frontend and Cloudflare Workers foundation are implemented. Phase 2 now
focuses on database design and backend foundation alongside the planned event UI.
Migrations 0001 through 0005 are applied and verified on Cloudflare DEV. Phase 2.8
adds initial RBAC reference data with local-only validation. Phase 2 remains in
progress; migration 0006 requires review and separate approval before remote
application. No registration APIs or authorization middleware are implemented.

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

- Modern, gaming-inspired appearance with a dark theme as the initial default.
- Responsive desktop and mobile layouts.
- Clear navigation and accessible interfaces.
- Consistent styling across pages, without unnecessary visual complexity.
- A design that remains easy to change during experimentation.

Follow the styling boundaries in `AGENTS.md`: global rules belong in
`src/CSS/main.css`, while page-specific rules belong in matching
`src/CSS/<PageName>_style.css` files.

## Architecture

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
  It is validated locally; Phase 2.8 awaits review and separate remote DEV verification.
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
- The existing news backlog also used the Phase 2.8 label. Preserve that future
  work; this approved Phase 2.8 task is RBAC seeding. Confirm later news numbering
  with the owner before its implementation.

## Open architectural questions and recommendations for review

1. **Organizer authentication:** Choose a secure approach suitable for a small number
   of organizers and the free-tier constraint. Decide how organizer access is granted
   and revoked before building administration endpoints.
2. **Registration editing:** Participant accounts are required by Phase 2.5. Define
   server-side signup ownership checks and the recovery/editing flow before APIs;
   email delivery, sessions, password reset and revocation are not implemented yet.
3. **Registration fields and privacy:** Agree the minimum fields, whether any contact
   information is necessary, and how participants are informed about public display
   names and selected days. Set retention and deletion rules before launch.
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

| Phase | Scope | Completion expectations |
| --- | --- | --- |
| 1 | Project foundation, tooling, and basic frontend | Establish React, TypeScript, Vite, npm, folder conventions, safe ignore/configuration examples, and responsive frontend basics; validate types and build. |
| 2 | Database design and backend foundation; event pages and calendar | Establish and locally validate the event schema, then continue event presentation and multi-day calendar behavior using fictional development data; check desktop, mobile, and accessibility. Phase 2 remains in progress. |
| 3 | D1 database and registration system | Extend the event foundation with registration migrations, separate development storage, server validation, and selected-day registration; verify persistence and error handling. |
| 4 | Attendance overview and organizer administration | Show display names, per-day attendance, and totals; enable event lifecycle management and verify public/private data boundaries. |
| 5 | Authentication, security, testing, and production readiness | Complete security review and authentication testing, unauthorized-edit tests, manual end-to-end checks, privacy decisions, and backup/recovery documentation. |
| 6 | Cloudflare deployment and custom domain | Configure production and domain, verify deployed behavior, and obtain owner approval before replacing Jotform. |

Security is required throughout development. Although Phase 5 consolidates security
and authentication verification, administration must be protected when introduced
in Phase 4. Resolve its authentication design before implementation; do not expose
unprotected administration while waiting for Phase 5.

Production data/schema changes and Codex deployments require explicit approval.
Do not commit or push automatically. Compilation and builds are necessary checks
but must be accompanied by relevant behavior tests and documented manual checks.

## Future ideas — possible enhancements only

These are not immediate requirements and must not be implemented without approval:

- Additional participant account tools beyond the required registration identity.
- Waiting lists or participant capacity limits.
- Event announcements.
- Registration confirmation emails.
- Event reminders.
- Additional organizer tools.
- Calendar subscriptions.
- Improved attendance statistics.
