'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, LoaderCircle, Play, Search, Sparkles, X } from 'lucide-react'

type Category = 'Recently' | 'Graphic' | 'Sketch' | 'Photo' | 'Video' | 'GIF'
type LibraryCategory = Exclude<Category, 'Recently'>
type Asset = {
  id: string; title: string; kind: 'image' | 'video' | 'icon' | 'gif'
  previewUrl: string; assetUrl: string; sourceUrl: string; creator?: string
  duration?: number; width?: number; height?: number; license?: string; licenseUrl?: string
}
type SearchResponse = { ok: boolean; assets?: Asset[]; hasMore?: boolean; total?: number; error?: string }
type SectionState = { assets: Asset[]; page: number; hasMore: boolean; loading: boolean; error: string }
const CATEGORIES: LibraryCategory[] = ['Graphic', 'Sketch', 'Photo', 'Video', 'GIF']
const PAGE_SIZE = 10
const SECTION_PREFETCH_DISTANCE = 220
const DEDICATED_PREFETCH_DISTANCE = 260
const DEFAULT_QUERIES: Record<LibraryCategory, string> = {
  Graphic: 'popular icons',
  Sketch: 'hand drawn illustration',
  Photo: 'popular nature photography',
  Video: 'nature',
  GIF: 'trending',
}
const EMPTY: SectionState = { assets: [], page: 0, hasMore: true, loading: false, error: '' }
const GIPHY_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY || process.env.NEXT_PUBLIC_GIPHY_API_KEY_WEB || process.env.NEXT_PUBLIC_GIPHY_API_KEY_ANDROID || ''

function normalizeGif(data: any): Asset[] {
  return (Array.isArray(data?.data) ? data.data : []).map((item: any) => {
    const images = item.images || {}
    const preview = images.fixed_width_small || images.preview_gif || images.fixed_width || images.original
    const original = images.original || images.fixed_width || preview
    return { id: 'giphy-' + String(item.id), title: String(item.title || 'GIF'), kind: 'gif' as const,
      previewUrl: String(preview?.url || preview?.webp || ''), assetUrl: String(original?.url || original?.webp || ''),
      sourceUrl: String(item.url || ''), creator: String(item.username || 'GIPHY'),
      width: Number(original?.width) || undefined, height: Number(original?.height) || undefined }
  }).filter((item: Asset) => item.previewUrl && item.assetUrl && item.sourceUrl)
}

export function StudioReplaceAssetBrowser({ onSelectAsset, importingId = null, onDedicatedViewChange }: {
  category?: Category; query?: string; onSelectAsset: (asset: Asset) => Promise<void>; importingId?: string | null; onDedicatedViewChange?: (open: boolean) => void
}) {
  const [sections, setSections] = useState<Record<LibraryCategory, SectionState>>(() => ({
    Graphic: { ...EMPTY }, Sketch: { ...EMPTY }, Photo: { ...EMPTY }, Video: { ...EMPTY }, GIF: { ...EMPTY },
  }))
  const [recent, setRecent] = useState<Asset[]>([])
  const [query, setQuery] = useState('')
  const [activeSection, setActiveSection] = useState<Category | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<Asset[]>([])
  const [searchError, setSearchError] = useState('')
  const [importError, setImportError] = useState('')
  const sectionScrolls = useRef<Record<string, HTMLDivElement | null>>({})
  const requestIds = useRef<Record<string, number>>({})
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchPageRef = useRef(1)
  const searchHasMoreRef = useRef(false)
  const searchMoreInFlight = useRef(false)
  const categoryMoreInFlight = useRef(new Set<LibraryCategory>())

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('socialens-studio-replace-recent-v1') || '[]')
      setRecent(Array.isArray(parsed) ? parsed.slice(0, 30) : [])
    } catch { setRecent([]) }
  }, [])

  const remember = (asset: Asset) => {
    setRecent(current => {
      const next = [asset, ...current.filter(item => item.id !== asset.id)].slice(0, 30)
      try { localStorage.setItem('socialens-studio-replace-recent-v1', JSON.stringify(next)) } catch {}
      return next
    })
  }

  const choose = async (asset: Asset) => {
    if (importingId) return
    setImportError('')
    try { await onSelectAsset(asset); remember(asset) }
    catch (error) { setImportError(error instanceof Error ? error.message : 'Could not import this element.') }
  }

  const removeRecent = (assetId: string) => {
    setRecent(current => {
      const next = current.filter(asset => asset.id !== assetId)
      try { localStorage.setItem('socialens-studio-replace-recent-v1', JSON.stringify(next)) } catch {}
      return next
    })
  }

  const renderRecentAsset = (asset: Asset) => (
    <div key={asset.id} className="group/recent relative h-[92px] w-[92px] shrink-0">
      {renderAsset(asset)}
      <button type="button" onClick={() => removeRecent(asset.id)}
        aria-label={'Remove ' + asset.title + ' from recently used'} title="Remove from recently used"
        className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-black/75 text-white opacity-100 shadow-sm transition hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400">
        <X className="h-3 w-3" />
      </button>
    </div>
  )

  const loadCategory = useCallback(async (category: LibraryCategory, page: number, term: string, append: boolean) => {
    const id = (requestIds.current[category] || 0) + 1
    requestIds.current[category] = id
    setSections(current => ({ ...current, [category]: { ...current[category], loading: true, error: '' } }))
    try {
      let assets: Asset[] = []
      let hasMore = false
      if (category === 'GIF') {
        if (!GIPHY_KEY) throw new Error('GIPHY API key is missing.')
        const url = new URL('https://api.giphy.com/v1/gifs/' + (term ? 'search' : 'trending'))
        url.searchParams.set('api_key', GIPHY_KEY)
        url.searchParams.set('limit', String(PAGE_SIZE))
        url.searchParams.set('offset', String((page - 1) * PAGE_SIZE))
        url.searchParams.set('rating', 'g')
        if (term) url.searchParams.set('q', term)
        const response = await fetch(url)
        if (!response.ok) throw new Error(response.status === 429 ? 'GIPHY rate limit reached.' : 'GIPHY is temporarily unavailable.')
        const data = await response.json()
        assets = normalizeGif(data)
        hasMore = assets.length === PAGE_SIZE && (page * PAGE_SIZE) < Number(data?.pagination?.total_count || 0)
      } else {
        const params = new URLSearchParams({ category, q: term || DEFAULT_QUERIES[category], page: String(page) })
        const response = await fetch('/api/studio/replace/search?' + params.toString())
        const data = await response.json() as SearchResponse
        if (!response.ok || !data.ok) throw new Error(data.error || 'This library is temporarily unavailable.')
        assets = data.assets || []
        hasMore = Boolean(data.hasMore)
        if (!assets.length && term && page === 1) {
          const fallback = new URLSearchParams({ category, q: DEFAULT_QUERIES[category], page: '1' })
          const fallbackResponse = await fetch('/api/studio/replace/search?' + fallback.toString())
          const fallbackData = await fallbackResponse.json() as SearchResponse
          if (fallbackResponse.ok && fallbackData.ok) { assets = fallbackData.assets || []; hasMore = Boolean(fallbackData.hasMore) }
        }
      }
      if (requestIds.current[category] !== id) return
      setSections(current => {
        const previous = current[category]
        const merged = append ? [...previous.assets, ...assets.filter(asset => !previous.assets.some(old => old.id === asset.id))] : assets
        return { ...current, [category]: { assets: merged, page, hasMore, loading: false, error: '' } }
      })
      return assets
    } catch (error) {
      if (requestIds.current[category] === id) setSections(current => ({ ...current, [category]: { ...current[category], loading: false, error: error instanceof Error ? error.message : 'Could not load assets.' } }))
      return []
    }
  }, [])

  useEffect(() => {
    CATEGORIES.forEach(category => { void loadCategory(category, 1, '', false) })
  }, [loadCategory])

  useEffect(() => { onDedicatedViewChange?.(activeSection !== null) }, [activeSection, onDedicatedViewChange])

  useEffect(() => {
    if (activeSection !== null) return
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!query.trim()) { setSearchResults([]); setSearchError(''); setSearching(false); return }
    const term = query.trim()
    setSearching(true)
    searchPageRef.current = 1
    searchHasMoreRef.current = false
    searchTimer.current = setTimeout(async () => {
      setSearchError('')
      const all: Asset[] = []
      let moreAvailable = false
      for (const category of CATEGORIES) {
        const id = (requestIds.current[category] || 0) + 1
        requestIds.current[category] = id
        try {
          let found: Asset[] = []
          if (category === 'GIF') {
            if (GIPHY_KEY) {
              const url = new URL('https://api.giphy.com/v1/gifs/search')
              url.searchParams.set('api_key', GIPHY_KEY); url.searchParams.set('q', term)
              url.searchParams.set('limit', String(PAGE_SIZE)); url.searchParams.set('rating', 'g')
              const response = await fetch(url)
              if (response.ok) { const gifData = await response.json(); found = normalizeGif(gifData); moreAvailable = moreAvailable || (Number(gifData?.pagination?.total_count || 0) > PAGE_SIZE) }
            }
          } else {
            const params = new URLSearchParams({ category, q: term, page: '1' })
            const response = await fetch('/api/studio/replace/search?' + params.toString())
            const data = await response.json() as SearchResponse
            if (response.ok && data.ok) { found = data.assets || []; moreAvailable = moreAvailable || Boolean(data.hasMore) }
            if (!found.length) {
              const fallback = new URLSearchParams({ category, q: DEFAULT_QUERIES[category], page: '1' })
              const fallbackResponse = await fetch('/api/studio/replace/search?' + fallback.toString())
              const fallbackData = await fallbackResponse.json() as SearchResponse
              if (fallbackResponse.ok && fallbackData.ok) found = fallbackData.assets || []
            }
          }
          all.push(...found)
        } catch {}
      }
      const unique = all.filter((asset, index) => all.findIndex(item => item.id === asset.id) === index)
      searchHasMoreRef.current = moreAvailable
      setSearchResults(unique)
      if (!unique.length) setSearchError('No matching assets are available at the moment. Try another word.')
      setSearching(false)
    }, 350)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [query, activeSection])

  useEffect(() => {
    if (!activeSection || activeSection === 'Recently') return
    const term = query.trim() || DEFAULT_QUERIES[activeSection]
    const timer = setTimeout(() => { void loadCategory(activeSection, 1, term, false) }, 250)
    return () => clearTimeout(timer)
  }, [activeSection, query, loadCategory])

  const loadMore = useCallback(async (category: LibraryCategory) => {
    const section = sections[category]
    if (section.loading || !section.hasMore || categoryMoreInFlight.current.has(category)) return
    categoryMoreInFlight.current.add(category)
    try { await loadCategory(category, section.page + 1, query.trim() || DEFAULT_QUERIES[category], true) }
    finally { categoryMoreInFlight.current.delete(category) }
  }, [sections, query, loadCategory])

  const loadMoreSearchResults = async () => {
    if (searching || searchMoreInFlight.current || !query.trim() || !searchHasMoreRef.current) return
    searchMoreInFlight.current = true
    setSearching(true)
    const term = query.trim()
    const nextPage = searchPageRef.current + 1
    const additions: Asset[] = []
    let moreAvailable = false
    for (const category of CATEGORIES) {
      try {
        if (category === 'GIF') {
          if (!GIPHY_KEY) continue
          const url = new URL('https://api.giphy.com/v1/gifs/search')
          url.searchParams.set('api_key', GIPHY_KEY)
          url.searchParams.set('q', term)
          url.searchParams.set('limit', String(PAGE_SIZE))
          url.searchParams.set('offset', String((nextPage - 1) * PAGE_SIZE))
          url.searchParams.set('rating', 'g')
          const response = await fetch(url)
          if (response.ok) { const gifData = await response.json(); additions.push(...normalizeGif(gifData)); moreAvailable = moreAvailable || (Number(gifData?.pagination?.total_count || 0) > nextPage * PAGE_SIZE) }
        } else {
          const params = new URLSearchParams({ category, q: term, page: String(nextPage) })
          const response = await fetch('/api/studio/replace/search?' + params.toString())
          const data = await response.json() as SearchResponse
          if (response.ok && data.ok) { additions.push(...(data.assets || [])); moreAvailable = moreAvailable || Boolean(data.hasMore) }
        }
      } catch {}
    }
    searchPageRef.current = nextPage
    searchHasMoreRef.current = moreAvailable
    setSearchResults(current => {
      const known = new Set(current.map(asset => asset.id))
      return [...current, ...additions.filter(asset => !known.has(asset.id) && (known.add(asset.id), true))]
    })
    setSearching(false)
    searchMoreInFlight.current = false
  }

  const renderAsset = (asset: Asset) => (
    <button key={asset.id} type="button" onClick={() => void choose(asset)} disabled={Boolean(importingId)}
      title={asset.title} aria-label={'Use ' + asset.title}
      className="group relative h-[92px] w-[92px] shrink-0 overflow-hidden rounded-md bg-[#252630] transition hover:ring-2 hover:ring-fuchsia-400/70 disabled:opacity-50">
      <img src={asset.previewUrl} alt="" loading="lazy" onError={event => { event.currentTarget.style.opacity = '0' }}
        className={asset.kind === 'icon' ? 'h-full w-full object-contain p-3' : 'h-full w-full object-cover transition group-hover:scale-105'} />
      {asset.kind === 'video' && <span className="absolute bottom-1 left-1 rounded bg-black/70 p-1"><Play className="h-3 w-3 text-white" /></span>}
      {asset.kind === 'gif' && <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[8px] font-bold text-white">GIF</span>}
      {importingId === asset.id && <span className="absolute inset-0 flex items-center justify-center bg-black/60"><LoaderCircle className="h-5 w-5 animate-spin text-white" /></span>}
    </button>
  )

  const renderRow = (category: LibraryCategory) => {
    const section = sections[category]
    return <section key={category} className="mb-5 min-w-0">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[12px] font-semibold text-slate-100">{category}</h3>
        <button type="button" onClick={() => setActiveSection(category)} className="text-[10px] font-semibold text-slate-300 hover:text-white">See more</button>
      </div>
      <div ref={node => { sectionScrolls.current[category] = node }} onScroll={event => {
        const node = event.currentTarget
        if (node.scrollWidth - node.scrollLeft - node.clientWidth < SECTION_PREFETCH_DISTANCE) void loadMore(category)
      }} className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin] [scrollbar-color:rgba(168,85,247,.45)_transparent]">
        {section.assets.map(renderAsset)}
        {section.loading && Array.from({ length: section.assets.length ? 3 : PAGE_SIZE }, (_, index) => <div key={'skeleton-' + index} className="h-[92px] w-[92px] shrink-0 animate-pulse rounded-md bg-white/[0.06]" />)}
        {!section.loading && !section.assets.length && <div className="flex h-[92px] w-full items-center justify-center rounded-md border border-dashed border-white/10 text-[10px] text-slate-500">{section.error || 'Loading more soon'}</div>}
      </div>
    </section>
  }

  const active = activeSection && activeSection !== 'Recently' ? sections[activeSection] : null
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <label className="mb-4 flex h-9 shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 focus-within:border-fuchsia-400/50">
      {activeSection && <button type="button" onClick={() => { setActiveSection(null); setQuery('') }} aria-label="Back to all element categories" className="text-slate-400 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /></button>}
      <Search className="h-3.5 w-3.5 text-slate-500" />
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search elements" aria-label="Search all elements" className="h-full min-w-0 flex-1 bg-transparent text-[11px] text-white outline-none placeholder:text-slate-500" />
      {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-slate-400"><X className="h-3.5 w-3.5" /></button>}
    </label>
    {importError && <p role="alert" className="mb-2 text-[9px] text-red-300">{importError}</p>}
    {activeSection ? <div className="flex min-h-0 flex-1 flex-col">
      <div onScroll={event => { const node = event.currentTarget; if (activeSection !== 'Recently' && node.scrollHeight - node.scrollTop - node.clientHeight < DEDICATED_PREFETCH_DISTANCE) void loadMore(activeSection) }} className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-3 gap-2">{(activeSection === 'Recently' ? recent.filter(asset => !query.trim() || asset.title.toLowerCase().includes(query.trim().toLowerCase())) : active?.assets || []).map(renderAsset)}</div>
        {active?.loading && <div className="flex justify-center py-4"><LoaderCircle className="h-4 w-4 animate-spin text-fuchsia-300" /></div>}
        {active?.error && !active.loading && <p className="py-5 text-center text-[10px] text-slate-500">{active.error}</p>}
      </div>
    </div> : query.trim() ? <div onScroll={event => { const node = event.currentTarget; if (node.scrollHeight - node.scrollTop - node.clientHeight < DEDICATED_PREFETCH_DISTANCE) void loadMoreSearchResults() }} className="min-h-0 flex-1 overflow-y-auto">
      <div className="mb-2 text-[10px] text-slate-500">{searching ? 'Finding matching elements…' : searchResults.length + ' elements'}</div>
      {searching ? <div className="grid grid-cols-3 gap-2">{Array.from({length:10},(_,i)=><div key={i} className="aspect-square animate-pulse rounded-md bg-white/[0.06]"/>)}</div>
        : searchResults.length ? <div className="grid grid-cols-3 gap-2">{searchResults.map(renderAsset)}</div>
        : <div className="py-8 text-center text-[10px] text-slate-500">{searchError || 'No results'}</div>}
    </div> : <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(168,85,247,.45)_transparent]">
      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between"><h3 className="text-[12px] font-semibold text-slate-100">Recently used</h3><button type="button" onClick={() => setActiveSection('Recently')} className="text-[10px] text-slate-400 hover:text-white">See more</button></div>
        {recent.length ? <div className="flex gap-2 overflow-x-auto pb-2">{recent.slice(0,10).map(renderRecentAsset)}</div> : <div className="flex h-[58px] items-center gap-2 text-[10px] text-slate-500"><Sparkles className="h-4 w-4" />Your recently used elements will appear here</div>}
      </section>
      {CATEGORIES.map(renderRow)}
    </div>}
  </div>
}
