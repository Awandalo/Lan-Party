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
the removal candidate sends no OAuth login or identity requests to Google.

Cloudflare hosts Workers/static assets and D1 storage and supplies the conditional
Turnstile security check; Resend processes transactional authentication email under
the established DEV allowlist and budgets. Necessary HttpOnly session/security
cookies protect sign-in, CSRF, MFA and restricted recovery. No advertising tracking
or email click/open tracking is introduced by this work.

Use and disclose only data needed for these purposes. Token/session expiry and
bounded temporary operations follow existing security rules; expiry does not mean
every historical database row is automatically deleted. Fixed account/data retention
periods and routine deletion procedures have not been established. Retention review
must consider the ongoing purpose, account/security history and participant requests;
do not promise automatic account deletion or a self-service mechanism that does not
exist. Historical provider data remains pending separately approved cleanup.

Visitors can ask the organizers about access, correction, deletion and other privacy
rights through the public contact. Requests require appropriate identity checks
and manual handling; no guaranteed processing time or unsupported deletion feature
is promised here. Event registration remains unavailable in the current application;
future registration data/purposes and public attendance visibility require updated
privacy information before launch. This DEV documentation does not change the
current public website or its separately reviewed production policy.
