# Administration foundation — issue 26

The Phase 4.1 sections below retain their original implementation scope. Current
Phase 4.3 authority, role mutation and audit rules are in
[Roles & Permissions administration](role-administration.md); its approved genuine
built-in Administrator exception supersedes older explicit-grant-only wording.

This first iteration adds DEV/local administration navigation. It does not add a
member directory, role editor, event CRUD or registrations. No migration or new
dependency is required. Production administration remains unavailable.

## Routes and access

`/manage` shows the permitted areas. `/manage/users` (Members), `/manage/roles`
(Roles & Permissions) and `/manage/events` currently explain their future scope.
The public Events page and Administration both link to `/manage/events`.
`/account/users` retains its existing restricted reactivation behavior and proofs.

`GET /api/manage/capabilities` requires a valid verified full session and the
existing authentication environment/request boundaries. It returns section names
only, with no private member data and no caching. Database/configuration failures
deny access. Explicit grants from active roles are read on each request; future
assignment/grant timestamps do not authorize access. The schema has no separate
assignment active flag or expiry column: revocation removes the assignment/grant
or disables the role. A role's name never supplies implicit permissions.

| Section | Required grant (any listed) |
| --- | --- |
| Members | `users.view`, `users.manage` |
| Roles & Permissions | `roles.manage` |
| Events | `events.create`, `events.update`, `events.publish`, `events.cancel`, `events.manage_registrations` |

News-only or locations-only grants do not unlock these sections. Section access
does not imply authorization to read profiles or mutate accounts. Future APIs must
check their exact permission independently, with existing CSRF and identity/MFA
proofs where required. This iteration introduces no new mutation API.

The frontend refreshes capabilities on session refresh and navigation, clears
results on session/route changes and denies access on errors. UI visibility is
guidance; it is never the backend security boundary.

## DEV acceptance checklist

After an authorized push and successful CI/DEV deployment, verify the deployed
build identity before testing with approved disposable accounts:

- Administrator: open Administration and each of the three placeholders.
- Event-only staff: see only Events; verify both Events links reach the same page.
  Grant setup needs separately authorized administration/fixture provisioning;
  this iteration has no role editor and must not seed privileged accounts.
- Ordinary member: no Administration or Manage events link; direct `/manage`
  shows restricted access, capabilities API returns 403 without private data.
- Visitor: direct `/manage` sends the visitor to Login; API returns 401.
- Revoke a test grant/session through an authorized workflow and navigate again:
  old sections must disappear; refresh failure must not retain privileged content.
- Check desktop and narrow screens, keyboard navigation, visible focus, page
  titles and focus moving to main content after route navigation.
- Confirm public Events filters and Account Security/reactivation remain intact.

Hosted acceptance is separate from local simulator/browser checks. Do not test
with real participant data or change PROD/D1 configuration for this iteration.

## Iteration 2 — coordinated refresh and stable geometry

SessionValidation owns each session → capabilities validation. Concurrent route
checks share one in-flight operation; explicit refresh supersedes old work.
Generation guards fence old session/capability results even if transport ignores
abort. Same-context navigation hints remain during background validation; denial
or failure clears them. Initial loading and outages remain distinct from denial.
A changed account/CSRF context drops old hints before capabilities resolve.

The existing capability endpoint optionally validates `X-LAN-Session-Proof`
against the current session's derived CSRF proof. The new client supplies it to
avoid mixing account A's session with account B's grants during cookie changes.
Mismatch returns 409 without grants, clears client context and requests no automatic
retry. This is correlation, not a new authentication mechanism or permission grant.
No proof is persisted. Existing callers without the header retain their contract.

Focus/visibility and restored pages revalidate. Cross-tab logout broadcasts an
invalidation-only message; receivers clear state and recheck the server. Messages
contain no identity, token or grants. Login/account switching in another tab is
also detected when the tab becomes visible or regains focus. No permission cache
is written to localStorage. Every protected Worker action retains its own checks.

Header/action slots and an initial Administration skeleton prevent asynchronous
controls from moving adjacent content. Same-account background checks leave the
shell mounted, with no repeated screen-reader loading announcements. A stable
scrollbar gutter fixes the separately measured width shift on long/short pages.

### Local reproducible evidence

Run `node --test worker/tests/session-validation.test.mjs
worker/tests/administration.test.mjs` for deterministic races and Worker/D1 checks.
With Vite running, open `/worker/tests/fixtures/administration-navigation.html`.
The fixture intercepts requests locally and uses fictional identities only.
`?mode=staff&route=/manage/events&delay=600` exercises a direct staff destination;
`mode=ordinary` or `mode=error` exercise denial/outage. The controls reset measurement
or simulate another tab's identity/logout invalidation. Use a second fixture tab
for cross-tab checks; the displayed counters report requests, sampled geometry and
overflow. Fixture storage is fictional test state only, never application auth.

In a controlled desktop Home → Events comparison with 600 ms per endpoint,
iteration 1 issued three requests (capabilities/session/capabilities), temporarily
removed Administration, and moved Events filters 48.59 px. Iteration 2 issued two
(session/capabilities), kept navigation present, and measured 0 px movement of the
filters and Administration link. This excludes intended route-content replacement;
it is not a zero-CLS claim for every page. Initial cold validation still takes two
sequential reads (~1.2 s of imposed delay); same-context navigation renders content
without waiting for those reads. These are controlled fixture results, not hosted
latency measurements. A 390 px direct staff route showed no horizontal overflow;
back/forward, account replacement and cross-tab logout were also checked locally.
Authenticated hosted owner acceptance remains separate.
A capabilities outage does not turn a verified login/MFA session refresh into an
authentication failure: authentication remains ready while Administration reports
unavailable with no granted sections. A session-context conflict clears identity
and requires a fresh explicit check; it is never retried indefinitely.

## Iteration 3 — GUI cleanup

Resolved visitors and ordinary members no longer reserve an Administration-sized
header slot. Initial unknown access can reserve a temporary noninteractive slot;
same-context background revalidation retains confirmed staff navigation. Landing
cards use their heading as the link name without underlines or redundant Open text.
The redundant Browse events link is removed; main navigation and the shared Events
management destination remain. Section tabs use charcoal inactive backgrounds,
mint active styling and explicit hover/focus feedback with mobile wrapping.

## Phase 4.2 — read-only Members administration

`/manage/users` now browses accounts; `/manage/users/:userId` displays approved
private detail. Access to the shell does not grant access to member data: every
read requires a verified full session, active explicit `users.view` permission and
the session-correlation proof. `users.manage` or `roles.manage` alone is insufficient.
The existing `/account/users` reactivation workflow is unchanged. No edit, role,
reactivation, password/MFA, export or deletion actions are introduced.

The DEV/local-only read contract is:

- `GET /api/manage/users?status=active&search=&limit=20`: list
  nickname, decimal-string member number, account/lifecycle state and assigned
  role labels with active/inactive distinction. No email or real names in lists.
- Status is `active` by default, with explicit `deactivated` and `disabled`
  filters; disabled includes a deleting-state badge when applicable. Unverified
  active accounts remain accounts; verification appears in detail.
- One search input matches a literal case-insensitive nickname substring anywhere.
  Numeric input also matches an exact member number (optional #/leading zeros),
  with no duplicate rows when both match. Numbers beyond SQLite's range only
  participate in nickname matching; no rounded or clamped number lookup occurs.
  Clear filters restores an empty query, active-only state and page one.
  No email search. Current nickname
  storage is ASCII; Unicode input is normalized and handled literally without
  inventing a Unicode nickname migration. LIKE wildcard characters are escaped.
- Page size is 20, capped at 50. Pages use member-number/UUID order and a bounded
  cursor tied to normalized criteria/page size. Previous navigation retains a
  client-side cursor stack. Cursors are validated pagination positions, not signed
  credentials or authorization; insertions/deletions do not create a frozen snapshot.
  No unconditional total count, arbitrary sorting or export endpoint exists.
- `GET /api/manage/users/:uuid`: the summary plus email, stored first/last name,
  name prefix, verification state and creation time. Lifecycle-scrubbed names/prefix
  are null/unavailable; do not reconstruct them. No auth internals are selected.
- Both endpoints require `X-LAN-Request: 1` and `X-LAN-Session-Proof` from the
  current session, preserve origin restrictions and return no-store/no-referrer.
  Denial, invalid query, context change, missing account and outage have distinct
  HTTP responses. Cursor contents never bypass per-request authorization.

Queries start from existing users with registered member numbers, so reserved
slots, deleted-account ledger rows and tombstones cannot become directory accounts.
Missing nicknames or roles remain visible as unavailable/none. Existing schema
and indexes are reused; no migration or remote data operation is part of this work.

Private results use a memory-only cache owned by the current AuthProvider, bounded
to eight query/detail views. Returning to a cached view displays it while refreshing;
an uncached view still requires its first data request. A reserved progress line
announces background work without displacing the table/detail. Nothing is stored
in browser storage or a service worker.

Focus, visibility and route session/capability checks remain enabled. Previously,
each new validation object cleared the member hook's data, causing focus reloads;
data reads also waited for both validation requests. Each validation generation
now triggers one deduplicated member read in parallel when a same-context validated
session is available. Every private endpoint still independently checks the live
session, proof and explicit users.view grant. Cached same-context content survives
only background checking, never a detected failure: account/session/proof changes,
invalidation, expiry, permission denial, validation errors and failed member reads
purge cached private views and fence late responses even if cancellation is ignored.
Query/route keys prevent out-of-order results replacing the current view. The shell
remains the stable 4.1 navigation; permission hints never authorize a data request.
The redundant Administration eyebrow is removed in both loading and ready views.

Iteration 3 presents search actions below the aligned fields. Account-state pills
share the same styling in list and detail: green for active, red for deactivated,
disabled or deleting, retaining distinct text labels. Assigned roles use wrapping
neutral chips, preserving inactive labels and the None empty state.

Authorized member detail also includes an Attended events card with an empty
Event / Date / Location table and a truthful coming-later message. It fetches no
event data and infers no attendance. Future event names should link to real event
details only where the viewer is authorized; no event links/routes are added now.
The card is rendered only alongside an available authorized private detail result
and disappears with it on access/session failures. Name prefix remains read-only
and truthful; profile editing and attendance data belong to their later phases.

### Verification / owner acceptance

Run `node --test worker/tests/members.test.mjs worker/tests/administration.test.mjs worker/tests/member-read-cache.test.mjs worker/tests/session-validation.test.mjs`
for Worker/D1 permission, projection, lifecycle, search and pagination checks.
With Vite running, `/worker/tests/fixtures/members-ui.html` provides fictional
browser data and controls for revoked access, identity replacement, API outage
and session expiry. Focus controls dispatch the real focus/visibility handlers and
can simulate a read denial/outage without changing shell hints. A slow substring
request intentionally ignores abort to exercise
late-response fencing. Use `?mode=manage-only` for shell access without read rights.
No fixture request reaches real accounts or an external provider.

On hosted DEV, verify the exact deployed footer identity, then use approved test
accounts to check overview/detail, active/deactivated/disabled filters, nickname
and member-number searches, previous/next, keyboard focus and narrow layout.
Check visitors, ordinary members, users.manage-only/roles.manage-only and an explicit
users.view custom role; creating roles/grants or changing data for acceptance needs
its own authorization. Confirm no stale member data after revocation/account switch
and no real names/email in lists. Owner acceptance remains pending; deployment and
local fictional browser evidence do not substitute for it. PROD is untouched.

Owner reported iteration 1's six hosted checks passed, but withheld final acceptance
pending iteration 2 (#27 comment 6483398045). Recheck combined search/reset, list/detail
navigation and the physical two-monitor focus-switch reproduction on DEV. Synthetic
focus events and delayed fictional transport checks do not prove that OS scenario
or actual hosted latency. No schema, dependency or remote data changes are required.
