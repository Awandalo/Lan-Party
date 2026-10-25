# Privacy-only release review — awaiting final owner review

Prepared on 25 October 2026 from main f1606bde0328ae299794533dd7bf0e8fb5d2219e.
This is an isolated page/route/footer change, not a DEV-to-MAIN promotion.
No authentication implementation, registration, Worker, migrations, dependencies or configuration
are promoted from DEV. The existing SPA fallback is retained.

## Owner decisions and remaining final review

- On 25 October 2026 the owner confirmed LAN Party is a non-commercial hobby
  initiative organized by friends who make most website/data-processing decisions.
  Use LAN Party Organizers and privacy@lan-party.club publicly. Do not disclose
  private organizer names, personal email addresses, home addresses or the inbox
  destination. No legal entity or hobby/GDPR exemption is asserted or invented.
- The owner confirmed active Cloudflare Email Routing and successful end-to-end
  delivery. This is owner-provided evidence; no further email was sent.
- The public draft banner is removed at the owner's request. This does not approve
  merge/deployment or certify legal compliance. Keep PR #22 draft for final review.
- Controller-identification review remains material: a shared public-facing label
  does not by itself resolve GDPR applicability, controller/joint-controller identity
  or required disclosures. The policy accurately describes the organizing group;
  it does not establish that private information must be published or that this
  label alone satisfies every legal requirement. Obtain appropriate review rather
  than infer private details or a legal entity.
- The final text states current public-site behavior separately from invited DEV
  tests and future public accounts/event registration. It describes relevant data,
  purposes, providers, manual privacy requests and criteria-based retention without
  inventing fixed periods, automatic deletion, EU-only processing or a legal basis.
- Confirm the final text reflects actual hosting/log/cookie configuration, provider
  arrangements, international-transfer safeguards, and any applicable lawful bases
  or additional mandatory disclosures before release. The source/code review does
  not independently audit remote provider settings or establish legal compliance.
- Future public account/event processing and detailed retention/deletion decisions
  still need review before those features open. This privacy-only release adds no
  account functionality, retention job or deletion service.

## Release path

1. Review this isolated comparison against current main; refresh it if main changes.
2. Complete final owner policy/controller review and required checks/reviews. The
   contact is verified; removal of the public draft banner is not release approval.
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
