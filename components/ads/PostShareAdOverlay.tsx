'use client'

import { NativeAdUnit } from './NativeAdUnit'

// Fills the natural pause between tapping Share and the post actually
// finishing - the same kind of brief, low-friction interstitial big apps
// show during an unavoidable short wait, rather than a blank spinner.
// Auto-dismisses itself (see the minimum-display timer in
// CreatePostModal's handlePost), so there's nothing for the person to
// tap through or get annoyed by.
export function PostShareAdOverlay() {
  return (
    <div className="fixed inset-0 bg-background z-[300] flex flex-col items-center justify-center gap-4 px-6">
      <p className="text-xs font-medium text-muted-foreground tracking-wide">Sponsored</p>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden border bg-card">
        <NativeAdUnit background="var(--card, #fff)" />
      </div>
      <p className="text-sm text-muted-foreground">Posting...</p>
    </div>
  )
}
