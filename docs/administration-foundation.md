# Administration foundation — issue 26

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
