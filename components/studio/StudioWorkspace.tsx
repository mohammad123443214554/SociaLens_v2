'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, Clapperboard, FolderOpen, Image as ImageIcon, Layers3, Plus, Search, Sparkles, Video, X, SlidersHorizontal, Trash2, Clock3 } from 'lucide-react'
import { deleteStudioProject, listStudioProjects } from '@/lib/studio/persistence'

type Mode = 'photo' | 'video'
type Step = 'home' | 'setup' | 'templates'
type Flow = { step: Step; mode: Mode | null; name: string; created: boolean; selectedTemplate: string | null; projectId: string | null }
type Template = { id: string; title: string; category: string; modes: Mode[]; format: string; description: string; colors: [string, string, string]; layout: 'editorial' | 'bold' | 'minimal' | 'collage' | 'gradient'; tag?: string }

const initialFlow: Flow = { step: 'home', mode: null, name: '', created: false, selectedTemplate: null, projectId: null }

// Add new template definitions here. The library UI, filters and preview are generated from this registry.
const TEMPLATE_REGISTRY: Template[] = [
  { id: 'aurora-launch', title: 'Aurora Product Launch', category: 'Business', modes: ['photo'], format: '4:5', description: 'A premium product announcement with a strong headline and clear call to action.', colors: ['#21113f', '#c026d3', '#f9a8d4'], layout: 'editorial', tag: 'Popular' },
  { id: 'daily-inspiration', title: 'Daily Inspiration', category: 'Quotes', modes: ['photo'], format: '4:5', description: 'An expressive quote layout with generous typography and a soft visual accent.', colors: ['#102c43', '#0ea5e9', '#a5f3fc'], layout: 'minimal', tag: 'Popular' },
  { id: 'midnight-story', title: 'Midnight Story', category: 'Instagram Story', modes: ['photo'], format: '9:16', description: 'A cinematic vertical story composition for announcements and updates.', colors: ['#111827', '#7c3aed', '#f0abfc'], layout: 'gradient', tag: 'Trending' },
  { id: 'weekend-sale', title: 'Weekend Sale', category: 'Sale & Offers', modes: ['photo'], format: '4:5', description: 'A high-contrast offer card with space for a discount, product and details.', colors: ['#431407', '#f97316', '#fde68a'], layout: 'bold', tag: 'Popular' },
  { id: 'event-invite', title: 'Modern Event Invite', category: 'Events', modes: ['photo'], format: '4:5', description: 'A clean event announcement with date, venue and RSVP information.', colors: ['#172554', '#6366f1', '#c4b5fd'], layout: 'editorial' },
  { id: 'creator-cover', title: 'Creator Reel Cover', category: 'Reel Covers', modes: ['photo'], format: '9:16', description: 'A bold cover design with a large title that stays readable in a profile grid.', colors: ['#3b0764', '#d946ef', '#f5d0fe'], layout: 'bold' },
  { id: 'soft-brand-kit', title: 'Soft Brand Feature', category: 'Business', modes: ['photo'], format: '1:1', description: 'A balanced square brand feature for services, products and introductions.', colors: ['#134e4a', '#14b8a6', '#99f6e4'], layout: 'collage' },
  { id: 'travel-diary', title: 'Travel Diary', category: 'Lifestyle', modes: ['photo'], format: '4:5', description: 'A photo-led travel layout with a location label and editorial caption.', colors: ['#422006', '#d97706', '#fde68a'], layout: 'collage' },
  { id: 'neon-reel', title: 'Neon Reel Opener', category: 'Reels & Shorts', modes: ['video'], format: '9:16', description: 'A punchy vertical opener designed for short-form video titles.', colors: ['#18102d', '#9333ea', '#22d3ee'], layout: 'bold', tag: 'Trending' },
  { id: 'cinematic-intro', title: 'Cinematic Intro', category: 'Intros & Outros', modes: ['video'], format: '16:9', description: 'A dramatic opening frame for trailers, explainers and video stories.', colors: ['#0f172a', '#334155', '#e2e8f0'], layout: 'editorial' },
  { id: 'product-showcase', title: 'Product Showcase', category: 'Business', modes: ['video'], format: '9:16', description: 'A product-first video cover with space for a feature and short message.', colors: ['#3f0d2e', '#db2777', '#fbcfe8'], layout: 'collage' },
  { id: 'vlog-chapter', title: 'Vlog Chapter', category: 'Vlogs', modes: ['video'], format: '16:9', description: 'A clean chapter title card for daily vlogs and travel edits.', colors: ['#082f49', '#0284c7', '#bae6fd'], layout: 'minimal' },
  { id: 'story-countdown', title: 'Story Countdown', category: 'Stories', modes: ['video'], format: '9:16', description: 'A vertical countdown opener for launches, events and special moments.', colors: ['#4a044e', '#c026d3', '#f5d0fe'], layout: 'gradient' },
  { id: 'event-recap', title: 'Event Recap', category: 'Events', modes: ['video'], format: '16:9', description: 'A polished title frame for highlights, recaps and event aftermovies.', colors: ['#052e16', '#16a34a', '#bbf7d0'], layout: 'editorial' },
  { id: 'photo-montage', title: 'Photo Montage', category: 'Montage', modes: ['video'], format: '9:16', description: 'A multi-moment composition for memories, celebrations and recaps.', colors: ['#312e81', '#818cf8', '#e0e7ff'], layout: 'collage' },
  { id: 'minimal-promo', title: 'Minimal Promo', category: 'Promos', modes: ['video'], format: '16:9', description: 'A restrained promotional opener with clear hierarchy and a modern finish.', colors: ['#1c1917', '#a8a29e', '#fafaf9'], layout: 'minimal' },
]

function readFlow(): Flow {
  if (typeof window === 'undefined') return initialFlow
  const p = new URLSearchParams(window.location.search)
  const mode = p.get('mode') === 'photo' || p.get('mode') === 'video' ? p.get('mode') as Mode : null
  const requested = p.get('step')
  if (!mode || (requested !== 'setup' && requested !== 'templates')) return initialFlow
  const created = p.get('created') === '1'
  return { step: requested === 'templates' && created ? 'templates' : 'setup', mode, name: p.get('name') || '', created, selectedTemplate: p.get('template') || null, projectId: p.get('projectId') || null }
}

function pushFlow(flow: Flow, replace = false) {
  const p = new URLSearchParams()
  if (flow.step !== 'home') p.set('step', flow.step)
  if (flow.mode) p.set('mode', flow.mode)
  if (flow.name.trim()) p.set('name', flow.name.trim())
  if (flow.created) p.set('created', '1')
  if (flow.selectedTemplate) p.set('template', flow.selectedTemplate)
  if (flow.projectId) p.set('projectId', flow.projectId)
  const query = p.toString()
  const url = query ? '/studio?' + query : '/studio'
  if (replace) window.history.replaceState({ studio: true }, '', url)
  else window.history.pushState({ studio: true }, '', url)
}

const modeCopy = {
  photo: { title: 'Photo Studio', subtitle: 'Create polished graphics, posts and visual designs.', format: 'Still image project', icon: ImageIcon, panel: 'border-pink-400/25 bg-gradient-to-br from-pink-500/15 via-[#171326] to-[#101426]', iconBox: 'border-pink-300/20 bg-pink-400/10 text-pink-300', action: 'Create Photo Project' },
  video: { title: 'Video Studio', subtitle: 'Create engaging videos, stories and short-form content.', format: 'Video project', icon: Video, panel: 'border-violet-400/25 bg-gradient-to-br from-violet-500/15 via-[#15152a] to-[#101426]', iconBox: 'border-violet-300/20 bg-violet-400/10 text-violet-300', action: 'Create Video Project' },
}

function TemplateArtwork({ template, compact = false }: { template: Template; compact?: boolean }) {
  const [a, b, c] = template.colors
  return (
    <div className="relative isolate flex h-full min-h-[170px] w-full items-center justify-center overflow-hidden rounded-xl p-4" style={{ background: 'radial-gradient(circle at 80% 12%, ' + c + '55, transparent 38%), linear-gradient(140deg, ' + a + ', ' + b + ')' }}>
      <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full border border-white/20" />
      <div className="absolute -bottom-12 -left-8 h-36 w-36 rounded-full border border-white/15" />
      {template.layout === 'collage' ? (
        <div className="relative grid w-[82%] grid-cols-2 gap-2"><div className="col-span-2 h-16 rounded-lg border border-white/25 bg-white/20 backdrop-blur-sm" /><div className="h-20 rounded-lg border border-white/20 bg-black/15" /><div className="h-20 rounded-lg border border-white/20 bg-white/25" /></div>
      ) : template.layout === 'minimal' ? (
        <div className="relative w-[82%] text-left"><div className="mb-3 h-1 w-10 rounded-full" style={{ backgroundColor: c }} /><div className="h-3 w-[88%] rounded bg-white/90" /><div className="mt-2 h-3 w-[62%] rounded bg-white/65" /><div className="mt-6 h-1.5 w-16 rounded-full" style={{ backgroundColor: c }} /></div>
      ) : template.layout === 'bold' ? (
        <div className="relative w-[86%] -rotate-3 rounded-xl border border-white/30 bg-black/15 p-4 shadow-2xl backdrop-blur-sm"><div className="mb-3 inline-flex rounded-full bg-white/20 px-2 py-1 text-[8px] font-bold uppercase tracking-widest text-white">Make it happen</div><div className="text-2xl font-black leading-[0.95] tracking-tight text-white sm:text-3xl">{template.title.split(' ').slice(0, 2).join(' ').toUpperCase()}</div><div className="mt-3 h-1 w-12 rounded-full" style={{ backgroundColor: c }} /></div>
      ) : (
        <div className="relative w-[84%] rounded-xl border border-white/25 bg-black/10 p-4 backdrop-blur-[2px]"><div className="mb-4 flex items-center justify-between"><span className="h-1.5 w-10 rounded-full bg-white/70" /><span className="h-5 w-5 rounded-full border border-white/60" /></div><div className="text-xl font-extrabold leading-tight text-white sm:text-2xl">{template.title}</div><div className="mt-3 h-1 w-12 rounded-full" style={{ backgroundColor: c }} /><div className="mt-4 h-1.5 w-2/3 rounded-full bg-white/45" /></div>
      )}
      {!compact && <span className="absolute bottom-3 right-3 rounded-md border border-white/20 bg-black/25 px-2 py-1 text-[9px] font-semibold text-white/90">{template.format}</span>}
    </div>
  )
}

function TemplateLibrary({ mode, selectedId, onChoose }: { mode: Mode; selectedId: string | null; onChoose: (id: string) => void }) {
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<Template | null>(null)
  const templates = useMemo(() => TEMPLATE_REGISTRY.filter(item => item.modes.includes(mode)), [mode])
  const categories = useMemo(() => ['All', ...Array.from(new Set(templates.map(item => item.category)))], [templates])
  const filtered = useMemo(() => templates.filter(item => (category === 'All' || item.category === category) && (item.title + ' ' + item.category + ' ' + item.description + ' ' + (item.tag || '')).toLowerCase().includes(search.trim().toLowerCase())), [templates, category, search])
  const selected = templates.find(item => item.id === selectedId) || null

  return (
    <div className="min-w-0">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-pink-300">Template library</p><h2 className="mt-1 text-2xl font-bold tracking-tight">Find your starting design</h2><p className="mt-1 text-xs text-slate-400">Browse curated {mode} layouts or search by name and purpose.</p></div>
        <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-slate-400"><Layers3 className="h-4 w-4 text-pink-300" />{templates.length} templates</div>
      </div>
      <div className="mb-4 flex flex-col gap-3">
        <label className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-[#101426] px-3 focus-within:border-pink-400/50"><Search className="h-4 w-4 shrink-0 text-slate-500" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search templates, categories..." aria-label="Search templates" className="h-full min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />{search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="rounded-md p-1 text-slate-400 hover:bg-white/10"><X className="h-4 w-4" /></button>}</label>
        <div className="flex items-center gap-2 overflow-x-auto pb-1"><SlidersHorizontal className="h-4 w-4 shrink-0 text-slate-500" />{categories.map(item => <button key={item} type="button" onClick={() => setCategory(item)} className={'shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ' + (category === item ? 'border-pink-400/50 bg-pink-500/15 text-pink-200' : 'border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.07]')}>{item}</button>)}</div>
      </div>
      {selected && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3"><div className="flex min-w-0 items-center gap-2 text-xs text-emerald-200"><Check className="h-4 w-4 shrink-0" /><span className="truncate">Selected: <strong>{selected.title}</strong></span></div><button type="button" onClick={() => onChoose('')} className="text-[11px] font-semibold text-slate-400 hover:text-white">Clear selection</button></div>}
      {filtered.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{filtered.map(item => <article key={item.id} className="group overflow-hidden rounded-2xl border border-white/10 bg-[#101426] transition hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl hover:shadow-black/20"><button type="button" onClick={() => setPreview(item)} className="block w-full p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"><div className="relative overflow-hidden rounded-xl"><TemplateArtwork template={item} /><span className="absolute left-3 top-3 rounded-md border border-white/20 bg-black/35 px-2 py-1 text-[9px] font-semibold text-white">{item.tag || item.category}</span><span className="absolute bottom-3 left-3 rounded-md bg-black/45 px-2 py-1 text-[9px] text-white/90">{item.format}</span></div><div className="px-2 pb-2 pt-3"><h3 className="truncate text-sm font-bold text-white">{item.title}</h3><p className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-4 text-slate-400">{item.description}</p></div></button><div className="flex items-center justify-between gap-2 border-t border-white/[0.07] px-4 py-3"><span className="text-[10px] text-slate-500">{item.category}</span><button type="button" onClick={() => onChoose(item.id)} className={'rounded-lg px-3 py-1.5 text-[10px] font-bold transition ' + (selectedId === item.id ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/[0.07] text-white hover:bg-pink-500/20 hover:text-pink-200')}>{selectedId === item.id ? 'Selected' : 'Use template'}</button></div></article>)}</div> : <div className="rounded-2xl border border-dashed border-white/10 px-5 py-14 text-center"><Search className="mx-auto h-7 w-7 text-slate-600" /><p className="mt-3 text-sm font-semibold text-slate-300">No templates found</p><p className="mt-1 text-xs text-slate-500">Try another search or choose a different category.</p><button type="button" onClick={() => { setSearch(''); setCategory('All') }} className="mt-4 rounded-lg border border-white/10 px-3 py-2 text-[11px] font-semibold text-slate-300 hover:bg-white/5">Clear filters</button></div>}
      {preview && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="template-preview-title" onMouseDown={event => { if (event.target === event.currentTarget) setPreview(null) }}><div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#0d1020] shadow-2xl"><div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div><p className="text-[10px] font-bold uppercase tracking-widest text-pink-300">Template preview</p><h3 id="template-preview-title" className="mt-1 text-sm font-bold text-white">{preview.title}</h3></div><button type="button" onClick={() => setPreview(null)} aria-label="Close preview" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button></div><div className="p-4"><div className="mx-auto max-w-[280px]"><TemplateArtwork template={preview} /></div><p className="mt-4 text-xs leading-5 text-slate-400">{preview.description}</p><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-white/[0.06] px-3 py-1 text-[10px] text-slate-300">{preview.category}</span><span className="rounded-full bg-white/[0.06] px-3 py-1 text-[10px] text-slate-300">{preview.format}</span></div><button type="button" onClick={() => { onChoose(preview.id); setPreview(null) }} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 text-xs font-bold text-white transition hover:brightness-110">Use this template <ArrowRight className="h-4 w-4" /></button></div></div></div>}
    </div>
  )
}

export function StudioWorkspace() {
  const [flow, setFlow] = useState<Flow>(initialFlow)
  const [ready, setReady] = useState(false)
  const [drafts, setDrafts] = useState<Array<{ id: string; project_type: Mode; name: string; template_id: string | null; updated_at: string }>>([])
  const [draftsLoading, setDraftsLoading] = useState(true)
  const [draftsError, setDraftsError] = useState('')

  useEffect(() => {
    const sync = () => setFlow(readFlow())
    sync()
    setReady(true)
    void listStudioProjects().then(items => setDrafts(items as typeof drafts)).catch(() => setDraftsError('Sign in to view your saved Studio drafts.')).finally(() => setDraftsLoading(false))
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  const navigate = useCallback((next: Flow, replace = false) => {
    pushFlow(next, replace)
    setFlow(next)
  }, [])

  const back = () => {
    if (flow.step === 'templates' && flow.mode) navigate({ ...flow, step: 'setup', created: false, selectedTemplate: null, projectId: null })
    else navigate(initialFlow)
  }

  const createProject = () => {
    if (!flow.mode || !flow.name.trim()) return
    navigate({ ...flow, step: 'templates', name: flow.name.trim(), created: true, selectedTemplate: null, projectId: crypto.randomUUID() })
  }

  const chooseTemplate = (id: string) => navigate({ ...flow, selectedTemplate: id || null })
  const removeDraft = async (id: string) => {
    if (!window.confirm('Delete this Studio project and its uploaded media? This cannot be undone.')) return
    try {
      await deleteStudioProject(id)
      setDrafts(items => items.filter(item => item.id !== id))
    } catch (cause) { setDraftsError(cause instanceof Error ? cause.message : 'Could not delete this draft.') }
  }

  if (!ready) return <main className="fixed inset-0 z-[60] grid place-items-center bg-[#080a13] text-sm text-slate-400">Opening SociaLens Studio…</main>

  const details = flow.mode ? modeCopy[flow.mode] : null
  const ModeIcon = details?.icon
  const chosenTemplate = TEMPLATE_REGISTRY.find(item => item.id === flow.selectedTemplate && item.modes.includes(flow.mode || 'photo'))

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
              <button type="button" onClick={() => navigate({ step: 'setup', mode: 'photo', name: 'Untitled photo project', created: false, selectedTemplate: null, projectId: null })} className="group relative min-h-[230px] overflow-hidden rounded-2xl border border-pink-400/20 bg-gradient-to-br from-pink-500/15 via-[#171326] to-[#101426] p-6 text-left transition duration-200 hover:-translate-y-1 hover:border-pink-400/50 hover:shadow-[0_20px_70px_rgba(219,39,119,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400">
                <div className="absolute -right-10 -top-12 h-48 w-48 rounded-full bg-pink-500/10 blur-3xl transition group-hover:bg-pink-500/20" />
                <div className="relative flex h-full flex-col"><div className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl border border-pink-300/20 bg-pink-400/10"><ImageIcon className="h-7 w-7 text-pink-300" /></div><div className="mt-auto flex items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Photo</h2><p className="mt-2 max-w-xs text-xs leading-5 text-slate-400">Design posts, stories, announcements and graphics.</p></div><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink-500/15 text-pink-200 transition group-hover:translate-x-1"><ArrowRight className="h-5 w-5" /></span></div></div>
              </button>
              <button type="button" onClick={() => navigate({ step: 'setup', mode: 'video', name: 'Untitled video project', created: false, selectedTemplate: null, projectId: null })} className="group relative min-h-[230px] overflow-hidden rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-500/15 via-[#15152a] to-[#101426] p-6 text-left transition duration-200 hover:-translate-y-1 hover:border-violet-400/50 hover:shadow-[0_20px_70px_rgba(124,58,237,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                <div className="absolute -right-10 -top-12 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl transition group-hover:bg-violet-500/20" />
                <div className="relative flex h-full flex-col"><div className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-300/20 bg-violet-400/10"><Clapperboard className="h-7 w-7 text-violet-300" /></div><div className="mt-auto flex items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Video</h2><p className="mt-2 max-w-xs text-xs leading-5 text-slate-400">Prepare reels, stories, shorts and creative videos.</p></div><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-violet-200 transition group-hover:translate-x-1"><ArrowRight className="h-5 w-5" /></span></div></div>
              </button>
            </div>
            <section className="mt-10 rounded-2xl border border-white/10 bg-[#101426]/90 p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-bold text-white">Your saved projects</h2><p className="mt-1 text-[11px] text-slate-500">Autosaved drafts are available when you return or refresh.</p></div><span className="rounded-full border border-white/10 px-3 py-1 text-[10px] text-slate-400">{drafts.length} drafts</span></div>
              {draftsLoading ? <p className="py-5 text-center text-xs text-slate-500">Loading your drafts…</p> : drafts.length ? <div className="grid gap-2 sm:grid-cols-2">
                {drafts.map(draft => <div key={draft.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-black/15 p-3">
                  <div className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ' + (draft.project_type === 'photo' ? 'bg-pink-500/10 text-pink-300' : 'bg-violet-500/10 text-violet-300')}>{draft.project_type === 'photo' ? <ImageIcon className="h-5 w-5" /> : <Video className="h-5 w-5" />}</div>
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white">{draft.name}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-slate-500"><Clock3 className="h-3 w-3" />{new Date(draft.updated_at).toLocaleString()}</p></div>
                  <Link href={'/studio/' + (draft.project_type === 'photo' ? 'photo-editor' : 'video-editor') + '?projectId=' + encodeURIComponent(draft.id) + '&name=' + encodeURIComponent(draft.name) + (draft.template_id ? '&template=' + encodeURIComponent(draft.template_id) : '')} className="rounded-lg bg-white/[0.08] px-3 py-2 text-[10px] font-bold text-white hover:bg-white/[0.14]">Open</Link>
                  <button type="button" onClick={() => void removeDraft(draft.id)} aria-label={'Delete ' + draft.name} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
                </div>)}
              </div> : <p className="py-5 text-center text-xs text-slate-500">{draftsError || 'Your saved Studio projects will appear here.'}</p>}
            </section>
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
          <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 py-8 sm:px-8">
            <div className="mb-7 flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><button type="button" onClick={back} aria-label="Back to project setup" className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-slate-300 hover:bg-white/5"><ArrowLeft className="h-4 w-4" /></button><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Project created</p><h1 className="mt-1 text-xl font-bold">{flow.name}</h1></div></div><span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-300"><ModeIcon className="h-4 w-4" />{flow.mode === 'photo' ? 'Photo project' : 'Video project'}</span></div>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold tracking-tight">{flow.mode === 'photo' ? 'Start your photo design' : 'Start your video project'}</h2><p className="mt-1 text-xs text-slate-400">Choose a ready-made template or continue with a blank project.</p></div><span className="text-[10px] text-slate-500">Your selection is saved in this project link</span></div>
            <div className="mb-7 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="min-w-0 rounded-2xl border border-white/10 bg-[#101426] p-4 sm:p-5"><TemplateLibrary mode={flow.mode!} selectedId={flow.selectedTemplate} onChoose={chooseTemplate} /></div>
              <aside className="h-fit rounded-2xl border border-white/10 bg-[#101426] p-5"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/10"><Plus className="h-5 w-5 text-cyan-300" /></div><h3 className="text-sm font-bold">Blank project</h3><p className="mt-2 text-xs leading-5 text-slate-400">Start without a preset and build your own design when the editing workspace is available.</p><button type="button" onClick={() => chooseTemplate('')} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-semibold text-slate-200 transition hover:bg-white/[0.08]"><FolderOpen className="h-4 w-4" /> Choose blank project</button></aside>
            </div>
            {chosenTemplate && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3"><div className="flex items-center gap-2 text-xs text-emerald-200"><Check className="h-4 w-4" /> <span><strong>{chosenTemplate.title}</strong> selected for this project</span></div><span className="text-[10px] text-slate-400">Template choice saved</span></div>}
            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5"><button type="button" onClick={back} className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-xs font-semibold text-slate-300 hover:bg-white/5"><ArrowLeft className="h-4 w-4" /> Project settings</button><div className="flex flex-wrap items-center gap-3"><div className="inline-flex items-center gap-2 text-[11px] text-slate-500"><Check className="h-4 w-4 text-emerald-400" /> Project setup complete</div>{flow.mode === 'photo' ? <Link href={'/studio/photo-editor?name=' + encodeURIComponent(flow.name) + '&projectId=' + encodeURIComponent(flow.projectId || '') + (flow.selectedTemplate ? '&template=' + encodeURIComponent(flow.selectedTemplate) : '')} className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 px-5 text-xs font-bold text-white shadow-lg shadow-violet-950/25 transition hover:brightness-110">Open Photo Editor <ArrowRight className="h-4 w-4" /></Link> : <Link href={'/studio/video-editor?name=' + encodeURIComponent(flow.name) + '&projectId=' + encodeURIComponent(flow.projectId || '') + (flow.selectedTemplate ? '&template=' + encodeURIComponent(flow.selectedTemplate) : '')} className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-pink-600 px-5 text-xs font-bold text-white shadow-lg shadow-violet-950/25 transition hover:brightness-110">Open Video Editor <ArrowRight className="h-4 w-4" /></Link>}</div></div>
          </div>
        )}
      </section>
    </main>
  )
}
