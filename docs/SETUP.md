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

## 4. Put the website on Cloudflare Pages

1. Go to **dash.cloudflare.com**, sign up free, open **Workers & Pages → Create → Pages → Connect to Git**, choose your JobFlow repository.
2. Build settings:
   - Framework preset: **None**
   - Build command: `npm run build`
   - Build output directory: `dist`
3. Environment variables (add each):
   - `NODE_VERSION` = `22`
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon public key
4. **Save and Deploy**. Cloudflare gives you an address like `https://jobflow-xyz.pages.dev`.

## 5. Tell Supabase where the website lives

In Supabase: **Authentication → URL Configuration**

- Site URL: your Cloudflare address, e.g. `https://jobflow-xyz.pages.dev`
- Redirect URLs, add both:
  - `https://jobflow-xyz.pages.dev/**`
  - `http://localhost:5173/**` (for testing on a computer)

This makes the "confirm your email" and "reset password" links open JobFlow.

## 6. Check it works

1. Open your Cloudflare address. You should see **Sign in to JobFlow**, not demo data.
2. Tap **Create an account**, use your email, open the confirmation email, sign in.
3. Create your business. You land on the dashboard.
4. Open **Settings**, invite a second email address of yours as Employee, copy the link, open it in a private browser window, create that account and join.

## Good to know

- **Email limits:** Supabase's built-in email sends only a few messages per hour. That is enough for testing. Before customers sign up, a proper email service is needed; it will be proposed with its cost for your approval.
- **Free project pause:** a free Supabase project pauses after a week without use. Open the app now and then while testing. Before the first paying customer, the paid plan (about US$25/month) is needed; that also needs your approval.
- **Running locally (computer only):** copy `.env.example` to `.env.local`, fill in the two `VITE_` values, then `npm install` and `npm run dev`.
