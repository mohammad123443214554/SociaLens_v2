'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LoaderCircle, ExternalLink, Play, Image as ImageIcon, Sparkles } from 'lucide-react'

type Category = 'Recently' | 'Graphic' | 'Sketch' | 'Photo' | 'Video' | 'GIF'
type Asset = {
  id: string
  title: string
  kind: 'image' | 'video' | 'icon' | 'gif'
  previewUrl: string
  assetUrl: string
  sourceUrl: string
  creator?: string
  duration?: number
  width?: number
  height?: number
  license?: string
  licenseUrl?: string
}
type SearchResponse = { ok: boolean; assets?: Asset[]; hasMore?: boolean; total?: number; error?: string; code?: string }

const GIPHY_API_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY || process.env.NEXT_PUBLIC_GIPHY_API_KEY_WEB || process.env.NEXT_PUBLIC_GIPHY_API_KEY_ANDROID || ''
const PAGE_SIZE = 10
const DEFAULT_QUERIES: Record<Exclude<Category, 'Recently'>, string> = {
  Graphic: 'popular',
  Sketch: 'illustration',
  Photo: 'nature landscape',
  Video: 'nature',
  GIF: 'trending',
}

function normalizeGiphy(data: any): Asset[] {
  return (Array.isArray(data?.data) ? data.data : []).map((item: any) => {
    const images = item.images || {}
    const rendition = images.fixed_width_small || images.preview_gif || images.fixed_width || images.original
    const original = images.original || images.fixed_width || rendition
    return {
      id: 'giphy-' + String(item.id),
      title: String(item.title || 'Animated GIF').slice(0, 140),
      kind: 'gif' as const,
      previewUrl: String(rendition?.url || rendition?.webp || ''),
      assetUrl: String(original?.url || original?.webp || ''),
      sourceUrl: String(item.url || ''),
      creator: String(item.username || 'GIPHY'),
      width: Number(original?.width) || undefined,
      height: Number(original?.height) || undefined,
    }
  }).filter((item: Asset) => item.previewUrl && item.assetUrl && item.sourceUrl)
}

export function StudioReplaceAssetBrowser({ category, onSelectAsset, importingId = null }: { category: Category; query?: string; onSelectAsset: (asset: Asset) => Promise<void>; importingId?: string | null }) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [recentAssets, setRecentAssets] = useState<Asset[]>([])
  const [recentError, setRecentError] = useState('')
  const requestSequence = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const categoryQuery = category === 'Recently' ? '' : DEFAULT_QUERIES[category]

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('socialens-studio-replace-recent-v1')
      const parsed = raw ? JSON.parse(raw) : []
      setRecentAssets(Array.isArray(parsed) ? parsed.slice(0, 30) : [])
    } catch { setRecentAssets([]) }
  }, [])

  const rememberAsset = (asset: Asset) => {
    if (asset.kind === 'gif') return
    setRecentAssets(current => {
      const next = [asset, ...current.filter(item => item.id !== asset.id)].slice(0, 30)
      try { window.localStorage.setItem('socialens-studio-replace-recent-v1', JSON.stringify(next)) } catch { /* Optional local history. */ }
      return next
    })
  }

  const chooseAsset = async (asset: Asset) => {
    if (importingId) return
    setRecentError('')
    try {
      await onSelectAsset(asset)
      rememberAsset(asset)
    } catch (cause) {
      setRecentError(cause instanceof Error ? cause.message : 'Could not import this asset.')
    }
  }

  const fetchPage = useCallback(async (targetPage: number, append: boolean, signal?: AbortSignal) => {
    if (category === 'Recently') return
    if (category === 'GIF') {
      if (!GIPHY_API_KEY) throw new Error('GIPHY API key is not configured in Vercel.')
      const url = new URL('https://api.giphy.com/v1/gifs/' + (targetPage === 1 ? 'trending' : 'trending'))
      url.searchParams.set('api_key', GIPHY_API_KEY)
      url.searchParams.set('limit', String(PAGE_SIZE))
      url.searchParams.set('offset', String((targetPage - 1) * PAGE_SIZE))
      url.searchParams.set('rating', 'g')
      const response = await fetch(url, { signal })
      if (!response.ok) throw new Error(response.status === 429 ? 'GIPHY rate limit reached. Please wait and try again.' : 'GIPHY is temporarily unavailable.')
      const data = await response.json()
      const next = normalizeGiphy(data)
      setAssets(current => append ? [...current, ...next.filter(item => !current.some(existing => existing.id === item.id))] : next)
      setTotal(Number(data?.pagination?.total_count) || next.length)
      setHasMore(next.length === PAGE_SIZE && (targetPage * PAGE_SIZE) < (Number(data?.pagination?.total_count) || 0))
    } else {
      const params = new URLSearchParams({ category, q: categoryQuery, page: String(targetPage) })
      const response = await fetch('/api/studio/replace/search?' + params.toString(), { signal })
      const data = await response.json() as SearchResponse
      if (!response.ok || !data.ok) throw new Error(data.error || 'Asset library is temporarily unavailable.')
      const next = data.assets || []
      setAssets(current => append ? [...current, ...next.filter(item => !current.some(existing => existing.id === item.id))] : next)
      setTotal(Number(data.total) || next.length)
      setHasMore(Boolean(data.hasMore))
    }
  }, [category, categoryQuery])

  useEffect(() => {
    const sequence = ++requestSequence.current
    const controller = new AbortController()
    setAssets([])
    setPage(1)
    setHasMore(false)
    setTotal(0)
    setError('')
    if (category === 'Recently') return () => controller.abort()
    setLoading(true)
    void fetchPage(1, false, controller.signal).catch(cause => {
      if (!controller.signal.aborted && requestSequence.current === sequence) setError(cause instanceof Error ? cause.message : 'Could not load assets.')
    }).finally(() => {
      if (!controller.signal.aborted && requestSequence.current === sequence) setLoading(false)
    })
    return () => controller.abort()
  }, [category, fetchPage])

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore || category === 'Recently') return
    setLoadingMore(true)
    const nextPage = page + 1
    try {
      await fetchPage(nextPage, true)
      setPage(nextPage)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load more assets.')
    } finally {
      setLoadingMore(false)
    }
  }, [category, fetchPage, hasMore, loading, loadingMore, page])

  const handleScroll = () => {
    const node = scrollRef.current
    if (!node || loadingMore || loading || !hasMore) return
    if (node.scrollHeight - node.scrollTop - node.clientHeight < 180) void loadMore()
  }

  const renderAsset = (asset: Asset) => (
    <article key={asset.id} className="group min-w-0 overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.025]">
      <div className="relative aspect-square overflow-hidden bg-[#171b2b]">
        <img src={asset.previewUrl} alt={asset.title} loading="lazy" onError={event => { event.currentTarget.style.display = 'none' }} className={asset.kind === 'icon' ? 'h-full w-full object-contain p-5' : 'h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]'} />
        {asset.kind === 'video' && <span className="absolute bottom-2 left-2 rounded-md bg-black/70 p-1"><Play className="h-3 w-3 text-white" /></span>}
        {asset.kind === 'gif' && <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[8px] font-bold text-white">GIF</span>}
        {importingId === asset.id && <span className="absolute inset-0 flex items-center justify-center bg-black/60"><LoaderCircle className="h-5 w-5 animate-spin text-white" /></span>}
      </div>
      <div className="p-2">
        <p className="truncate text-[9px] font-medium text-slate-200" title={asset.title}>{asset.title}</p>
        <p className="mt-0.5 truncate text-[8px] text-slate-500">{asset.creator || 'Community asset'}{asset.duration ? ' · ' + asset.duration + 's' : ''}</p>
        {asset.license && <p className="mt-1 truncate text-[8px] text-slate-500" title={asset.license}>{asset.license}</p>}
        <a href={asset.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[8px] text-fuchsia-300 hover:text-fuchsia-200">Source <ExternalLink className="h-2.5 w-2.5" /></a>
        {asset.kind === 'gif' ? <p className="mt-2 text-[8px] leading-3 text-slate-500">Powered by GIPHY</p> : <button type="button" onClick={() => void chooseAsset(asset)} disabled={Boolean(importingId)} className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-gradient-to-r from-violet-600 to-fuchsia-600 text-[9px] font-bold text-white disabled:opacity-50">{importingId === asset.id ? <><LoaderCircle className="h-3 w-3 animate-spin" /> Importing…</> : 'Use this asset'}</button>}
      </div>
    </article>
  )

  return <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(168,85,247,.55)_transparent]">
    {recentError && <p role="alert" className="mb-2 rounded-lg border border-red-400/20 bg-red-400/5 p-2 text-[9px] text-red-200">{recentError}</p>}
    {category === 'Recently' ? recentAssets.length
      ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{recentAssets.map(renderAsset)}</div>
      : <div className="flex flex-col items-center justify-center py-10 text-center"><Sparkles className="h-5 w-5 text-slate-500" /><p className="mt-3 text-[10px] font-semibold text-slate-300">No recently used assets</p><p className="mt-1 max-w-[230px] text-[9px] leading-4 text-slate-500">Assets you successfully import will appear here on this device.</p></div>
      : <>
        <div className="mb-2 flex items-center justify-between gap-2"><p className="text-[9px] text-slate-500">{loading ? 'Loading popular assets…' : total ? total.toLocaleString() + ' results' : assets.length + ' assets'}</p><span className="text-[8px] text-slate-500">Popular picks · {PAGE_SIZE} per batch</span></div>
        {loading && !assets.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{Array.from({ length: PAGE_SIZE }, (_, index) => <div key={index} className="aspect-square animate-pulse rounded-lg bg-white/[0.05]" />)}</div>
          : error && !assets.length ? <div className="rounded-lg border border-red-400/15 bg-red-400/[0.05] p-3 text-[10px] leading-4 text-red-200" role="alert">{error}</div>
          : assets.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{assets.map(renderAsset)}</div>
          : <div className="py-10 text-center"><ImageIcon className="mx-auto h-5 w-5 text-slate-600" /><p className="mt-3 text-[10px] font-semibold text-slate-300">No assets available right now</p><p className="mt-1 text-[9px] text-slate-500">This library returned no matching popular assets.</p></div>}
        {error && assets.length > 0 && <p role="alert" className="mt-2 text-[9px] text-red-300">{error}</p>}
        {loadingMore && <div className="flex items-center justify-center gap-2 py-4 text-[9px] text-slate-400"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />Loading more assets…</div>}
        {hasMore && !loadingMore && <p className="py-3 text-center text-[8px] text-slate-500">Scroll down to load more</p>}
      </>}
  </div>
}
