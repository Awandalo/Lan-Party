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
- [ ] Review migration 0003 and obtain separate approval before applying it to DEV.
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

Local authentication migration work is explicitly approved for Phase 2.5. The owner
confirms 0001 and 0002 are applied on DEV; remote application of 0003 is not authorized.
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

## Phase 6 — News & Community

- [ ] Add a public news listing and individual article pages.
- [ ] Provide article creation and editing for authorized Admin/News Editor roles.
- [ ] Support draft, publish and archive workflows.
- [ ] Support optional cover images and inline article images.
- [ ] Display author attribution and publication dates.

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

