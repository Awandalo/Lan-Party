# Controlled DEV-to-MAIN release procedures

## Scope and explicit initiation

Execute release preparation only when the user explicitly requests it, for example,
"Prepare the DEV-to-MAIN release." Reading, creating, or editing this file is not
authorization to execute it. Post-release housekeeping requires a separate explicit
request, for example, "Run post-release housekeeping."

Read `AGENTS.md` and `PROJECT.md` before either procedure. Their Git, security,
CI/CD, database, deployment, privacy, and production protections remain in effect.
An explicit release-preparation request authorizes fetching remote information,
running safe local checks, and automatically creating or updating the matching
GitHub PR only after all required pre-flight checks pass. It does not authorize
staging, committing, pushing, pulling, merging, deployment, or remote migrations.
The separate README/TODO automatic Git exception is not part of these procedures.

Never force-push, reset, rebase, discard changes, bypass hooks or permission
boundaries, or resolve conflicts automatically. Do not change application code,
schemas, deployment configuration, or unrelated files while executing these
procedures. Report blockers for separate owner action rather than repairing them
as part of the release. Do not print secrets or private data in logs or reports.

## Release preparation

### 1. Verify the repository and local state

Confirm the repository root, active branch, remote repository identity, and GitHub
authentication. `origin` must identify the intended personal GitHub repository.
Stop if authentication, identity, or permissions cannot be verified.

Use the existing authenticated GitHub connector for GitHub API reads, following
`AGENTS.md` and `docs/GITHUB_COMMUNICATION.md`; do not fall back to CLI reads.
CLI read commands below are historical examples, not an approved execution path.
Verify the connected identity, access to `Awandalo/Lan-Party`, and
permissions for each required operation. Git fetch/push access alone does not
prove access to checks, security results, protection policies, or PR operations.

The selected interface must provide exact-SHA CI/status and security evidence,
applicable branch protection/rulesets and required reviews, PR discovery/read/write,
base/head repository identities and SHAs, and mergeability. Use supported structured
operations; do not extract credentials, print tokens, invent missing evidence, or
substitute unauthenticated public metadata for required authenticated access.
If no approved interface can supply a required operation or evidence, report the
specific blocker and stop. Missing CLI alone is not a blocker when a verified
alternative provides all required capabilities. Record the interface and evidence.

Use read-only inspection, including:

```powershell
git rev-parse --show-toplevel
git branch --show-current
git status --porcelain=v1 --untracked-files=all
git diff --name-status
git diff --cached --name-status
git diff --check
git diff --cached --check
git ls-files --others --exclude-standard
```

Use the connector's supported identity and repository-permission inspection
operations. If required evidence is unavailable, stop and report the limitation.

Review the full staged and unstaged diffs privately for sensitive data. Inspect
ignored-file names when needed to identify local configuration, databases, or
generated artifacts; do not expose their contents. Confirm no unresolved conflicts
or merge/rebase operations are in progress. The branch must already be `dev`.
Require a clean tracked and untracked working tree before release preparation;
ignored local artifacts do not count as release content. If the branch is wrong,
the tree is dirty, or an operation is unfinished, stop and report the state. Do not
switch branches, stash, stage, commit, or clean files to satisfy this requirement.

### 2. Fetch and capture the branch comparison

Fetch current GitHub branch information without changing local branch tips, the
index, or the working tree:

```powershell
git fetch --no-tags --no-prune origin refs/heads/dev:refs/remotes/origin/dev refs/heads/main:refs/remotes/origin/main
git rev-parse dev origin/dev origin/main
git rev-list --left-right --count dev...origin/dev
git rev-list --left-right --count origin/main...origin/dev
git log --format="%h %s" origin/main..origin/dev
git diff --name-status --find-renames origin/main...origin/dev
git diff --numstat --find-renames origin/main...origin/dev
git diff --shortstat origin/main...origin/dev
git diff --name-status --find-renames origin/main origin/dev
git diff --shortstat origin/main origin/dev
```

Inspect the fetch configuration first: it must update only remote-tracking refs,
not local branches. Use the explicit, non-forced refspecs above on every fetch in
these procedures. Do not force-update or prune refs; stop on rejected updates.
If fetching fails or either remote branch is missing, stop. Record both full remote
SHAs and the comparison time. Local `dev` must equal `origin/dev`; any unpublished,
behind, or divergent local commits are a blocker, not authorization to push or pull.

Report both exact counts from `origin/main...origin/dev`: MAIN-only commits first,
DEV-only commits second. Identify the DEV-only commits being promoted. The
three-dot file diff is the PR change set relative to the merge base; report its
exact file count, changed file paths and statuses, total line additions, and total
line deletions. Count a rename as one changed file and identify both paths. Binary
diffs have no line counts: list them separately rather than inventing counts.
Label the two-tip comparison separately; it may differ when MAIN has unique work.
Stop if there are no promotable changes, no valid merge base, or uncertain results.
MAIN-only commits do not by themselves establish a conflict; verify mergeability.

### 3. Summarize the promotion

Review the commit list and complete PR diff, not just commit titles. Group changes
by relevant categories, such as frontend behavior, backend/security, database
migrations, CI/CD/configuration, tests, and documentation. Describe the resulting
behavior and any limitations, breaking changes, or incomplete features. Do not
present proposals or future work in `PROJECT.md` as completed functionality.
Include this same grouped summary in the PR description and final report.

### 4. Complete release-readiness checks

Treat each required check as passed, failed, or unverified. Use "not applicable"
only with evidence and an explanation. A missing tool, pending check, inaccessible
setting, or unavailable evidence is unverified, not passed. Any failed or unverified
required pre-flight check stops the procedure before PR creation or update.

Classify gates using verified workflow triggers and repository policy, rather than
requiring a check for a PR that does not yet exist:

| Stage | Required evidence and boundary |
| --- | --- |
| Before PR creation/update | Verified identity/permissions, clean synchronized DEV, recorded branch SHAs, local validation, sensitive-data/migration/configuration review, merge simulation (or existing PR mergeability), known protection/review policy, and successful applicable DEV-SHA CI/security checks. All required evidence must be available. |
| After PR creation/update | Read back PR identity, same-repository `dev` to `main` targets and SHAs; inspect GitHub mergeability and PR-triggered CI/security results. Explicitly list verified PR-only checks as pending until they complete; never label them passed in advance. |
| Before merging (owner action) | All required CI/security checks must pass for the current PR revision and applicable tested merge SHA, required reviews/approvals must be satisfied, and GitHub must report mergeability with all protection rules met. Production effects and separate operational approvals must remain explicit. Codex must not approve, enable auto-merge, or merge automatically. |

Only checks proven to require a PR may be deferred to the post-creation stage.
Unknown triggers, inaccessible protection/security policy, or missing required
DEV-SHA evidence remain preflight blockers. Record each check's name, trigger,
tested SHA, status and evidence. For PR merge-ref checks, tie the tested merge SHA
to the recorded base/head revision; a result for another revision is insufficient.
An existing PR's required checks already available must be verified before update.
New pending PR-only checks block merging, not an otherwise verified initial PR
creation. Preserve automatic creation/update after successful preflight under an
explicit release-preparation request; no additional PR-creation approval is needed.

- **Local validation:** Inspect `package.json`, the lockfile, CI workflows, and
  documented test commands before running scripts. Run the repository's available
  TypeScript, production build, and relevant behavior/database tests against the
  recorded DEV SHA. Inspect script side effects; never run a deployment or remote
  migration command as a check. Use isolated local database state and fictional
  data. Report versions, commands, results, and required manual validation.
  Compilation alone is insufficient. Verify applicable manual behavior evidence,
  including responsive layouts, accessibility, registration/attendance behavior,
  and permission boundaries; unresolved required validation is a blocker.
  At the time this procedure was written, the safe local commands are
  `npm run typecheck`, `npm run build`, and
  `node --test worker/tests/*.test.mjs`; recheck their definitions each run.
- **CI and security:** Inspect the actual GitHub workflows, branch protection/rulesets,
  and CI/security results (including applicable CodeQL scanning) for the exact
  `origin/dev` SHA. All applicable pre-PR required and release checks must have
  completed successfully. A skipped, cancelled, pending, or absent required
  pre-PR check is a blocker. Verify any available existing PR checks and required
  review policy. Checks that can only run on a new PR must be identified as
  post-creation gates; they cannot substitute for pre-flight DEV validation.
- **Mergeability:** For an existing matching PR, verify GitHub reports no conflicts
  for the recorded SHAs. For a new PR, use an available Git merge simulation that
  does not touch the index, working tree, or branch refs, such as modern
  `git merge-tree --write-tree origin/main origin/dev`. Inspect its exit status and
  output; conflicts or an unavailable reliable simulation are blockers. This may
  write temporary Git objects but must not create a commit or change branch tips.
  Do not perform a trial merge in the active checkout. Branch protection or required
  approvals remain manual merge gates even when content merges cleanly.
- **Sensitive data:** Review the complete promoted patch and DEV-only commit
  history, including files added and later removed. Use existing scanning tools
  where available, supplemented by manual review for secrets, credentials, real
  participant details, production exports, and private information. Confirm ignore
  rules and fictional examples. Do not include any discovered values in the PR or
  report. Stop on findings or incomplete review; do not rewrite history.
- **Migrations:** List added, modified, and deleted migrations. Check version order
  and confirm already-applied migrations have not been edited or removed; use
  new versioned migrations for schema changes. Check preservation of existing
  registrations, parameterized backend queries, local
  test evidence, and compatibility between the promoted Worker and the verified
  production schema. Review `migrations/README.md` and current decisions in
  `PROJECT.md`; do not assume a DEV migration exists in production. Verify required
  backup/recovery and migration-order planning before production use. Do not apply
  remote migrations or query/export participant records. Obtain sanitized
  read-only schema evidence or owner confirmation if needed. Source promotion of
  a reviewed migration does not approve its production application. Block if
  schema compatibility or a required plan cannot be verified.
- **Production configuration and CI/CD:** Review Wrangler environments, Worker
  and D1 bindings, static assets, routes, secret references, and workflow triggers
  using read-only evidence. Verify DEV/PROD separation, absence of browser-shipped
  secrets, and compliance with existing approval gates. Verify needed secrets are
  configured through presence/metadata evidence without reading their values.
  Identify effects of PR events and a future MAIN merge, including automatic
  deployments. Do not create/update a PR if doing so would trigger unauthorized
  production actions. Explain merge-triggered production effects to the owner;
  release preparation does not authorize them or allow bypassing protection rules.
  Verify applicable production-readiness decisions, privacy requirements, and
  backup/recovery procedures. Jotform remains operational until separately approved.
  The current Wrangler default targets production; do not invoke an unqualified
  deployment or migration command. The current CI runs on DEV pushes and MAIN
  PRs, while the development deployment workflow runs on DEV pushes. Reinspect
  these triggers for each release rather than assuming they remain unchanged.

Pending production migration approval or a manual merge approval is reported as a
manual action, not as approval granted by this procedure. It may remain pending
only when the source promotion is otherwise verified safe and all required
pre-flight checks pass. An unresolved production compatibility or security issue
is a blocker, not merely a checklist item for later.

### 5. Create or update the GitHub PR

Find open PRs in the verified repository with exactly base `main` and head `dev`
from this repository, not a fork. One match is updated; no match is created;
multiple matches are a blocker. Do not reopen a closed PR automatically.

Immediately before writing, fetch again and confirm both recorded branch SHAs,
local `dev`, and the working-tree state are unchanged. If they changed, stop and
repeat the affected comparisons and checks before any PR write. Use the existing
Conventional Commit title conventions and the dominant change type.

Automatically create the PR with base `main` and head `dev`, or update the matching
PR's title and release description after every pre-flight check has passed. Preserve
unrelated owner notes and existing PR metadata; do not overwrite comments, review
decisions, labels, or assignees. Use a structured tool argument or a temporary body
file with actual newlines (`gh pr create/edit --body-file`), not shell-interpolated
multiline text. Keep temporary files outside the tracked working tree. Attach any
created or updated PR to the Codex chat using the available PR attachment tool.
Never enable auto-merge, approve, merge, or push as part of this procedure.

Include in the PR description:

- The release intent, base/head branches and full SHAs, exact commit counts, file
  count, changed file list, line additions/deletions, and any binary-file caveat.
- The grouped promotion summary, breaking changes, and limitations.
- Local and GitHub check evidence tied to the DEV SHA; manual validation evidence
  and remaining PR-only check/review gates.
- Migration and production-configuration findings, production-impact ordering,
  and separate approvals required before deployment or database changes.
- Required owner actions, including review, protected merge, and any approved
  production steps. Do not imply that merging establishes deployed functionality.

Read back the PR through the selected authenticated interface and verify its URL,
base/head repositories and branches, description, and base/head SHAs. Inspect
GitHub mergeability and CI/security checks now available on the PR. Report pending,
failed or unverified post-creation gates clearly and leave the PR unmerged; do not
approve or bypass them. Recheck required review policy and report outstanding owner
approvals. If a revision changes, invalidate affected evidence and revalidate it.
If the PR write fails, stop and report the error. For an uncertain creation outcome, inspect matching PRs
before retrying to avoid duplicates.

### 6. Refresh GitKraken information and report

Fetch safe remote-tracking information again without switching branches or changing
local tips. GitKraken can refresh its graph from these refs; fetching does not make
local branches equal to remote branches. Recheck working-tree status and record any
remote movement. Changed SHAs invalidate earlier check evidence for the new state;
report this rather than claiming that the new state was verified.

The final report must contain the exact commit counts and SHAs, changed files and
line totals, grouped promotion summary, PR URL (or "not created"), check results
and evidence, blockers, and required manual actions. Report staged, unstaged, and
untracked status and local/remote branch divergence. State explicitly that no
commit, push, merge, production deployment, or production migration was performed.

## Post-release housekeeping (separate explicit request)

This procedure is read-only inspection, public HTTP verification and safe
remote-tracking refresh only. It does not run automatically after PR creation,
merge, deployment, or a release report. TechDevie must use the
[environment reference in PROJECT.md](PROJECT.md#environment-reference) for
environment mappings and website addresses; do not maintain duplicate URLs here.

The owner confirms Phase 2 Database Foundation is complete on DEV and PROD, with
migrations `0001` through `0007` applied and verified in both environments. Phase 3
Authentication & Accounts is next. This recorded milestone does not replace
release-specific deployment and public website evidence. Cloudflare Git integration
handles PROD deployment from `main`; do not assume a local GitHub Actions production
deployment workflow exists. Worker deployment does not apply D1 migrations, and
production migrations still require separate explicit owner approval.

1. Re-read the repository protections and inspect the repository identity, current
   branch, complete staged/unstaged/untracked state, and unfinished Git operations.
   Do not require switching to `dev` or discard unrelated work. If an unfinished
   operation or unsafe fetch configuration exists, stop before fetching.
2. Fetch current `origin` branch information under the same fetch safeguards as
   release preparation. Preserve all local branches, staged changes, and files.
   Stop and report authentication, network, permission, or ref-update failures.
3. Verify the intended release PR was merged into `main`, recording its URL, merge
   commit, and time. A closed unmerged or still-open PR is not a completed release.
   Inspect available MAIN CI results and deployment evidence read-only; report
   unknown production state without claiming deployment or migration success.
   During post-release verification, TechDevie must:

   - Obtain the production URL and Worker mapping from the environment reference
     in `PROJECT.md`.
   - Verify the actual deployment status using GitHub PR/merge, checks and workflow
     evidence as applicable, together with Cloudflare's production Worker build,
     deployment and active-version evidence. Tie evidence to the released MAIN
     commit; record unavailable evidence as unverified. The checked-in DEV workflow
     does not establish production deployment success.
   - Check public website availability with a read-only GET of the production URL.
     Inspect the returned page and assets for unexpected behavior; HTTP 200 alone
     may still serve an error or unexpected page.
   - Check `GET /api/health` on that same production origin. Reconfirm its actual
     route and expected response from `worker/index.ts` and the routing rules in
     `wrangler.jsonc`; currently it returns HTTP 200 and JSON `{"status":"ok"}`.
     This is a liveness check independent of D1, not database verification.
   - Report the URLs checked, check time, HTTP status codes, redirects, response
     content and unexpected behavior, or request failures when no HTTP response
     is received. Exclude secrets and private data from the report.
   - Report deployment status and public website verification separately. A merged
     PR or successful deployment is not proof of a successfully verified website;
     public HTTP checks alone do not identify the deployed release. Missing evidence
     must remain unverified. These checks do not authorize deployment, remote D1
     access or migrations, or replacing Jotform.

4. Record remote MAIN/DEV and local MAIN/DEV SHAs where local branches exist. Run
   `git rev-list --left-right --count origin/main...origin/dev` and compare the
   two remote trees with `git diff --name-status origin/main origin/dev` and
   `git diff --shortstat origin/main origin/dev`. For each existing local branch,
   run the equivalent local-to-remote commit count. Missing local branches are
   reported, not created. Distinguish equal commit tips, equal file content with
   different history (possible after squash merging), and actual content divergence.
5. Verify and report the resulting synchronization state for GitKraken. If MAIN
   has merge/squash commits absent from DEV, DEV contains newer work, or local
   branches lag their remote refs, list exact counts and file differences and
   explain the required owner follow-up. This request does not authorize a
   MAIN-to-DEV merge, local fast-forward, pull, commit, push, or branch deletion;
   any reconciliation needs a separate explicit instruction under `AGENTS.md`.
   Never reset, rebase, force-push, or resolve conflicts automatically.
6. Recheck the complete working-tree state against the initial snapshot and report
   that local work was preserved. Include PR/merge evidence, MAIN checks, remote
   and local synchronization counts, content differences, blockers, and required
   manual actions. Report whether synchronization was verified or remains pending;
   a successful fetch alone is not proof of MAIN/DEV synchronization.
