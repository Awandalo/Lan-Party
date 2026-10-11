# Development instructions

These permanent instructions apply throughout this repository. Read `PROJECT.md`
for requirements, architecture, roadmap, and decisions awaiting owner review.

## Technology and scope

- Use React, TypeScript, and Vite for the frontend.
- Use Cloudflare Workers for the backend and hosting, and Cloudflare D1 (SQLite)
  for persistent data.
- Develop locally on Windows 11 using npm for dependency management and Git and
  GitHub for version control.
- Prefer solutions compatible with Cloudflare Workers Free and avoid unnecessary
  external services, dependencies, or paid products.
- Keep this personal project independent of work infrastructure and accounts.
- Requirements in `PROJECT.md` are mandatory unless explicitly marked as proposals,
  open decisions, or future ideas. Future ideas do not authorize implementation.

## 1. Folder structure and styling

Use these locations when implementation begins:

| Location | Responsibility |
| --- | --- |
| `src/pages/` | Individual website pages |
| `src/CSS/main.css` | Global typography, colors, themes, shared layout, and general UI elements |
| `src/CSS/<PageName>_style.css` | Page-specific styling |
| `src/components/` | Reusable React components |
| `src/lib/` | Shared frontend utilities |
| `worker/` | Backend code |
| `migrations/` | Versioned database migrations |
| `public/` | Static public assets |

- Use consistent PascalCase page names and matching stylesheet names, such as
  `EventDetails.tsx` and `EventDetails_style.css`.
- Create a corresponding page-specific stylesheet when a new page needs one.
- Never put page-specific CSS in `main.css` merely because its dedicated stylesheet
  does not exist; create the dedicated stylesheet instead.
- Reusable components may have dedicated stylesheets.
- Keep components small, readable, and maintainable; avoid unnecessarily large files.

## 2. Code quality

- Enable strict TypeScript type checking.
- Prefer readable, maintainable code over clever solutions.
- Avoid unnecessary dependencies and duplicated functionality.
- Keep frontend and backend responsibilities separate.
- Use consistent naming conventions and established React best practices.
- Add comments to explain non-obvious decisions, rather than every line.
- Keep the application responsive and accessible.

## 3. Security and privacy

**This is a public GitHub repository. Never assume it is a trusted environment.**

- Never commit passwords, tokens, API keys, secrets, or credentials.
- Never commit real participant data, email addresses, or production database exports.
- Use environment variables and Cloudflare secret management for sensitive configuration.
- Include appropriate `.gitignore` rules before introducing local configuration,
  generated files, local databases, or exports.
- Provide safe `.env.example` files when needed, containing fictional placeholders only.
  Do not place secrets in frontend environment variables or shipped browser assets.
- Validate registration input on the server; never trust frontend validation alone.
- Protect all administration functionality with authentication and authorization,
  including backend endpoints. A hidden frontend route is not access control.
- Prevent unauthorized registration edits; review the editing mechanism before implementing it.
- Public API responses and attendance views must never expose private registration details
  or contact information. Publish only approved display names and attendance per day.
- Use secure packages whose dependencies have been reviewed.
- Avoid unnecessary personal data collection. Resolve privacy and retention requirements
  before production use, including the GDPR considerations recorded in `PROJECT.md`.

## 4. Database management

- Use versioned database migrations in `migrations/`.
- Never modify production data or production schemas without explicit approval.
- Use parameterized queries, never SQL constructed from untrusted input.
- Maintain a clear separation between development and production databases and configuration.
- Design schema and data changes to preserve existing registrations.
- Document backup and recovery procedures before production use.

## 5. Git and deployment

- Work locally by default and keep changes focused and easy to review.
- Do not create commits unless explicitly requested.
- Do not push commits automatically.
- Do not deploy from Codex without approval.
- Explain significant architectural changes before implementation and ask the owner
  before making major architectural changes.
- Prefer small, testable development steps.
- Separate production deployment from experimentation.
- Never rewrite Git history or use destructive Git operations without approval.

## 6. Testing and verification

- Run relevant checks after changes, including TypeScript validation and production
  builds when applicable.
- Report failures clearly and distinguish tested behavior from assumptions.
- Do not claim functionality works unless it has been tested.
- Document manual testing requirements, including responsive layouts, accessibility,
  registration flows, attendance totals, and permission boundaries when relevant.
- Successful compilation does not establish that the application functions correctly.

## 7. Collaboration with the project owner

The owner is learning this technology stack.

- Explain new tools, dependencies, and important technical decisions in plain language.
- Follow existing project conventions.
- Ask before making major architectural changes.
- Avoid unnecessary refactoring outside the requested task.
- Suggest improvements, but do not implement unrelated features without approval.
- Keep documentation updated when functionality or decisions change.
- Keep the existing Jotform workflow operational until its replacement has been
  tested and approved by the owner.

## Git Commit & Pull Request Conventions

Use Conventional Commits for Git commit messages and Pull Request titles.

### Approved types

| Prefix | Purpose |
| --- | --- |
| `feat:` | New functionality or features |
| `fix:` | Bug fixes |
| `docs:` | Documentation changes |
| `style:` | Formatting or styling changes that do not affect functionality |
| `refactor:` | Code restructuring without changing behavior |
| `perf:` | Performance improvements |
| `test:` | Adding or updating tests |
| `build:` | Build system or dependency changes |
| `ci:` | CI/CD workflow changes |
| `chore:` | General maintenance tasks |

### Naming format and rules

Use `type(scope): short description`. The scope is optional and identifies the
affected feature, component, or subsystem. Without a scope, use
`type: short description`.

Commit and Pull Request titles must:

- Be written in English with lowercase type prefixes.
- Use the imperative mood, such as "add", "fix", or "update".
- Be concise and descriptive, without unnecessary punctuation at the end.
- Describe the actual changes, rather than just the task being worked on.
- Use `!` immediately before the colon for breaking changes, such as
  `feat(events)!: change registration format`. Clearly document the breaking
  changes and their impact in the PR description.
- Use the dominant change type when multiple categories are involved.

Examples:

- `feat(events): add event registration functionality`
- `fix(login): correct authentication validation`
- `docs(project): update development guidelines`
- `ci(github): add automated build verification`
- `refactor(home): simplify news component structure`

### Completion guidance for Codex

When completing development tasks:

- Suggest an appropriate Conventional Commit message.
- Suggest a matching Pull Request title when applicable.
- Provide a short PR description summarizing the changes and tests performed.
- Mention any tests that could not be performed or were not run.
- Never create commits, push branches, merge PRs, or deploy automatically unless
  explicitly instructed by the project owner.
