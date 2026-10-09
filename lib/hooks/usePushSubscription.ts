'use client'

import { useEffect } from 'react'

// Same public key as lib/server/push.ts - safe to have in client code,
// that's what the "public" half of a VAPID key pair is for.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BGI4kJnzbedMSJ9-cgol7_P8MnNzsyXzGjSG6QZwSZtKX1qCXvrcoxuXvH9FwDNrW0-rjpf8aZWBMcGn9EYrT1k'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

/**
 * Web Push is used by the normal browser/PWA version. The native Android
 * shell has its own FCM registration, so keeping a Web Push subscription in
 * the WebView would make the same call arrive through two notification paths.
 * On native Android we therefore remove any old Web Push subscription and
 * leave FCM as the only native notification transport.
 */
export function usePushSubscription(userId?: string) {
  useEffect(() => {
    if (!userId) return

    let cancelled = false

    ;(async () => {
      let Capacitor: typeof import('@capacitor/core').Capacitor
      try {
        ;({ Capacitor } = await import('@capacitor/core'))
      } catch {
        Capacitor = null as unknown as typeof import('@capacitor/core').Capacitor
      }

      if (Capacitor?.isNativePlatform()) {
        try {
          if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.ready
            const subscription = await registration.pushManager.getSubscription()
            if (subscription) {
              const endpoint = subscription.endpoint
              await subscription.unsubscribe()
              if (!cancelled) {
                await fetch('/api/push/subscribe', {
                  method: 'DELETE',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ endpoint }),
                })
              }
            }
          }
        } catch (err) {
          console.error('[push] native web-push cleanup failed', err)
        }
        return
      }

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

      try {
        if (Notification.permission === 'default') {
          const result = await Notification.requestPermission()
          if (result !== 'granted') return
        }
        if (Notification.permission !== 'granted') return

        const registration = await navigator.serviceWorker.ready
        let subscription = await registration.pushManager.getSubscription()
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          })
        }
        if (cancelled) return

        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        })
      } catch (err) {
        console.error('[push] subscription setup failed', err)
      }
    })()

    return () => { cancelled = true }
  }, [userId])
}
