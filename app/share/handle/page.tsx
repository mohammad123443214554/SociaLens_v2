'use client'

import Link from 'next/link'
import { Sparkles } from 'lucide-react'

// Lands here whenever someone shares a photo, video, or link into
// SociaLens from another app's share sheet (see manifest.json's
// share_target and public/sw.js). Actually doing something with what was
// shared (e.g. "Add to Story") is planned for a future version of
// SociaLens - for now this just confirms the share came through instead
// of the person hitting a 404 or a raw server error.
export default function ShareHandlePage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center gap-4">
      <div className="h-16 w-16 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center">
        <Sparkles className="h-8 w-8 text-white" />
      </div>
      <h1 className="text-xl font-bold">Coming soon</h1>
      <p className="text-sm text-muted-foreground max-w-xs">
        Sharing content into SociaLens from other apps isn't available just yet - it's on the way in a future version.
      </p>
      <Link href="/feed" className="mt-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white text-sm font-semibold">
        Open SociaLens
      </Link>
    </div>
  )
}
