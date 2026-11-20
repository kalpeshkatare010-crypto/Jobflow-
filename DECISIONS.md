# JobFlow decisions

Short record of choices made where the specification left room. Change a decision by editing this file in the same pull request as the code that changes it.

## Fixed by the product owner

- **D-01 Prices.** Starter ₹299/month, Professional ₹599/month. Not to be changed without the owner.
- **D-02 Scope.** MVP = dashboard, customers, job orders, configurable workflows and stages, production entries, employees and roles, basic inventory, basic reports with CSV, offline-first sync, PWA, test-mode billing. Out: accounting, payroll, attendance, AI, IoT, advanced procurement, advanced wastage analytics, dispatch, native apps. Tauri desktop after launch.
- **D-03 Stack.** React + TypeScript + Vite, Tailwind CSS, Supabase (Postgres, Auth), Dexie/IndexedDB, Workbox PWA, Cloudflare Pages, GitHub Actions.
- **D-04 No spending without approval.** No paid plan, domain, email provider, certificate or live payments without written approval.

## Defaults chosen (owner may override)

- **D-05 Job statuses.** Draft → Approved → In production → Completed → Delivered, plus On hold and Cancelled. Quality check is a stage a business can add, not a status.
- **D-06 Stages belong to the business.** No industry stages are built in. A new business has no stages until the owner names them. Each job copies its workflow's stages when created, so editing a workflow never changes running jobs.
- **D-07 Employees without logins.** An employee roster is separate from user accounts. Workers can be assigned and named on production entries without signing in. Plan limits count logins.
- **D-08 Plan limits.** Starter: 3 logins, 15 employees, 2 workflows, 100 open jobs. Professional: 10 logins, unlimited employees, workflows and jobs. Enforced on the server.
- **D-09 Trial.** 14 days, no card. After expiry plus the grace period the workspace becomes read-only, never deleted without notice.
- **D-10 Billing.** Razorpay, INR only, test mode, behind a `BillingProvider` interface. A subscription is active only after a webhook with a verified signature. The owner opens the Razorpay account; no business details are invented.
- **D-11 Language and formats.** English interface first. Numbers use Indian grouping (`en-IN`) by default.
- **D-12 Demo data.** Sample figures exist only in `src/features/dashboard/demoData.ts` and every view of them carries a "Demo data" tag. Demo workspaces will carry `is_demo = true`.
- **D-13 Unfinished modules.** Show a plain "being built" page with the milestone number. Never fake screens for essential features.

- **D-14 Sign-in.** Email and password through Supabase Auth, with email confirmation and password reset by link. A person can belong to several businesses and picks one. One login can own at most 3 businesses (stops trial abuse).
- **D-15 Invitations.** The owner (or an admin, for non-admin roles) creates an invitation and gets a one-time link to send by WhatsApp or email. Only the link's SHA-256 hash is stored. It works once, only for the invited email, and expires in 7 days. Sending invitation emails automatically waits for an email provider (needs approval).
- **D-16 Team changes are server functions.** Memberships cannot be written directly; `create_business`, `create_invitation`, `accept_invitation`, `change_member_role`, `set_member_permissions` and `revoke_member` check permission themselves. Nobody can become, remove or demote the owner, and only the owner manages admins.
- **D-17 Demo mode.** With no Supabase settings the app runs without sign-in on sample data. This keeps previews and local development working without accounts.

- **D-18 Installable app first.** The PWA install (manifest, icons, service worker for the app's own files) was brought forward at the owner's request. Business data is never stored in the service-worker cache. New versions wait for the person to tap Reload. A Play Store listing (one-time Google fee) is possible later and needs approval.

- **D-19 How offline changes sync.** Each change is saved on the device with an outbox entry in one IndexedDB transaction. Edits record only changed fields and their previous values; the server applies a field if it still holds the previous value, otherwise it reports a conflict and overwrites nothing. A delete of a record edited elsewhere is a conflict. Conflicts show "Needs review" with both values and "Keep yours" / "Keep saved version". Refused changes stay in the outbox marked "Not saved to cloud" with the server's reason. Sync runs on start, on reconnect, when the app comes back into view, after each change and every 60 seconds; failures retry after 2 s doubling to 5 minutes. One browser tab syncs at a time (Web Locks).
- **D-20 Demo mode keeps data on the device.** Without Supabase settings, customers are saved in a local database named for the demo and never leave the device; the screen says so.
- **Still to do (Milestone 10):** warn before signing out with unsynced changes and clear the device's data on sign-out or removal from a business.

- **D-21 Android app.** Capacitor wraps the same React build into an APK (app id `com.rkdigitals.jobflow`), so it works offline from the first launch without Chrome. GitHub Actions builds it (Google's Android tools are not reachable from the development workspace) and publishes it on the `android-latest` release. The release signing key lives only in GitHub secrets and with the owner; without it, builds are clearly named TEST. Tauri (Windows) stays post-launch.

## Architecture corrections (made before the code that depends on them)

- **C-01 Commit-safe sync cursor.** A sequence number assigned at write time is not commit-ordered: a slow transaction can commit a lower number after a device has already pulled past it, and that row would never be downloaded. Each synced row records the writing transaction id (`xid8`). A pull returns rows whose transaction id is at or above the device's checkpoint, and the new checkpoint is `pg_snapshot_xmin(pg_current_snapshot())`, the oldest transaction still running. Rows may be sent twice, never missed; the client merge is idempotent by `id` + `version`.
- **C-02 Idempotent mutations.** Every queued change has a client-generated UUID. The server records `(tenant_id, mutation_id)` with the result in the same transaction as the change, and returns the stored result on a retry.
- **C-03 Persistent queue.** A change and its queue entry are written in one IndexedDB transaction before the app reports "Saved on this device". "Synced" is shown only after the server's reply has been stored locally.
- **C-04 Inventory concurrency.** Stock is an append-only movement ledger. Balances are updated by an atomic `insert … on conflict do update set on_hand = on_hand + excluded.qty` inside the same transaction. Negative balances raise an alert; nothing is silently corrected.
- **C-05 Server functions.** Privileged helpers live in a `private` schema that is not exposed through the API, are `security definer` with `set search_path = ''`, and have `execute` revoked from `public` and `anon`. Sync functions are `security invoker`, so Row Level Security still applies to every row they touch.
- **C-06 Subscription enforcement.** The sync and write functions check the tenant's subscription state on the server. Expired workspaces can still upload work done during the grace period but cannot create new jobs.
- **C-07 Backups on the free tier.** Supabase Free has no automatic backups, so a scheduled GitHub Action runs a daily `pg_dump`, encrypts it and stores it as a private workflow artifact. Restore is tested before launch. Supabase Pro (paid, needs approval) before the first paying customer.
- **C-08 Hosting.** Cloudflare (Workers static assets, free; Cloudflare's current replacement for Pages), not Vercel Hobby (Hobby forbids commercial use).

## Technical notes

- Package versions are those current on 2026-11-20 (React 19, React Router 8, Vite 8, Tailwind 4, TypeScript 7, Vitest 5).
- Chart colours are validated for colour-blind separation and contrast; SVG fills use hex values because SVG attributes do not resolve CSS variables.
- The preview build (`npm run build:preview`) uses hash URLs so it runs from any static host; production uses clean URLs with `public/_redirects`.
