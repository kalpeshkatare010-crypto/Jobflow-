# Connecting JobFlow to the cloud

These steps link JobFlow to your own free accounts so real sign-in and saving work. Everything here can be done from a phone browser. Nothing in these steps costs money.

You will copy a few values between websites. Keep a private note open to paste them into as you go. **Never paste the database password, access token or "service_role" key into a chat, an email or the code.**

## 1. Create the Supabase project (database and sign-in)

1. Go to **supabase.com**, sign in with GitHub.
2. Tap **New project**.
   - Name: `jobflow`
   - Database password: tap **Generate a password**, then copy it into your private note. You need it in step 3.
   - Region: **South Asia (Mumbai)**.
   - Plan: **Free**.
3. Wait about two minutes for the project to start.
4. Open **Project Settings → API** (or "API Keys") and copy into your note:
   - **Project URL**, like `https://abcd1234.supabase.co`. The part before `.supabase.co` (`abcd1234`) is your **project ref**.
   - **anon public key** (may be called **publishable key**). This one is safe to put in the app.

## 2. Create an access token for GitHub

1. In Supabase, open your account menu → **Access Tokens** (supabase.com/dashboard/account/tokens).
2. **Generate new token**, name it `github-jobflow`, copy it into your note. It is shown only once.

## 3. Give GitHub the three secrets

1. Open your repository on GitHub → **Settings → Secrets and variables → Actions → New repository secret**.
2. Add these three, one at a time:

| Name | Value |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | the token from step 2 |
| `SUPABASE_PROJECT_REF` | the project ref from step 1 (e.g. `abcd1234`) |
| `SUPABASE_DB_PASSWORD` | the database password from step 1 |

3. Open the **Actions** tab → **Deploy database** → **Run workflow**. When it shows a green tick, the tables and security rules are in your database.

## 4. Put the website on Cloudflare (free)

1. Go to **dash.cloudflare.com**, sign up free, open **Workers & Pages → Create → Import a repository**, choose your JobFlow repository.
2. Settings (the repository's `wrangler.jsonc` does the rest):
   - Project name: `jobflow`
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
3. **Deploy**. Cloudflare gives you an address like `https://jobflow.<your-name>.workers.dev`.
4. To connect the database, open the project → **Settings → Build → Variables and secrets** (build variables, not runtime ones) and add:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon public key
   Then **Deployments → Retry/Redeploy** so the site is rebuilt with them.

## 5. Tell Supabase where the website lives

In Supabase: **Authentication → URL Configuration**

- Site URL: your Cloudflare address, e.g. `https://jobflow.your-name.workers.dev`
- Redirect URLs, add all three:
  - `https://jobflow.your-name.workers.dev/**`
  - `http://localhost:5173/**` (for testing on a computer)
  - `com.rkdigitals.jobflow://auth/callback**` (the Android app)

This makes the "confirm your email", "reset password" and sign-in links open JobFlow, on the website or in the app.

### Sign in with an email code (no password)

On by default. One change makes the email show the code, not only a link:
**Authentication → Emails → Magic Link** (the template). Make sure the message contains `{{ .Token }}`, for example add the line
`Your JobFlow sign-in code: {{ .Token }}` and **Save**.

### Sign in with Google (free, optional)

1. Go to **console.cloud.google.com** with your Google account. Create a project named `JobFlow`.
2. **APIs & Services → OAuth consent screen**: choose **External**, app name `JobFlow`, your own email as support and developer contact. Add only the basic scopes (email, profile, openid). Then set the publishing status to **In production** so any Google account can sign in.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
   Under **Authorized redirect URIs** add `https://<your-project-ref>.supabase.co/auth/v1/callback`
   (Supabase shows this exact address on the Google provider page in the next step). **Create**.
4. Google shows a **Client ID** and **Client secret**. In Supabase open **Authentication → Sign In / Providers → Google**, switch it on, paste both, **Save**.
   The client secret goes only into Supabase. Do not paste it into chat, GitHub or any file.
5. Show the Google button: add the build variable `VITE_GOOGLE_SIGN_IN` = `true`
   - in Cloudflare (same place as step 4 of section 4), then redeploy;
   - in GitHub → **Settings → Secrets and variables → Actions → Variables** for the Android app.

Until step 5 is done the app hides the Google button, so nobody sees a button that fails.

### Support contact (optional)

The **Help & Support** screen and the sign-in pages show contact buttons only for details you give. Add either or both as build variables (Cloudflare and GitHub Variables, like above):

- `VITE_SUPPORT_EMAIL` = the email address that should receive support requests
- `VITE_SUPPORT_WHATSAPP` = WhatsApp number with country code, digits only (for India: 91 followed by the 10-digit number)

Without them, Help & Support still works and lets people copy their problem details to send you.

## 6. Check it works

1. Open your Cloudflare address. You should see **Sign in to JobFlow**, not demo data.
2. Tap **Create an account**, use your email, open the confirmation email, sign in. Also try **Email me a sign-in code instead**, and **Continue with Google** if you switched it on.
3. Create your business. You land on the dashboard.
4. Open **Settings**, invite a second email address of yours as Employee, copy the link, open it in a private browser window, create that account and join.

## Good to know

- **Backups:** switch on the free nightly encrypted backup: [docs/BACKUP.md](BACKUP.md). Do this before real data goes in.
- **Email limits:** Supabase's built-in email sends only a few messages per hour. That is enough for testing. Before customers sign up, a proper email service is needed; it will be proposed with its cost for your approval.
- **Free project pause:** a free Supabase project pauses after a week without use. Open the app now and then while testing. Before the first paying customer, the paid plan (about US$25/month) is needed; that also needs your approval.
- **Running locally (computer only):** copy `.env.example` to `.env.local`, fill in the two `VITE_` values, then `npm install` and `npm run dev`.
