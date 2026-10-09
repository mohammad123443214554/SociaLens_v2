'use client'

import { Mic, Video, ShieldCheck, LockKeyhole, ExternalLink } from 'lucide-react'
import type { CallType } from '@/lib/hooks/useCall'

interface PermissionGateProps {
  mode: 'prompt' | 'blocked'
  type: CallType
  peerName: string
  onAllow: () => void
  onCancel: () => void
}

function isInstalledStandaloneApp() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)')?.matches || (window.navigator as any).standalone === true
}

/**
 * Shown before we ever touch the browser's real getUserMedia prompt.
 *
 * mode="prompt": first time asking - a friendly explainer with our own
 * "Allow" button. Clicking it IS the user gesture that lets the browser's
 * Native permission dialog appear right after - people are far more
 * likely to hit "Allow" there when they already understand why.
 *
 * mode="blocked": access was already explicitly denied for this site at
 * the browser level. No in-app button can undo that - only changing the
 * browser's own site setting can - so this shows exactly how to do that
 * instead of just failing quietly.
 *
 * On some Android phones (MIUI/Xiaomi especially), an installed home-screen
 * PWA never surfaces the camera/mic permission prompt at all - the request
 * silently fails with no dialog, even on a fresh install. Since there's no
 * in-app fix for that, we point people to open the same page in a normal
 * browser tab instead, which reliably shows the real permission prompt.
 */
export function PermissionGate({ mode, type, peerName, onAllow, onCancel }: PermissionGateProps) {
  const needsCamera = type === 'video'
  const standalone = isInstalledStandaloneApp()

  return (
    <div className="fixed inset-0 bg-neutral-950 z-[200] flex flex-col items-center justify-center text-white px-6 text-center">
      <div className="h-20 w-20 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center mb-6">
        {mode === 'blocked' ? <LockKeyhole className="h-9 w-9" /> : (needsCamera ? <Video className="h-9 w-9" /> : <Mic className="h-9 w-9" />)}
      </div>

      {mode === 'prompt' ? (
        <>
          <h2 className="text-xl font-bold mb-2">Allow microphone{needsCamera ? ' & camera' : ''} access</h2>
          <p className="text-white/60 text-sm max-w-xs mb-8">
            SociaLens needs your {needsCamera ? 'microphone and camera' : 'microphone'} to connect this call with {peerName}.
            Your browser will ask you to confirm next.
          </p>
          <button
            onClick={onAllow}
            className="w-full max-w-xs py-3.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 font-medium mb-3"
          >
            Allow {needsCamera ? 'Camera & Microphone' : 'Microphone'}
          </button>
        </>
      ) : (
        <>
          <h2 className="text-xl font-bold mb-2">{needsCamera ? 'Camera & microphone' : 'Microphone'} access is blocked</h2>
          <p className="text-white/60 text-sm max-w-xs mb-4">
            You (or your browser) blocked this earlier, so it won't ask again automatically. Fix it in a few taps:
          </p>
          <ol className="text-left text-sm text-white/70 max-w-xs space-y-2 mb-8 bg-white/5 rounded-xl p-4">
            <li>1. Tap the lock/site-info icon next to the address bar</li>
            <li>2. Find "Microphone"{needsCamera ? ' and "Camera"' : ''}, set to <span className="text-white font-medium">Allow</span></li>
            <li>3. Reload this page</li>
          </ol>
          <button
            onClick={onAllow}
            className="w-full max-w-xs py-3.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 font-medium mb-3"
          >
            I've fixed it - Try Again
          </button>
        </>
      )}

      {standalone && (
        <button
          onClick={() => window.open(window.location.href, '_blank')}
          className="w-full max-w-xs py-3 rounded-xl bg-white/10 font-medium mb-3 flex items-center justify-center gap-2 text-sm"
        >
          <ExternalLink className="h-4 w-4" /> Open in browser instead
        </button>
      )}
      {standalone && (
        <p className="text-white/40 text-xs max-w-xs mb-2">
          Not asking, even after trying? Some phones don't show the permission popup inside an installed app - opening this in your regular browser (Chrome/etc) usually fixes it.
        </p>
      )}

      <button onClick={onCancel} className="text-white/50 text-sm py-2">
        Cancel call
      </button>

      <p className="flex items-center gap-1.5 text-[11px] text-white/30 mt-8">
        <ShieldCheck className="h-3 w-3" /> SociaLens only uses this while you're on a call
      </p>
    </div>
  )
}
