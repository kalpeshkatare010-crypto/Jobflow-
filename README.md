# JobFlow

**Production Management, Simplified.** A product of RK Digitals.

JobFlow helps small manufacturers (5–30 people) manage job orders and track production through stages they define themselves. It works offline and syncs to the cloud when the connection returns.

## Status

| Milestone | What it delivers | State |
| --- | --- | --- |
| 1 | Project, design system, app shell, dashboard with demonstration data | Done |
| 2 | Sign-in, businesses, roles, invitations, database security | Done (needs your Supabase project to go live: [docs/SETUP.md](docs/SETUP.md)) |
| 3 | Offline database and sync engine | Next |
| 4–12 | Customers, jobs, workflows, production, inventory, reports, hardening, PWA, billing, launch | Planned |

Without Supabase settings the app runs in **demo mode**: no sign-in, invented sample data marked "Demo data", and the header says "Not connected". With settings (see [docs/SETUP.md](docs/SETUP.md)) it requires sign-in, business setup and team invitations. The dashboard figures stay sample data until job orders arrive.

## Run it on a computer

You need [Node.js 22](https://nodejs.org) (choose the "LTS" installer). Then, in a terminal opened in this folder:

```bash
npm install        # once, downloads the libraries
npm run dev        # starts the app at http://localhost:5173
```

Other commands:

```bash
npm test           # runs the automated app tests
./scripts/test-db.sh  # database security tests (needs PostgreSQL; runs in CI)
npm run typecheck  # checks the TypeScript code
npm run build      # builds the production site into dist/
```

## Deploy (Cloudflare Pages, free)

1. Push this project to a GitHub repository.
2. In Cloudflare: Workers & Pages > Create > Pages > Connect to Git, choose the repository.
3. Build settings: framework preset **None**, build command `npm run build`, output folder `dist`, environment variable `NODE_VERSION` = `22`.
4. Save. Every push to `main` deploys; every pull request gets a preview link.

`public/_redirects` makes links like `/jobs` work when opened directly.

## Project layout

```text
src/
  app/            App root, routes, layout (sidebar, header, sync indicator)
  auth/           Sign-in, sign-up, invitations, business selection, Supabase client
  components/ui/  Design system: buttons, fields, cards, badges, tables, states
  domain/         Pure business rules (job metrics, delays, progress)
  features/       One folder per module (dashboard now; more each milestone)
  lib/            Formatting and small helpers
  styles/         Design tokens (colours, type, radii) in index.css
supabase/         Database migrations (tables, Row Level Security, server functions)
tests/unit/       App tests (Vitest + Testing Library)
tests/db/         Database security tests (plain SQL, run by scripts/test-db.sh)
scripts/          Developer tools (review screenshots)
.github/workflows CI on every push; "Deploy database" applies migrations
DECISIONS.md      Product and architecture decisions
```

## Rules this codebase follows

- Demonstration data lives only in `src/features/dashboard/demoData.ts` and is always labelled.
- The app never says something is synced until the server has confirmed it.
- No secrets in the repository. `.env.example` lists the settings; real values go in `.env.local` (ignored by git) or the hosting dashboard.
- No paid service is switched on without the owner's approval.
