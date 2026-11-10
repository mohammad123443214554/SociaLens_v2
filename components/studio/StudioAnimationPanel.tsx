'use client'

import { Pause, Play, RotateCcw, Search, Sparkles, Type, CheckCircle2 } from 'lucide-react'
import { BASIC_ENTRANCE_ANIMATIONS } from '@/lib/studio/basic-entrance-animations'
import { EXIT_ANIMATIONS } from '@/lib/studio/exit-animations'
import { BOUNCE_ELASTIC_ANIMATIONS } from '@/lib/studio/bounce-elastic-animations'
import { ROTATION_3D_ANIMATIONS } from '@/lib/studio/rotation-3d-animations'
import { TYPING_CHARACTER_ANIMATIONS } from '@/lib/studio/typing-character-animations'
import { WORD_LINE_ANIMATIONS } from '@/lib/studio/word-line-animations'
import { WIPE_MASK_REVEAL_ANIMATIONS } from '@/lib/studio/wipe-mask-reveal-animations'
import { LOOP_CONTINUOUS_ANIMATIONS } from '@/lib/studio/loop-continuous-animations'

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
  selectedAnimationId?: string | null
  isPreviewing?: boolean
  previewProgress?: number
  onPreview?: () => void
  onStopPreview?: () => void
  onReset?: () => void
  onSelectAnimation?: (id: string) => void
}

export function StudioAnimationPanel({ selectedCategory, onSelectCategory, search, onSearchChange, selectedText = null, selectedAnimationId = null, isPreviewing = false, previewProgress = 0, onPreview, onStopPreview, onReset, onSelectAnimation }: Props) {
  const filteredCategories = ANIMATION_CATEGORIES.filter(category =>
    (category.name + ' ' + category.description).toLowerCase().includes(search.trim().toLowerCase())
  )
  const isBasicEntrance = selectedCategory === 'Basic Entrance'
  const isExit = selectedCategory === 'Exit'
  const isBounceElastic = selectedCategory === 'Bounce & Elastic'
  const isRotation3D = selectedCategory === 'Rotation & 3D'
  const isTypingCharacter = selectedCategory === 'Typing & Character'
  const isWordLine = selectedCategory === 'Word & Line'
  const isWipeMaskReveal = selectedCategory === 'Wipe, Mask & Reveal'
  const isLoopContinuous = selectedCategory === 'Loop & Continuous'
  const isPresetCategory = isBasicEntrance || isExit || isBounceElastic || isRotation3D || isTypingCharacter || isWordLine || isWipeMaskReveal || isLoopContinuous
  const categoryAnimations = isBasicEntrance ? BASIC_ENTRANCE_ANIMATIONS : isExit ? EXIT_ANIMATIONS : isBounceElastic ? BOUNCE_ELASTIC_ANIMATIONS : isRotation3D ? ROTATION_3D_ANIMATIONS : isTypingCharacter ? TYPING_CHARACTER_ANIMATIONS : isWordLine ? WORD_LINE_ANIMATIONS : isWipeMaskReveal ? WIPE_MASK_REVEAL_ANIMATIONS : isLoopContinuous ? LOOP_CONTINUOUS_ANIMATIONS : []
  const animations = categoryAnimations.filter(item => (item.name + ' ' + (item.description || '')).toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-white/[0.07] p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={event => onSearchChange(event.target.value)} placeholder="Search animations or categories" aria-label="Search animations or categories" className="h-9 w-full rounded-lg border border-white/10 bg-[#080c18] pl-9 pr-3 text-[10px] text-white outline-none placeholder:text-slate-500 focus:border-fuchsia-400/50" />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-[.13em] text-slate-500">Animation library</span>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-2 py-1 text-[9px] font-semibold text-emerald-200">200 ready · 100 upcoming</span>
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
          </div> : <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[9px] leading-4 text-slate-500">Select a text layer on the canvas or Text timeline track.</p>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" disabled={!selectedText || !selectedAnimationId || isPreviewing} onClick={onPreview} className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-[9px] font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"><Play className="h-3.5 w-3.5" /> Preview motion</button>
            <button type="button" disabled={!selectedText || !selectedAnimationId} onClick={onReset} className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/10 text-[9px] font-semibold text-slate-300 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
          </div>
          {isPreviewing && <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between"><span className="flex items-center gap-1 text-[8px] font-semibold text-fuchsia-200"><Sparkles className="h-3 w-3" /> Preview playing</span><button type="button" onClick={onStopPreview} className="flex items-center gap-1 text-[8px] text-slate-400 hover:text-white"><Pause className="h-3 w-3" /> Stop</button></div>
            <div className="h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-[width]" style={{ width: Math.max(0, Math.min(1, previewProgress)) * 100 + '%' }} /></div>
          </div>}
          <p className="mt-2 text-[8px] leading-4 text-slate-500">{selectedAnimationId ? 'Selected preset is saved with this text layer and follows the project timeline.' : 'Choose an animation below to apply it to the selected text layer.'}</p>
        </section>

        <div className="mb-3">
          <h3 className="mb-2 px-1 text-[9px] font-bold uppercase tracking-[.12em] text-slate-500">Categories</h3>
          <div className="space-y-1">{filteredCategories.map(category => <button key={category.name} type="button" onClick={() => onSelectCategory(category.name)} className={'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition ' + (selectedCategory === category.name ? 'border-fuchsia-400/35 bg-fuchsia-500/[0.09]' : 'border-transparent bg-white/[0.02] hover:bg-white/[0.05]')}>
            <span className={'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[8px] font-bold ' + (selectedCategory === category.name ? 'bg-fuchsia-400/15 text-fuchsia-200' : 'bg-white/[0.05] text-slate-500')}>{category.range.split('–')[0]}</span>
            <span className="min-w-0 flex-1"><span className="block text-[9px] font-semibold text-slate-200">{category.name}</span><span className="mt-0.5 block truncate text-[8px] text-slate-500">{category.description}</span></span>
            <span className="text-[8px] tabular-nums text-slate-500">{category.range}</span>
          </button>)}</div>
        </div>

        {isPresetCategory ? <>
          <div className="mb-2 flex items-center justify-between"><h3 className="px-1 text-[9px] font-bold uppercase tracking-[.12em] text-slate-500">{isLoopContinuous ? 'Loop & Continuous · 176–200' : isWipeMaskReveal ? 'Wipe, Mask & Reveal · 151–175' : isWordLine ? 'Word & Line · 126–150' : isTypingCharacter ? 'Typing & Character · 101–125' : isRotation3D ? 'Rotation & 3D · 76–100' : isBounceElastic ? 'Bounce & Elastic · 51–75' : isExit ? 'Exit · 26–50' : 'Basic Entrance · 01–25'}</h3><span className="text-[8px] text-emerald-300">All {categoryAnimations.length} available</span></div>
          <div className="grid grid-cols-2 gap-2">{animations.map((animation, index) => <button key={animation.id} type="button" disabled={!selectedText} onClick={() => onSelectAnimation?.(animation.id)} aria-pressed={selectedAnimationId === animation.id} className={'group flex min-w-0 flex-col rounded-xl border p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ' + (selectedAnimationId === animation.id ? 'border-fuchsia-400/60 bg-fuchsia-500/10 ring-1 ring-fuchsia-400/20' : 'border-white/10 bg-white/[0.025] hover:border-fuchsia-300/35 hover:bg-white/[0.06]')}>
            <span className="relative flex h-12 w-full items-center justify-center overflow-hidden rounded-lg border border-white/[0.07] bg-[#101525]"><span className="text-[21px] font-black tracking-tight text-white transition-transform group-hover:scale-110">Aa</span>{selectedAnimationId === animation.id && <CheckCircle2 className="absolute right-1 top-1 h-3.5 w-3.5 text-fuchsia-300" />}</span>
            <span className="mt-2 block w-full truncate text-[9px] font-semibold text-slate-100">{String((isLoopContinuous ? 176 : isWipeMaskReveal ? 151 : isWordLine ? 126 : isTypingCharacter ? 101 : isRotation3D ? 76 : isBounceElastic ? 51 : isExit ? 26 : 1) + categoryAnimations.indexOf(animation)).padStart(2, '0')}. {animation.name}</span>
            <span className="mt-1 line-clamp-2 min-h-[24px] text-[8px] leading-3 text-slate-500">{animation.description}</span>
          </button>)}</div>
          {!animations.length && <p className="py-6 text-center text-[9px] text-slate-500">No matching animations found.</p>}
        </> : <div className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center"><Sparkles className="mx-auto h-5 w-5 text-slate-600" /><p className="mt-2 text-[10px] font-semibold text-slate-300">{selectedCategory}</p><p className="mt-1 text-[9px] leading-4 text-slate-500">This animation family will be implemented in its scheduled stage. The first 150 presets across Basic Entrance, Exit, Bounce & Elastic, Rotation & 3D, Typing & Character and Word & Line are ready now.</p></div>}
      </div>
    </div>
  )
}
