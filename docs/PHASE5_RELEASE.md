# Phase 5 release candidate

## Scope and approval boundary

The owner accepted the hosted DEV launch scope at
`117d99a2628b44666f103a98cd3b320d1e07eaeb` and explicitly authorized publishing an
isolated `codex/release-phase5` candidate integrating MAIN
`b6670220a25e92468493685edc40ffc93ccfec35` with bounded production activation fixes.
DEV stays unchanged. This is preparation, not Step 0 production acceptance.

Includes Locations metadata/text snapshots; event drafts, publication and details;
registration with invited guests, daily capacity/waitlists and transactional notices;
private organizer attendance corrections; manual complimentary attendance; event-only
rental adjustment before finishing; permanent final bills (including empty events);
manual Paid/Unpaid; explicitly previewed payment emails. Finishing closes registration
atomically and can happen early with the accepted warning/acknowledgement.

#35, #37–#41 and #43 are closed as owner-accepted. #36 remains open for deferred
attachments/files and #42 for deferred gallery/social. No R2 resources/billing,
file uploads, new features, Jotform cutover, automated payments or bank API.

## Candidate integration and activation

MAIN's live Phase 4 auth/admin behavior, login clock fixture, email and test fixes
are retained. Four conflicts (App, Worker entrypoint/manage and login fixture) are
resolved in the isolated candidate. Production routes use the existing canonical
origin, hosted auth and immutable production-build guards plus EVENTS_MODE=enabled.
Live session, CSRF, role/permission, schema, revision and finalization guards remain.
Fictional registration preview remains DEV-only; the maintained day-card thumbnails
and real registration component are included in the production build.

Public event pages run through the Worker for anonymous initial share metadata.
Production mail accepts only exact canonical event paths and preserves existing
recipient policy and shared budgets. The provider receipt is retained for duplicate
send tracking. Registration notice maintenance reuses the existing daily cron;
payment-info mail is an explicit organizer action, not an automatic finishing send.
No additional role grants are introduced by activation. The privacy notice removes
obsolete DEV-only claims and describes the accepted event behavior; existing
retention, audit and backup caveats remain without a new purge schedule.

## Verified production baseline (read-only, 2026-11-09)

- Worker lan-party serves MAIN b667022, 100% active version prefix 8a70ff57.
- D1 lan-party-prod: `9fbe3402-c26b-45fd-be67-71775e5e6a3e`; history through 0023,
  quick_check ok and foreign_key_check empty. No participant rows queried/exported.
- Cloudflare Git builds only MAIN, previews disabled. Build: npm run build with
  VITE_AUTH_MODE=hosted-prod. Existing deploy command uses --env prod --keep-vars
  and hosted-prod overrides for REGISTRATION_MODE and AUTH_SESSION_MODE.
- Existing secrets verified by presence only. Production email allocations remain
  40/day and 1000/month; provider ceilings 100/day and 3000/month. Bootstrap disabled.
- MAIN requires PR and up-to-date TypeScript and build, enforced for administrators;
  force pushes/deletion disabled. CodeQL default setup covers Actions and JS/TS,
  main/protected pushes and PRs plus weekly runs. No settings changed.

## Migrations proposed for separate exact-PR production approval

0001–0023 are already applied and unchanged: **do not reapply them**. Apply only the
following 13 files in order after a fresh recovery checkpoint and preflight.
LF rules preserve the reviewed bytes on Windows and CI; migration SQL is unchanged
from accepted DEV. These hashes identify the proposed scope, not permission to run it.

| File | SHA-256 |
| --- | --- |
| 0024_create_location_management.sql | `ae9d640f93d5d3ed3deafcb29626ef954d70cff2cd60155e9243c51a93f1de43` |
| 0025_create_event_management.sql | `d525bdf02bba9dcc3c7ed34d0910e3fd369875a9098531ae73a0fe85d68fec2f` |
| 0026_simplify_event_snapshots.sql | `4c66275f54a06d9ffe1257df943257bdef29f08b4fb96b20a6603391e54adcc0` |
| 0027_correct_unregistered_events.sql | `1b3a351faf9adda145fd3304f6617bd8e4a681c1328534c83e6e3da8b4eb646c` |
| 0028_enable_event_publication.sql | `33d921163a0f0d40f0e9ce3ba57a0c7f5455d7d849d6a2140e44bd3c568252d8` |
| 0029_create_event_registration.sql | `0dadeb45ab52cacaefdf63291f7a597420aacf1e90a90eb0be1fd9c4261d9da6` |
| 0030_create_attendance_review.sql | `c967d57069e184f2085f264d519e3bb20ea0c56cb0073abf5638e34c7e9e6903` |
| 0031_separate_registration_capacity.sql | `fd1ec3b338697c53ecd7482e8e37b241c9f256abb3ba1be19c05a0f01189e565` |
| 0032_finalize_event_bills.sql | `8346ba8d350af5e64be613749d5e938c982397325ea779234b4642c0c40b1884` |
| 0033_record_manual_bill_payments.sql | `3ecbb4ca7370696f6378860f72652523ccaacf57fcc590b3992bc81b1aeb941b` |
| 0034_allow_event_rental_adjustments.sql | `8e5c2594c076cfc7f1756f5994a64130968edc450dd5915e00e9885e6425ff88` |
| 0035_record_payment_info_emails.sql | `d8b6046342e9ba163c8b0c1f6b283a2845ac11f315b263144d88d4295393ea56` |
| 0036_allow_empty_event_finalization.sql | `425c1265e73ca399c9e530c41e7730b1f6839fec222e1f3c9b427f02fb4e68fc` |

## Investigate and Deploy scope — proposed, not yet accepted

Step 0 must name the PR and exact head and explicitly cover this sequence under
RELEASE.md. Revalidate the live revision, bindings, migration history, feature flags,
build triggers and recovery before writes. Stop on unexpected schema/history,
data-integrity, privacy/security, recovery or out-of-scope issues.

1. Take a fresh private PROD D1 export/hash and Time Travel checkpoint; verify an
   isolated restore and preserve accounts, roles, permissions, sessions, registrations,
   migration history and existing schema/data. Retain the current P4 deployment.
2. Apply **only 0024–0036** to the exact PROD database above, before the MAIN merge
   can trigger deployment. Verify expected schema/history, unchanged existing rows,
   integrity and foreign keys; no copied DEV data or test events. Old Phase 4 code
   remains compatible with the additional tables while EVENTS_MODE stays absent.
3. Preserve build variable VITE_AUTH_MODE=hosted-prod. Add the bounded deployment
   override --var EVENTS_MODE:enabled to the existing deploy command, retaining
   --env prod --keep-vars and both hosted-prod overrides. Source env.prod also sets
   EVENTS_MODE=enabled and /events/* Worker-first routing. Preserve secrets, email
   allocations, canonical origin, cron, grants and all other configuration.
4. Merge the exact approved PR through protected MAIN after all checks pass, then
   observe the existing Cloudflare MAIN build/deployment. Do not create a parallel
   deployment mechanism. Verify the actual deployed MAIN SHA and active Worker.
5. Perform focused read-only hosted checks of auth/admin, Locations/events pages,
   publication controls, registration availability, private Participants/Finance and
   privacy notice using the owner's authorized session as needed. Check anonymous
   identity protection and denied unauthorized access. Reuse DEV/CI behavior evidence;
   no event publication/finalization, attendance/payment mutations or test emails.
6. Correct only bounded, approved activation issues. If recovery is needed, stop
   mutations and assess the retained compatible P4 Worker rollback. Never restore
   D1, delete new records or lose post-checkpoint writes automatically; obtain the
   applicable recovery authorization and preserve evidence.

No PROD changes have been performed by this preparation. Approval of the PR's
source alone does not authorize unlisted operations or sending live test mail.
The deployment report must distinguish shipped code from verified live features.

## Validation and retained evidence

Accepted DEV: CI 42703473412 (767/767); deployment 42703473418 and owner walkthroughs.
Local candidate: Node 24.22.2/npm 11.19.1; full regression 775/776 initially passed.
The single failure asserted the now-intentionally-changed PROD event routing;
correcting that expectation plus Windows CRLF fixture normalization preserved
assertion coverage. All 49 affected policy/public UI/event-page/production-boundary
checks then passed. Production scenarios use fictional state and intercepted mail,
including member/guest registration, early finishing, explicit sends, receipts and
duplicate protection. TypeScript, hosted-prod frontend build and Worker dry run pass.
Production dependencies audit reports zero findings. Three email-pattern scan hits
are intentionally rejected credential-in-URL test inputs, not participant contacts.
Exact-candidate CI and PR CodeQL results are recorded in the PR when available.

The production bundle contains the real registration chunk and ten LAN thumbnails,
and excludes the fictional registration preview. Vite reports a >500 kB main chunk;
no unrelated bundle rewrite or warning suppression is included. Real email delivery,
mobile/email-client layouts and accepted interactive flows reuse unchanged owner
DEV evidence; no release-preparation provider send or production browser mutation.

Private recovery/evidence files are ignored and not published. Cleanup reclaimed
38 obsolete generated files (12,236,253 bytes), with hashes checked before removal.
Current/prior successful builds, manifests, local data and all migration recovery
exports/checkpoints remain. No database, source fixture or maintained artwork was
removed. DEV and its deployed revision are unchanged by the release branch.
