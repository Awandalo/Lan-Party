import '../CSS/Privacy_style.css';

export default function Privacy() {
  return <article className="page-section privacy-page" aria-labelledby="privacy-title">
    <p className="eyebrow">Your information</p>
    <h1 id="privacy-title">Privacy Policy</h1>
    <p>Draft updated <time dateTime="2026-10-25">25 October 2026</time>.</p>
    <aside className="panel privacy-review" aria-label="Publication review required">
      <h2>Draft — not approved for publication</h2>
      <p>The privacy contact is verified. Responsible-controller identification, retention details and policy content still require approval before publication.</p>
    </aside>
    <section aria-labelledby="privacy-scope"><h2 id="privacy-scope">Who and what this covers</h2>
      <p>LAN Party Organizers is the public-facing name for the people maintaining the LAN Party website. The identity of the responsible data controller still needs to be confirmed.</p>
      <p>This notice covers the LAN Party website. The public site currently provides information only; public account signup and event registration are not enabled. Account features are being tested separately on DEV. The account information below describes that testing and the intended future service, not features enabled by this page.</p>
    </section>
    <section aria-labelledby="privacy-hosting"><h2 id="privacy-hosting">Visiting the site and cookies</h2>
      <p>Cloudflare hosts and delivers this website. Delivering and protecting requests involves technical information such as your IP address, requested address, browser information and request timing. Hosting and security services may also process diagnostic information.</p>
      <p>The public information pages do not add account-session, advertising or analytics cookies. Cloudflare may use necessary security cookies depending on its configuration. Tested account features use essential cookies for sign-in, security and Google sign-in transactions.</p>
      <p>Hosting settings, log retention and any international processing still require review. See <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare’s privacy policy</a> for its own practices.</p>
    </section>
    <section aria-labelledby="privacy-accounts"><h2 id="privacy-accounts">Testing and future accounts</h2>
      <p>Account signup collects a nickname, first and last name, email address and password. Passwords are stored as protected password verifiers, not readable passwords. Account records and authentication information are stored using Cloudflare D1. Optional MFA uses an encrypted authenticator secret and recovery-code verifiers, alongside session and security records.</p>
      <p>The purpose is to identify your account, support sign-in and recovery, and verify your email address. Email verification, password recovery and security notices use your email address through Resend. See <a href="https://resend.com/legal/privacy-policy">Resend’s privacy policy</a>.</p>
      <p>If you choose Google sign-in, the website requests your Google account identifier, email and basic profile information. The identifier links your sign-in method to your LAN Party account; validated first and last names may be offered as editable suggestions. Matching email addresses do not automatically link accounts. See <a href="https://policies.google.com/privacy">Google’s privacy policy</a> for Google’s own processing.</p>
      <p>Private names, email addresses and authentication information are not intended for public attendance views. Future event registration may show your chosen display name and attendance per day; details will be explained before that feature opens.</p>
    </section>
    <section aria-labelledby="privacy-retention"><h2 id="privacy-retention">Retention and your requests</h2>
      <p>Specific retention periods for technical logs, test accounts, future accounts, event information and backups have not yet been approved. These must be confirmed before publication; this draft does not promise automatic deletion or a fixed retention period.</p>
      <p>You may ask about information held about you, request correction or deletion where applicable, or raise a privacy concern. The organizer may need to confirm your identity to handle a request safely. The applicable lawful bases, rights procedure and controller contact details require owner review.</p>
    </section>
    <section aria-labelledby="privacy-contact"><h2 id="privacy-contact">Privacy contact</h2>
      <p>Contact LAN Party Organizers at <a className="privacy-address" href="mailto:privacy@lan-party.club">privacy@lan-party.club</a> for privacy questions or requests.</p>
      <p>Cloudflare Email Routing forwards messages to a private organizer inbox. The destination is not public. Do not include passwords, authenticator secrets or recovery codes in your message.</p>
    </section>
  </article>;
}
