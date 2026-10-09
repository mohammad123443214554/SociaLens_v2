'use client'

import { useEffect, useId, useRef } from 'react'
import Script from 'next/script'

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string
      reset: (widgetId?: string) => void
      remove: (widgetId?: string) => void
    }
  }
}

interface CaptchaProps {
  onVerify: (token: string) => void
  onExpire?: () => void
}

// A quiet, mostly-invisible check that runs before signup/login submit.
// The widget itself is just the client-side half - the token it produces
// still gets checked server-side (see /api/captcha/verify) before the
// actual signup or login goes through, since a bot could otherwise skip
// this component entirely and call Supabase directly.
export function Captcha({ onVerify, onExpire }: CaptchaProps) {
  const elementId = useId().replace(/:/g, '')
  const widgetIdRef = useRef<string | null>(null)
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  useEffect(() => {
    if (!siteKey) return
    const tryRender = () => {
      if (!window.turnstile || widgetIdRef.current) return
      widgetIdRef.current = window.turnstile.render(`#${elementId}`, {
        sitekey: siteKey,
        callback: onVerify,
        'expired-callback': () => onExpire?.(),
        theme: 'auto',
      })
    }
    tryRender()
    const interval = setInterval(tryRender, 300)
    return () => {
      clearInterval(interval)
      if (widgetIdRef.current) window.turnstile?.remove(widgetIdRef.current)
      widgetIdRef.current = null
    }
  }, [siteKey])

  if (!siteKey) return null

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" />
      <div id={elementId} className="flex justify-center" />
    </>
  )
}
