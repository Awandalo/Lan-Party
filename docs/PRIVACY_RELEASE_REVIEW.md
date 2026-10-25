# Privacy-only release review — publication blocked

Prepared on 25 October 2026 from main f1606bde0328ae299794533dd7bf0e8fb5d2219e.
This is an isolated page/route/footer change, not a DEV-to-MAIN promotion.
No authentication implementation, registration, Worker, migrations, dependencies or configuration
are promoted from DEV. The existing SPA fallback is retained.

## Owner confirmations required before publication

- The owner approved the public-facing name LAN Party Organizers and
  privacy@lan-party.club. On 25 October 2026 the owner confirmed Cloudflare Email
  Routing is active and an end-to-end delivery test succeeded. This is owner-provided
  evidence; no additional email test was performed. The private destination is not
  published or stored in this review. Policy/controller review remains outstanding.
- Identify the actual controller. A public-facing label is not evidence of a legal
  entity or sufficient controller identification. GDPR Article 13 requires controller
  identity/contact information where applicable. Confirm the necessary disclosures
  and applicability with appropriate review; do not infer or publish a private name,
  private email or home address. None is included in this draft.
- Confirm lawful bases, current Cloudflare request/log processing and cookie settings,
  processor arrangements, international transfers/safeguards and retention criteria
  or periods. Do not infer EU-only processing from a D1 jurisdiction.
- Confirm DEV-testing/account disclosures and future feature descriptions, including
  Google data access/use/storage/sharing, private versus public information and
  the request-handling procedure. No compliance certification is claimed.
- Confirm account/event/backup retention and deletion rules before those features
  become publicly available. This PR does not implement deletion or retention jobs.
- Approve the final policy text and remove/update the explicit draft/pending notices
  only after those facts are resolved. Keep the PR draft until then.

## Release path

1. Review this isolated comparison against current main; refresh it if main changes.
2. Satisfy the contact/controller/policy confirmations and required checks/reviews.
3. Obtain separate owner approval for the exact revised head and merge/deployment.
   A main merge can trigger Cloudflare's production Git integration. Do not merge
   or deploy as part of preparation. No D1 migrations or secrets are involved.
4. After separately authorized publication, verify anonymous HTTPS direct navigation
   and refresh at https://lan-party.club/privacy, homepage/footer discovery and
   unchanged homepage/login/health behavior. Do not call the URL live beforehand.
5. Only then consider separately authorized Google OAuth privacy-URL configuration.
   A privacy page alone does not establish Google verification or claim eligibility.

## Sources used for review

- https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- https://autoriteitpersoonsgegevens.nl/nl/zelf-doen/privacyrechten/recht-op-informatie
- https://autoriteitpersoonsgegevens.nl/nl/over-privacy/persoonsgegevens/bewaren-van-persoonsgegevens
- https://www.cloudflare.com/privacypolicy/
- https://resend.com/legal/privacy-policy

These sources inform the checklist; they do not establish the organizer's legal
identity, lawful basis, actual provider configuration or legal compliance.

## Observed review limitations

The connector confirms main is protected and returns no repository rulesets, but
legacy branch-protection details return HTTP 403. Required checks/review policy
remain unverified; do not infer permission to merge or broaden connector access.
This owner-requested isolated draft is for content/code review, not a completed
DEV-to-MAIN release or a claim that release gates passed.

The unchanged main lockfile reports three pre-existing tooling advisories in the
Wrangler/Miniflare/Undici development dependency chain (two moderate, one high).
No dependency or lockfile change is included. Record/resolve or obtain an explicit
owner disposition before release; no automatic dependency repair is authorized.
