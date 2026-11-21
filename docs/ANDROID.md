# JobFlow Android app (APK)

GitHub builds the Android app automatically every time the code changes. The app carries the whole JobFlow interface inside it, so it opens and works without internet from the first launch. It uses the same cloud database as the website.

## Download and install on a phone

1. On the phone, open **github.com/kalpeshkatare010-crypto/Jobflow-/releases/tag/android-latest** (signed in to GitHub if the repository is private).
2. Under **Assets**, tap the file ending in `.apk`.
3. When Android asks, allow your browser to **install unknown apps** (one time).
4. Open the downloaded file and tap **Install**.

To update later, download the newest `.apk` from the same page and install it over the old one. Your data stays.

## Signed builds (do this once, before sharing the app)

Without a signing key, GitHub makes a **TEST** build (file name ends in `-TEST.apk`). Each test build is signed with a different temporary key, so Android refuses to update one over another: you must uninstall first, which deletes the data saved on that phone.

With your own key every build updates the previous one. To set it up:

1. Open the private file `JobFlow-signing-key-PRIVATE.txt` you received. Keep a backup of it somewhere safe.
2. GitHub → Jobflow- → **Settings → Secrets and variables → Actions → New repository secret**.
3. Add `ANDROID_KEYSTORE_PASSWORD` with the password from the file.
4. Add `ANDROID_KEYSTORE_BASE64` with the long line from the file.
5. **Actions** tab → **Android app** → **Run workflow**. The next APK is signed (no `-TEST` in the name).

If you installed a TEST build, uninstall it once before installing the first signed build.

## Connecting the app to the database

The app is connected through the public values in `.env.android` (Project URL and publishable key). Every build GitHub makes uses them; nothing to set.

## Good to know

- Email links (confirm account, reset password) open the website, not the app. After confirming, sign in inside the app with your email and password.
- Google Play listing is a separate step (Google charges a one-time US$25 developer fee; needs approval).
- Developers: `npm run build:android` builds the web app and copies it into `android/`; icons come from `scripts/generate-android-assets.mjs`.
