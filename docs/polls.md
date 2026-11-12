# Polls in News — approved local increment (#57)

Polls reuse News storage, permissions, lifecycle, editor, public list/Home slots,
article URLs, metadata and manual share menu. Create… offers News or Poll.
News Editor retains the existing four News permissions; permanent deletion remains
Administrator-only. No new grants or member assignments are introduced.

## Voting contract

- Choose single choice or multiple choices when creating a poll; 2–8 distinct
  options, each at most 120 characters. Introduction is optional rich text.
- Only signed-in, verified active members vote. Anonymous visitors see aggregate
  results. Guests cannot vote. No voter identities or per-person vote history is
  exposed to editors, administrators or public visitors.
- Single choice: one option per person. Multiple choices: several different options,
  **one vote per option per person**. A save replaces that person's ballot.
- Bars compare each option's count with distinct voters; multiple-choice option
  totals may exceed the number of people. Show vote counts and distinct voters.
- Members may change choices while published and open. Close/Reopen is manual.
  Unpublish hides the poll and blocks voting; republishing preserves explicit closure.
- Question, choice mode and options lock after the first vote, even if that member
  later deletes their account. The optional introduction stays editable.
- Account deletion removes the person's ballot/selections; deactivation prevents
  further changes. No emails, schedules, external polling service or analytics.

## Integrity and privacy

0040 adds settings, ordered options, private current ballots and selections. A
composite primary key enforces unique person/option; composite foreign keys prevent
cross-poll answers. A database trigger also enforces single choice. Atomic revision
checks fence stale/concurrent votes, closure, unpublication and session loss. The
ballot limits changes to 60 per ten minutes using the database clock. Choice values
are not written to activity logs. Existing News lifecycle audit remains in use.

## Local acceptance checklist

- Create and publish both modes through Create…; optional introduction.
- Vote once, change it, reload; multiple answers each count once for that person.
- Compare distinct voters and option counts; test two fictional accounts.
- Close/Reopen; Unpublish/republish; verify first-vote question/options locking.
- Ordinary member cannot edit polls; anonymous visitor cannot vote.
- Check mobile layout, keyboard operation, bars, article sharing and open-polls link.

Owner accepted local review and authorized DEV publication on 2026-11-12, including
accepted #54–56 fixes. Separate approval covers only DEV migration 0040. Keep #57
open for hosted owner acceptance. No PROD, role assignments or provider sends.

## Verification — 2026-11-12

844 full regression tests pass. The final focused Polls/News API run passes all
28 cases, including the later old-schema and malformed-document guards. Strict
TypeScript, frontend build and diff checks pass. Browser checks cover Create… →
Poll, optional introduction, both modes, replacement/reload, overlapping votes from
two fictional accounts, distinct voter counts, ordinary-member navigation, editorial
locks, Close/Reopen and mobile-width overflow. Owner accepted local review.

These local results precede publication; exact-head CI/deployment and focused hosted
verification follow the authorized DEV push. No provider sends were performed.

Local follow-up: renamed Check again to Refresh results and grouped it beside
Share below the results, retaining the saved-ballot refresh behavior. Focused
presentation/types/build and browser placement/refresh checks cover this UI change;
unchanged backend/security evidence remains valid.

## DEV schema preparation — 2026-11-12

Owner-approved 0040 applied after a fresh private export, Time Travel checkpoint
and verified isolated restore/migration. All existing rows in 58 tables and their
permissions are preserved; four new poll tables are empty, exact schema matches,
quick check OK and no foreign-key violations. Publication includes #54–56 and #57;
hosted owner acceptance remains pending. PROD unchanged.

Local follow-up after DEV review: render open-poll choices immediately while the
private current-ballot request is pending. Voting and refresh stay disabled until
that check finishes; saved-choice/status space is reserved so results/actions do
not shift when the selection arrives. No private ballot cache or backend changes.
Seven focused presentation tests and strict types pass. A disposable local fixture
delaying the private read by 1.2 seconds confirms visible disabled choices first,
then the saved selection and enabled controls with identical action-row position.
No publication is included in this follow-up.

Local size follow-up: compact wrapping choice buttons and smaller poll actions,
retaining saved-label space, at least 44px touch height and existing hover/focus/press
feedback. Scoped CSS only; voting and loading behavior are unchanged.

Local alignment touch-up: align choice indicators with the first text line,
keeping the reserved saved-choice row and compact touch target unchanged.

Owner accepted these local loading, sizing and alignment follow-ups and approved
DEV publication on 2026-11-12. Only frontend presentation and its focused tests
change; reuse the verified DEV 0040 schema and existing backend/security evidence.
No migration, configuration change, provider send or PROD operation is required.
