# Phase 4.5 — Administration cleanup and User Log

Scope: #30 review 6533573410, plus direct owner authorization to build and publish
to DEV. Owner accepted Phase 4.4 at bba6ff5. Phase 4.5 still requires hosted owner
acceptance; no PROD, schema, configuration or retention change is included.

## Navigation and visual layout

Main navigation contains Home, Events, authorized Administration and signed-in
User Settings. The lower context is derived from the route, with no wrapper or
divider when there are no children. Administration order is Overview, Events,
Members, Roles & Permissions, Logs, filtered by current access. User Settings
contains existing My account and Account Security routes. Profile/Badge placeholders
are omitted. Public /events and /manage/events remain separate placeholders until
Phase 5; no redirect, duplicate editor or Events CRUD is introduced.

The header power button uses existing logout, with no additional confirmation.
It has a keyboard tooltip, accessible name, busy protection and persistent error
feedback outside session-conditional markup. Existing session invalidation and
cross-tab behavior remain authoritative. Unsaved changes are never saved by logout.

Account Security retains existing action components and state while CSS balances
collapsed Sign-in/MFA cards, gives expanded forms full-row space and separates the
lifecycle area. Recovery, proof, password and MFA safeguards are unchanged. Roles
use a more comfortable list width/type size; Members use bounded width and row
spacing. Small screens stack cards and preserve accessible controls.

## Logs and privacy

/manage/logs chooses the first permitted viewer. /manage/activity remains Role
Activity; /manage/user-activity is User Log. Ordinary route links are styled as tabs.
Both require genuine current built-in Administrator membership. Delegated
roles.manage/users.view grants do not authorize either log. User Log has a distinct
userActivity capability; Worker authorization is checked on every request.

GET /api/manage/user-activity uses the existing DEV/local management boundary,
verified full session, session proof, same-origin request restrictions and no-store
response. Filters: before, date (UTC), event and search (80 characters); unknown or
duplicate keys, invalid dates/cursors/events fail. Pages contain at most 20 rows,
with a decimal-string sequence cursor. No mutations or export endpoint exist.

The query reads migration 0021's event facts. It never joins short-lived command
receipts or reconstructs deleted identities. Only current active, non-lifecycle-hidden
nicknames are projected; hidden/missing labels show Unavailable member. Anonymous
groups suppress all identity/operation fields and show Identity removed and a UTC
date without an invented exact time. No email/name snapshots, tokens, provider
payloads, profile deltas, historical backfill or invented expiry/open events exist.
Provider accepted submission is explicitly different from delivery and activation.

The read-time cutoff uses the same SQLite two-calendar-year expression as existing
maintenance, excluding expired rows even before the daily purge. The schedule,
stored retention and Role Activity's separate indefinite retention remain unchanged.
A typed frontend validator rejects malformed/privacy-inconsistent rows; session-bound
memory reads are cancelled/fenced and cleared on identity/capability changes.

## Iteration 2 — DEV feedback 6535348451

Members uses one 75rem bounded workspace for heading, filters/back link, profile
and attendance cards. The summary occupies the existing progress line rather than
an extra disconnected row. Both logs share toolbar sizing and a pagination component;
empty/single cursor pages have no redundant controls, while older pages retain a
way back. API page size, cursor/filter semantics and empty-state messages are unchanged.
The collapsed lifecycle card uses normal styling; warning emphasis is limited to
an opened destructive confirmation. No lifecycle/password/MFA action logic changes.

Focus/visibility events still validate the session and current capabilities. Their
auth request generation is separate from the view-data revision: unchanged successful
background checks retain the displayed views and do not restart their data reads.
The capability response includes an opaque fingerprint of effective permission codes
and genuine-Administrator status, used only for cache invalidation, never as a grant
or credential. Changes clear both private caches even when section names stay the
same (for example users.view loss while users.manage remains). Missing hints from
an older server conservatively trigger normal view refresh; malformed hints fail closed.
Foreground navigation, filters/retry and explicit mutation refresh still reload data.
Identity/proof changes, changed capabilities, denied/error responses and explicit
cross-tab invalidation continue to clear/fence private data. Focus is not a content
polling mechanism; every Worker read/write still independently authorizes its request.
Equivalent blur/focus/visibility sequences were tested with fictional browser
diagnostics and request counts; physical two-monitor interaction is owner retesting.

## Iteration 3 — DEV feedback 6535820652

Members no longer centers its outer section independently. All Administration
headings use the existing shared workspace origin; only Members' inner content
retains its 75rem limit. Desktop checks at 1280/1920px confirm matching heading
origins across Overview, Events, Members list/detail, Roles and both Logs.

Permission categories start collapsed, including roles with saved grants, and
reset through the existing selected-role component key. Manual group controls and
Expand all/Collapse all remain available. Single/empty first-page Members results
hide pagination; later cursor pages retain their return navigation.

Security keeps its Sign-in, MFA, email and lifecycle summaries in fixed positions.
Existing action components render their details in a shared region after the
summaries using a presentation-only React portal. The destination stays mounted;
action state, busy guards, proof handling and transport handlers are retained.
Opening details focuses their region unless an action already focused its field.
Close details uses the existing section toggle and returns focus to its control;
existing Cancel behavior remains. Standalone action screens retain inline rendering.
The personal reactivation shortcut is removed; Administration reactivation remains.

No missing last-admin safeguard was found. Existing lifecycle checks repeat the
genuine active/verified Administrator survival predicate inside the final database
transaction. Isolated tests cover refusal through HTTP and direct paths, stale
proof, invalid replacement candidates and concurrent changes. An added mixed
delete/deactivate race permits one winner and verifies that the surviving genuine
Administrator cannot then delete or deactivate. No real hosted account is changed.

Local evidence: 60 lifecycle/role tests, 196 focused lifecycle/MFA/session/presentation
tests, then 6 updated UI contracts; strict TypeScript and hosted-dev Vite build pass.
The initial JSX compile error during development was corrected before these checks.
Fictional browser checks cover 320/390/768px without horizontal overflow, desktop
alignment, category reset/manual expansion, Members cursors/filter reset, stable
Security summaries and password/lifecycle keyboard focus. Hosted owner acceptance
of the revised presentation remains pending; publication evidence is recorded in #30.

## Iteration 4 — DEV feedback 6536111969

Custom roles have an explicit confirmed deletion action, subject to the backend
rules in [the role contract](role-administration.md#phase-45--delete-an-unassigned-custom-role).
The owner separately approved local migration work and exact DEV migration 0022.
No existing assignments, account data or audit facts were changed by that migration.
Deletion and assignment races, immutable/protected roles, delegated authority,
CSRF/revoked sessions, explicit confirmation, replay, unchanged unrelated memberships
and audit rollback are covered by isolated fixtures.

Password Save/Cancel and regeneration/replacement/lifecycle confirmation actions
use compact left-aligned rows with responsive wrapping. Regeneration/replacement
panels size to content rather than reserving 22–64rem of empty height. Lifecycle
uses a neutral panel border; wording and explicit destructive confirmations remain.
Close details stays at top right. Existing security request handlers, proof rules,
session invalidation and code consumption are unchanged. The fixed summary layout
from iteration 3 is retained; details may grow naturally as their content changes.

The full local regression passed 548 tests; final changed-area contracts and the
strict TypeScript/hosted-dev build also pass. The initial new test used an invalid
overlong fictional code; it was corrected. The migration inventory was updated,
and compatibility checks explicitly allow only the empty audit table's new zero
AUTOINCREMENT namespace while preserving all existing account sequences exactly.
The initial broad run's sole inventory failure passed after that correction.
Desktop/390/320px checks cover all four Security flows without horizontal overflow,
dialog confirmation/cancel and assigned-role refusal. Publication evidence and
owner hosted acceptance remain recorded separately in #30.

Wrangler initially returned authentication error 10000; the owner authorized a
retry using the existing authentication, which succeeded. No reauthentication,
credential or permission change was performed. Recovery and pre/postflight evidence
remain in ignored local files. PROD and live destructive tests were not performed.

The subsequent AGENTS-only commit's CI exposed a nondeterministic status assertion
in an existing last-admin race test (547/548 passed). The original failure omitted
the actual response status. A controlled fixture reproduces the valid late-guard
interleaving: a real authorized role removal commits after lifecycle prechecks;
the final lifecycle transaction refuses with its existing uncertain-result 503.
The test now exercises that precise window and asserts exact responses, one
surviving Administrator, unchanged account/session state, no lifecycle record and
only the successful role audit/revision. Other real concurrent-operation tests
remain. Production handlers/predicates and clocks are unchanged; this is a test
contract correction, not an HTTP or authorization policy change. An initial
diagnostic harness using cross-request promises was rejected by Workerd and was
replaced with request-local interleaving; no compatibility flag was weakened.

## Owner follow-up after iteration 4

The owner directly requested and authorized DEV publication of the deletion
acknowledgement switch, preflight blocked-member warning, red Delete styling,
selected-role Assigned members card and Account Access scroll correction. No new
phase, schema/configuration change or permission grant is introduced.

The role card loads only 20 members for the selected role and reuses the bounded,
session-bound Members cache. Clickable nickname/member numbers lead to existing
member details. All assignment states are included so inactive/future assignments
can be found before deletion; only Members-view holders see the card. A separate
fresh eligibility read keeps dialog controls disabled until assignment checks pass.
The final deletion transaction remains authoritative if state changes afterward.

Security's fallback region focus now uses `preventScroll`, so opening Account
Access does not move the viewport once its trigger is visible. Explicit form-field
autofocus and Close/Cancel focus return remain unchanged. Browser checks verify
the same scroll offset before/after expansion and keyboard focus on the region.

Changed-area tests cover assignment preflight/read authorization, inactive/future
members, strict filters and role-bound pagination without duplicate members or
private profile fields. Thirty final changed-area tests and strict TypeScript/
hosted-dev build pass; earlier unaffected role/security evidence is reused. Browser
checks cover blocked/available/failed dialog states, switch acknowledgement gating,
member-detail links, pagination, restricted visibility and 320/390px layout. Hosted
owner acceptance and final publication evidence remain in #30.

## Verification and hosted handover

The owner accepted Phase 4.5 in the 2026-10-31 Codex conversation and requested
#30 closure after the final switch consistency changes are deployed and verified.
Remaining native checkbox presentations in role setup/review and MFA recovery-code
acknowledgements now use `SwitchInput` and its shared stylesheet. Future binary
input controls should reuse this component. It retains native required validation,
names/IDs, controlled or uncontrolled state and disabled-fieldset behavior while
exposing switch semantics, keyboard input, focus indication and a 44px hit target.
Existing button-based account/member switches remain switches. This changes no
authentication policy, backend workflow, schema or configuration. Automated/local
evidence is distinct from the owner's hosted acceptance; no new hosted account or
provider mutation is implied by closure.

Local fixtures are fictional and intercept all transports. Check main/context route
selection, no-empty submenu, deep links/history/refresh, mobile drawer/focus, logout
busy/failure/success and stale reads. Check User Log strict filters, cursor paging,
retention boundaries, anonymity/name suppression, permissions and existing Role
Activity behavior. Check expanded Security forms and loading/error/responsive states.

Hosted handover uses approved disposable identities and visitor checks. Real account
mutations/emails require their separately bounded authorization. Prove the exact
last-active-admin invariant in isolated integration tests; never modify a retained
real administrator merely to manufacture that condition. Record final two-account
evidence under #16/#30 before Phase 4 sign-off. Password recovery for deactivated
accounts remains deferred. Keep #30 open until owner acceptance.
