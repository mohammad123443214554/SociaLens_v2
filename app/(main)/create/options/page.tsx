import Link from 'next/link'
import { ArrowLeft, ImagePlus, Sparkles } from 'lucide-react'

export default function CreateOptionsPage() {
  return (
    <main className="mx-auto min-h-[calc(100vh-3.5rem)] w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center gap-3">
        <Link href="/feed" aria-label="Back to Home" className="flex h-10 w-10 items-center justify-center rounded-full border border-border transition hover:bg-accent"><ArrowLeft className="h-5 w-5" /></Link>
        <div><h1 className="text-2xl font-bold tracking-tight">Create</h1><p className="text-sm text-muted-foreground">Choose how you want to create today.</p></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/create" className="group flex min-h-52 flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-pink-500/50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pink-500/10 text-pink-400"><ImagePlus className="h-6 w-6" /></div>
          <div><h2 className="text-xl font-bold">Create Post or Reel</h2><p className="mt-1 text-sm text-muted-foreground">Share photos, videos and updates with your SociaLens community.</p></div>
          <span className="mt-5 text-sm font-semibold text-pink-400">Open Create Post <span aria-hidden="true">→</span></span>
        </Link>
        <Link href="/studio" className="group flex min-h-52 flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-500/50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
          <div className="flex h-14 w-14 items-center justify-center"><img src="/images/socialens-studio-logo.png" alt="" className="h-full w-full object-contain" /></div>
          <div><h2 className="text-xl font-bold">SociaLens Studio</h2><p className="mt-1 text-sm text-muted-foreground">A dedicated creative workspace for photo and video projects.</p></div>
          <span className="mt-5 text-sm font-semibold text-violet-400">Open Studio <span aria-hidden="true">→</span></span>
        </Link>
      </div>
    </main>
  )
}
