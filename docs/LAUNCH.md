# Launch checklist

Everything in the app is built and tested. What is left needs **your** accounts, secrets or approval. Do the steps in order; each links to its guide. Free steps are marked **Free**. Anything that costs money is marked **Needs your approval**, and nothing here is switched on for you.

## A. Go live for testing (all free)

1. **Free.** Supabase project, GitHub secrets, database deployed: [SETUP.md](SETUP.md) sections 1–3.
2. **Free.** Website on Cloudflare with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`: [SETUP.md](SETUP.md) section 4.
3. **Free.** Supabase URL settings, including the Android app link `com.rkdigitals.jobflow://auth/callback**`: [SETUP.md](SETUP.md) section 5.
4. **Free.** Email code template (`{{ .Token }}`): [SETUP.md](SETUP.md), "Sign in with an email code".
5. **Free, optional.** Google sign-in, then `VITE_GOOGLE_SIGN_IN=true`: [SETUP.md](SETUP.md), "Sign in with Google".
6. **Free, optional.** Support email and/or WhatsApp number as `VITE_SUPPORT_EMAIL` / `VITE_SUPPORT_WHATSAPP`: [SETUP.md](SETUP.md), "Support contact".
7. **Free.** Nightly encrypted backups (`BACKUP_PASSPHRASE`), run once by hand: [BACKUP.md](BACKUP.md).
8. **Free.** Proper Android app (not TEST): add the signing-key secrets from your private key note: [ANDROID.md](ANDROID.md).
9. **Free.** Add the same `VITE_` values as GitHub **Variables** so the Android app connects too: [ANDROID.md](ANDROID.md).

## B. Check it works (about 30 minutes, two phones)

- [ ] Website shows **Sign in to JobFlow** (not demo data). Create an account with a password; also try **Email me a sign-in code instead** (and Google if switched on).
- [ ] Create the business; the dashboard shows sample data marked "Demo data".
- [ ] Settings → Team: invite your second email as Employee; accept on the second phone.
- [ ] Phone 1: add a workflow, a customer and an approved job. Phone 2 sees it after the sync icon says synced.
- [ ] Turn on airplane mode on phone 2; record production on a stage. The icon says "Saved on this device". Turn the internet back on: it says synced, and phone 1 shows the numbers.
- [ ] Add a material, receive stock, issue some to the job; the dashboard's low-stock card reacts.
- [ ] Reports → Rejections → **Download CSV**; open it in Excel or Google Sheets.
- [ ] Help & Support → **Email support** or **WhatsApp support** opens with the details filled in.
- [ ] Actions → **Back up database** → Run workflow shows a green tick.

## C. Before the first paying customer (each needs your approval)

| Item | Why | Rough cost |
| --- | --- | --- |
| Supabase **Pro** plan | Free projects pause after a week idle and have no automatic backups | about US$25 per month |
| Email sending service (custom SMTP in Supabase) | The built-in sender is for testing only and has a low hourly limit | free tiers exist; depends on the provider |
| Your own domain (for example jobflow.yourname.in) | A trustworthy address for the website and emails | about ₹800–1,500 per year |
| Payment provider (Razorpay, Cashfree or similar) | Online payment for ₹299 / ₹599 plans | a percentage per payment, set by the provider |
| Google Play listing (optional) | Install from the Play Store instead of the APK link | one-time developer fee set by Google |
| Privacy policy and terms of service | Required by Google, Play Store and customers | needs RK Digitals' real business details; not written for you |

Prices change; check each provider's current price before you approve. Ask me to set up any item once you approve it.

## D. Activating a paying customer (until online payment exists)

When a business pays you (for example by UPI), open Supabase → **SQL Editor**, paste this, change the business name, plan and end date, and **Run**:

```sql
update public.tenants
set subscription_status = 'active',
    plan_code = 'starter',               -- or 'professional'
    current_period_end = '2026-12-31'    -- the last day they have paid for
where name = 'Exact business name';
```

Check that it says `UPDATE 1`. If it says `UPDATE 0`, the name did not match exactly. When a month is not paid, set `subscription_status = 'past_due'`: the business keeps working for 7 days after `current_period_end`, then becomes read-only. Nothing is ever deleted.
