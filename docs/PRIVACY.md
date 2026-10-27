# Authentication privacy — current DEV implementation

LAN Party is a non-commercial initiative organized by friends under the public-facing
identity **LAN Party Organizers**. Privacy requests can be submitted to the verified
public contact **privacy@lan-party.club**. Do not publish private organizer names,
mailboxes or addresses. Responsible-controller identification still needs owner
review before public account/registration launch; the public-facing name is not a
claim that all legal identification requirements have been resolved.

Hosted DEV accounts use email/password and optional TOTP MFA. Account data includes
private names and email, public nickname/member number, password verifiers, session
and security-action records, encrypted authenticator secrets and non-reversible
recovery-code verifiers. These support account access, verification, recovery,
security notifications and abuse prevention. Passwords, setup keys and recovery
codes must not appear in logs or public output. Google OAuth is discontinued;
LAN Party sends no OAuth login or identity requests to Google.

Cloudflare hosts Workers/static assets and D1 storage and supplies the conditional
Turnstile security check; Resend processes transactional authentication email under
the established DEV allowlist and budgets. Necessary HttpOnly session/security
cookies protect sign-in, CSRF, MFA and restricted recovery. No advertising tracking
or email click/open tracking is introduced by this work.

## Account deletion and backup decision — owner approved 2026-10-27

The owner accepts that restoring yesterday's backup after today's account deletion
can restore that deleted data. Do not create an identifying deletion registry,
tombstone list or restore-reconciliation system. No automatic reapplication of
past deletions is promised. The public policy and final warning disclose this
limitation; a restored user may request deletion again through the privacy contact.
This is a factual limitation, not a promise that provider copies are immediately erased.

The locally prepared Account Security flow requires password, optional MFA and a
separate final explicit warning/confirmation. Preparation is read-only. The final
atomic delete rechecks current session/generation, strict proof freshness, CSRF
and last-admin protection; it removes identity, credentials, MFA/recovery codes,
sessions, roles and identifying registration links. No email is sent by deletion.
Anonymous completed-event/day registration totals remain registrations (not verified
attendance). The number ledger retains only a retired number without user/actor UUID;
it prevents reuse, not restoration. The temporary deleting guard is removed in the
same transaction, so it is not a persistent deletion registry.

Security/abuse budgets and provider-held emails/logs follow their existing purposes
and expiry/configuration; deletion does not reset shared abuse counters. Fixed
retention periods are not invented here. Backups expire under the actual provider
plan/configuration; no new backup system or individual backup-scrubbing mechanism
is introduced. Reference: https://developers.cloudflare.com/d1/reference/time-travel/ .
Any actual restore remains a separately approved destructive operation and can also
roll back session/MFA/recovery-code state. Keep the existing MFA-aware restore gates;
no restore or hosted deletion is performed by this local implementation.

The existing public privacy page from main is brought into DEV as source, updated
for password/MFA and this decision. Its live production copy is unchanged until
separate reviewed publication to main. Controller-identification/public-launch
review requirements above remain unchanged.

Visitors can ask the organizers about access, correction, deletion and other privacy
rights through the public contact. Requests require appropriate identity checks
and manual handling; no guaranteed processing time or unsupported deletion feature
is promised here. Event registration remains unavailable in the current application;
future registration data/purposes and public attendance visibility require updated
privacy information before launch. This DEV documentation does not change the
current public website or its separately reviewed production policy.
