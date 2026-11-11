'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Gauge, Repeat2, Search, Sparkles, Timer } from 'lucide-react'
import type { TextAnimationEasing, TextAnimationSettings } from '@/lib/studio/animation-engine'
import { BASIC_ENTRANCE_ANIMATIONS } from '@/lib/studio/basic-entrance-animations'
import { EXIT_ANIMATIONS } from '@/lib/studio/exit-animations'
import { BOUNCE_ELASTIC_ANIMATIONS } from '@/lib/studio/bounce-elastic-animations'
import { ROTATION_3D_ANIMATIONS } from '@/lib/studio/rotation-3d-animations'
import { TYPING_CHARACTER_ANIMATIONS } from '@/lib/studio/typing-character-animations'
import { WORD_LINE_ANIMATIONS } from '@/lib/studio/word-line-animations'
import { WIPE_MASK_REVEAL_ANIMATIONS } from '@/lib/studio/wipe-mask-reveal-animations'
import { LOOP_CONTINUOUS_ANIMATIONS } from '@/lib/studio/loop-continuous-animations'
import { MOTION_DYNAMIC_ANIMATIONS } from '@/lib/studio/motion-dynamic-animations'
import { CINEMATIC_LIGHT_ANIMATIONS } from '@/lib/studio/cinematic-light-animations'
import { DIGITAL_CREATIVE_ANIMATIONS } from '@/lib/studio/digital-creative-animations'
import { ARTISTIC_ADVANCED_ANIMATIONS } from '@/lib/studio/artistic-advanced-animations'

const ALL_ANIMATIONS = [
  ...BASIC_ENTRANCE_ANIMATIONS,
  ...EXIT_ANIMATIONS,
  ...BOUNCE_ELASTIC_ANIMATIONS,
  ...ROTATION_3D_ANIMATIONS,
  ...TYPING_CHARACTER_ANIMATIONS,
  ...WORD_LINE_ANIMATIONS,
  ...WIPE_MASK_REVEAL_ANIMATIONS,
  ...LOOP_CONTINUOUS_ANIMATIONS,
  ...MOTION_DYNAMIC_ANIMATIONS,
  ...CINEMATIC_LIGHT_ANIMATIONS,
  ...DIGITAL_CREATIVE_ANIMATIONS,
  ...ARTISTIC_ADVANCED_ANIMATIONS,
]

const FEATURED_ANIMATION_NAMES = [
  'Fade In', 'Fade Up', 'Rise', 'Slide Up', 'Pop In', 'Zoom In',
  'Focus In', 'Blur In', 'Soft Bounce', 'Spring In', 'Cinematic Focus Pull',
  'Soft Spotlight Reveal', 'Light Sweep Reveal', 'Word Cascade',
  'Typewriter', 'Character Fade', 'Mask Reveal', 'Cinematic Push In',
  'Orbit Drift', 'Ink Bloom', 'Brush Stroke Reveal', 'Golden Hour Glow',
  'Neon Edge Reveal', 'Film Fade In',
]

type Props = {
  search: string
  onSearchChange: (value: string) => void
  mobile?: boolean
  onClose?: () => void
  selectedText?: { text: string; kind: string; animation?: Partial<TextAnimationSettings> } | null
  animationSettings?: Partial<TextAnimationSettings>
  animationMode?: 'entrance' | 'exit' | 'loop' | 'continuous'
  onUpdateAnimationSettings?: (patch: Partial<TextAnimationSettings>) => void
  selectedAnimationId?: string | null
  onSelectAnimation?: (id: string) => void
}

export function StudioAnimationPanel({
  search,
  onSearchChange,
  selectedText = null,
  animationSettings = {},
  animationMode = 'entrance',
  onUpdateAnimationSettings,
  selectedAnimationId = null,
  onSelectAnimation,
}: Props) {
  const [visibleCount, setVisibleCount] = useState(36)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const orderedAnimations = useMemo(() => {
    const characterFirst = new Map(TYPING_CHARACTER_ANIMATIONS.map((animation, index) => [animation.name, index]))
    const featured = new Map(FEATURED_ANIMATION_NAMES.map((name, index) => [name, index]))
    return [...ALL_ANIMATIONS].sort((a, b) => {
      const aCharacter = characterFirst.get(a.name)
      const bCharacter = characterFirst.get(b.name)
      if (aCharacter !== undefined || bCharacter !== undefined) {
        if (aCharacter === undefined) return 1
        if (bCharacter === undefined) return -1
        return aCharacter - bCharacter
      }
      const aRank = featured.get(a.name) ?? Number.MAX_SAFE_INTEGER
      const bRank = featured.get(b.name) ?? Number.MAX_SAFE_INTEGER
      return aRank - bRank || a.name.localeCompare(b.name)
    })
  }, [])
  const filteredAnimations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return orderedAnimations
    return orderedAnimations.filter(animation =>
      (animation.name + ' ' + (animation.description || '')).toLocaleLowerCase().includes(query)
    )
  }, [orderedAnimations, search])

  useEffect(() => {
    setVisibleCount(36)
    setIsLoadingMore(false)
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0
  }, [search])

  useEffect(() => {
    const root = scrollContainerRef.current
    const target = loadMoreRef.current
    if (!root || !target || isLoadingMore || visibleCount >= filteredAnimations.length) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setIsLoadingMore(true)
    }, { root, rootMargin: '180px 0px', threshold: 0 })
    observer.observe(target)
    return () => observer.disconnect()
  }, [filteredAnimations.length, isLoadingMore, visibleCount])

  useEffect(() => {
    if (!isLoadingMore) return
    const timer = window.setTimeout(() => {
      setVisibleCount(count => Math.min(filteredAnimations.length, count + 36))
      setIsLoadingMore(false)
    }, 260)
    return () => window.clearTimeout(timer)
  }, [filteredAnimations.length, isLoadingMore])

  const hasAnimation = Boolean(selectedText && selectedAnimationId)
  const duration = animationSettings.durationMs ?? 850
  const delay = animationSettings.delayMs ?? 0
  const speed = animationSettings.speed ?? 1
  const repeats = animationSettings.repeatCount ?? 1
  const direction = animationSettings.direction ?? 'normal'
  const easing = animationSettings.easing ?? 'ease'
  const update = (patch: Partial<TextAnimationSettings>) => {
    if (hasAnimation) onUpdateAnimationSettings?.(patch)
  }

  return (
    <div ref={scrollContainerRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
      <div className="shrink-0 border-b border-white/[0.07] p-3">
        <section aria-label="Motion controls" className="rounded-xl border border-fuchsia-400/20 bg-gradient-to-br from-fuchsia-500/[0.09] to-violet-500/[0.05] p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-fuchsia-400/15 text-fuchsia-200"><Sparkles className="h-4 w-4" /></span>
              <span className="text-[11px] font-bold text-white">Motion controls</span>
            </div>
            <span className="text-[8px] font-semibold uppercase tracking-[.1em] text-fuchsia-200/80">Per text layer</span>
          </div>
          {!selectedText ? (
            <p className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-center text-[9px] leading-4 text-slate-400">Select a text layer on the canvas or timeline. Motion controls will be ready here.</p>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/15 px-2.5 py-2">
                <span className="min-w-0 flex-1 truncate text-[9px] font-semibold text-slate-200">{selectedText.text.trim() || 'Untitled text layer'}</span>
                <span className="shrink-0 rounded-md bg-emerald-400/10 px-2 py-1 text-[8px] font-semibold text-emerald-200">Selected</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="min-w-0 rounded-lg bg-black/15 p-2">
                  <span className="flex items-center justify-between gap-1 text-[8px] text-slate-400"><span className="flex items-center gap-1"><Timer className="h-3 w-3" /> Duration</span><strong className="text-slate-200">{(duration / 1000).toFixed(2)}s</strong></span>
                  <input aria-label="Animation duration" type="range" min="0.1" max="8" step="0.05" disabled={!hasAnimation} value={duration / 1000} onChange={event => update({ durationMs: Math.round(Number(event.target.value) * 1000) })} className="mt-2 w-full accent-fuchsia-400 disabled:opacity-35" />
                </label>
                <label className="min-w-0 rounded-lg bg-black/15 p-2">
                  <span className="flex items-center justify-between gap-1 text-[8px] text-slate-400"><span className="flex items-center gap-1"><Timer className="h-3 w-3" /> Delay</span><strong className="text-slate-200">{(delay / 1000).toFixed(2)}s</strong></span>
                  <input aria-label="Animation delay" type="range" min="0" max="5" step="0.05" disabled={!hasAnimation} value={delay / 1000} onChange={event => update({ delayMs: Math.round(Number(event.target.value) * 1000) })} className="mt-2 w-full accent-fuchsia-400 disabled:opacity-35" />
                </label>
                <label className="min-w-0 rounded-lg bg-black/15 p-2">
                  <span className="flex items-center justify-between gap-1 text-[8px] text-slate-400"><span className="flex items-center gap-1"><Gauge className="h-3 w-3" /> Speed</span><strong className="text-slate-200">{speed.toFixed(2)}×</strong></span>
                  <input aria-label="Animation speed" type="range" min="0.25" max="3" step="0.05" disabled={!hasAnimation} value={speed} onChange={event => update({ speed: Number(event.target.value) })} className="mt-2 w-full accent-fuchsia-400 disabled:opacity-35" />
                </label>
                <label className="min-w-0 rounded-lg bg-black/15 p-2">
                  <span className="flex items-center justify-between gap-1 text-[8px] text-slate-400"><span className="flex items-center gap-1"><Repeat2 className="h-3 w-3" /> Repeats</span><strong className="text-slate-200">{repeats === 0 ? '∞' : repeats}</strong></span>
                  <input aria-label="Animation repeat count" type="range" min="1" max="10" step="1" disabled={!hasAnimation || repeats === 0} value={Math.max(1, repeats)} onChange={event => update({ repeatCount: Number(event.target.value) })} className="mt-2 w-full accent-fuchsia-400 disabled:opacity-35" />
                </label>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-[8px] text-slate-400">Direction
                  <select aria-label="Animation direction" disabled={!hasAnimation} value={direction} onChange={event => update({ direction: event.target.value as TextAnimationSettings['direction'] })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-[#101525] px-2 text-[9px] text-white outline-none focus:border-fuchsia-400/50 disabled:opacity-40">
                    <option value="normal">Normal</option><option value="reverse">Reverse</option><option value="alternate">Alternate</option><option value="alternate-reverse">Alternate reverse</option>
                  </select>
                </label>
                <label className="text-[8px] text-slate-400">Easing
                  <select aria-label="Animation easing" disabled={!hasAnimation} value={easing} onChange={event => update({ easing: event.target.value as TextAnimationEasing })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-[#101525] px-2 text-[9px] text-white outline-none focus:border-fuchsia-400/50 disabled:opacity-40">
                    {(['linear','ease','ease-in','ease-out','ease-in-out','cubic-in','cubic-out','cubic-in-out','premium-out','premium-in','premium-in-out','back-out','back-in','elastic-out','bounce-out'] as const).map(value => <option key={value} value={value}>{value.replaceAll('-', ' ')}</option>)}
                  </select>
                </label>
              </div>
              <label className="mt-2 flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/10 px-2.5 py-2 text-[9px] text-slate-300">
                <span>Loop continuously</span>
                <input aria-label="Loop animation continuously" type="checkbox" checked={repeats === 0} disabled={!hasAnimation || (animationMode !== 'loop' && animationMode !== 'continuous')} onChange={event => update({ repeatCount: event.target.checked ? 0 : 1 })} className="h-3.5 w-3.5 accent-fuchsia-400 disabled:opacity-35" />
              </label>
              {!hasAnimation && <p className="mt-2 text-[8px] leading-3 text-slate-500">Choose an animation below to activate these controls.</p>}
            </>
          )}
        </section>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={event => onSearchChange(event.target.value)} placeholder="Search all animations" aria-label="Search all animations" className="h-9 w-full rounded-lg border border-white/10 bg-[#080c18] pl-9 pr-3 text-[10px] text-white outline-none placeholder:text-slate-500 focus:border-fuchsia-400/50" />
        </div>
        <div className="mt-2">
          <span className="text-[9px] font-bold uppercase tracking-[.13em] text-slate-500">Animation library</span>
        </div>
      </div>

      <div className="shrink-0 p-3">
        <div className="grid grid-cols-2 gap-2">
          {filteredAnimations.slice(0, visibleCount).map(animation => (
            <button key={animation.id} type="button" disabled={!selectedText} onClick={() => onSelectAnimation?.(animation.id)} aria-pressed={selectedAnimationId === animation.id} className={'group flex min-w-0 flex-col rounded-xl border p-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ' + (selectedAnimationId === animation.id ? 'border-fuchsia-400/60 bg-fuchsia-500/10 ring-1 ring-fuchsia-400/20' : 'border-white/10 bg-white/[0.025] hover:border-fuchsia-300/35 hover:bg-white/[0.06]')}>
              <span className="relative flex h-12 w-full items-center justify-center overflow-hidden rounded-lg border border-white/[0.07] bg-[#101525]">
                <span className="text-[21px] font-black tracking-tight text-white transition-transform duration-300 group-hover:scale-110">Aa</span>
                {selectedAnimationId === animation.id && <CheckCircle2 className="absolute right-1 top-1 h-3.5 w-3.5 text-fuchsia-300" />}
              </span>
              <span className="mt-2 block w-full truncate text-[9px] font-semibold text-slate-100">{animation.name}</span>
              <span className="mt-1 line-clamp-2 min-h-[24px] text-[8px] leading-3 text-slate-500">{animation.description}</span>
            </button>
          ))}
        </div>
        {!filteredAnimations.length && <p className="py-8 text-center text-[9px] text-slate-500">No matching animations found.</p>}
        {visibleCount < filteredAnimations.length && <div ref={loadMoreRef} aria-hidden="true" className="flex h-12 items-center justify-center">
          {isLoadingMore && <span role="status" aria-label="Loading more animations" className="flex items-center gap-2 text-[9px] text-fuchsia-200"><span className="h-4 w-4 animate-spin rounded-full border-2 border-fuchsia-300/25 border-t-fuchsia-300" />Loading animations</span>}
        </div>}
      </div>
    </div>
  )
}
