# Phase 3 closeout and release-preparation inventory

Owner requested #19 cleanup and preparation for a dev-to-main PR on 2026-10-27,
after accepting scoped #17 DEV UX. This is a local inventory, not merge,
production deployment, credential, reset or migration approval. Coordination:
[#19](https://github.com/Awandalo/Lan-Party/issues/19).

## Owner-approved preservation follow-up — 2026-10-27

After the initial report, the owner approved separate documentation handling and
explicitly authorized resolving the clean-working-tree gate while preserving the
unrelated monitor/DNS work. Ten files (six modified tracked files and four
untracked DNS files) were copied byte-for-byte to an ignored private backup and
verified with SHA-256, then set aside in a named path-scoped Git stash. Every stash
blob and its base were independently checked; the four cleanup documents were
unchanged by preservation. No work was discarded or published incidentally.

The original monitor stays PAUSED, with task settings and live journal untouched.
Its unpublished bounded helper is preserved outside the working tree and must be
restored before the existing bounded scheduled prompt is resumed. Private backup
metadata includes the exact stash commit and conflict-aware restoration steps.
Do not automatically pop/drop the stash, resume the task or clear a journal lock.

The protection connector was retried and still returned 403 Resource not accessible
by integration. The rulesets list is still empty, which does not establish the
classic protection policy. No credential, permission, Git configuration or CLI
API fallback was introduced. The initial inventory below remains the dated
baseline; the dirty-file blocker is resolved through this explicit preservation,
while synchronized published documentation and policy evidence remain release gates.

## Recorded source and preliminary comparison

- Primary checkout: D:/Development/Projects/Lan-Party, branch dev.
- Local/remote dev: 82f7b3400f003cc37c543f7b7aa941095ab36ef3; divergence 0/0.
- Remote main: 9654d1d2aaa2bd3d2ce354507793f4c2ab423f84.
- Local main remains d4771f74fdb1d20f1b95dd959629ad33f6ef2113, three commits behind remote main; it was not changed.
- Three-dot comparison: 3 MAIN-only / 68 DEV-only commits; 184 files,
  17,742 additions and 83 deletions. Two-tip comparison differs: 188 files,
  17,705 additions and 638 deletions. These counts apply to the recorded published
  baseline, not the uncommitted housekeeping patch or a final release candidate.
- MAIN-only work is PR #22 privacy and PR #5 Resend DNS history. Preserve it;
  do not overwrite main with the dev tree or interpret two-tip differences as
  authorized deletion. No existing open PR was returned by the connector.
- New source migrations are 0008 through 0018 in order; no existing SQL migration
  is modified/deleted by the promotion or this cleanup. migrations/README.md is
  documentation. PRODUCTION application is a separate operation.

## Accepted work and retained limitations

Historical Phase 3.7 7/7 owner DEV acceptance is recorded by #19. It does not
require restoration of Google OAuth after the explicit permanent retirement.
#9/#10/#13/#14/#15 record the later MFA acceptance. #16 DEV lifecycle and #17
scoped polish are owner-accepted; administrator-assisted reactivation acceptance
remains deliberately deferred until the end of Phase 4 using two disposable users.
Phase 4 Administration precedes Phase 5 Events. Actual event registration/Jotform
replacement is not completed by Phase 3. Public auth activation remains separate.
The login replacement fallback remains until its exact removal dependency is
established. External Google Cloud client retirement is not independently verified;
#17's source and DEV secret-name audit found no Google runtime configuration or
Google-named secrets. Do not retire credentials or rewrite historical migrations.

## Local unpublished work — preserve, do not duplicate or discard

| Scope | Verified current finding | Required disposition |
| --- | --- | --- |
| AGENTS.md and workflow governance/standards | Three genuine unpublished read-query retry directive additions; published baseline adoption is already present | Separate scoped publication decision; no duplicate adoption commit |
| docs/GITHUB_COMMUNICATION.md and two monitor scripts | Genuine bounded-transfer implementation/tests and local prompt/activation notes, not published duplicates | Saved task already has bounded instructions and is PAUSED; reconcile stale pending-activation wording before separately authorized publication; no task/profile/journal change in this cleanup |
| Four untracked .github Resend DNS files | Separate work, also represented by merged PR #5 on main | Preserve for owner disposition; do not add them incidentally to dev or delete them to make release checks green |
| This housekeeping patch | PROJECT/TODO, migration README and this inventory | Review then separately authorize scoped commit/publication |

Read-only saved-task verification found the existing heartbeat ID unchanged,
30-minute schedule, original target chat and bounded connector-only prompt present.
Its current saved status is PAUSED. No resume/update was requested or performed.
The communication document still describes bounded activation as pending; the
proposed correction is to record configured instructions with execution paused,
without claiming unattended journal access or successful monitoring. This local
wording is mixed with the unpublished bounded feature, so it must be reviewed
together rather than duplicate-published accidentally.

The release procedure requires a clean tracked AND untracked tree. Do not stash,
commit, clean or move this work merely to bypass that gate. Existing recovery
bundle .wrangler/reconciliation-backups/20261027T094424Z/history.bundle verified
successfully. It preserves historical Git recovery; this is not a claim that it
is a fresh verified backup of every current uncommitted file. No reconciliation,
restoration, lock deletion or journal reset was performed.

## Branch/worktree inventory

Counts below are commits unique to each branch relative to the recorded dev.
An ancestral branch has zero unique commits but may still be needed for review,
worktree attachment or release recovery. No branch/worktree was deleted.

| Local branch / short head | Unique vs dev | Disposition |
| --- | --- | --- |
| dev / 82f7b34 | 0 | Keep primary development |
| main / d4771f7 | 0 | Keep; behind remote main by 3, no synchronization performed |
| codex/account-lifecycle / f158c17 | 0 | Safe ancestry candidate for later exact local-branch deletion approval |
| codex/mfa-enrollment-polish / dc36b17 | 0 | Safe ancestry candidate for later exact local-branch deletion approval |
| codex/connector-reads / 92de5a0 | 0 | Retain until clean attached worktree disposition is approved |
| codex/mfa-386-integration-review / 752d738 | 0 | Retain attached clean worktree/review history through release |
| codex/remove-google-oauth / c9ffa2e | 0 | PR #24 merged to dev; retain through release, then exact cleanup approval |
| codex/privacy-only-review / 543a6e6 | 4 | PR #22 merged to main; tree equals remote main, but not an ancestor of dev; retain attached worktree/history pending reviewed cleanup |
| codex/resend-dns-automation / e92e7c6 | 1 | PR #5 merged to main; ancestor of remote main, not dev; retain separate attached worktree/DNS work |
| codex/backup-dev-before-reconciliation-20261027t094424z / d330e66 | 17 | KEEP recovery branch; dev has 37 commits absent from this branch |

Remote inventory contains six codex branches plus dev/main:

| Remote branch / short head | Finding / disposition |
| --- | --- |
| codex/mfa-386-integration-review / bb223f9 | Ancestor of dev; retain through release/review then propose exact cleanup |
| codex/remove-google-oauth / c9ffa2e | Ancestor of dev, PR #24 merged; retain through release then propose cleanup |
| codex/r2-mfa-assurance-review / ea8d776 | 16 unique commits relative to dev; KEEP, do not wholesale merge or delete |
| codex/r3-mfa-enrollment-review / d330e66 | 17 unique commits relative to dev; KEEP, do not wholesale merge or delete |
| codex/privacy-only-review / 543a6e6 | Merged PR #22, tree equal to remote main; retain until attached worktree/recovery disposition is approved |
| codex/resend-dns-automation / e92e7c6 | Merged PR #5, ancestor of remote main; retain separate DNS history/worktree |

All four secondary attached worktrees were clean during read-only inspection.
The sandbox identity initially triggered Git ownership protection for one checkout;
inspection under the existing approved owner execution context succeeded. No
safe.directory entry, Windows ACL, Git configuration or permission profile changed.
No new worktree was created and all actual edits stayed in the primary checkout.

## Release gates — currently BLOCKED before PR creation

1. Dirty working tree: the unpublished scopes above need explicit disposition.
   RELEASE.md forbids silently cleaning/stashing/committing around this check.
2. Main protection is enabled, but connector GET branches/main/protection returns
   403 Resource not accessible by integration. Repository rulesets returned an
   empty list, which does NOT prove absence of classic branch protection. Required
   reviews/checks/security policy are unverified. Obtain supported policy evidence;
   do not broaden credentials, weaken protection or invent requirements.
3. Formal complete-history sensitive-data review, final candidate local validation,
   exact merge simulation and production compatibility/configuration evidence must
   follow resolution of the preflight blockers. They are not marked passed here.
4. PROD authentication is currently intentionally gated off. Decide whether this
   PR is source/public-site promotion only, or a later separately designed and
   approved production activation. Never assume a main merge enables DEV features
   safely. Initial fresh-PROD database intent does not authorize a reset now;
   exact identity/recovery/schema/key/configuration steps need separate approval.

Successful existing DEV evidence at 82f7b34: CI run 40522847015 passed 419 Worker,
3 public UI and 37 routing-policy cases; deployment run 40522847199 passed. This
is not final PR merge-SHA or production evidence. During cleanup the unpublished
monitor's 29 synthetic tests passed using disposable caches only; the live journal
and scheduled task were not touched. Documentation-only changes need link/diff
review, not an unrelated repeat of the application suite.

## Shortest safe next sequence

1. Owner/Q review the four-file housekeeping patch and separately decide the
   unpublished directive/monitor and DNS disposition. Reconcile saved-task wording
   with current evidence rather than blindly publishing a historical pending note.
2. Obtain current main protection/review/security requirements through a supported
   interface; do not change permissions as an implicit cleanup step.
3. Only after a clean synchronized dev and all release preconditions pass, prepare
   the full revision-bound dev-to-main PR under RELEASE.md. Preserve unique main
   privacy/DNS changes and stop on conflicts; no automatic merge resolution.
4. Leave PR unmerged. Exact-head owner approval, production deployment and any
   production schema/reset/key activation remain separate gates.
5. After verified integration/release and explicit exact branch/worktree approval,
   remove only proven obsolete branches; retain unique/recovery history.
