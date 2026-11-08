'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, Clapperboard, FolderOpen, Image as ImageIcon, Layers3, Plus, Sparkles, Video } from 'lucide-react'

type Mode = 'photo' | 'video'
type Step = 'home' | 'setup' | 'templates'
type Flow = { step: Step; mode: Mode | null; name: string; created: boolean }
const initialFlow: Flow = { step: 'home', mode: null, name: '', created: false }

function readFlow(): Flow {
  if (typeof window === 'undefined') return initialFlow
  const p = new URLSearchParams(window.location.search)
  const mode = p.get('mode') === 'photo' || p.get('mode') === 'video' ? p.get('mode') as Mode : null
  const requested = p.get('step')
  if (!mode || (requested !== 'setup' && requested !== 'templates')) return initialFlow
  const created = p.get('created') === '1'
  return { step: requested === 'templates' && created ? 'templates' : 'setup', mode, name: p.get('name') || '', created }
}

function pushFlow(flow: Flow, replace = false) {
  const p = new URLSearchParams()
  if (flow.step !== 'home') p.set('step', flow.step)
  if (flow.mode) p.set('mode', flow.mode)
  if (flow.name.trim()) p.set('name', flow.name.trim())
  if (flow.created) p.set('created', '1')
  const query = p.toString()
  const url = query ? '/studio?' + query : '/studio'
  if (replace) window.history.replaceState({ studio: true }, '', url)
  else window.history.pushState({ studio: true }, '', url)
}

const modeCopy = {
  photo: { title: 'Photo Studio', subtitle: 'Create polished graphics, posts and visual designs.', format: 'Still image project', icon: ImageIcon, panel: 'border-pink-400/25 bg-gradient-to-br from-pink-500/15 via-[#171326] to-[#101426]', iconBox: 'border-pink-300/20 bg-pink-400/10 text-pink-300', action: 'Create Photo Project' },
  video: { title: 'Video Studio', subtitle: 'Create engaging videos, stories and short-form content.', format: 'Video project', icon: Video, panel: 'border-violet-400/25 bg-gradient-to-br from-violet-500/15 via-[#15152a] to-[#101426]', iconBox: 'border-violet-300/20 bg-violet-400/10 text-violet-300', action: 'Create Video Project' },
}

export function StudioWorkspace() {
  const [flow, setFlow] = useState<Flow>(initialFlow)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const sync = () => setFlow(readFlow())
    sync()
    setReady(true)
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  const navigate = useCallback((next: Flow, replace = false) => {
    pushFlow(next, replace)
    setFlow(next)
  }, [])

  const back = () => {
    if (flow.step === 'templates' && flow.mode) navigate({ ...flow, step: 'setup', created: false })
    else navigate(initialFlow)
  }

  const createProject = () => {
    if (!flow.mode || !flow.name.trim()) return
    navigate({ ...flow, step: 'templates', name: flow.name.trim(), created: true })
  }

  if (!ready) return <main className="fixed inset-0 z-[60] grid place-items-center bg-[#080a13] text-sm text-slate-400">Opening SociaLens Studio…</main>

  const details = flow.mode ? modeCopy[flow.mode] : null
  const ModeIcon = details?.icon

  return (
    <main className="fixed inset-0 z-[60] flex min-h-dvh flex-col overflow-hidden bg-[#080a13] text-white">
      <header className="z-20 flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#0d1020] px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={back} aria-label="Go back" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 text-slate-300 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"><ArrowLeft className="h-4 w-4" /></button>
          <img src="/images/socialens-studio-logo.png" alt="SociaLens Studio" className="h-9 w-9 shrink-0 object-contain" />
          <div className="min-w-0"><p className="truncate text-sm font-bold tracking-tight">SociaLens Studio</p><p className="truncate text-[11px] text-slate-500">Create. Edit. Express.</p></div>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-slate-400 sm:flex"><Sparkles className="h-3.5 w-3.5 text-pink-400" />{flow.step === 'home' ? 'Choose creation type' : flow.step === 'setup' ? 'New project' : 'Project starting point'}</div>
        <Link href="/create/options" className="rounded-lg px-3 py-2 text-xs font-medium text-slate-400 transition hover:bg-white/5 hover:text-white">Exit Studio</Link>
      </header>

      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[radial-gradient(ellipse_at_50%_0%,rgba(91,58,160,0.18),transparent_48%),#090c17]">
        {flow.step === 'home' && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-5 py-12 sm:px-8">
            <div className="mb-10 text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]"><Layers3 className="h-7 w-7 text-pink-300" /></div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.24em] text-pink-300">SociaLens Studio</p>
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">What would you like to create?</h1>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-400">Choose a creation type to start a new project and enter its dedicated workflow.</p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <button type="button" onClick={() => navigate({ step: 'setup', mode: 'photo', name: 'Untitled photo project', created: false })} className="group relative min-h-[230px] overflow-hidden rounded-2xl border border-pink-400/20 bg-gradient-to-br from-pink-500/15 via-[#171326] to-[#101426] p-6 text-left transition duration-200 hover:-translate-y-1 hover:border-pink-400/50 hover:shadow-[0_20px_70px_rgba(219,39,119,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400">
                <div className="absolute -right-10 -top-12 h-48 w-48 rounded-full bg-pink-500/10 blur-3xl transition group-hover:bg-pink-500/20" />
                <div className="relative flex h-full flex-col"><div className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl border border-pink-300/20 bg-pink-400/10"><ImageIcon className="h-7 w-7 text-pink-300" /></div><div className="mt-auto flex items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Photo</h2><p className="mt-2 max-w-xs text-xs leading-5 text-slate-400">Design posts, stories, announcements and graphics.</p></div><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink-500/15 text-pink-200 transition group-hover:translate-x-1"><ArrowRight className="h-5 w-5" /></span></div></div>
              </button>
              <button type="button" onClick={() => navigate({ step: 'setup', mode: 'video', name: 'Untitled video project', created: false })} className="group relative min-h-[230px] overflow-hidden rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-500/15 via-[#15152a] to-[#101426] p-6 text-left transition duration-200 hover:-translate-y-1 hover:border-violet-400/50 hover:shadow-[0_20px_70px_rgba(124,58,237,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                <div className="absolute -right-10 -top-12 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl transition group-hover:bg-violet-500/20" />
                <div className="relative flex h-full flex-col"><div className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-300/20 bg-violet-400/10"><Clapperboard className="h-7 w-7 text-violet-300" /></div><div className="mt-auto flex items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Video</h2><p className="mt-2 max-w-xs text-xs leading-5 text-slate-400">Prepare reels, stories, shorts and creative videos.</p></div><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-violet-200 transition group-hover:translate-x-1"><ArrowRight className="h-5 w-5" /></span></div></div>
              </button>
            </div>
            <p className="mt-8 text-center text-[11px] text-slate-600">Photo and Video use one unified SociaLens Studio.</p>
          </div>
        )}

        {flow.step === 'setup' && details && ModeIcon && (
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-10 sm:px-8">
            <button type="button" onClick={back} className="mb-7 inline-flex w-fit items-center gap-2 text-xs font-medium text-slate-400 transition hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to creation type</button>
            <div className={'rounded-3xl border p-6 sm:p-8 ' + details.panel}>
              <div className="flex items-center gap-4"><div className={'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border ' + details.iconBox}><ModeIcon className="h-7 w-7" /></div><div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">New {flow.mode} project</p><h1 className="mt-1 text-2xl font-bold">{details.title}</h1></div></div>
              <p className="mt-5 max-w-xl text-sm leading-6 text-slate-300">{details.subtitle}</p>
              <div className="mt-7 rounded-2xl border border-white/10 bg-[#080a13]/65 p-4 sm:p-5">
                <label htmlFor="studio-project-name" className="mb-2 block text-xs font-semibold text-slate-300">Project name</label>
                <input id="studio-project-name" value={flow.name} onChange={event => setFlow(current => ({ ...current, name: event.target.value.slice(0, 80) }))} maxLength={80} autoComplete="off" placeholder="Enter project name" className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-pink-400/50 focus:ring-2 focus:ring-pink-400/10" />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500"><span>{details.format}</span><span>{flow.name.length}/80</span></div>
              </div>
              <button type="button" disabled={!flow.name.trim()} onClick={createProject} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 px-5 text-sm font-bold text-white shadow-lg shadow-violet-950/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">{details.action}<ArrowRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}

        {flow.step === 'templates' && details && ModeIcon && (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-8 sm:px-8">
            <div className="mb-7 flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><button type="button" onClick={back} aria-label="Back to project setup" className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-slate-300 hover:bg-white/5"><ArrowLeft className="h-4 w-4" /></button><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Project created</p><h1 className="mt-1 text-xl font-bold">{flow.name}</h1></div></div><span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-300"><ModeIcon className="h-4 w-4" />{flow.mode === 'photo' ? 'Photo project' : 'Video project'}</span></div>
            <div className="mb-7"><h2 className="text-2xl font-bold tracking-tight">{flow.mode === 'photo' ? 'Start your photo design' : 'Start your video project'}</h2><p className="mt-2 text-sm text-slate-400">{flow.mode === 'photo' ? 'Your photo project is ready. Choose a starting point for your design.' : 'Your video project is ready. Choose a starting point for your edit.'}</p></div>
            <div className="grid flex-1 content-start gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-[#101426] p-5 sm:p-6"><div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]"><Layers3 className="h-6 w-6 text-pink-300" /></div><h3 className="text-base font-bold">Templates</h3><p className="mt-2 text-xs leading-5 text-slate-400">Explore ready-made {flow.mode} layouts and choose one as the starting point for your project.</p><div className="mt-5 flex items-center gap-2 rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-3 text-[11px] text-slate-500"><Sparkles className="h-4 w-4 shrink-0 text-pink-400" />Template library is part of the next Studio stage.</div></div>
              <div className="rounded-2xl border border-white/10 bg-[#101426] p-5 sm:p-6"><div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]"><Plus className="h-6 w-6 text-cyan-300" /></div><h3 className="text-base font-bold">Blank project</h3><p className="mt-2 text-xs leading-5 text-slate-400">Start with an empty {flow.mode} workspace and build your own composition.</p><div className="mt-5 flex items-center gap-2 rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-3 text-[11px] text-slate-500"><FolderOpen className="h-4 w-4 shrink-0 text-cyan-300" />The editing workspace is connected in its dedicated development stage.</div></div>
            </div>
            <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5"><button type="button" onClick={back} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-xs font-semibold text-slate-300 hover:bg-white/5"><ArrowLeft className="h-4 w-4" /> Project settings</button><div className="inline-flex items-center gap-2 text-[11px] text-slate-500"><Check className="h-4 w-4 text-emerald-400" /> Project setup complete</div></div>
          </div>
        )}
      </section>
    </main>
  )
}
