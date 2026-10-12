# TODO / To remember

These notes record requested future work. They do not authorize backend,
authentication, storage, or production changes now. See AGENTS.md and PROJECT.md.

## Phase 2 database progress

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
- [ ] Review Phase 2.7 and separately approve/apply/verify migration 0005 on DEV;
  Phase 2.7 is not complete until that review and remote verification finish.
- [ ] Implement authenticated participant registration lifecycle transactions,
  ownership/permission checks, event/day eligibility and minimum-one-day enforcement
  only in a separately approved Worker task. No guest registration or capacity logic.
- [ ] Review full cancellation/re-registration audit requirements before APIs;
  retain selected days on cancellation and exclude cancelled registrations from counts.
- [ ] Plan `0006_seed_reference_data.sql` for initial `user`/`admin` roles and the
  explicit permission catalogue; review mappings before implementation. Preserve
  extensibility for `news_editor` and `moderator`; create no administrator account.
- [ ] Approve a controlled first-administrator provisioning process and audit design.
- [ ] Implement default-deny Worker permission checks, active-role/disabled-user
  rules and protected role assignment only in a separately approved task.
- [ ] Implement reviewed password hashing, trusted Google issuer/subject validation,
  explicit login-method linking, and disabled-account enforcement in future Worker logic.
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
- [ ] Continue remaining Phase 2 work; this migration does not complete the phase.

Local registration schema work is explicitly approved for Phase 2.7. Migrations
0001 through 0004 are applied and verified on DEV; remote application of 0005 is
not authorized by this task.
Automatic migration execution remains unauthorized.

### Phase 2.8 — News Database Foundation

- [ ] Create a versioned migration for a `news_articles` table in a separately
  approved implementation task. This roadmap update does not implement the migration.

Planned fields:

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

- [ ] Follow existing SQLite STRICT, application-generated UUID, timestamp and
  foreign-key conventions; preserve author attribution.
- [ ] Enforce draft privacy and public readability of published articles in future
  Worker APIs. Only authorized roles may create, edit or publish articles.
- [ ] Keep image files outside D1 and store references only. Evaluate Cloudflare R2
  when implementing image uploads; do not introduce upload infrastructure yet.

## Phase 4 — Event Pricing, Cost Sharing & Optional Extras

Future follow-up to Phase 4 event management and attendance work, dependent on
event creation, registration, participant management, and registered attendance
durations being implemented and tested. Plan this feature before participant
payments or payment collection. Preserve existing priorities and phase numbering;
the work packages below are backlog only, not implementation authorization.

### Cost sharing and minimum attendance

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

### First-time visitor promotion

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

### Reusable optional extras

- [ ] Design reusable event extras, initially gaming chair rental, rather than
  hardcoded chairs. Allow future monitors, equipment, meals, and other services.
- [ ] Support name, description, price, optional quantity or availability limit,
  pricing method (per event, per day, or per unit), and event-specific availability.
- [ ] Let participants select available extras during registration. Validate
  quantities and availability server-side; calculate extras separately from base
  admission and include them in the total payable amount, including for free visitors.

### Estimates and automatic price locking

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

### Individual post-lock adjustments

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

### Financial reporting and participant visibility

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

### Backend, security, and verification

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

## Phase 6 — News & Community

- [ ] Add a public news listing and individual article pages.
- [ ] Provide article creation and editing for authorized Admin/News Editor roles.
- [ ] Support draft, publish and archive workflows.
- [ ] Support optional cover images and inline article images.
- [ ] Display author attribution and publication dates.

### AI Development Transparency & About Page

Small future frontend enhancement alongside the Phase 6 public-page work, not a
separate development phase. This backlog entry does not authorize implementation;
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

Future feature within Phase 6, scheduled after event management, registration,
and confirmed attendance tracking are implemented and tested. This backlog entry
does not authorize implementation or change the existing phase numbering.

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

Future enhancement:

- [ ] Add a Hall of Fame showing current Grand-LAN Masters, longest attendance
  streaks, and LAN Legends.

### LAN Idea Box — Community Suggestions & Contribution Achievements

Future feature within Phase 6, after authentication, participant account tools,
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

- [ ] Integrate with the planned Phase 6 achievement definitions, unlocking logic,
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
- [ ] Support bragging rights through the shared participant showcase: participants
  may choose one unlocked achievement to display alongside their permanent LAN rank.

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

- Login replaces Admin in navigation and has a disabled login preview.
- The temporary /admin redirect has been removed; /login is the shared sign-in entry.
- The obsolete standalone Registration page and /registration route have been removed.
- Registration should eventually start from the selected event page, including day selection.
  Public event registration must not require an organizer login.
- Upcoming/Past buttons filter the event view. Local typed content is a temporary
  frontend boundary, not a database or working administration feature.
- The homepage has a news section between Up next and the three feature cards.

## Future administration work

- [ ] Let authorized organizers upload and replace the left/right LAN background photos.
  Support image selection, preview, cropping/position, and removal.
- [ ] Decide storage compatible with the Cloudflare free-tier goal before implementing uploads.
  Validate file type and size on the server, review image rights/participant privacy,
  remove unnecessary image metadata, and enforce upload authorization.
- [ ] Let organizers create, edit, publish, and remove homepage news, such as
  countdowns, practical reminders, and event updates. Replace example content
  with published backend data; decide ordering and publication dates.
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

