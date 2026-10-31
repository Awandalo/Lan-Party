# Private page loading — DEV follow-up

Owner authorized five loading improvements and DEV publication on 2026-10-31.
Scope: Members, Roles, Feedback and the owner-requested Logs follow-up. Messaging
feature refinements remain separate.
No migrations, configuration, credentials, new services or authentication-policy
changes are needed. Existing DEV schema through 0023 remains compatible.

## Behavior

- Navigation still validates the session and current capability hint, but uses the
  existing background coordinator. Unchanged authority preserves the view revision
  so it cannot abort/restart a page read. Page reads can run alongside validation
  once the current session/access context is known. Cold startup still discovers
  the session and capabilities before private administration reads.
- Members, Roles and Feedback keep at most eight results per cache in provider
  memory. Successful reads are reused for five seconds to coalesce intent and
  immediate navigation. Older results remain visible while a new authorized read
  runs. Query/filter/cursor URLs have separate entries. Explicit reload bypasses
  freshness; mutations invalidate freshness and fence pending older responses.
- Focusing or pointing at Members, Roles or Feedback navigation starts its first
  page read. Feedback also preloads its lazy route chunk. No directory crawl,
  global polling, service worker, localStorage or IndexedDB private-data cache.
  Prefetch never marks a conversation read or performs a mutation.
- Feedback shows a reserved progress line, distinguishing initial loading from
  checking for updates; refreshed content does not disappear beneath a spinner.
- Logs navigation and its Overview card prefetch the same permitted destination
  as the landing redirect (Role Activity first, User Log as the fallback). Each
  log tab also prefetches on pointer/keyboard focus. User Log now shares the same
  five-second freshness window and explicit-reload bypass. Both logs retain their
  tables during background refresh and keep filters/cursors in separate entries.
  The existing RoleReadCache bound, principal/authority fences and independent
  activity/userActivity gates apply; neither log is fetched without its section.
- Role and Feedback schema readiness each use one SQL request. Administration
  reuses role-schema/authority facts only within the same HTTP request; nothing
  caches server authorization or schema readiness between requests. Capability
  integration profiling observes at most eight foreground D1 method calls for a
  genuine Administrator, including session checks and all schema guards.
- Feedback expiry remains enforced in every SQL read/write at 30 days. The
  per-access bounded physical purge runs after foreground queries via waitUntil,
  reusing that request's successful schema check. The existing daily cleanup,
  limits, account-deletion behavior and retention policy are unchanged.

## Security and freshness

Cached content is a previously authorized snapshot, not an access credential.
It can briefly show older data while navigation revalidates. Every network read
and write still checks the real session and current server authority; writes keep
CSRF, origin, ownership, revision and transactional guards. No MFA check is removed.
There is no promise that a client snapshot detects a remote revocation instantly.

Account/session proof changes, explicit/cross-tab invalidation, logout and
validation/access failures erase or fence private results. Feedback additionally
keys its cache to capability/authorization context; read failures clear its other
views and late aborted responses cannot restore them. Closed Feedback results
cannot be reused at or past their 30-day visibility cutoff. Read acknowledgement
still uses only the latest event actually rendered; prefetch has no read side effect.

## Verification and acceptance

Deterministic tests cover freshness expiry, explicit reload, mutation fencing,
bounded memory, identity/proof/authority changes, failures, late transport replies,
read acknowledgement and exact closed-thread expiry. Integration tests count schema
reads and background cleanup tasks without exposing SQL parameters. The local
fixture awaits observed maintenance completion rather than assuming the response
waits for physical purge.

Before/after browser checks use the previous commit and the updated application
with fictional intercepted responses and an artificial 300 ms delay per request.
The previous Feedback inbox blanks on return; the updated inbox displays its
cached list immediately while refreshing. Keyboard focus starts prefetch before
navigation. These demonstrate the loading sequence, not authenticated DEV latency
or database speed. Cold visits still require a network response. Actual DEV timing
and two-account acceptance remain owner handover checks; no real account or message
mutation is needed or performed for these local comparisons.

The Logs follow-up adds deterministic loader/cache integration tests for landing
selection, independently authorized tabs, single-fetch prefetch/mount reuse,
filters, explicit reload, denial and malformed responses. In the fictional
300 ms-delay browser check, Members-to-Logs and Role Activity-to-User Log each
started their GET on keyboard focus, completed it before navigation, and reused
it without a second log GET on mount. Log access/retention regression evidence
remains separate from these frontend loading checks.
