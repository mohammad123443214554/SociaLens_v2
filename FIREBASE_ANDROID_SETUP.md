# Firebase setup for the native Android app's push notifications

The website's own Web Push (VAPID keys) keeps working exactly as before -
this is only for the native Android app (built with Capacitor), which
needs Firebase Cloud Messaging (FCM) to reliably wake up in the
background/when fully closed, the same way Instagram/WhatsApp do it.

This is a one-time setup. Everything below is free (Firebase's "Spark"
plan covers this comfortably).

## 1. Create the Firebase project
1. Go to https://console.firebase.google.com → **Add project**.
2. Name it `SociaLens` (or anything - the name here is just a label).
3. You can turn off Google Analytics for this project, it isn't needed.

## 2. Add the Android app to it
1. Inside the new project → **Add app** → Android icon.
2. **Android package name**: must exactly match `appId` in `capacitor.config.ts`
   (currently `com.socialens.app`).
3. Download the `google-services.json` file it gives you.
4. Keep it - after you run `npx cap add android` (see the main build steps),
   drop this file into `android/app/google-services.json`. Bubblewrap/Capacitor's
   Android project needs it there to talk to Firebase at all.

## 3. Get the server-side credentials
The server needs to be able to *send* pushes via Firebase, which needs a
separate "service account" credential (different from the file above):

1. In Firebase Console → ⚙️ **Project settings** → **Service accounts** tab.
2. Click **Generate new private key** → confirm. This downloads a `.json` file.
3. Open that file. You need three values out of it:
   - `project_id`
   - `client_email`
   - `private_key`

## 4. Add them as environment variables in Vercel
In your Vercel project → **Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `FIREBASE_PROJECT_ID` | the `project_id` from the JSON |
| `FIREBASE_CLIENT_EMAIL` | the `client_email` from the JSON |
| `FIREBASE_PRIVATE_KEY` | the `private_key` from the JSON, **paste it exactly as-is, including the `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----` lines** |

Redeploy after adding these. Until all three are set, `lib/server/push.ts`
simply skips the Firebase part and only sends Web Push - nothing breaks,
native app users just won't get pushes yet.

## 5. Run the database migration
Run `supabase-migration-device-push-tokens.sql` against your Supabase
project (SQL Editor in the Supabase dashboard, paste and run) - this is
where the app saves each Android device's push token.

## 6. Add the SQL migration + this env setup, then rebuild
Once the three env vars are set and the migration has run, the native app
(after you build it with `npx cap sync android` and reinstall it on a
device) will register itself automatically - `lib/hooks/useNativePush.ts`
handles that the moment someone opens the app while logged in.

---

**What's still needed after this** (native Android code, added once
`npx cap add android` has generated the `android/` folder locally) is a
small Kotlin file that turns an incoming "call" push into the same
loud/ringing notification with Accept/Decline buttons that the website's
service worker already shows browser users. That file comes in the next
step of this build - This document only covers the Firebase account setup
itself.
