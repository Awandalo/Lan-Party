# Phase 4.4 — member lifecycle commands

Owner authorized implementation and DEV publication after the #29 review on
2026-10-30. Consolidated scope: issue comment 6523408137. This includes the proposed
administrator name-preservation, exclusive destructive intent and two-year User
Log foundation. Hosted account/email tests and PROD remain separate operations.

## Member editing

Members detail has one Review / Save changes / Cancel bar, supporting one role
change and one compatible account intent. Disabled accounts cannot receive new
roles. A role removal is saved first; failure stops the account command. Successful
removal is never automatically undone if sending fails. The UI reports each
outcome separately and makes uncertain results require explicit inspection/reissue.
Administrator disable/cancel is exclusive of simultaneous role edits.

The invitation switch stages a request; it does not represent active access.
After provider submission, the account remains disabled until recipient completion.
Confirmation identifies the target and existing email and lists retained roles,
warning about elevated rights. No admin receives the token or recipient session.
The old /account/users page points to Members instead of implementing another send.

## Authority and transitions

Only current genuine built-in Administrators with a full valid authenticated
session may issue commands. There is no fresh password or MFA step-up for these
administrator commands. Existing enrolled-MFA session validity, session generation,
CSRF/origin, rate limits and SQL current-authority checks remain mandatory.
Self-service deactivation/deletion retain their existing recent-proof requirements.

| Source | Command | Result |
| --- | --- | --- |
| Active other account | Disable | Disabled with administrator origin; names and roles preserved; sessions/action tokens revoked and lifecycle operations removed |
| Voluntary or administrator-disabled, verified, password credential present | Invite | 30-minute invitation; still disabled; replaces older invited/claimed operation |
| Disabled with exact pending operation | Cancel | That invitation/context cancelled; account still disabled |
| Restricted recipient context | Complete | Existing password, names and optional MFA verified; new full session, current roles effective, old sessions invalid |
| Legacy disabled, deleting, deleted, active recipient | Invite | Rejected |

Administrator disable is for other accounts only. The last-active-Administrator
predicate is checked in the final transaction. Administrator disable preserves
private names; voluntary deactivation still clears them. Both origins use the
existing deactivated state with a distinct persisted origin. Both hide the public
identity. Member detail privately labels administrator origin accurately.

Commands carry target generation, server-observed timestamp, exact pending
invitation ID and a UUID operation ID. Destructive stale commands fail rather than
flipping the current status. An exact replay returns its known receipt, never a
second email. Payload mismatch conflicts. Admission expires after 24 hours; daily
maintenance removes old receipts. A pending/unknown receipt does not authorize an
automatic retry; deliberate reissue has a new ID and replaces the old context.

Issuer privilege loss does not retroactively invalidate an issued invitation.
Target account generation/email, expiry and recipient proofs are checked throughout.
Claim lasts at most five minutes and cannot outlive the original 30-minute deadline.
Uncertain email failure cancels only the affected invited/claimed attempt. A newer
attempt or committed activation survives. Provider acceptance is not inbox delivery.

## User Log foundation and privacy

Migration 0021 adds user_activity, lifecycle_commands and lifecycle origin/operation
metadata. There is no read API or Logs navigation in #29; #30 owns those surfaces
and must enforce Administrator-only access. Role Activity policy is unchanged.

Database triggers record new account rows, actual lifecycle deactivation and
reactivation transitions, and deletion. They also cover bootstrap creation without
a separate writer. Registration is an unverified account creation, not verified
activation. New invitation preparation and submission/cancellation outcomes are
recorded in structured events. State events and receipt writes are atomic with the
corresponding database mutations; provider outcomes follow the external operation.
No historical events are backfilled and no inbox-delivery/automatic-expiry events
are invented. Lifecycle events contain controlled type, time, actor kind, nullable
actor/target IDs and optional operation ID; no names, emails, passwords, MFA
material, token digests, free text or provider payloads.

Permanent deletion unlinks complete related event groups, clears actor/target and
operation references, sets actor kind to anonymous and coarsens timestamps to UTC
days. It also removes command receipts identifying the deleted actor or target.
The deletion event itself has no account/operation reference. Remaining event facts
are anonymous within this log's stored fields; this does not erase separately
approved linkable Role Activity records, backups or information held elsewhere.

Retention is two SQLite calendar years. A daily 03:00 UTC scheduled handler deletes
expired events and 24-hour receipts, and removes expired/cancelled token operations.
Physical purge can lag the cutoff by up to one scheduling interval when healthy;
failed schedules must be investigated from Worker execution failures. A future read
API must also filter by the cutoff. No cron is installed on PROD. The handler is
environment-neutral and runs only with explicit lifecycle enablement.

Existing pre-0021 personal lifecycle services remain compatible while the feature
is inactive. With lifecycle enablement on, registration/lifecycle routes fail closed
if the complete User Log foundation is unavailable. New member commands always
require it. This prevents silent loss of mandatory logging during the rollout.

## DEV rollout and recovery

1. Complete local tests/build, diff/privacy review and migration checksum.
2. Obtain separate approval for read-only DEV preflight/recovery bookmark and the
   exact 0021 migration. Confirm database identity, migration history at 0020,
   integrity and required guards. Stop on drift; do not apply other migrations.
3. Apply 0021 to DEV only before deploying writers. Verify schema/integrity. The
   existing deployed Worker ignores the additive columns/tables; triggers begin
   logging real subsequent creation/deletion/state changes, not historical rows.
4. With explicit configuration approval, publish the reviewed DEV commit through
   the existing workflow, enabling AUTH_LIFECYCLE_ADMIN_MODE and the daily cron in
   the DEV profile only. Confirm exact SHA, CI/deployment and focused hosted reads.
5. Owner tests two approved disposable accounts in separate browser profiles;
   real invitation/account actions require that explicit hosted scope. Record
   deferred #16 acceptance together with #29 acceptance. Keep #29 open meanwhile.

No down migration or destructive restore is included. Before publication failure,
stop with the existing application still deployed and preserve the additive schema.
After publication, recovery is a separately reviewed forward fix or explicitly
authorized previous-Worker deployment plus removal of the new DEV configuration;
do not assume it removes the cron or restores database state. Once the retention
schedule is running, purged log events/receipts cannot be reconstructed from code.
PROD enablement, migration and release are separate decisions.

## DEV migration receipt — 2026-10-30

Owner separately approved the exact 0021 checksum
`7755ef22eef78cc83b85d5cc2f81f092a4dd7ef158f199260a93e15007bd9745`,
read-only preflight/recovery bookmark and DEV flag/daily schedule activation.
Preflight confirmed history through 0020 and clean integrity/FKs. Only 0021 was
applied; postflight confirms history through 0021, seven foundation objects, clean
integrity/FKs, unchanged aggregate account count and zero initial events/receipts.
No historical backfill, account mutations or invitations were executed. Recovery
bookmark and detailed pre/postflight output remain in ignored local files.
