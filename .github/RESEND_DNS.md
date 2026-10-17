# Approved Resend DNS workflow — prepared, not executed

This manual operation is separate from Worker deployment and authentication
enablement. Owner approval of the reviewed revision and its execution is required
before dispatch. No workflow has been run as part of preparation.

## Fixed scope

Account: `11ddea61be41a70883d6c703d2a9a3d6`.
Active zone: `lan-party.club`, ID `83c0841a468b8368704d7ad48313707c`.

| Type | Full hostname | Content | TTL | Proxy |
| --- | --- | --- | --- | --- |
| TXT | `resend._domainkey.auth.lan-party.club` | Exact complete owner-supplied public key in `scripts/resend-dns.mjs` | Auto | Not applicable |
| CNAME | `rsend.auth.lan-party.club` | `rsend-euw1.forge.rmta.net` | Auto | DNS Only |
| CNAME | `send.auth.lan-party.club` | `send.forge.rmta.net` | Auto | DNS Only |
| TXT | `_dmarc.auth.lan-party.club` | `v=DMARC1; p=none;` | Auto | Not applicable |

Auto is `ttl: 1` in Cloudflare's API. Both CNAMEs explicitly use `proxied: false`.
TXT POST bodies use quoted DNS character strings; the quotes are API syntax,
not part of the published value. Readback compares the complete decoded value.
DMARC applies to the auth sending domain; no root DMARC policy or report address
is added. No separate TXT/MX records are created at either CNAME hostname.

## Security and behavior

- `workflow_dispatch` only, no inputs, push, PR, schedule or workflow-call trigger.
- Job and script require `Awandalo/Lan-Party`, protected `main`, the expected
  workflow path, and matching workflow/source commit SHAs. The script refuses
  reruns: obtain fresh owner approval and make a new dispatch after inspecting
  any failure. Checkout uses the immutable dispatch SHA, not a moving branch.
- SHA-pinned official checkout/setup-node actions; checkout does not persist Git
  credentials. GitHub token permission is only `contents: read`.
- No npm install, package scripts, application imports or third-party dependencies.
  Offline tests run before the DNS token is supplied to the publishing step.
- Only that step receives `secrets.CLOUDFLARE_DNS_API_TOKEN`. It never uses
  `CLOUDFLARE_API_TOKEN_DEV`. Do not enable shell tracing or dump environments,
  upstream responses, authorization headers or HTTP exception objects.
- Verify account/zone identity, inventory all four exact names before any write,
  then recheck each immediately before creation. Skip one exactly matching record
  and report its ID. Any differing value/type/TTL/proxy setting or duplicate is a
  conflict. Quoted TXT chunks and DNS case/trailing-dot normalization are handled
  without truncating or changing the decoded DKIM value.
- Only GETs for the fixed zone/record inventory and at most four fixed-body POSTs
  are implemented. No PATCH, PUT, DELETE, Worker or D1 operations exist.
- A serialized concurrency group prevents overlapping runs of this workflow.
  External DNS edits can still race between inspection and creation; Cloudflare
  has no transaction spanning these four independent creations. Stop on any
  discrepancy. Never automatically reconcile, overwrite, retry or roll back.
- HTTP failures, invalid responses, permission failures, inventory inconsistencies
  and timeouts stop immediately. Earlier successful creations may remain. Logs
  and the job summary identify `created` versus `existing` records and IDs; a
  returned creation ID is reported before validating the rest of the response.
  A timeout/runner termination can leave an uncertain write: inspect DNS and
  Cloudflare audit evidence before any new dispatch.
- The repository secret is zone-scoped, not record-scoped. These limits are
  enforced by reviewed workflow code, not by Cloudflare's token permissions.
  Repository secrets also cannot be restricted to one workflow by this YAML.
  Keep write access and all secret-using repository workflows trusted; untrusted
  PR code is never checked out or run by this workflow. Do not grant fork PRs
  secret access or run unreviewed workflows with this repository secret.

## Review and publication gates

1. Review only this workflow, its script, offline tests and this document. Preserve
   the unrelated password-recovery working tree. No commit, push or PR creation
   is authorized by preparation alone.
2. Once separately authorized, use an isolated change based on current `main`
   containing only these four files. Do not promote unfinished DEV work merely
   to publish this workflow. Follow existing PR checks, review and branch rules;
   do not bypass protections or merge without owner approval.
3. **Resolve the merge side effect before merging:** PROJECT.md records that
   Cloudflare Git integration deploys production from `main`. A workflow-only
   MAIN merge may still trigger that integration. This DNS workflow does not
   deploy, but cannot suppress a separate Cloudflare build. Obtain explicit owner
   direction/approval for any resulting deployment; do not alter integration or
   deployment workflows to avoid this gate.
4. Confirm the reviewed files are on protected `main`, the DNS secret exists and
   remains restricted to this zone, and obtain separate execution approval for
   that exact revision. Secret names can be inspected without reading values.
5. Owner-approved execution: choose **Configure approved Resend DNS**, **Run
   workflow**, branch **main**. There are no record inputs. Review the run summary
   for the four IDs and their created/existing classification.
6. Read back all values/TTL/proxy settings and check public TXT/CNAME answers.
   Join DNS TXT character strings before comparing the entire owner key. Verify
   DMARC at `_dmarc.auth.lan-party.club` and confirm root DMARC was not changed.
   Allow DNS cache propagation without re-creating records.
7. Check DEV and PROD homepages and `/api/health` over validated HTTPS, retaining
   hostname validation when using a public DNS answer. Compare Worker custom
   domains and deployment versions against a captured pre-dispatch baseline using
   the separately authorized read-only interface; this DNS-only token must not
   gain Worker permissions. No database access or secret updates are needed.
8. Domain verification status in Resend requires authorized account access. Owner
   triggers verification in its dashboard if access is unavailable. No message
   send, API-key creation or hosted authentication activation is included.

## Rollback — separately approved, never automatic

Keep the run URL/SHA, returned IDs and created/existing classifications. Read back
each candidate by ID and confirm it still matches the exact approved name/type/
value before requesting rollback. Delete only IDs created by this run, after
explicit approval, using `DELETE /zones/83c0841a468b8368704d7ad48313707c/dns_records/{created_id}`.
Never delete matching records classified as existing, other DNS records, or either
Worker custom-domain attachment. If an outcome was uncertain, establish ownership
from DNS/audit evidence first. DNS rollback does not delete the Resend domain,
revoke keys or clear cached DNS answers. This workflow intentionally has no delete
mode or arbitrary record input.

## Local validation

`node --test .github/tests/resend-dns.test.mjs` uses synthetic credentials and
in-memory Cloudflare responses only. Importing the module does not execute it.
Direct local CLI execution refuses to run before obtaining a credential or making
requests. No real DNS writes are part of local checks.

Future owner-approved DNS plans should be separate reviewed allowlists and changes,
not free-form dispatch inputs or a general DNS administration endpoint.
