# Backups

The free Supabase plan does not back up your database. JobFlow's **Back up database** workflow does it every night at about 02:47 India time.

## Switch it on (once)

1. Make up a long passphrase, at least 20 characters, for example five unrelated words with numbers. Write it down on paper or in a password manager. **Without it, no backup can ever be opened, by you or anyone.**
2. GitHub → your repository → **Settings → Secrets and variables → Actions → New repository secret**:
   name `BACKUP_PASSPHRASE`, value your passphrase. Do not paste it into chat or any file.
3. The workflow also uses the three Supabase secrets you added for "Deploy database".
4. Test it now: **Actions → Back up database → Run workflow**. A green tick means a backup was made, encrypted, and checked.

## Where backups are

**Actions → Back up database →** a run **→ Artifacts**. Each is one file, `jobflow-backup-YYYY-MM-DD.tar.gz.gpg`, kept for 30 days.

Your repository is public, so other GitHub users could download these files, but they are encrypted with AES-256 and cannot be read without your passphrase.

## Restore (only when needed)

Do this on a computer, ideally with someone technical. It needs the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), `gpg` and `psql`.

1. Download the backup file and unlock it:
   ```bash
   gpg --decrypt jobflow-backup-2026-11-21.tar.gz.gpg > backup.tar.gz
   tar -xzf backup.tar.gz
   ```
2. Create a new, empty Supabase project (or use the broken one if its database is empty). Copy its connection string from **Project Settings → Database → Connection string (URI)**.
3. Load roles, then schema, then data, in one go:
   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file backup/roles.sql --file backup/schema.sql \
     --command 'SET session_replication_role = replica' \
     --file backup/data.sql \
     --dbname "YOUR_CONNECTION_STRING"
   ```
4. Point the app at the restored project (update `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Cloudflare and GitHub if it is a new project), then sign in and check a few jobs.

Practise a restore once, into a spare free project, before the first paying customer (decision C-07).
