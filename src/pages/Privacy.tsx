import '../CSS/Privacy_style.css';

export default function Privacy() {
  return <article className="page-section privacy-page" aria-labelledby="privacy-title">
    <p className="eyebrow">Your information</p>
    <h1 id="privacy-title">Privacy Policy</h1>
    <p>Last updated <time dateTime="2026-10-25">25 October 2026</time>.</p>
    <section aria-labelledby="privacy-scope"><h2 id="privacy-scope">About LAN Party</h2>
      <p>LAN Party is a non-commercial hobby initiative organized by a group of friends. We use the public-facing name LAN Party Organizers. The organizing group makes most decisions about this website and how personal information is used.</p>
      <p>This policy covers the LAN Party website and its separate, invited development tests. The current public website provides information only: public accounts and event registration are not available. You do not need an account to read it.</p>
    </section>
    <section aria-labelledby="privacy-hosting"><h2 id="privacy-hosting">Visiting the public website</h2>
      <p>Cloudflare hosts and delivers the website. It processes technical request information such as your IP address, the requested address, browser information and request timing to deliver pages, protect the service and diagnose problems.</p>
      <p>The public website’s application does not set account-session cookies or include advertising or analytics scripts. Cloudflare may use necessary security cookies depending on its configuration. Our tested account features use essential cookies for sign-in and security.</p>
      <p>Cloudflare’s own processing, including service records and international processing where applicable, is described in its <a href="https://www.cloudflare.com/privacypolicy/">privacy policy</a>. This notice does not claim that all processing stays within the Netherlands or the EU.</p>
    </section>
    <section aria-labelledby="privacy-contact"><h2 id="privacy-contact">Contacting us</h2>
      <p>Email <a className="privacy-address" href="mailto:privacy@lan-party.club">privacy@lan-party.club</a> to contact LAN Party Organizers about privacy or submit a request.</p>
      <p>We receive your sender address, message and anything you choose to include so we can understand and respond. Cloudflare Email Routing forwards the message to a private organizer inbox; Cloudflare and the inbox’s email provider process it for delivery and storage. The private destination is not published.</p>
      <p>Only include information relevant to your request. Do not send passwords, authenticator secrets or recovery codes.</p>
    </section>
    <section aria-labelledby="privacy-accounts"><h2 id="privacy-accounts">Development tests and future features</h2>
      <p>Invited DEV testers can use account features that are not enabled on the public website. Signup collects a nickname, first and last name, email address and password to create and identify an account. Cloudflare D1 stores account and authentication records. Passwords are stored as protected verifiers, not readable passwords; optional MFA uses an encrypted authenticator secret and recovery-code verifiers.</p>
      <p>Verification, recovery and security emails use the account email address and message content through Resend. See <a href="https://resend.com/legal/privacy-policy">Resend’s privacy policy</a>. Session and security records support sign-in, protect accounts and limit abuse.</p>
      <p>If a tester chooses Google sign-in, Google supplies an account identifier, email and basic profile information. We use these to identify the connected account and offer editable private-name suggestions. These records are stored with the LAN Party account in Cloudflare D1. Matching emails do not automatically link accounts. We do not request Google inbox, contact or calendar access. See <a href="https://policies.google.com/privacy">Google’s privacy policy</a> for Google’s own processing.</p>
      <p>Private names, email addresses and authentication information are not published in attendance views. Future event registration may display a chosen nickname and attendance per day. The information requested and its use will be explained before public accounts or registration open.</p>
    </section>
    <section aria-labelledby="privacy-retention"><h2 id="privacy-retention">How long information is kept</h2>
      <p>Where no fixed period has been established, retention is assessed by the purpose: delivering and securing the site, investigating a technical or security issue, responding to a request and keeping any record needed for obligations that apply. Provider logs and email copies also follow the relevant service configuration and provider policies.</p>
      <p>DEV account records may remain until they are manually reviewed and removed. Expiry of a session or token does not necessarily delete its stored record or backup copies. There is no automatic account-deletion service. Requests for deletion are reviewed manually, including any information that still needs to be retained and the limits of provider or backup deletion.</p>
    </section>
    <section aria-labelledby="privacy-rights"><h2 id="privacy-rights">Your privacy questions and rights</h2>
      <p>You can ask what information we hold about you and request access, correction or deletion. Where applicable, you can also request restriction or portability, object to processing, or withdraw consent for processing that relies on consent.</p>
      <p>Send your request to <a href="mailto:privacy@lan-party.club">privacy@lan-party.club</a>, describing the information or activity concerned and what you want us to do. We may ask for the minimum additional information needed to confirm your identity and handle the request safely. Do not send identity documents unless a proportionate verification method has been agreed.</p>
      <p>We review requests individually and explain any applicable limits. You can also raise a concern with the Dutch data-protection authority, the <a href="https://www.autoriteitpersoonsgegevens.nl/">Autoriteit Persoonsgegevens</a>.</p>
    </section>
  </article>;
}
