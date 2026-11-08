# LAN Party frontend design guidance

Optional guidance adapted from the approved Development-Workflow v1.4.0 chapter
at immutable revision `fa1a86a07fda44ac7434b95142eb7f30bc5987b2`:
[source](https://github.com/Awandalo/Development-Workflow/blob/fa1a86a07fda44ac7434b95142eb7f30bc5987b2/standards/frontend-design.md).
The owner authorized this local baseline adoption on 2026-11-08; see
[governance](governance.md#current-source-and-adoption-decision--2026-11-08).
Existing [project requirements](../../PROJECT.md), [AGENTS.md](../../AGENTS.md)
and [workflow standards](standards.md) remain controlling.

Standardize how we work, not what we build. Preserve LAN Party's dark surfaces,
mint accents, shared controls, typography and established responsive layouts.
Read the affected flow and identify the user's task before choosing an effect.
Use clear hierarchy, spacing, alignment, imagery and concise text. Do not add cards
or decoration merely to fill space. This chapter requires no redesign, dependency,
component library, Material Design adoption or additional Skill.

## Feedback and continuity

Motion can clarify hierarchy, acknowledge input, explain spatial relationships or
express the project's personality. Choose a purpose first; skip motion when static
feedback is clearer. Frequent administration/data-entry actions call for restraint;
an occasional important transition may be more expressive. Keep repeated behavior
consistent and interruptible. Do not delay input/navigation for decoration or for
a data request merely to avoid showing its loading state.

Select a clicked tab immediately. If data is needed, provide accurate pending,
error/empty and disabled states. Where safe, retain same-context content during a
refresh with visible progress instead of blanking it; never show content from
another account/event or imply that stale values or an unconfirmed operation are
current/successful. Preserve focus and stable geometry where practical.

Respect `prefers-reduced-motion` and any project motion setting. Replace substantial
travel, zoom or springs with immediate/static or subtle feedback, retaining focus,
progress and outcome information. Avoid flashing, repeated attention traps and
scroll effects that impair reading. Example durations (including roughly 200–500 ms)
are starting points, not universal limits or mandatory timing.

## Optional patterns

These examples are inspiration, not requirements to retrofit every component.
Existing owner-approved choices can be reused when they suit the affected flow.

| Pattern | Possible expression | Preserve usability |
| --- | --- | --- |
| Button press | Approximately 95% scale followed by return/spring; perceptible hover and active feedback | Stable hit target, focus-visible, keyboard/touch, disabled/busy states; no hover-only meaning or dramatic tiny-control scaling |
| Pull to refresh | Content follows part of finger travel with resistance, for example 35% | Use only for meaningful touch refresh; provide a button/equivalent, threshold, cancellation and pending/error states without breaking scrolling/navigation |
| Drag to reorder | A small pickup/lift, for example 105%, with neighbors moving over about 200 ms | Valid destinations, keyboard and single-pointer non-drag alternatives, cancellation, persistence and save-failure recovery |
| Card expansion | Restrained ease-out around 350 ms connecting preview/detail | Unclipped content, stable layout, meaningful reading/focus order, correct expanded semantics and clean interruption/reversal |
| Success feedback | Circle/checkmark sequence, for example about 470 ms | Only after confirmed success; static/text status, accessible asynchronous announcement, useful errors and onward interaction |
| Connected steps | Static or moving lines grouping progress/onboarding steps | Semantic order and clear complete/current/upcoming states; no false relationships or reliance on color alone |
| Floating labels | A smaller persistent label moves toward the top-left on focus/value | A real associated label; no overlap after blur, prefill, autofill or validation; readable labels, focus/errors/disabled states and reduced-motion alternative |

## Visual language and proportionate verification

Selective Material Design 3 ideas can inform a small coherent vocabulary of spatial
transitions versus color/opacity changes, action/surface/outline colors, readable
type roles, tabular figures and purposeful shape families. Preserve LAN Party's
branding rather than copying proprietary screenshots, assets or layouts. Do not
port Android spring APIs/physical values into CSS by default. The source chapter
is optional inspiration, not a browser compatibility or accessibility certification.

For an implementation, apply existing risk-based checks to the affected viewport,
zoom and input modes. Check keyboard focus, touch, semantics, real foreground/
background contrast, reduced motion, pending/error/empty/disabled states, accurate
outcomes and interrupted/repeated input. Prefer transform/opacity for suitable
effects; content-driven expansion may need other techniques. Avoid layout thrashing
and excessive dependencies; inspect constrained-device performance when warranted.
An image or successful compilation alone cannot establish usability, accessibility
or runtime performance. A guide-only edit needs editorial/link checks, not UI tests.

Useful references from the pinned chapter:
[M3 motion](https://m3.material.io/styles/motion),
[MotionScheme concepts](https://developer.android.com/reference/kotlin/androidx/compose/material3/MotionScheme),
[M3 color](https://m3.material.io/styles/color/the-color-system),
[M3 foundations](https://m3.material.io/foundations/),
[form labels](https://www.w3.org/WAI/tutorials/forms/labels/),
[non-drag alternatives](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html),
[interaction animation](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
and [animation performance](https://web.dev/articles/animations-guide).
These links are preserved source references; this adoption did not freshly audit
their interactive content, certify WCAG conformance or install a frontend Skill.
