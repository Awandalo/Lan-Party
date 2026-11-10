# Profile settings — local review

Owner-authorized on 2026-11-10. The local review below was accepted in trusted
conversation, followed by a request to publish and merge for live use. Prepare
the exact reviewed release PR under RELEASE.md, including the bounded proposed
production application of migration 0037, recovery and read-only verification.
Remote execution follows its exact-head and disclosed database approval rules.

## Behavior

User Settings → Profile (`/account/profile`) edits the existing public nickname
(labelled Display name), private first/last names and optional preferred prefix.
My account also links to Edit profile. Fields use the established dark, rounded
site styling, shared buttons, hover/focus feedback and a single-column phone layout.
The preview shows how the saved prefix and nickname appear in Who is coming.

Choices, in order: None, Mr., Mrs., Apache Helicopter., Pastafarier., TechnoViking.,
NPC., LAN Legend, Chaos Goblin. Only the eight approved prefix catalogue IDs can
be newly selected. An inactive or older saved selection can be preserved while
editing other fields; an older unapproved prefix is not published on attendance.

The approved nickname policy remains: unique without regard to case; 3–24 ASCII
letters/digits/spaces/underscores/hyphens with unambiguous spacing; reserved names
rejected. Registration does not start the cooldown. The first participant change
is immediate, then 14 days, including case-only changes. Exact no-ops preserve
timestamps. First/last names and prefix remain editable during nickname cooldown.

## Data and security

Migration `0037_seed_preferred_name_prefixes.sql` adds eight reference-data rows
to the existing Phase 2 `name_prefixes` catalogue. It adds no columns/tables and
preserves users, existing selections, member numbers, registrations and grants.
`users.name_prefix_id` already provides the foreign key. No applied migration is
edited, and no remote database has been changed for this work.

`GET/POST /api/auth/profile` uses existing canonical environment/session gates,
live active-account/MFA checks and a session-bound read proof. Mutations also
require existing same-origin JSON/CSRF controls. Owner identity comes exclusively
from the session; body IDs, email, roles and other unexpected keys are rejected.
A content revision detects stale edits. The atomic D1 batch rechecks session,
MFA, account lifecycle, original field values, prefix eligibility and database-clock
nickname cooldown. A conflict rolls back both private names and nickname. No
credential, email, auth generation or privilege change is introduced.

Only the chosen approved prefix and public nickname join confirmed-member cards.
Avatar initials remain based on nickname. Private names/contact details and guest
identities do not enter the member attendance projection; signed-out responses
continue to contain no attendee identities. Deactivated users' prefixes are hidden.
Final bills retain their existing immutable snapshots. The privacy notice receives
only a factual addition about the chosen public prefix.

## Verification and handover

Focused profile/registration/presentation checks: 36 pass, including ownership,
CSRF, MFA fencing, revoked/disabled sessions, duplicate/stale-update rollback,
cooldown/no-op/case-only rules, inactive prefixes, migration preservation/rollback
and profile-to-crew privacy. Full local regression initially passed 786/787; the
one failure was the old two-link account-navigation expectation. Update that exact
expectation for Profile while preserving signed-out hiding and route-order checks;
rerun the affected presentation tests. The new route-label assertion also exposed
that this standalone Node fixture lacked Vite's environment constants; explicitly
define the default build flags in its esbuild fixture and retain the assertion.
Reuse the other unchanged successful results.

Strict TypeScript and all 40 CI-policy/public-UI checks pass. Browser verification
uses an isolated loopback-only service with disposable fictional accounts and
in-memory D1, not DEV/PROD data. It verifies saving through the actual form,
persisted prefix on Who is coming, private-name separation, field styling and
375px responsive layout without horizontal overflow (controls at least 44px tall).
The demo leaves nickname's first-change allowance available for owner review.
All four affected navigation/presentation checks now pass with both fixture
corrections; strict TypeScript and the production build pass. No additional broad
rerun is needed because the other 786 checks' implementation remained unchanged.
The final field-only CSS correction was verified in the actual browser, including
the shared control sizing, border/background, hover and focus treatment.

Review: `http://127.0.0.1:5200/account/profile`, with a Who is coming link in the
local-only banner. The ignored review harness blocks external provider requests;
data persists only while that local server runs. Source work is isolated on
`codex/user-settings`, based on released MAIN `839122f`; DEV stays unchanged.
No credentials are needed for the fictional review account.

Suggested eventual commit: `feat(profile): add editable user details and display prefixes`.
This release uses the isolated feature branch directly to MAIN; DEV publication
and DEV migration 0037 are not part of the production operation. No application
configuration, credentials, grants or provider sends need to change.
