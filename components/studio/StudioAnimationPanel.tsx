'use client'

import { Pause, Play, RotateCcw, Search, Sparkles, Type, X } from 'lucide-react'

const ANIMATION_CATEGORIES = [
  { name: 'Basic Entrance', range: '01–25', description: 'Clean, polished ways for text to appear' },
  { name: 'Exit', range: '26–50', description: 'Controlled motion for text leaving the scene' },
  { name: 'Bounce & Elastic', range: '51–75', description: 'Playful spring, bounce and overshoot motion' },
  { name: 'Rotation & 3D', range: '76–100', description: 'Depth, perspective and dimensional movement' },
  { name: 'Typing & Character', range: '101–125', description: 'Letter-by-letter and typewriter-inspired motion' },
  { name: 'Word & Line', range: '126–150', description: 'Staggered word and line-based reveals' },
  { name: 'Wipe, Mask & Reveal', range: '151–175', description: 'Directional reveals and masked entrances' },
  { name: 'Loop & Continuous', range: '176–200', description: 'Seamless motion that continues over time' },
  { name: 'Motion & Dynamic', range: '201–225', description: 'Energetic movement and expressive transitions' },
  { name: 'Cinematic & Light', range: '226–250', description: 'Atmospheric light, focus and cinematic motion' },
  { name: 'Digital & Creative', range: '251–275', description: 'Modern digital, glitch and experimental styles' },
  { name: 'Artistic & Advanced', range: '276–300', description: 'Expressive, refined and advanced motion design' },
] as const

type Props = {
  selectedCategory: string
  onSelectCategory: (category: string) => void
  search: string
  onSearchChange: (value: string) => void
  onClose?: () => void
  mobile?: boolean
  selectedText?: { text: string; kind: string; animation?: { animationId?: string | null } } | null
  isPreviewing?: boolean
  previewProgress?: number
  onPreview?: () => void
  onStopPreview?: () => void
  onReset?: () => void
}

export function StudioAnimationPanel({ selectedCategory, onSelectCategory, search, onSearchChange, onClose, mobile = false, selectedText = null, isPreviewing = false, previewProgress = 0, onPreview, onStopPreview, onReset }: Props) {
  const filtered = ANIMATION_CATEGORIES.filter(category =>
    (category.name + ' ' + category.description).toLowerCase().includes(search.trim().toLowerCase())
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-white/[0.07] p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={event => onSearchChange(event.target.value)} placeholder="Search animation categories" aria-label="Search animation categories" className="h-9 w-full rounded-lg border border-white/10 bg-[#080c18] pl-9 pr-3 text-[10px] text-white outline-none placeholder:text-slate-500 focus:border-fuchsia-400/50" />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-[.13em] text-slate-500">Animation library</span>
          <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-400/[0.08] px-2 py-1 text-[9px] font-semibold text-fuchsia-200">300 planned</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        <section className="mb-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3" aria-label="Selected text animation preview controls">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-[.12em] text-slate-400">Selected text</span>
            {selectedText ? <span className="rounded-md bg-emerald-400/10 px-2 py-1 text-[8px] font-semibold text-emerald-200">Layer selected</span> : <span className="rounded-md bg-amber-400/10 px-2 py-1 text-[8px] font-semibold text-amber-200">No selection</span>}
          </div>
          {selectedText ? <div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/[0.06] bg-[#080c18]/70 p-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-fuchsia-400/10 text-fuchsia-200"><Type className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold text-white">{selectedText.text.trim() || 'Untitled text'}</span><span className="mt-0.5 block text-[8px] capitalize text-slate-500">{selectedText.kind} layer</span></span>
          </div> : <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[9px] leading-4 text-slate-500">Select a text layer directly on the canvas or from the Text timeline track to enable preview controls.</p>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" disabled={!selectedText || isPreviewing} onClick={onPreview} className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-[9px] font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"><Play className="h-3.5 w-3.5" /> Preview motion</button>
            <button type="button" disabled={!selectedText} onClick={onReset} className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/10 text-[9px] font-semibold text-slate-300 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
          </div>
          {isPreviewing && <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between"><span className="flex items-center gap-1 text-[8px] font-semibold text-fuchsia-200"><Sparkles className="h-3 w-3" /> Preview playing</span><button type="button" onClick={onStopPreview} className="flex items-center gap-1 text-[8px] text-slate-400 hover:text-white"><Pause className="h-3 w-3" /> Stop</button></div>
            <div className="h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-[width]" style={{ width: Math.max(0, Math.min(1, previewProgress)) * 100 + '%' }} /></div>
          </div>}
          <p className="mt-2 text-[8px] leading-4 text-slate-500">This stage uses a temporary engine demonstration to verify selection and preview behaviour. Final named presets will be connected in the animation-family stages.</p>
        </section>
        <div className="mb-3 rounded-xl border border-violet-400/15 bg-gradient-to-br from-violet-500/[0.10] to-fuchsia-500/[0.06] p-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-fuchsia-400/10 text-fuchsia-200"><Sparkles className="h-4 w-4" /></span>
            <div><p className="text-[10px] font-bold text-white">Text motion studio</p><p className="mt-0.5 text-[9px] text-slate-400">12 curated animation families</p></div>
          </div>
          <p className="mt-2 text-[9px] leading-4 text-slate-400">Choose a family to explore its motion styles. Presets will be enabled progressively as the animation engine is completed.</p>
        </div>

        <div className="space-y-1.5">
          {filtered.map((category, index) => {
            const active = selectedCategory === category.name
            return (
              <button key={category.name} type="button" onClick={() => onSelectCategory(category.name)} aria-pressed={active} className={'flex w-full items-center gap-2.5 rounded-xl border p-2.5 text-left transition ' + (active ? 'border-fuchsia-400/40 bg-fuchsia-500/[0.10] shadow-[0_0_0_1px_rgba(217,70,239,.08)]' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.05]')}>
                <span className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold tabular-nums ' + (active ? 'bg-fuchsia-500/20 text-fuchsia-100' : 'bg-white/[0.05] text-slate-500')}>{String(index + 1).padStart(2, '0')}</span>
                <span className="min-w-0 flex-1">
                  <span className={'block text-[10px] font-semibold ' + (active ? 'text-fuchsia-100' : 'text-slate-200')}>{category.name}</span>
                  <span className="mt-0.5 block text-[8px] leading-3 text-slate-500">{category.description}</span>
                </span>
                <span className="shrink-0 rounded-md bg-white/[0.045] px-1.5 py-1 text-[8px] tabular-nums text-slate-500">{category.range}</span>
              </button>
            )
          })}
          {filtered.length === 0 && <p className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-[9px] text-slate-500">No animation categories match your search.</p>}
        </div>
      </div>

      <div className="border-t border-white/[0.07] p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[8px] leading-4 text-slate-500">Preview controls are ready. Preset selection will be enabled as the 300-animation library is built.</p>
          {mobile && onClose && <button type="button" onClick={onClose} aria-label="Close animation panel" className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2 text-[9px] text-slate-300"><X className="h-3.5 w-3.5" /> Close</button>}
        </div>
      </div>
    </div>
  )
}
