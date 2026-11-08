'use client'

import Link from 'next/link'

export function StudioBrandLink({ className = '', compactOnMobile = true }: { className?: string; compactOnMobile?: boolean }) {
  return (
    <Link href="/studio" aria-label="Open SociaLens Studio" title="SociaLens Studio" className={`inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:border-pink-500/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 ${className}`}>
      <img src="/images/socialens-studio-logo.png" alt="" className="h-7 w-7 shrink-0 object-contain" />
      <span className={compactOnMobile ? 'hidden md:inline' : 'inline'}>SociaLens Studio</span>
    </Link>
  )
}
