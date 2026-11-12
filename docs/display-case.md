# Display case — local review, 2026-11-10

## Scope and owner decisions

Owner requested reading Achievements #51 after accepting News #50 on DEV at
01b5693, placing the feature beneath Profile as **Display case**. The issue's
original research-only scope is superseded only by the trusted conversational
approval of the five revised tiers below, qualification switch and local migration.
No remote migration, commit, push or deployment is included.

| Badge | Approved eligibility |
| --- | --- |
| Worn Iron Shield | One own reviewed member day; suffix **the Initiate**, iron |
| Bronze | One full qualifying weekend; **the LANner**, bronze |
| Silver | Four full qualifying weekends; **the Dedicated**, silver |
| Gold | Ten full qualifying weekends; **the Veteran**, gold |
| Legendary | Ten full qualifying weekends in a row; **the Legend**, purple |

Full weekend means every scheduled day of an event lasting at least two days.
Iron through Gold remain earned. Legendary is active only while the streak
continues, as explicitly chosen by the owner. Any completed qualifying event
without a full-weekend visit breaks it; excluded/cancelled/unfinished events do
not enter the sequence. Sequence uses scheduled start, then stable event ID for
ties, independent of finalization order. A new ten-event streak restores it.
Highest earned tier determines the automatic suffix, independent of the optional
showcased badge; loss of Legendary falls back to Gold. Saved nicknames are unchanged.
Owner-supplied PNGs live in public/images/achievements; the Iron asset was
regenerated with real transparency at the owner’s request.

Free attendance counts. Guest attendance, waitlisted/unretained days, cancelled,
unfinalized, unfinished and excluded/test events do not. An early-finalized event
waits until its scheduled end. Completion time is the later of scheduled end and
finalization. Member UUIDs separate accounts; names/emails never establish credit.
The member may showcase one unlocked badge, or none. Configurable thresholds, manual awards, leaderboards and notifications remain future work.

## Small representation and reliable sources

Existing finalized bill lines contain the immutable reviewed days and explicit
Member/Invited guest distinction, including complimentary attendance. Read only
this member's Member lines, never guest lines, prices, payment state or names.
Join qualifying finalized events whose scheduled end has passed. The initial
fixed rules derive progress/unlock dates from those facts; no counters, award log,
new background jobs, external services or duplicate attendance storage are needed.
Finalized facts and qualification are locked. Only Legendary is deliberately
revocable through a later missed qualifying event. Stale Legendary showcase
choices are hidden and cannot be saved while ineligible.

Migration **0039_create_member_display_case.sql** adds only:
- event_management.achievements_enabled, default 0 for all existing events;
- a trigger locking qualification after finalization;
- member_achievement_showcase with a nullable allowlisted badge choice, revision,
  timestamp and account FK with ON DELETE CASCADE.

New application-created/duplicated events default enabled. Event managers can
change qualification through the existing permission/revision-checked wizard
before finalization; edits are included in the existing event audit. Legacy final
records remain excluded and locked. No retroactive award/qualification repair is
implied. Old-schema event functionality remains compatible; the new setting and
Display case fail closed until migration readiness.

## UI, API and privacy

User Settings → Profile → Display case at /account/profile/display-case contains
earned cards only, earned dates, a title preview and explicit Save. No locked
card or unearned progress is rendered.
The child entry does not also mark Profile selected. Shared formatting, fields,
buttons, help dialogs, loading/error handling and reduced-motion navigation apply.

GET/POST /api/auth/display-case derive identity only from the live session.
Require verified email, current MFA/session generation, session proof, same-origin
request boundary and CSRF for writes. Strict POST fields are selectedCode and
revision; reject locked/unknown badges and stale saves. The transaction rechecks
live membership/session authority, and concurrent saves cannot overwrite each other.
Private responses are no-store. Account deletion removes the preference and existing
billing deletion behavior removes identifying attendance links; recreated accounts
inherit nothing.

The existing signed-in Who is coming projection adds only the eligible opted-in badge code and automatic highest rank code.
It exposes no private progress, earned date, historical events, prices or guest
identities. Clearing the showcase removes that code on the next read. Deactivated
accounts do not publish their showcase. Existing registration access/final authority
checks remain in place. Other organizer card placeholders are not a new award feed.

## Local review and verification

Ignored .wrangler/display-case-review-server.mjs runs the real React app/Worker
against disposable fictional D1 on http://127.0.0.1:5202. Existing 5201 review data
was preserved. The banner selects fictional accounts: Administrator has all three
badges, News Editor has First Time LANner and 1/5 LAN Recruit progress, Member has
none. Account selection is shared by tabs on this fictional server. No real
credentials or remote database copies are used; external Worker fetches are blocked.

Browser checks verify selection/save/reopen, locked/partial/full collections,
opt-in badge in Who is coming, account cards, event Share destinations, qualification
save/reopen in the four-step wizard, and retained active-navigation lift. Helpers
and navigation remain keyboard-accessible. Fresh mobile viewport emulation was not
established by the browser capability in this session; narrow-layout owner review
remains appropriate. CSS keeps the grid responsive and disables lift when reduced
motion is requested.

The full regression run passed **811/812**; its only failure was the old expected
account-navigation list missing the approved Display case child. Update that exact
expectation and rerun the affected presentation/policy checks, reusing unchanged
successful coverage. Eight new D1 tests cover migration rollback/preservation,
qualification defaults/locking, precise member-only rules, concurrent and revoked
session writes, actual account deletion and public badge privacy. A new privacy
fixture initially supplied a pre-publication registration revision; reading the
actual current revision corrected that test defect without changing runtime guards.
The first seven new D1 tests already passed before that fixture correction.
Final focused results, types/build and browser evidence are retained privately in
.wrangler/display-case-*.log. Hosted/provider checks were intentionally not run.

Suggested future commit: feat(profile): add the achievement display case

## Revised five-tier verification

Local rule/API checks cover thresholds, deduplication, missed/partial events,
Legendary loss/restoration and Gold fallback, unchanged nicknames, Free attendance,
private history exclusion and existing session/concurrent-write protections.
Preview generation: http://127.0.0.1:5203/account/profile/display-case with fictional
Administrator (ten full weekends), Editor (Iron only), Member (no earned badges).
The previous local preview is preserved; no remote migration or publication.

Five-tier validation: 11 rule/API tests, 37 registration/attendance/navigation
checks, and one additional escaped-name/suffix presentation check pass (49 unique
checks). Strict TypeScript and Vite build pass. Desktop browser verified all-five,
Iron-only and empty collections, crew suffix colours and a real local showcase
save. Existing successful broader regression evidence is reused for unchanged
authentication and finance code; no new hosted/mobile claim. The initial revised
test runs exposed outdated expectations and an incorrect test-only nickname-table
query; corrected without weakening runtime guards, then rerun successfully.

Crew icons use the member-selected eligible showcase image in place of initials.
The initials remain the default when no valid badge is selected. The automatic
rank suffix remains independent; choosing Bronze does not replace a Legendary
title. The badge name stays readable below the name without a duplicate image.

## DEV publication authorization — 2026-11-10

After accepting local review, the owner requested DEV publication and separately
approved only migration 0039 on lan-party-dev, with a fresh recovery checkpoint
and preservation/integrity verification. This supersedes the earlier local-only
publication boundary for the Display case, selected badge icons, automatic tier
suffixes, navigation motion, shared event Share menu and account-card cleanup.
Existing events remain excluded. No PROD operations, role assignments or emails.

Local alignment follow-up, 2026-11-12: Display case uses the same User Settings
link indentation as My account, Profile and Account Security. Its URL, active state,
hover/focus motion and access rules are unchanged. No publication included.

Owner accepted the alignment correction and authorized including it in the final
DEV UI follow-up on 2026-11-12. Hosted owner acceptance remains pending.
