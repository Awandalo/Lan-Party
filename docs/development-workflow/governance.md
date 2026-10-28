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
below, with the approved project-specific CLI linking fallback below replacing
the source's connector-only linking-write provision for this project. No framework task
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

<a id="retained-directives-and-unresolved-deviation"></a>

## Retained directives and approved linking fallback

The linking difference was resolved by the owner's explicit project decision on
2026-10-22. The legacy anchor above preserves links to the earlier assessment.

Preserve the existing stack, naming/layout, Windows/npm workflow, roadmap authority,
privacy/security, Jotform cutover, production/database protection, risk-based testing,
Conventional Commits, and all scoped Git/publication rules in AGENTS.md. The
README/TODO automatic Git exception remains limited to its exact conditions.
Preserve connector-only reads, existing manual read scope across accessible
repositories (not global automated discovery), bounded research and parent-linking
permissions, notification-only codex-ready handling and independent host approvals.
Directional routing narrows eligibility; it creates no new execution/write scope.

**Approved project-specific rule — native parent/sub-issue linking.** On 2026-10-22,
Awandalo explicitly confirmed in this trusted conversation that LAN Party's narrow
CLI fallback is the correct rule because the connector cannot perform the linking
write, and requested that this be documented. This is explicit project directive
change intent resolving the previously recorded adoption difference. It retains
the original 2026-10-20 standing linking authorization; no new write scope is added.

Capability evidence: inspection of the GitHub tools exposed in this session on
2026-10-22 found no native parent/sub-issue relationship write action. The generic
GitHub fetch tool supports GET only. This is a current-surface capability observation,
not a claim that all connectors or future versions lack the operation, nor a live
linking test. Recheck capability before use and prefer a supported connector action
if one becomes available.

When that write is unavailable, use the existing authenticated GitHub CLI only for
the exact parent attachment described in the communication protocol: resolved child
database ID, explicit parent in `Awandalo/Lan-Party`, and `replace_parent:false`.
Keep all reads and post-write verification through the connector. No new credentials,
read fallback, reparenting, detachment, generalized HTTP helper or expanded authority
is allowed. Host/tool approvals remain mandatory; lack of authenticated CLI access,
ambiguous targets, conflicting relationships or uncertain writes still stop the
operation under the existing procedure. Do not request another conversational
approval merely for an attachment already within this standing scope.

Source difference: pinned FW-COM-001 says to stop if the connector linking write is
unavailable. That source provision is not adopted locally; the explicitly approved
LAN Party alternative above governs this operation. The framework repository and
immutable pin are unchanged, and this decision propagates nowhere else. Existing
verification, temporary-instruction cleanup and sanitized completion-report rules
remain intact. No actual relationship operation or credential change is performed
by this documentation update. Any rollback of a real relationship needs separate
authority; this exception permits attachment only.

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

## Project DEV publication clarification — 2026-10-28

The LAN Party owner explicitly requested the seven-step Normal development push
workflow in trusted conversation to avoid repeated approval of publication already
included in an approved task. AGENTS.md is its authoritative procedure; PROJECT.md
and the communication approval table now refer to that same scope. This changes
project execution guidance, not the pinned framework or any other repository.

Task authorization can cover local implementation, scoped commit, origin/dev push,
its existing automatic DEV deployment and bounded hosted verification together.
It does not grant publication merely from issue labels/prose or extend a prepare-only
instruction. Unexpected risks, failed checks, unrelated outgoing history and uncertain
DEV compatibility stop publication for owner decision. Host gates, exact outgoing
commit review, meaningful commit bodies, connector reads, main/PROD, migrations,
credentials and infrastructure boundaries remain intact. This is consistent with
the existing rule that operations are included only where actual scope covers them.

Validation: review all affected directive references and the full scoped diff,
check Markdown links/whitespace, and preserve unrelated staging. No runtime test
can establish future authorization; actual publication still requires live identity,
remote-state and compatibility checks. A later change/reversal needs owner authority;
this record supplies no history-rewrite or deployment-recovery permission.
