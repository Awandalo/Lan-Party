# Controlled DEV-to-MAIN release procedures

The separate [Investigate and Deploy](#investigate-and-deploy) operation below
governs owner-authorized merge-through-production execution. The preparation-only
and separately requested housekeeping procedures retain their narrower scopes.

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

## Investigate and Deploy

Owner-approved LAN Party project directive, 2026-11-01. This implements the owner's
hands-off preference inside a bounded approved production operation. It updates
project execution guidance, not the adopted framework pin or other repositories.
The authoritative procedure is here; AGENTS.md and the governance/communication
documents link to it. No new framework directive ID or framework version is assigned.

### Step 0 — accept the reviewed release and its production scope

Prepare a clearly labelled **Investigate and Deploy scope** in the release PR
before asking for acceptance. In trusted conversation, the owner's acceptance of
that PR for merge under this directive authorizes the exact reviewed head's merge
and the explicitly disclosed production operation together. For example, once
that scope is complete, "PR #N accepted, merge it" is sufficient; no second round
is needed for the listed migrations, deployment, activation or acceptance checks.
Record the accepted head and scope in the existing PR. A label, issue prose, agent
recommendation or edited PR description alone never supplies owner authorization.

The scope must identify:

- Repository, PR, exact base/head, features to make live, exclusions, and the
  canonical PROD Worker/database from PROJECT.md's environment reference.
- Exact migration filenames/order, required earlier dependencies, existing-data
  compatibility and any explicitly approved bounded data transformations.
- Configuration keys and intended values, feature/origin gates, production build
  profile and deployment mechanism; any source changes must already be reviewed.
- Small operational corrections allowed below, hosted checks and their fictional
  account/data/email effects and cleanup, and separately approved provider actions.
- Recovery checkpoint method, integrity baseline, safe ordering, abort conditions,
  rollback compatibility and any recovery actions actually authorized to execute.

Missing information can be investigated without approval, but an omitted write,
migration, activation, provider action or recovery operation is not authorized.
If one is needed, first prepare the concrete addition and ask only for that scope.
An owner may approve this same explicit production scope for an already merged
revision; start at step 1 without another merge. A merge-only or prepare-only
instruction stays limited. Earlier PR #46 was approved as source promotion only:
this directive is not retroactive approval for its pending production activation.

All required review, exact-head approval, CI/security, branch protection and host
gates remain. Recheck the head immediately before merging with an expected-SHA
guard. A changed source head needs affected validation, review and fresh exact-head
owner approval; this directive never permits silently merging a replacement head.
Use a reviewed isolated release branch when DEV contains excluded work. Never
publish later DEV commits just to make the earlier approved release live.

### Execute the ten stages continuously

After step 0, follow these stages without routine research-report or approval stops.
Keep short progress updates; the final report contains the consolidated results.

1. **Verify current reality.** Check root/origin, clean scoped work, MAIN/PROD SHAs,
   active deployed version, account, Worker/D1 identities, configuration, feature
   and origin gates, authentication and actual production migration history. Use
   explicit PROD profiles and canonical targets, never CLI defaults. Resolve
   deploy-before-migration ordering in the PR before merge when automatic deployment
   could encounter an incompatible schema. A post-merge check is not a substitute.
2. **Verify the migration chain.** Compare every pending file with reviewed source,
   check ordered dependencies against the real applied history and prove data
   compatibility. Preserve applied migrations and registrations. A missing unlisted
   dependency requires a scoped decision, not an automatic extra migration.
3. **Prepare activation.** Confirm the exact approved settings and source gates
   required to expose the approved features. Prepare commands/diffs and a sequence
   that keeps incomplete functionality gated. Distinguish missing schema, disabled
   gates and account roles; an Administrator grant does not enable PROD routes.
4. **Verify recovery first.** Capture and verify a fresh D1 recovery checkpoint and
   integrity baseline immediately before database writes; retain sanitized recovery
   references privately. Establish a realistic procedure, responsible operator and
   stop conditions. Do not export participant data into the repository. A checkpoint
   does not authorize a destructive restore, and Worker rollback may be incompatible
   with a newer schema. Stop writes if recovery capability cannot be verified.
5. **Resolve genuine blockers.** Investigate privacy, security, email, retention,
   authorization, data and operational concerns that affect this release. Reuse
   valid recorded decisions; do not reopen settled questions without new evidence.
6. **Select acceptance checks.** Reuse unchanged DEV/CI/preflight evidence with its
   revision and limits. Choose the smallest necessary hosted-PROD checks for affected
   behavior, including server-side permissions, private-data boundaries and schema
   integrity. Use only approved fictional fixtures/provider actions. A build or
   health response alone does not establish functional acceptance.
7. **Handle bounded small issues.** Investigate and correct safe operational issues
   inside the approved scope, then rerun affected checks. Examples: correct command
   quoting for the identical approved effect; set an explicitly listed activation
   value; redeploy the same approved artifact through the approved mechanism after
   a diagnosed failure, if preauthorized. For uncertain writes, inspect actual state
   first and never replay blindly. Apply the existing error-10000 rule exactly;
   other errors have no automatic retry entitlement. No retry-until-green.
8. **Apply approved migrations.** Only when prerequisites pass, apply the explicitly
   approved files in verified order to the named PROD database. Inspect results and
   applied history before the next dependency; stop on partial/uncertain application
   or failed integrity. Never edit an applied file or include a later feature's
   migrations merely because it shares DEV. Record actual effects.
9. **Deploy, activate and verify.** Confirm the approved MAIN artifact and deployment,
   apply the disclosed activation settings in their safe order, and test actual
   hosted behavior. Reuse unchanged preflight evidence; refresh anything invalidated
   by writes, configuration or revision changes. Check account/permission boundaries
   and data integrity. Do not claim a feature is live merely because its PR merged.
10. **Report once.** Give a concise completion report: reviewed/merged/deployed SHAs,
    actual migrations/settings, hosted checks and results, reused/omitted evidence,
    limitations, recovery references and clean/staged/unstaged state. Update the
    existing PR's execution receipt within the approved operation, without private
    data; keep historical evidence distinct. Routine stages need progress updates,
    not another approval. Stop reports identify the actual blocker and decision.

### Repairs and stop boundaries

Small means low-impact, understood, within the exact approved target/effect and
recoverable under the approved procedure, not merely a small diff. Reuse existing
credentials/permissions only. No speculative refactoring, new dependencies/services,
production data repair, secret rotation, account privilege grants, authentication
weakening, privacy/retention policy changes, extra migrations or infrastructure
expansion are implied. Jotform cutover requires its separate explicit decision.

If a source correction is necessary, prepare and validate the minimal patch locally
when covered by the repair scope. DEV publication must also be authorized under
AGENTS.md. A new MAIN commit/PR must follow exact-head review/owner approval;
operational repair authority never bypasses that boundary. Do not downgrade a
security test, suppress an alert or weaken a gate to continue.

Stop affected actions for insufficient authority, identity/revision/environment
mismatch, missing recovery capability, incompatible/unlisted schema requirements,
material privacy/security issues, failed integrity or critical runtime checks,
destructive recovery, or a correction outside the approved scope. Preserve minimal
sanitized diagnostics; investigate a failed check without repeating its harmful
effect or broadening authority. Separable safe work may continue. Report impact,
work completed, concrete options and the smallest owner decision needed. Host/tool
confirmation requirements still apply even where conversational approval is reused.

### Scenario review

| Scenario | Expected action |
| --- | --- |
| Reviewed PR lists the full PROD operation; owner accepts its exact head; prerequisites pass | Merge under protections and execute stages 1–10 without another migration/activation approval. |
| Quoting fails before any effect; corrected syntax has the identical authorized target/effect | Correct it, verify actual state and continue with affected checks. |
| Approved activation key has the wrong value | Apply the reviewed value and recheck behavior; no new scope. |
| MAIN changes, an earlier migration is missing, CLI authorization fails, recovery is unverified, or integrity fails | Stop affected effects, diagnose safely and request the concrete missing decision/access/recovery action. No credential or security bypass. |
| New application code is required to enable PROD | Prepare a scoped reviewed patch; obtain exact-head approval before its MAIN merge. |
| Phase 4 source already merged as #46; PROD activation is requested later | Prepare the explicit operation for that revision; approve it once, then execute continuously. Verify 0020–0023 and earlier dependencies; exclude Locations/0024 and retain Jotform. |
| Owner only asks to update this directive | Publish the scoped project documentation to DEV under its existing authorization; execute no PROD operation. |

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
