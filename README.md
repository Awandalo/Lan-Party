# LAN Party

A personal LAN party website built with React, TypeScript, and Vite. Phase 1
provides the initial placeholder pages, shared navigation and a footer, and a responsive
dark theme. The repository root is the application root.

## Setup on Windows 11

1. Install Node.js 24 LTS (includes npm) and Git. This project requires Node.js
   22.12 or newer; Node.js 24 is the recommended development version.
2. Open PowerShell in the repository:

   ```powershell
   Set-Location 'D:\Development\Projects\Lan-Party'
   git branch --show-current
   node --version
   npm --version
   ```

   Development for this phase uses the `dev` branch.
3. Install the locked dependencies:

   ```powershell
   npm ci
   ```

4. Start the local development server:

   ```powershell
   npm run dev
   ```

   Open the localhost URL printed by Vite (normally
   `http://127.0.0.1:5173`). The server listens locally, not on the LAN.
   Press Ctrl+C to stop it. Vite updates the browser as source files change.

If PowerShell blocks the npm script shim, use `npm.cmd` instead of `npm` for
these commands; no system-wide execution-policy change is needed.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run Vite with live updates |
| `npm run typecheck` | Validate frontend, Vite configuration, and Worker with strict TypeScript |
| `npm run build` | Run type checking, then create the production frontend in `dist/` |
| `npm run preview` | Serve the built frontend locally for verification |
| `npm run dev:worker` | Serve built frontend and Worker locally in the explicit dev environment |
| `npm audit` | Review known dependency vulnerabilities |

Run `npm run build` before `npm run preview`. Preview is a local verification
server, not a production deployment. Cloudflare deployment configuration is in
`wrangler.jsonc`. Branch pushes trigger the deployment automation described below;
manual deployments require explicit approval.

## Project structure

```text
src/
  pages/         Home, Events, and Login
  CSS/           main.css and <PageName>_style.css
  components/    Shared header, footer, and route focus handling
  lib/           Shared frontend utilities and typed temporary public content
  App.tsx        Client-side routes and shared layout
  main.tsx       React application entry point
worker/          TypeScript Worker entry point and health API
migrations/      Versioned D1 migrations (0001–0004 on DEV; registrations local only)
public/          Static assets, including the generated LAN hall photograph
```

Empty directories contain `.gitkeep` so Git preserves them. Global theme colors,
spacing, and shared UI styles are in `src/CSS/main.css`; page-specific styles
are in dedicated stylesheets. Header and footer styles stay with their components.
The theme uses system fonts, a local generated photograph, and no UI framework.

React Router provides `/`, `/events`, and `/login`, browser
back/forward navigation, active navigation links, and a missing-page fallback.
Navigation updates the document title and moves focus to the main content.
Workers Static Assets uses the single-page application fallback to serve
`index.html` for frontend navigation requests such as `/events` and `/login`.
Vite handles frontend route fallback locally.

## Cloudflare Workers deployment

Deploy this project with **Cloudflare Workers**, not Cloudflare Pages. Wrangler
is a locked development dependency. `wrangler.jsonc` names the Worker `lan-party`
and serves `./dist` using `assets.not_found_handling: "single-page-application"`
so direct visits and refreshes reach React Router. The `worker/index.ts` entry
point handles `/api/*` before assets; other paths retain static asset serving.

When configuring Workers Builds for `Awandalo/Lan-Party`, use:

| Setting | Value |
| --- | --- |
| Worker/project name | `lan-party` |
| Root directory | Repository root |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Production branch | `main` |
| Preview builds | Disabled for now |

Work on `dev`; reserve `main` for reviewed, stable production releases. Configure
the production branch and disable preview builds in Cloudflare's branch control
settings. Wrangler does not enforce this Git branch strategy: a manual deploy
uses the current checkout, so only deploy an approved production release.
Once repository integration is configured, pushes to `main` can trigger production
builds and deployment. With preview builds disabled, `dev` pushes do not produce
Cloudflare previews. These settings are documented here, not changed by this setup.

For local verification without login, uploads, or deployment, run from the root:

```powershell
npm run typecheck
npm run build
npx wrangler deploy --dry-run
npx wrangler deploy --dry-run --env dev
```

The build must run first because Wrangler consumes `dist/`. The dry run validates
and prepares the deployment locally; it does not verify a live Cloudflare site.
Actual deployment (`npx wrangler deploy`, without `--dry-run`) requires separate
approval and authorized Cloudflare access.

The default command still targets the existing production Worker and production
D1 binding. Development requires explicit `--env dev`. This foundation references
existing databases only; it creates no Cloudflare resources and performs no
database queries or schema changes.

### Automatic development deployment

`.github/workflows/deploy-dev.yml` runs only on pushes to `dev`. It uses Node.js
24 with npm caching, installs locked dependencies with `npm ci`, runs
`npm run typecheck` and `npm run build`, then validates Wrangler with
`npx wrangler deploy --dry-run --env dev`. If those checks pass, it runs
`npx wrangler deploy --env dev` to deploy the existing `lan-party-dev` Worker.
The explicit environment selects its `DB` binding to `lan-party-dev`
(`a3c4cea6-ceb7-43b8-b9b7-b374726b35b4`). No migrations or SQL run automatically.

In **Awandalo/Lan-Party → Settings → Secrets and variables → Actions**, configure:

| GitHub configuration | Name | Value |
| --- | --- | --- |
| Repository secret (already created) | `CLOUDFLARE_API_TOKEN_DEV` | Authorized development deployment token |
| Repository variable (add before the first push) | `CLOUDFLARE_ACCOUNT_ID` | Account ID from the Cloudflare dashboard for the development Worker |

The deployment step passes these as `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`. Keep the token in GitHub Secrets, never in files or
frontend variables. The account ID is an identifier, not an API credential.
The workflow's GitHub token has only `contents: read` permission.

The `deploy-dev` concurrency group allows one active run at a time, with
`cancel-in-progress: false` so a newer push does not interrupt an active deployment.
GitHub can replace an older pending run with a newer one. Monitor results in the
repository's **Actions** tab; an actual deployment requires the configuration above
and valid Cloudflare permissions. Local dry runs cannot verify these credentials.

This workflow does not run on `main`. Production continues through the existing
Cloudflare Git integration from `main`, using the unchanged `npm run build` and
`npx wrangler deploy` commands. Cloudflare preview builds remain disabled;
development deployment uses this separate GitHub Actions workflow.

## Backend environments and local development

| Wrangler environment | Worker | Binding | D1 database | Database UUID |
| --- | --- | --- | --- | --- |
| Default (no environment flag) | `lan-party` | `DB` | `lan-party-prod` | `9fbe3402-c26b-45fd-be67-71775e5e6a3e` |
| `dev` (explicit `--env dev`) | `lan-party-dev` | `DB` | `lan-party-dev` | `a3c4cea6-ceb7-43b8-b9b7-b374726b35b4` |

Both existing databases were created with EU jurisdiction. UUIDs are resource
identifiers, not credentials. D1 bindings are non-inheritable, so `env.dev`
defines its own `DB`. Both environments explicitly define `ASSETS`, `./dist`,
SPA fallback, and Worker-first routing for `/api` and `/api/*`.
The shared entry point and compatibility date are inherited by `dev`.

For the complete local frontend and API:

```powershell
npm run build
npm run dev:worker
```

Open the URL printed by Wrangler (normally `http://127.0.0.1:8787`).
`GET /api/health` returns `{"status":"ok"}` without using D1. Other methods
return JSON 405 with `Allow: GET`; unknown API paths return JSON 404 rather
than SPA HTML. Check `/events` and `/login` directly and on refresh.
Press Ctrl+C to stop the server.

`--local` uses local simulation; do not use `--remote` or remote D1 bindings
for routine development. State belongs in ignored `.wrangler/`. No login or
credentials are needed. `npm run dev` still runs Vite for frontend editing,
without this API. Rebuild to update frontend files served by Wrangler.

Worker code is checked separately via `tsconfig.worker.json` using the
development-only `@cloudflare/workers-types` package. The existing
`npm run build` command includes Worker type validation through `typecheck`;
Wrangler bundles the Worker during deploy or dry run. Production build and deploy
commands remain `npm run build` and `npx wrangler deploy`.

### Migration safety

Both bindings use `./migrations`. Migration 0001 defines locations, events, and
event days and is applied on Cloudflare DEV. Migration 0002 defines prefixes and
user profiles and is also applied on DEV, as confirmed by the owner. Migration 0003
defines external identities and password credential storage and is applied/verified
on DEV. Migration 0004 adds role and permission storage and is applied/verified on
DEV. Migration 0005 adds registrations and selected days; it is local-only pending
review/approval, with no seeds or registration APIs. Reference data is planned
separately for migration 0006 with reviewed mappings. Worker authorization and
transactional registration lifecycle remain future work. See `migrations/README.md`
for local checks, cancellation/re-registration decisions and execution safety.

- Use ordered, versioned migrations; never edit already-applied migrations.
- Review and test future migrations on local development state first with
  explicit `--env dev` and `--local`; the default environment targets production.
- Confirm database name, UUID, and environment before any database work.
- Remote SQL and migrations require explicit approval. Production changes require
  reviewed backup/recovery procedures and preservation of existing registrations.
- Keep SQL out of build/deploy/CI automation and real participant data out of Git.

References: [Workers Static Assets SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
and [Workers Builds branch control](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/).

## Current limitations and verification

All event, registration, and organizer content is placeholder content. There is
no authentication, registration submission, or database queries. The backend
currently provides only the database-independent health endpoint.
The Login page is publicly accessible, with disabled email/password controls, and
explicitly identifies itself as a nonfunctional preview, not a secured administration
area. The temporary `/admin` redirect has been removed. Registration will be added
directly to individual event pages without requiring an organizer account.
Continue using the existing Jotform workflow until the
replacement is tested and approved.

After changes, run type checking and a production build. Also manually verify:

- Home, Events, and Login navigation, active states, browser back/forward, and direct URL reloads.
- Unknown URLs show the missing-page message and a working home link.
- Keyboard navigation, visible focus, the skip link, and focus after route changes.
- Desktop and mobile layouts, including 320px width and increased text/zoom, without horizontal overflow.
- Clear Login placeholder messages, with disabled login controls.
- Upcoming/Past event filters and their distinct empty states.
- Homepage news between Up next and the feature cards; example news must be clearly labeled.
- Side photos at wide desktop widths, with the central column unchanged and photos hidden on narrow screens.
- The same navigation and layouts in the production preview.

Successful type checking and compilation do not replace browser behavior,
accessibility, or layout checks.

## Security and future work

Read `AGENTS.md` and `PROJECT.md` before development. They define conventions,
requirements, the roadmap, and unresolved architecture decisions. They were not
modified as part of this scaffold.

Do not commit secrets, real participant data, or production exports. Local secret
files, dependencies, build output, Workers local state, and database files are
ignored. Local development needs no Cloudflare credentials; GitHub development
deployment uses the secret and variable documented above. Any future variable
prefixed with `VITE_` is exposed to the browser and must never contain a secret.

Additional Worker APIs, D1 schema and queries will be introduced in later phases,
with separate development/production databases and reviewed access controls.
Commits and pushes remain owner-controlled. Pushing to `dev` triggers the
development workflow; production deployment follows the existing `main` integration.

## UI follow-up notes

`TODO.md` records future photo uploads, news publishing, backend-driven event
lists, event-specific registration, and possible moderator permissions. These
features are not implemented yet. The obsolete standalone Registration page and
route have been removed; `/registration` now uses the missing-page fallback.
`src/lib/content.ts` holds typed temporary content, without API or database access.

`/login` is the shared sign-in entry point. Future `/account` tools will let
participants view and adjust their own signups; future `/manage` tools will serve
authorized organizers and moderators. Neither route is implemented yet. Backend
permission checks must control access. Phase 2.5 requires a participant account
for registration, without organizer privileges. Login and signup ownership checks
remain future Worker implementation work.

The decorative `public/lan-hall.png` image was created using the built-in image
generator. Prompt: a wide overhead LAN gaming hall overview, dense monitor rows,
almost pitch-black room illuminated by cool monitor light, no text, branding,
watermark, readable screen content, or recognizable faces. It is an illustration
of the desired atmosphere, not a photograph of an actual DreamHack event.
