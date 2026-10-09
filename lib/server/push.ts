import webpush from 'web-push'
import firebaseAdmin from 'firebase-admin'
import { createAdminClient } from '@/lib/supabase/admin'

// Generated once for this project - a VAPID key pair just identifies "this
// server" to the push service, it isn't a per-deployment secret you need
// to rotate. Reads from an env var if one's set (recommended once this
// repo is public/shared, so the private half isn't sitting in source
// control) and falls back to the original baked-in pair otherwise, so
// nothing breaks if you don't set one. (The public half is also in
// usePushSubscription.ts - both halves have to match.)
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BGI4kJnzbedMSJ9-cgol7_P8MnNzsyXzGjSG6QZwSZtKX1qCXvrcoxuXvH9FwDNrW0-rjpf8aZWBMcGn9EYrT1k'
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'NXrDfGWfCOQQWysEldmbeAB3hdepebohRluzEXFf1fQ'

let configured = false
function ensureConfigured() {
  if (configured) return
  webpush.setVapidDetails('mailto:support@socialens.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  configured = true
}

// Firebase Cloud Messaging - the native Android app's equivalent of Web
// Push, since the app's WebView (unlike a real Chrome tab) can't reliably
// wake up in the background on its own. Only initializes once these three
// env vars exist (from a Firebase project's service-account JSON: see
// FIREBASE_ANDROID_SETUP.md) - until they're set, this quietly no-ops so
// the website's own Web Push keeps working exactly as before either way.
let firebaseApp: firebaseAdmin.app.App | null | undefined
function getFirebaseApp() {
  if (firebaseApp !== undefined) return firebaseApp
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) {
    firebaseApp = null
    return firebaseApp
  }
  firebaseApp = firebaseAdmin.apps.length
    ? firebaseAdmin.app()
    : firebaseAdmin.initializeApp({ credential: firebaseAdmin.credential.cert({ projectId, clientEmail, privateKey }) })
  return firebaseApp
}

export interface PushPayload {
  title: string
  body: string
  url: string
  /** 'call' shows Accept/Decline actions and a distinct look in the service worker (web) and the native Android notification. */
  kind?: 'call' | 'message' | 'generic'
  tag?: string
  callId?: string
  chatId?: string
}

async function sendWebPushToUser(admin: ReturnType<typeof createAdminClient>, userId: string, payload: PushPayload) {
  ensureConfigured()

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (!subs || subs.length === 0) return

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        )
      } catch (err: any) {
        // 404/410 = the subscription is dead (user revoked permission,
        // uninstalled, etc.) - clean it up so we stop trying.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id)
        }
      }
    })
  )
}

async function sendFcmToUser(admin: ReturnType<typeof createAdminClient>, userId: string, payload: PushPayload) {
  const app = getFirebaseApp()
  if (!app) return // Firebase not configured yet - see FIREBASE_ANDROID_SETUP.md

  const { data: tokens } = await admin
    .from('device_push_tokens')
    .select('id, token')
    .eq('user_id', userId)

  if (!tokens || tokens.length === 0) return

  const messaging = firebaseAdmin.messaging(app)

  await Promise.all(
    tokens.map(async (row) => {
      try {
        await messaging.send({
          token: row.token,
          // Sent as `data` only (no `notification` block) on purpose: a
          // plain FCM "notification" payload gets shown by Android itself
          // with a generic look whenever the app isn't in the foreground -
          // there's no way to add Accept/Decline actions or a distinct
          // ringtone to that. A data-only message instead always reaches
          // this app's own code (see FIREBASE_ANDROID_SETUP.md for the
          // native handler), even while fully closed, which builds the
          // notification itself - the same custom call look the web
          // service worker already gives browser/PWA users.
          data: {
            title: payload.title,
            body: payload.body,
            url: payload.url,
            kind: payload.kind || 'generic',
            tag: payload.tag || '',
            callId: payload.callId || '',
            chatId: payload.chatId || '',
          },
          android: { priority: 'high' },
        })
      } catch (err: any) {
        // Same idea as the Web Push cleanup above - an invalid/unregistered
        // token means the app was uninstalled, reinstalled, or the token
        // simply rotated (FCM tokens aren't permanent).
        if (
          err?.code === 'messaging/registration-token-not-registered' ||
          err?.code === 'messaging/invalid-registration-token'
        ) {
          await admin.from('device_push_tokens').delete().eq('id', row.id)
        }
      }
    })
  )
}

/**
 * Notifies every device a user has - browsers/PWAs via Web Push, and the
 * native Android app via Firebase Cloud Messaging - so a call or message
 * reaches them even when SociaLens isn't open anywhere. Callers (see
 * app/api/push/notify-call and notify-message) don't need to know or care
 * which kind of device someone's on; this fans out to both automatically,
 * and either half quietly does nothing for a user who has no devices of
 * that kind.
 */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  const admin = createAdminClient()
  await Promise.all([sendWebPushToUser(admin, userId, payload), sendFcmToUser(admin, userId, payload)])
}
