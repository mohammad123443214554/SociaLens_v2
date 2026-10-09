'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// The other half of lib/utils/googleSignIn.ts's native flow: once someone
// finishes signing in with Google in the system browser, Supabase
// redirects that browser to com.socialens.app://login-callback?code=...,
// Which Android hands to this app (see the intent-filter added to
// AndroidManifest.xml in ANDROID_NATIVE_SETUP.md) as an "app opened via
// URL" event. This listens for exactly that, exchanges the code for a
// real session the same way app/api/auth/callback/route.ts does for the
// website, and sends the person into the app - mirroring that route's
// first-time-Google-user → /onboarding redirect too, since native
// sign-ins never go through that server route at all.
//
// Mounted once in the root layout, active on every screen (including
// the login/signup pages, since that's where sign-in actually starts) -
// does nothing at all on the website (isNativePlatform() is false there).
export function NativeAuthBridge() {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    let removeListener: (() => void) | undefined

    async function setup() {
      let Capacitor: typeof import('@capacitor/core').Capacitor
      try {
        ;({ Capacitor } = await import('@capacitor/core'))
      } catch {
        return
      }
      if (!Capacitor.isNativePlatform()) return

      const [{ App }, { Browser }] = await Promise.all([import('@capacitor/app'), import('@capacitor/browser')])
      const supabase = createClient()

      const subscription = await App.addListener('appUrlOpen', async ({ url }) => {
        if (!url.startsWith('com.socialens.app://login-callback')) return
        try {
          await Browser.close()
        } catch {
          // Already closed, or never opened via Browser.open() - fine either way.
        }

        const code = new URL(url).searchParams.get('code')
        if (!code || cancelled) return

        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
        if (error || !data.user || cancelled) return

        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', data.user.id)
          .single()

        router.push(profile && profile.onboarding_completed === false ? '/onboarding' : '/feed')
      })
      removeListener = () => subscription.remove()
    }

    setup()
    return () => {
      cancelled = true
      removeListener?.()
    }
  }, [router])

  return null
}
