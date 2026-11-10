# News Posting — DEV preparation, 2026-11-10

Owner authorized #50 locally after accepting the research and News Editor role.
DEV and MAIN began aligned at `ca92533`. The owner accepted local review and
authorized the scoped DEV commit/push and automatic DEV deployment. The owner separately approved only DEV
migration 0038 and DEV-only News routing before execution.
No role assignment, provider send or production effect is included.

## Product and access

- Administration → News: create drafts, edit, publish, unpublish, and Administrator-
  only confirmed permanent deletion. All four existing `news.*` permissions remain
  independent. No role name grants authority by itself.
- Migration `0038_create_news_activity.sql` reuses `news_articles`, adds compact
  operation/audit metadata and seeds an ordinary assignable `news_editor` role with
  exactly create/update/publish/archive grants. It assigns no members and overwrites
  no existing/customized role. Conflicting reference IDs/codes fail the migration.
- Public `/news`, `/news/:slug`, and the newest featured post plus the three preceding posts on Home expose only published
  articles. Drafts/unpublished direct API/page requests return 404. Public responses
  and HTML metadata use no-store so withdrawal is checked on every new request.
- Unpublish stores `archived`, shown as “Unpublished” to editorial users. Publication
  dates are original and retained across edits/republication; slugs stay stable.
- Show the latest update date and current editor display name, never private names
  or email. Existing account deletion clears article attribution; audit actor FK
  uses SET NULL, retaining action metadata without historical names or article text.
- Reuse the event editor, validated JSON document and React renderer, including
  existing formatting/size limits and expanded editing. Only context labels vary;
  existing Event defaults remain intact. Helpers use the established question dialog.
- Admin-only sharing prepares editable title/teaser/canonical URL text. WhatsApp
  opens its composer; Discord copies for manual pasting with selectable fallback.
  No automatic send, tokens, integrations or upload work.
- Owner subsequently approved a public Share disclosure below individual published
  articles: WhatsApp, Facebook, X, Bluesky, LinkedIn, E-mail and Copy link. These
  open manual sharing composers using the canonical article URL. No provider SDK
  loads on the page; clipboard failures offer a selectable link. This supersedes
  the original public-social-button deferral; editorial prepared messages remain
  administration-only.

## API and integrity

Public GET `/api/news?limit=3` or bounded limit/offset pages and `/api/news/:slug`.
Management GET `/api/manage/news` lists summaries; `?id=UUID` reads one full draft.
POST actions use the same endpoint with operation ID and article audit revision.

Management enforces live session/MFA, verified account, same-origin JSON/CSRF,
session read proof and current grants. Transactions recheck live authority and
revision before changing article/audit rows atomically. Replays require the same
actor and payload; changed/stale operations fail without partial writes. Deleted
articles leave only audit metadata. Catalogue entries contain no account assignments.

News capabilities fail closed before 0038. The DEV-only Wrangler change adds
`/news/*` Worker-first routing for anonymous canonical metadata and HTTP status.
That is a future publication configuration effect requiring its applicable approval;
no Cloudflare setting has changed during local development.

## Review and verification

Run the ignored `.wrangler/news-review-server.mjs` harness for disposable, in-memory
D1 fixtures at `http://127.0.0.1:5201/manage/news`. The banner switches between
fictional Administrator, News Editor and member accounts. No real credentials are
used, no remote data is copied, and external Worker provider fetches are blocked.
Restarting this review process resets fictional articles and roles.

Manual review: create/format/expand/save; publish/read/Home; edit/update attribution;
unpublish and confirm direct links disappear; editor cannot Delete or access other
admin sections; member sees only public posts; admin Delete confirmation; helper
focus/Escape, narrow layouts, shared button feedback and manual sharing preview.

Automated evidence is retained privately under `.wrangler/news-*.log`. Initial full
run passed 792/798: six old catalogue/routing expectations were identified and the
missing pre-migration capability gate corrected. Affected suites are rerun without
weakening security assertions; unaffected successful evidence is reused. The new
deletion fixture initially used an invalid proof lifetime and was corrected to the
existing 300-second schema contract. Browser review uses only fictional content.

No local review alone establishes hosted acceptance. Issue #50 remains open for hosted acceptance. DEV publication is now authorized;
remote 0038, DEV News routing, real role assignments and production rollout retain
their respective owner-approval boundaries. Achievements #51 remains deferred.

Final local verification: all **801 regression tests** pass, as do **59 policy/UI/session checks**, strict TypeScript and the frontend build. The capability readiness check initially exceeded the existing private-read query budget; combining readiness with the existing live administrator predicate restored that budget without relaxing its assertion. Browser review verifies real fictional saves, formatting/expanded editing, publication, display-name update attribution, role boundaries, admin-only sharing preview and a 390px layout without horizontal overflow. The local server serves the final backend from fresh disposable fixtures. Hosted tests and real sends were intentionally not run because this iteration is local-only.

Homepage review correction — owner requested the newest published article as a full-width featured card, followed by the preceding three in a responsive row. Home requests four posts in existing publication order, with no duplicate featured post. This supersedes the original latest-three homepage decision only; publication/privacy rules and the separate News listing stay unchanged. Local only.

Owner homepage cleanup: remove the three legacy “Find your weekend”, “Choose your days” and “See the crew” placeholder tiles and their unused styling. Keep the published-News layout. Local-only review.

DEV publication preflight: origin/dev remains `ca92533`; read-only D1 checks show
exactly 0001–0037, all four News permissions, no conflicting editorial role, quick
check OK and no foreign-key violations. Existing scoped Cloudflare account/CI
configuration succeeded after the default CLI invocation returned authorization
error 7403; credentials and permissions were not changed. Seventeen affected News/
location-presentation checks, strict types/build and DEV deployment dry run pass.
Reuse the prior unchanged backend/security evidence (801 regression and 59 policy/
UI/session checks); normal exact-head CI will run on authorized publication.
Comments and emoji reactions are deferred to backlog #52.

Approved DEV migration receipt — 2026-11-10: applied only
`0038_create_news_activity.sql`, SHA-256
`3102d10ab65edf5ed5c6271f1d73e4ed74d02bc6c82043216e861ae2264e8e6e`,
to `lan-party-dev` (`a3c4cea6-ceb7-43b8-b9b7-b374726b35b4`). Fresh private
recovery export/hash and Time Travel checkpoint were retained outside the repository.
Its isolated SQLite restore reproduced all original rows and passed the exact
migration before remote execution. Immediate preflight and postflight preserve
all original rows/schema across 56 existing tables. Added only the News activity
table/index, one editorial role and four existing-permission grants, with no member
assignments or article changes. Audit is empty; quick check OK, foreign keys clean.
Private receipt: `.wrangler/news-dev-release/verified.json`. Production is unchanged.

Local follow-up: the Link action now focuses its URL field, leaving the document
focus outline only on the active editor. News alone enables a “Link to event”
picker using the existing anonymous upcoming/public-listed event endpoint. It
links selected text or inserts the event title at the saved cursor, preserving
the shared validated rich-text format. Cancellation/Escape preserve content;
empty/error states and retry are explicit. Event descriptions retain their current
toolbar by default. The owner accepted the local review and authorized this
scoped DEV commit/push and automatic deployment. No migration, API extension,
configuration change, participant data write or provider send is included. Existing
links remain ordinary links if an event is later withdrawn.

Verification: 24 focused formatting/public-event/News presentation tests pass;
strict types and the final build pass. Browser checks cover expanded-editor URL
focus, selected-text and cursor insertion, plain typing after a link, validated
save/reopen, keyboard cancellation, and empty/error/retry states. The first cursor
insertion check caught Tiptap’s whole-link unset behavior; using the stored-mark
command preserves the inserted anchor, verified in the browser. Reuse unchanged
backend/security evidence; normal exact-head CI runs on DEV publication.
