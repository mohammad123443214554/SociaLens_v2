'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Check, ChevronDown, Crop, ImagePlus, Layers3, LayoutTemplate,
  MousePointer2, Palette, Play, Redo2, Save, Sparkles, Sticker, Type,
  Undo2, Video, WandSparkles, X, ZoomIn, ZoomOut
} from 'lucide-react'

type CanvasKind = 'story' | 'post' | 'reel'
type StudioTool = 'select' | 'media' | 'text' | 'stickers' | 'background' | 'effects'

const canvasPresets: Record<CanvasKind, { label: string; width: number; height: number; description: string }> = {
  story: { label: 'Story', width: 1080, height: 1920, description: 'Vertical 9:16 canvas' },
  post: { label: 'Post', width: 1080, height: 1080, description: 'Square 1:1 canvas' },
  reel: { label: 'Reel', width: 1080, height: 1920, description: 'Vertical 9:16 canvas' },
}

const tools: { id: StudioTool; label: string; icon: typeof MousePointer2; description: string }[] = [
  { id: 'select', label: 'Select', icon: MousePointer2, description: 'Select and arrange objects on your canvas.' },
  { id: 'media', label: 'Media', icon: ImagePlus, description: 'Add a photo or video to your project.' },
  { id: 'text', label: 'Text', icon: Type, description: 'Add titles, captions and text elements.' },
  { id: 'stickers', label: 'Stickers', icon: Sticker, description: 'Explore stickers and expressive elements.' },
  { id: 'background', label: 'Background', icon: Palette, description: 'Choose a background for your canvas.' },
  { id: 'effects', label: 'Effects', icon: WandSparkles, description: 'Explore creative looks and visual effects.' },
]

export function StudioWorkspace() {
  const [kind, setKind] = useState<CanvasKind>('story')
  const [tool, setTool] = useState<StudioTool>('select')
  const [projectName, setProjectName] = useState('Untitled project')
  const [zoom, setZoom] = useState(58)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null)
  const [mediaName, setMediaName] = useState('')
  const [showPresets, setShowPresets] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => {
    if (mediaUrl?.startsWith('blob:')) URL.revokeObjectURL(mediaUrl)
  }, [mediaUrl])

  const selectMedia = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return
    const nextUrl = URL.createObjectURL(file)
    setMediaUrl(previous => {
      if (previous?.startsWith('blob:')) URL.revokeObjectURL(previous)
      return nextUrl
    })
    setMediaType(file.type.startsWith('video/') ? 'video' : 'image')
    setMediaName(file.name)
    setTool('select')
  }

  const preset = canvasPresets[kind]
  const activeTool = tools.find(item => item.id === tool) ?? tools[0]

  return (
    <main className="fixed inset-0 z-[60] flex min-h-dvh flex-col overflow-hidden bg-[#080a13] text-white">
      <header className="z-20 flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#0d1020] px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/create/options" aria-label="Back to create options" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 text-slate-300 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <img src="/images/socialens-studio-logo.png" alt="SociaLens Studio" className="h-9 w-9 shrink-0 object-contain" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight">SociaLens Studio</p>
            <input aria-label="Project name" value={projectName} onChange={event => setProjectName(event.target.value)} maxLength={80} className="block w-full max-w-44 border-0 bg-transparent p-0 text-[11px] text-slate-400 outline-none placeholder:text-slate-500 focus:text-white" />
          </div>
        </div>

        <div className="hidden items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1 md:flex">
          {(['story', 'post', 'reel'] as CanvasKind[]).map(value => (
            <button key={value} type="button" onClick={() => setKind(value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${kind === value ? 'bg-pink-500/15 text-pink-300' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>{value}</button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" disabled title="Undo will be available with editing tools" className="hidden h-9 w-9 items-center justify-center rounded-lg text-slate-600 sm:flex"><Undo2 className="h-4 w-4" /></button>
          <button type="button" disabled title="Redo will be available with editing tools" className="hidden h-9 w-9 items-center justify-center rounded-lg text-slate-600 sm:flex"><Redo2 className="h-4 w-4" /></button>
          <span className="mx-1 hidden h-6 w-px bg-white/10 sm:block" />
          <button type="button" disabled title="Project saving will be enabled in a later Studio part" className="inline-flex h-9 items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 px-3 text-xs font-bold text-white opacity-60 sm:px-4"><Save className="h-4 w-4" /><span className="hidden sm:inline">Save project</span></button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="z-10 flex shrink-0 flex-row overflow-x-auto border-b border-white/10 bg-[#0d1020] p-2 md:w-[76px] md:flex-col md:items-center md:gap-2 md:overflow-visible md:border-b-0 md:border-r md:p-3">
          {tools.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => { setTool(id); if (id === 'media') fileRef.current?.click() }} aria-pressed={tool === id} className={`flex min-w-[62px] flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-medium transition md:w-full md:py-3 ${tool === id ? 'bg-pink-500/15 text-pink-300 ring-1 ring-pink-500/25' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
              <Icon className="h-5 w-5" /><span>{label}</span>
            </button>
          ))}
          <div className="hidden flex-1 md:block" />
          <button type="button" onClick={() => setShowPresets(value => !value)} className="ml-auto flex min-w-[62px] flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] text-slate-400 hover:bg-white/5 md:ml-0 md:w-full md:py-3"><LayoutTemplate className="h-5 w-5" /><span>Canvas</span></button>
        </aside>

        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[radial-gradient(ellipse_at_center,_rgba(74,58,120,0.16),_transparent_62%),#090c17]">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/5 px-3 py-2.5 sm:px-5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-xs font-semibold text-slate-200">{preset.label} canvas</span>
              <span className="hidden text-[11px] text-slate-500 sm:inline">{preset.width} × {preset.height} px</span>
              <button type="button" onClick={() => setShowPresets(value => !value)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-slate-400 hover:bg-white/5 md:hidden">{kind}<ChevronDown className="h-3 w-3" /></button>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <button type="button" onClick={() => setZoom(value => Math.max(25, value - 5))} aria-label="Zoom out" className="rounded-lg p-1.5 hover:bg-white/10"><ZoomOut className="h-4 w-4" /></button>
              <span className="w-9 text-center tabular-nums">{zoom}%</span>
              <button type="button" onClick={() => setZoom(value => Math.min(100, value + 5))} aria-label="Zoom in" className="rounded-lg p-1.5 hover:bg-white/10"><ZoomIn className="h-4 w-4" /></button>
            </div>
          </div>

          {showPresets && <div className="absolute left-3 top-14 z-30 w-52 rounded-xl border border-white/10 bg-[#111629] p-2 shadow-2xl md:left-4">
            <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Canvas format</p>
            {(['story', 'post', 'reel'] as CanvasKind[]).map(value => <button key={value} type="button" onClick={() => { setKind(value); setShowPresets(false) }} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs capitalize hover:bg-white/5"><span>{value}</span>{kind === value && <Check className="h-4 w-4 text-pink-400" />}</button>)}
          </div>}

          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 sm:p-7">
            <div style={{ width: `min(calc(100vw - 40px), calc((100dvh - 210px) * ${preset.width / preset.height}), ${zoom * 7}px)`, aspectRatio: `${preset.width} / ${preset.height}` }} className="relative flex max-h-full max-w-full items-center justify-center overflow-hidden rounded-[3px] border border-white/20 bg-[#111827] shadow-[0_24px_90px_rgba(0,0,0,0.55)]">
              {mediaUrl && mediaType === 'image' && <img src={mediaUrl} alt={mediaName || 'Selected canvas media'} className="absolute inset-0 h-full w-full object-contain" />}
              {mediaUrl && mediaType === 'video' && <video src={mediaUrl} controls playsInline className="absolute inset-0 h-full w-full object-contain" />}
              {!mediaUrl && <div className="flex max-w-[80%] flex-col items-center text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]"><ImagePlus className="h-6 w-6 text-slate-400" /></div>
                <h2 className="text-sm font-semibold text-slate-200 sm:text-base">Your {kind} starts here</h2>
                <p className="mt-2 text-xs leading-5 text-slate-500">Choose a photo or video to place it on your canvas. Editing controls will be added in the next Studio part.</p>
                <button type="button" onClick={() => fileRef.current?.click()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-pink-950/30"><ImagePlus className="h-4 w-4" /> Add media</button>
              </div>}
              {mediaUrl && <button type="button" onClick={() => { if (mediaUrl.startsWith('blob:')) URL.revokeObjectURL(mediaUrl); setMediaUrl(null); setMediaType(null); setMediaName('') }} aria-label="Remove selected media" className="absolute right-2 top-2 z-10 rounded-lg bg-black/65 p-2 text-white hover:bg-black"><X className="h-4 w-4" /></button>}
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between border-t border-white/5 px-3 py-2 text-[10px] text-slate-500 sm:px-5">
            <span className="truncate">{mediaName || 'No media selected'}</span>
            <span>{preset.description}</span>
          </div>
        </section>

        <aside className="hidden w-[270px] shrink-0 flex-col border-l border-white/10 bg-[#0d1020] lg:flex">
          <div className="border-b border-white/10 px-4 py-4">
            <p className="text-sm font-bold">{activeTool.label}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{activeTool.description}</p>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]"><Layers3 className="h-5 w-5 text-slate-500" /></div>
            <p className="text-xs font-semibold text-slate-300">Workspace panel</p>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">This panel is ready for {activeTool.label.toLowerCase()} controls. The full editing tools arrive in the next Studio part.</p>
          </div>
          <div className="border-t border-white/10 p-4"><div className="flex items-center gap-2 text-[10px] text-slate-500"><Sparkles className="h-3.5 w-3.5 text-pink-400" /> One unified creative workspace</div></div>
        </aside>
      </div>

      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={event => { selectMedia(event.target.files?.[0]); event.target.value = '' }} />
    </main>
  )
}
