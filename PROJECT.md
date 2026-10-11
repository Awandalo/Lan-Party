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
Phase 2.2 introduces the first event-structure migration and local-only validation;
Phase 2 is not complete, and no remote schema application is authorized yet.

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
  reserved names, not implemented routes. Participant accounts and moderator roles
  remain future enhancements.
- Public registration can work without an account. Securely claiming or editing
  these registrations remains an open decision.

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

These proposals do not select an authentication provider, registration-editing
method, final schema, or API contract.

### Approved Phase 2 event database foundation

- `migrations/0001_create_event_structure.sql` defines `locations`, `events`, and
  `event_days`. Validate it locally before requesting review for Cloudflare DEV.
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

## Open architectural questions and recommendations for review

1. **Organizer authentication:** Choose a secure approach suitable for a small number
   of organizers and the free-tier constraint. Decide how organizer access is granted
   and revoked before building administration endpoints.
2. **Registration editing:** Decide how a participant proves ownership of a registration.
   Participant accounts are a future idea, so the initial editing mechanism must be
   agreed without assuming accounts or email delivery are already required.
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

- Participant accounts.
- Waiting lists or participant capacity limits.
- Event announcements.
- Registration confirmation emails.
- Event reminders.
- Additional organizer tools.
- Calendar subscriptions.
- Improved attendance statistics.
