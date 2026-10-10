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
| `npm run typecheck` | Validate frontend and Vite configuration with strict TypeScript |
| `npm run build` | Run type checking, then create the production frontend in `dist/` |
| `npm run preview` | Serve the built frontend locally for verification |
| `npm audit` | Review known dependency vulnerabilities |

Run `npm run build` before `npm run preview`. Preview is a local verification
server, not a production deployment. No Cloudflare configuration or deployment
scripts are included yet.

## Project structure

```text
src/
  pages/         Home, Events, and Login
  CSS/           main.css and <PageName>_style.css
  components/    Shared header, footer, and route focus handling
  lib/           Shared frontend utilities and typed temporary public content
  App.tsx        Client-side routes and shared layout
  main.tsx       React application entry point
worker/          Reserved for future Cloudflare Workers backend code
migrations/      Reserved for versioned D1 migrations
public/          Static assets, including the generated LAN hall photograph
```

Empty directories contain `.gitkeep` so Git preserves them. Global theme colors,
spacing, and shared UI styles are in `src/CSS/main.css`; page-specific styles
are in dedicated stylesheets. Header and footer styles stay with their components.
The theme uses system fonts, a local generated photograph, and no UI framework.

React Router provides `/`, `/events`, and `/login`, browser
back/forward navigation, active navigation links, and a missing-page fallback.
Navigation updates the document title and moves focus to the main content.
Future Workers hosting must serve `index.html` for frontend route requests while
keeping future API routes separate. Vite handles frontend route fallback locally.

## Current limitations and verification

All event, registration, and organizer content is placeholder content. There is
no authentication, database connection, registration submission, or backend API.
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
ignored. No environment variables are needed for this phase. Any future variable
prefixed with `VITE_` is exposed to the browser and must never contain a secret.

Cloudflare Workers and D1 integration will be introduced in later phases, with
separate development/production configuration and reviewed access controls.
Commits, pushes, and deployments are not automatic.

## UI follow-up notes

`TODO.md` records future photo uploads, news publishing, backend-driven event
lists, event-specific registration, and possible moderator permissions. These
features are not implemented yet. The obsolete standalone Registration page and
route have been removed; `/registration` now uses the missing-page fallback.
`src/lib/content.ts` holds typed temporary content, without API or database access.

`/login` is the shared sign-in entry point. Future `/account` tools will let
participants view and adjust their own signups; future `/manage` tools will serve
authorized organizers and moderators. Neither route is implemented yet. Backend
permission checks must control access. Public registration can work without an
account; securely claiming or editing such registrations remains an open decision.

The decorative `public/lan-hall.png` image was created using the built-in image
generator. Prompt: a wide overhead LAN gaming hall overview, dense monitor rows,
almost pitch-black room illuminated by cool monitor light, no text, branding,
watermark, readable screen content, or recognizable faces. It is an illustration
of the desired atmosphere, not a photograph of an actual DreamHack event.
