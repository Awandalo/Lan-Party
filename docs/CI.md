# Path-aware CI

The CI workflow retains its workflow name `CI`, job ID `frontend` and required
check name **TypeScript and build**. No workflow-level path filters or skipped
jobs are used. Main's currently required context remains unchanged. DEV currently
has no required status checks; this change adds or removes no protection rules.

## Coverage selection

| Change on a DEV push | Checks |
| --- | --- |
| Only README.md, PROJECT.md or TODO.md | Routing-policy tests; changed-document encoding and explicit relative Markdown link targets |
| Only allowlisted public UI/assets | Routing-policy tests; npm ci; public UI smoke tests and existing frontend auth-mode boundary test; strict TypeScript; production Vite build |
| Backend, authentication, MFA, authorization, lifecycle, migrations, security or configuration | Routing-policy tests; npm ci; public UI smoke tests; every worker/tests/*.test.mjs; strict TypeScript; production Vite build |
| Mixed categories, new/unmapped paths, CI policy/workflows, dependencies, governance or test infrastructure | Full regression |
| PR targeting main, main ref, manual dispatch | Full regression |
| Missing/invalid/rewritten push comparison or empty diff | Full regression |

The public UI allowlist is deliberately small: Home, Events, their own CSS, local
public content, Footer and its CSS. Only simple raster/font asset paths in public/
are also eligible. Global CSS, shared routing, account/navigation components,
authentication UI, SVG/HTML, headers/redirects and unknown assets are not eligible.
All existing Worker implementation lives in shared authentication or routing;
there is no justified reduced backend suite today. Do not invent one to save time.
New backend modules default to full until their isolation and test mapping are reviewed.
Documentation outside the exact ordinary-document allowlist also defaults to full;
security/operational instructions are not assumed harmless because they are Markdown.

Classification uses the entire local Git diff from push before to after, not just
the last commit or a capped API list. Renames are treated as deletion plus addition,
so moving a security file into an allowed directory cannot hide the old path.
Full checkout history retains the pinned pre-MFA fixture revision. SHA validation,
checkout identity and ancestry checks precede diff selection. Symlinks, submodules,
executable/type changes and malformed raw-diff records also force full coverage. Any comparison error
selects full; invalid path inventories fail rather than being partially classified.
No changed filename or PR text is interpolated into shell commands.

## Honest completion and manual regression

The job is always scheduled for its branch events. Its final always-run step
requires every selected step to have succeeded and every omitted step to have
actually been skipped. A missing plan, failed check, unexpected skip or cancellation
cannot satisfy it. GitHub's ordinary job failure behavior remains enabled; there
is no continue-on-error or retry-until-green. The job summary names the selected
coverage and explicitly states when full regression was not executed. A green
reduced plan is not evidence that the entire application regression passed.

Use Actions → CI → Run workflow for a full run at a published revision.
GitHub enables manual dispatch after the workflow_dispatch definition reaches
the default branch; until then use the same full commands locally or normal
main-promotion CI. This change does not authorize a main merge.
Local full commands: `node --test scripts/ci-plan.test.mjs`, then
`node --test scripts/ci-public-ui.test.mjs worker/tests/*.test.mjs`,
`npm run typecheck` and `npm exec -- vite build`.
Local focused policy check: `node --test scripts/ci-plan.test.mjs`.
These checks use fictional/disposable fixtures, not hosted accounts.

## Workload and limits

Before: every DEV push/MAIN PR installed dependencies, ran all 30 Worker test
files (402 cases at the current deployed baseline), and ran TypeScript twice:
once explicitly and once through npm run build.

After: ordinary docs install no dependencies and execute zero Worker cases;
allowlisted public UI runs four UI/boundary cases instead of 402 Worker cases
in the old pipeline. Full plans keep all 402 baseline cases
plus the three public UI smoke cases. Every plan additionally runs the 37-case
routing-policy suite. Full/UI plans run TypeScript once rather than twice.
Counts are a baseline comparison, not a promise that future test totals stay fixed.
No hosted CI timings have been measured for this unpublished change. npm install,
runner startup, simulator cost and queue time vary; case-count reduction is not
a measured percentage reduction in elapsed time.

The independent Deploy development workflow is unchanged: any future DEV push
still triggers its existing typecheck/build/dry-run/deployment. CI optimization
does not make documentation pushes deployment-free or add a new deployment gate.
No publication/deployment is authorized by this document.

Remaining limitations: path classification cannot infer semantic security changes
hidden inside an allowlisted public page; reviewers must treat new auth/API/storage
logic there as security-sensitive and move it to the governed shared modules before
publication, or expand the full-regression rules first. CI cannot replace source
review. UI smoke tests do not prove visual/browser accessibility behavior. Local
Markdown checks do not fetch external links or validate heading anchors.
Reverting to the former unconditional workflow is the conservative rollback;
branch protection names and deployment workflow need no alteration.

## Local verification (2026-10-27)

| Representative scenario | Expected | Actual classifier result |
| --- | --- | --- |
| README + TODO | docs | docs |
| Home + its CSS; Events + public content; raster asset | frontend | frontend |
| Worker/auth/MFA/authorization or migration | full | full |
| Account UI, global CSS, shared routing/navigation | full | full |
| Workflow, dependencies, governance or security documentation | full | full |
| Docs + UI; docs + backend; unknown path | full | full |
| Rename from a security path to an allowed UI path | full | full |
| Main PR/main ref; manual run; missing/empty comparison | full | full |
| Symlink/submodule/executable diff | reject reduced plan | rejected; full fallback |

37 policy/runner tests and four public-UI/environment-boundary tests passed.
TypeScript, the direct Vite production build, existing ordinary-document link checks
and whitespace checks passed. The workflow has dependency-free contract assertions
for retained names/triggers, unique step IDs, no workflow path filters, read-only
permissions and the always-run completion gate. A general YAML parser was not
available locally; no dependencies were installed to add one. Hosted Actions
validation remains pending publication. The first publication necessarily selects
full regression because the workflow/policy files themselves changed.

The new failing-child-runner fixture initially inherited NODE_TEST_CONTEXT from
its parent test process and did not model a standalone Actions step. It now clears
that fixture-only environment entry and proves both failure propagation and empty
selection rejection. Application tests/security predicates were not changed.
The unchanged 402-case application suite was intentionally not rerun locally.
No commit, push, deployment or branch-protection modification was performed.
