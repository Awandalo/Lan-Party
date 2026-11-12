# Outgoing email layouts — #56 local review

Owner requested auditing every outgoing email layout on 2026-11-12, after
accepting #54 and #55 locally. This is a presentation correction, not a new mail
flow or real-provider test. No remote or publication operation is included.

## Inventory and result

All outgoing delivery uses the existing ResendEmailTransport, selected through
the guarded DEV/PROD wrappers. The two renderers are authenticationEmail and
paymentInfoEmail; there is no separate mail provider path in the application.

| Purpose / audience | Result |
| --- | --- |
| Email verification | Existing branded shell retained |
| Password reset | Existing branded shell retained |
| Password changed | Existing branded shell retained |
| Authenticator enabled | Existing branded shell retained |
| Authenticator disabled | Existing branded shell retained |
| Recovery codes regenerated | Existing branded shell retained |
| Authenticator replaced | Existing branded shell retained |
| Account reactivation | Existing branded shell retained |
| Event registration confirmation/edit/cancellation/waitlist promotion | Fixed the shared update template to use the branded shell, mint action button and fallback link |
| Combined member payment bill | Existing branded shell retained |
| Guest cost information | Existing branded shell retained; guest receives no payment demand |
| Free bill rendering | Existing branded shell retained; delivery still excludes Free recipients |
| Bank instructions only | Existing branded shell retained |
| Contact-organizer fallback | Existing branded shell retained |

Registration-update subject, exact plain text, canonical link and URL validation
are preserved. The HTML now carries the existing message through the shared
LAN / PARTY dark shell. No recipient selection, trigger, retry, idempotency,
expiry, rate limit, allowlist, security control or payment calculation changes.
The eight other authentication/security template results were compared with the
current committed baseline and are byte-identical. Payment renderer source is
unchanged.

## Verification and review

- 14 template/provider-adapter checks pass, with mocks for all ten declared mail
  purposes and both DEV/PROD origins. The inventory test detects new uncovered
  mail purposes. Tests require branded self-contained HTML and readable text.
- 28 existing hosted-DEV/PROD and email-budget checks pass using local fictional
  databases and intercepted providers. No live account or provider operation.
- Strict TypeScript passes; build evidence is retained locally.
- All 14 browser previews fit desktop 600px and mobile 320px frames without
  horizontal overflow. This is browser rendering, not Gmail/Outlook certification.
- Real mail-client/inbox acceptance remains pending a separately authorized send.

Local fictional preview gallery:
http://127.0.0.1:5205/.wrangler/email-layout-review.html

Select an email type, switch Desktop/Mobile and expand Plain-text fallback.
Preview links are not test actions. Generated HTML/gallery and audit receipts
stay ignored under .wrangler; no fake authentication flow is added to the app.
Issue #56 stays open until the owner has checked and accepted the correction.

Owner accepted the local gallery on 2026-11-12. Issue #56 is closed with
verification notes. Real inbox/client checking remains a separately authorized
hosted follow-up; no real mail was sent. All three corrections (#54–#56) are
accepted locally and remain uncommitted/unpublished pending owner instruction.

Owner approved including this accepted correction in the next DEV publication
with Polls #57 on 2026-11-12. No real-email testing or PROD change is included.
