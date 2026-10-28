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
