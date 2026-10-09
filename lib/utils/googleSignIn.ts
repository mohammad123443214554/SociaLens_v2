'use client'

import { createClient } from '@/lib/supabase/client'

// Google actively refuses to show its own sign-in page inside an
// embedded WebView like the one the native Android app runs in (it
// detects the WebView's user-agent and blocks it as a phishing-risk
// surface - "disallowed_useragent") - this is a Google security policy,
// not something SociaLens's code can work around by tweaking the
// request. Every real app (Instagram included) works around it the same
// way: open Google's page in the device's actual browser instead, then
// hand control back to the app afterwards via a deep link. This constant
// is that deep link's address, and must also be added to Supabase's
// Authentication → URL Configuration → Redirect URLs allow-list (a
// dashboard setting, not code) or Supabase will refuse to redirect here.
const NATIVE_REDIRECT = 'com.socialens.app://login-callback'

/**
 * Starts Google sign-in. On the website this is unchanged - Supabase
 * redirects the whole page to Google and back, exactly as it always has.
 * Inside the native app it opens Google's page in the system browser
 * instead; see NativeAuthBridge.tsx for the other half (catching the
 * deep link back and finishing sign-in).
 */
export async function signInWithGoogle(): Promise<{ error: string | null }> {
  const supabase = createClient()

  let isNative = false
  try {
    const { Capacitor } = await import('@capacitor/core')
    isNative = Capacitor.isNativePlatform()
  } catch {
    isNative = false
  }

  if (!isNative) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    })
    return { error: error?.message ?? null }
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true },
  })
  if (error || !data?.url) return { error: error?.message ?? 'Could not start Google sign-in' }

  const { Browser } = await import('@capacitor/browser')
  await Browser.open({ url: data.url })
  return { error: null }
}
