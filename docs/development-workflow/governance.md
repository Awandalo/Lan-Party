# LAN Party workflow governance

## Source and adoption decision

Source repository: `Awandalo/Development-Workflow`, framework v1.2.1,
immutable revision `cbe4b564e2f30d084ba79b76c1e3ae0ef18ec155`.
[Source approval](https://github.com/Awandalo/Development-Workflow/blob/cbe4b564e2f30d084ba79b76c1e3ae0ef18ec155/governance/approval-model.md#framework-v121-adoption--2026-10-22)
records the framework owner's 2026-10-22 adoption of reviewed PR #8 merge
`299caa5cb9cde9330735b8a33e44f081633d2840`; VERSION at the pin is `1.2.1`.
Source approval does not authorize operations in LAN Party.

Target decision: on 2026-10-22, Awandalo, LAN Party owner, instructed in the trusted
conversation: “please update all that is missing while leaving all current
directives inside the project lan there update Communication routing to the proper
protocol as stated in the baseline”. This explicitly authorizes the additive
baseline integration and replacement of author-only routing with directional
routing, preserving all other project directives. The requested recheck covers
only the updated areas. It is not a framework-owner change to the source rules.

Applicable governance and development, Git, communication, security, testing,
release/environment and adoption guidance is adopted locally through the map
below, except the unresolved connector-only linking provision. No framework task
history, other-project permissions, personal profile or release authority is copied.

| Source at the pinned revision | Local authoritative location |
| --- | --- |
| `governance/approval-model.md`, `governance/main-protection.md`, `governance/directives.md` | This document plus existing Git/deployment boundaries in [AGENTS.md](../../AGENTS.md) and [RELEASE.md](../../RELEASE.md) |
| `standards/development.md`, `standards/git-and-github.md`, `standards/security.md`, `standards/testing-and-quality.md` | [Workflow standards](standards.md), supplementing AGENTS.md |
| `standards/releases-and-environments.md` | Workflow standards and existing RELEASE.md; environment identifiers remain in [PROJECT.md](../../PROJECT.md#environment-reference) |
| `standards/github-communication.md` | [Communication protocol](../GITHUB_COMMUNICATION.md), with retained scope and the linking deviation below |
| `standards/framework-adoption.md`, `bootstrap/project-baseline.md` | This adoption record, AGENTS.md entry point and the update/preservation rules below |

Existing README, PROJECT, TODO, RELEASE, migrations and security/design documents
retain their responsibilities. Equivalent filenames are intentional. The framework's
folder-per-standard layout is unnecessary; relevant additions are materialized here
and in standards.md once per subject. All applicable adopted rules are required.
No persistent identity profile or profile loader is installed. Display aliases in
the existing communication adapter are project routing labels, not authentication
or evidence of a verified personal profile. New-project creation and Skill/package
installation procedures are not applicable to this existing application update.

## Authorization, decisions and main

One approval, one operation, multiple necessary actions. A clearly authorized
operation includes necessary supporting inspections, edits and verification;
staging, commits and publication are included only where the actual scope covers
them. Reuse the existing AGENTS.md instruction-update publication authorization;
do not request repeated conversational approval for covered steps. Host/tool
approval and actual service permission remain independent prerequisites.

Stop dependent actions on failed safety checks, unexpected risk, unclear authority
or an operation outside scope. Recovery needs existing applicable authority or a
new owner decision. A task, issue, passing check, alias, template, handoff, reviewer
acceptance or silence is not owner approval. Preparation/publication of a proposal
does not approve its substance. Record meaningful decisions with owner, date,
scope and evidence in the relevant existing document or PR; no new registry is needed.

Preserve dev/main roles and all existing Git rules. Main changes require explicit
owner approval through a reviewed PR. Record approval for the exact reviewed head;
if it changes, recheck affected evidence and obtain approval for the revised head
before merging. Review acceptance does not authorize a merge. Verify the actual
repository protections rather than assuming enforcement; procedural safeguards
do not constitute technical branch protection. Tags/releases, deployments,
production operations and migrations retain their separate authorization boundaries.
An authorized push must account for the existing automatic DEV deployment trigger;
main promotion must account for Cloudflare's production integration.

## Directives and competent owners

Framework directives govern shared boundaries and require explicit authorization
from the Development-Workflow framework owner to change. Project directives govern
LAN Party conventions and require its owner's authorization within controlling
framework boundaries. Task instructions operate inside those rules. Holding both
owner roles does not implicitly authorize a framework change in a project task.
Higher-priority host/platform instructions remain controlling. Unresolved conflicts
must not be discarded through an assumed precedence or a closer instruction file.

Stable source references: `FW-GOV-001` (approval), `FW-GIT-001` (Git/main),
`FW-COM-001` (communication), `FW-SEC-001` (security), `FW-TST-001` (testing),
`FW-REL-001` (release/environment), `FW-ADP-001` (adoption/development) and
`FW-DIR-001` (directive changes/conflicts), as indexed in
[the pinned directive index](https://github.com/Awandalo/Development-Workflow/blob/cbe4b564e2f30d084ba79b76c1e3ae0ef18ec155/governance/directives.md).
These IDs refer to source subjects, not invented local permissions. Cite project
rules by their actual file/section; do not invent project directive IDs.

`DIRECTIVE UPDATE`, `NEW DIRECTIVE`, or equally explicit change intent must identify
the actual source/section, framework or project scope, competent owner, reason,
intended behavioral difference, conflicts/downstream effects, explicit decision
and proportionate verification/recovery boundaries. A marker alone grants nothing.
Review the entire intended/staged diff for indirect changes through templates,
formatters, synchronization, deleted restrictions and contradictory additions.
Preserve permitted exceptions within their recorded scope. Unexpected directive
changes stop affected publication; do not revert unrelated user work automatically.

For prohibited operations, unavailable required rules, unresolved conflicts or
unclear authority, stop only the affected operation. Separable authorized work
may continue. Use this source-defined report with real references:

```text
DIRECTIVE CONFLICT — STOP
- Requested operation: <affected operation>
- Directive ID: <actual indexed ID(s), or unindexed — actual source>
- Directive source: <document and section for each relevant rule>
- Relevant requirement or prohibition: <actual source requirement>
- Reason for conflict: <specific conflict, uncertainty or missing authority>
- Actions completed: <actual work, or none>
- Actions blocked: <affected actions>
- Required owner decision or clarification: <competent owner and exact decision>
```

## Retained directives and unresolved deviation

Preserve the existing stack, naming/layout, Windows/npm workflow, roadmap authority,
privacy/security, Jotform cutover, production/database protection, risk-based testing,
Conventional Commits, and all scoped Git/publication rules in AGENTS.md. The
README/TODO automatic Git exception remains limited to its exact conditions.
Preserve connector-only reads, existing manual read scope across accessible
repositories (not global automated discovery), bounded research and parent-linking
permissions, notification-only codex-ready handling and independent host approvals.
Directional routing narrows eligibility; it creates no new execution/write scope.

**Unresolved deviation — FW-COM-001, native parent/sub-issue procedure:** the pinned
framework requires connector-only linking writes and stopping when unsupported.
The owner's retained project rule in communication protocol “Temporary parent-linking
instructions” permits a narrowly scoped authenticated CLI write fallback. This
provision of the framework is not adopted as matching local policy; neither rule
is silently removed or broadened. Before using that fallback under this integration,
stop the affected CLI linking action and obtain a competent-owner resolution of
the framework/project conflict. Connector-supported linking within existing scope
and independent work can continue. No actual relationship operation is performed
by this adoption. Framework-owner authorization for a source change or an owner
decision to retire the local fallback is outside this preservation request.

## Updates and review boundaries

Future framework updates require comparison against this exact pin, relevance
review and target-specific authorization. Preserve existing instructions and user
work; propose minimal additions, record justified non-applicability and resolve
conflicts before dependent actions. Do not automatically propagate changes to other
repositories, profiles, installations or schedules. After setup, AGENTS.md and its
referenced local rules govern ongoing work without rerunning onboarding.

Validate changed links, provenance, placeholders, consistency and complete scoped
diffs. Reuse unaffected evidence with its original limits. A receiving host verifies
its own access, root/remote/branch, effective instructions, Git identity, local state
and authorization. A handoff supplies context, not permission or runtime acceptance.
