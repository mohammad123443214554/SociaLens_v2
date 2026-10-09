'use client'

import { useEffect } from 'react'

// Mirrors usePushSubscription.ts, but for the native Android app instead
// of a browser. `@capacitor/core` and `@capacitor/push-notifications` are
// only real packages once `npm install` has run with Capacitor added
// (see package.json) - on the live website (not inside the native app)
// `Capacitor.isNativePlatform()` is simply false and this hook does
// nothing, so it's always safe to mount everywhere the web app already
// mounts usePushSubscription.
//
// Dynamically imported (not a top-level `import`) so the website build
// never needs these native-only packages to be resolvable - only the
// Capacitor-built Android app actually loads this code path.
export function useNativePush(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return
    let cancelled = false

    async function register() {
      let Capacitor: typeof import('@capacitor/core').Capacitor
      try {
        ;({ Capacitor } = await import('@capacitor/core'))
      } catch {
        return // Not running inside the Capacitor app - nothing to do.
      }
      if (!Capacitor.isNativePlatform()) return

      const { PushNotifications } = await import('@capacitor/push-notifications')

      const permission = await PushNotifications.checkPermissions()
      if (permission.receive !== 'granted') {
        const requested = await PushNotifications.requestPermissions()
        if (requested.receive !== 'granted') return
      }

      const saveToken = async (token: string) => {
        try {
          await fetch('/api/push/register-device', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, platform: Capacitor.getPlatform() }),
          })
        } catch {
          // Best-effort - a missed registration just means this one device
          // won't get native pushes until the app is next opened.
        }
      }

      const registrationListener = await PushNotifications.addListener('registration', (token) => {
        if (!cancelled) saveToken(token.value)
      })
      await PushNotifications.addListener('registrationError', () => {
        // Nothing actionable client-side - the person just won't get
        // native push on this device until it succeeds on a later launch.
      })

      await PushNotifications.register()

      return () => {
        registrationListener.remove()
      }
    }

    const cleanupPromise = register()
    return () => {
      cancelled = true
      cleanupPromise.then((cleanup) => cleanup?.())
    }
  }, [userId])
}
