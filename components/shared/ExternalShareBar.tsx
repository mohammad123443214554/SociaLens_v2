'use client'

import { useState } from 'react'
import { Share2, Check, Loader2 } from 'lucide-react'

declare global {
  interface Window {
    SociaLensNativeShare?: {
      share: (title: string, text: string, url: string) => void
    }
  }
}

interface ExternalShareBarProps {
  // Called only when the user actually taps the button - builds/returns the
  // public share link (and can do any side effect needed to create it,
  // like an Aperonix reply which has to be saved somewhere public first).
  getShareUrl: () => Promise<string> | string
  shareTitle: string
  shareText: string
}

// On the SociaLens Android shell, use the native Kotlin bridge so the
// Android Sharesheet opens even on WebViews where navigator.share is absent.
// In a normal browser, use Web Share API and finally clipboard as fallback.
export function ExternalShareBar({ getShareUrl, shareTitle, shareText }: ExternalShareBarProps) {
  const [preparing, setPreparing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleShare = async () => {
    setError(null)
    setPreparing(true)
    try {
      const url = await getShareUrl()
      // Native Android bridge is installed by MainActivity in the APK.
      // It invokes Intent.createChooser(ACTION_SEND), showing installed apps.
      if (typeof window !== 'undefined' && window.SociaLensNativeShare) {
        window.SociaLensNativeShare.share(shareTitle, shareText, url)
      } else if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({ title: shareTitle, text: shareText, url })
        } catch {
          // The user dismissed the native share sheet; this is not an error.
        }
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      } else {
        setError('Sharing is not available on this device.')
      }
    } catch {
      setError("Couldn't create a share link. Please try again.")
    } finally {
      setPreparing(false)
    }
  }

  return (
    <div className="px-4 py-3 border-b space-y-2">
      <button
        onClick={handleShare}
        disabled={preparing}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-pink-500/40 hover:bg-pink-500/5 text-sm font-medium transition-colors disabled:opacity-60"
      >
        {preparing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : copied ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Share2 className="h-4 w-4" />
        )}
        {preparing ? 'Preparing link...' : copied ? 'Link copied!' : 'Share outside SociaLens'}
      </button>
      {error && <p className="text-xs text-red-500 text-center">{error}</p>}
      <p className="text-center text-[11px] text-muted-foreground leading-relaxed">
        Opens your phone's own share menu (WhatsApp, Messages & more). Anyone who opens the link can view it - no sign-in needed.
      </p>
    </div>
  )
}
