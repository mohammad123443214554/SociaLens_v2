import Link from 'next/link'
import { ArrowLeft, FolderOpen } from 'lucide-react'
import { StudioBrandLink } from '@/components/studio/StudioBrandLink'

export default function SociaLensStudioPage() {
  return (
    <main className="min-h-screen bg-[#070914] px-4 py-6 text-white sm:px-8 sm:py-10">
      <div className="mx-auto w-full max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <img src="/images/socialens-studio-logo.png" alt="SociaLens Studio" className="h-11 w-11 object-contain" />
            <div><h1 className="text-xl font-bold tracking-tight sm:text-2xl">SociaLens Studio</h1><p className="text-xs text-slate-400 sm:text-sm">Create. Edit. Express.</p></div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/create/options" className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5"><ArrowLeft className="h-4 w-4" /><span>Back</span></Link>
          </div>
        </header>
        <section className="mx-auto flex min-h-[65vh] max-w-3xl flex-col items-center justify-center py-16 text-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.03] p-3 shadow-[0_0_60px_rgba(139,92,246,0.12)]">
            <img src="/images/socialens-studio-logo.png" alt="" className="h-full w-full object-contain" />
          </div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Your creative workspace</p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">Create something <span className="bg-gradient-to-r from-pink-400 via-violet-400 to-cyan-300 bg-clip-text text-transparent">remarkable.</span></h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">A new space for your photos and videos, built right into SociaLens. Your creative journey starts here.</p>
          <div className="mt-9 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-medium text-slate-400"><FolderOpen className="h-4 w-4" /> Your Studio workspace</div>
        </section>
      </div>
    </main>
  )
}
