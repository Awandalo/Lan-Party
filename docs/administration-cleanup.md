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

## Verification and hosted handover

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
