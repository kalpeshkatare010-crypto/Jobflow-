# JobFlow

**Production Management, Simplified.** A product of RK Digitals.

JobFlow helps small manufacturers (5–30 people) manage job orders and track production through stages they define themselves. It works offline and syncs to the cloud when the connection returns.

## Status

| Milestone | What it delivers | State |
| --- | --- | --- |
| 1 | Project, design system, app shell, dashboard with demonstration data | Done |
| 2 | Sign-in, businesses, roles, invitations, database security | Done (needs your Supabase project to go live: [docs/SETUP.md](docs/SETUP.md)) |
| PWA | Installable app: icon, full-screen, starts offline, update notice | Done (brought forward) |
| 3 | Offline database and sync engine; Customers screen working offline | Done |
| Android | APK built by GitHub on every change: [docs/ANDROID.md](docs/ANDROID.md) | Done |
| 4 | Employee roster (shop-floor workers, no login needed) | Done |
| 5–6 | Your own production workflows (stages in your words); job orders with status, stages and history, all offline | Done |
| Sign-in | Email + password, one-time email code, Google (switch on: docs/SETUP.md); Help & Support screen | Done |
| 7 | Production entries: good and rejected quantities per stage, offline, void with reason; dashboard chart from real output | Done |
| 8 | Inventory: materials, receive/issue/adjust ledger, low-stock and below-zero warnings, offline | Done |
| 9 | Reports: jobs, production, rejections, stock; CSV download or share | Done |
| 10 | Hardening: nightly encrypted backups (docs/BACKUP.md), security headers, crash recovery, database-wide security checks | Done |
| 11 | Plans and billing screen (₹299 / ₹599); live payments need your approval of a payment provider | Next |
| 12 | Launch checklist | Planned |

Without Supabase settings the app runs in **demo mode**: no sign-in, invented sample data marked "Demo data", and the header says "Not connected". With settings (see [docs/SETUP.md](docs/SETUP.md)) it requires sign-in, business setup and team invitations. The dashboard shows sample figures only until the business creates its first job order; after that every figure is real.

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

## Deploy (Cloudflare, free)

In Cloudflare: Workers & Pages > Create > Import a repository, choose this repository, build command `npm run build`, deploy command `npx wrangler deploy`. Every push to `main` redeploys. `wrangler.jsonc` serves `dist/` and sends unknown paths (e.g. `/jobs`) to the app. Full steps: [docs/SETUP.md](docs/SETUP.md).

## Project layout

```text
src/
  app/            App root, routes, layout (sidebar, header, sync indicator)
  auth/           Sign-in, sign-up, invitations, business selection, Supabase client
  offline/        Local database (Dexie/IndexedDB), outbox, local customer changes
  sync/           Sync engine: push, pull, merge, retry, status
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
