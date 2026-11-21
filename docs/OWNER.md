# Owner statistics (for RK Digitals only)

A private screen with JobFlow-wide numbers: sign-ups, active people, businesses, trials ending, paying customers, monthly revenue and recent businesses. Counts and business names only; it never shows a customer's jobs.

## Make your account the owner (once)

1. Sign up or sign in to JobFlow with your own email first.
2. Open Supabase → your project → **SQL Editor** → **New query**.
3. Paste this, put **your JobFlow sign-in email** between the quotes, and tap **Run**:

```sql
insert into private.platform_admins (user_id)
select id from auth.users where email = lower('your-email@example.com')
on conflict do nothing;
```

4. It should say `INSERT 0 1`. If it says `INSERT 0 0`, the email did not match an account: check the spelling in **Authentication → Users**.
5. In JobFlow, sign out and in again (or reload). Tap your initials (top right) → **Owner statistics**.

## Why only you can see it

- The owner list sits in a private part of the database that the app and website cannot read or change. Only the SQL Editor, behind your Supabase login, can add someone.
- Every time the screen loads, the database checks the signed-in account against that list and refuses anyone else.

To remove an owner: `delete from private.platform_admins where user_id = (select id from auth.users where email = lower('their-email'));`
