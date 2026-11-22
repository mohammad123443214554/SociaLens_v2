'use client'

import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { LoaderCircle, Search, ExternalLink, Play, Image as ImageIcon, Sparkles } from 'lucide-react'

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
type SearchResponse = { ok: boolean; assets?: Asset[]; hasMore?: boolean; total?: number; error?: string; code?: string; provider?: string }

const GIPHY_API_KEY = Capacitor.isNativePlatform() ? (process.env.NEXT_PUBLIC_GIPHY_API_KEY_ANDROID || '') : (process.env.NEXT_PUBLIC_GIPHY_API_KEY_WEB || '')

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

export function StudioReplaceAssetBrowser({ category, query, onSelectAsset, importingId = null }: { category: Category; query: string; onSelectAsset: (asset: Asset) => Promise<void>; importingId?: string | null }) {
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
  const trimmedQuery = query.trim()

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
      try { window.localStorage.setItem('socialens-studio-replace-recent-v1', JSON.stringify(next)) } catch { /* Recent history is optional when browser storage is unavailable. */ }
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

  useEffect(() => {
    const sequence = ++requestSequence.current
    setAssets([])
    setPage(1)
    setHasMore(false)
    setTotal(0)
    setError('')
    if (category === 'Recently') return
    if (trimmedQuery.length < 2) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        if (category === 'GIF') {
          if (!GIPHY_API_KEY) throw new Error('GIPHY is not configured yet. Add the platform-specific GIPHY API key in Vercel Environment Variables.')
          const url = new URL('https://api.giphy.com/v1/gifs/search')
          url.searchParams.set('api_key', GIPHY_API_KEY)
          url.searchParams.set('q', trimmedQuery.slice(0, 50))
          url.searchParams.set('limit', '50')
          url.searchParams.set('offset', '0')
          url.searchParams.set('rating', 'g')
          url.searchParams.set('lang', 'en')
          const response = await fetch(url, { signal: controller.signal })
          if (!response.ok) throw new Error(response.status === 429 ? 'GIPHY search limit reached. Please wait and try again.' : 'GIPHY is temporarily unavailable.')
          const data = await response.json()
          const next = normalizeGiphy(data)
          if (requestSequence.current !== sequence) return
          setAssets(next)
          setTotal(Number(data?.pagination?.total_count) || next.length)
          setHasMore(next.length === 50 && Number(data?.pagination?.total_count) > 50)
        } else {
          const params = new URLSearchParams({ category, q: trimmedQuery, page: '1' })
          const response = await fetch('/api/studio/replace/search?' + params.toString(), { signal: controller.signal })
          const data = await response.json() as SearchResponse
          if (!response.ok || !data.ok) throw new Error(data.error || 'Asset search failed. Please try again.')
          if (requestSequence.current !== sequence) return
          setAssets(data.assets || [])
          setTotal(data.total || 0)
          setHasMore(Boolean(data.hasMore))
        }
      } catch (cause) {
        if (controller.signal.aborted || requestSequence.current !== sequence) return
        setError(cause instanceof Error ? cause.message : 'Asset search failed. Please try again.')
      } finally {
        if (!controller.signal.aborted && requestSequence.current === sequence) setLoading(false)
      }
    }, 350)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [category, trimmedQuery])

  const loadMore = async () => {
    if (loadingMore || !hasMore || category === 'Recently' || trimmedQuery.length < 2) return
    setLoadingMore(true)
    const nextPage = page + 1
    try {
      if (category === 'GIF') {
        const url = new URL('https://api.giphy.com/v1/gifs/search')
        url.searchParams.set('api_key', GIPHY_API_KEY)
        url.searchParams.set('q', trimmedQuery.slice(0, 50))
        url.searchParams.set('limit', '50')
        url.searchParams.set('offset', String((nextPage - 1) * 50))
        url.searchParams.set('rating', 'g')
        url.searchParams.set('lang', 'en')
        const response = await fetch(url)
        if (!response.ok) throw new Error('Could not load more GIFs. Please try again.')
        const data = await response.json()
        const next = normalizeGiphy(data)
        setAssets(current => [...current, ...next.filter(item => !current.some(existing => existing.id === item.id))])
        setHasMore(next.length === 50 && (nextPage * 50) < (Number(data?.pagination?.total_count) || 0))
      } else {
        const params = new URLSearchParams({ category, q: trimmedQuery, page: String(nextPage) })
        const response = await fetch('/api/studio/replace/search?' + params.toString())
        const data = await response.json() as SearchResponse
        if (!response.ok || !data.ok) throw new Error(data.error || 'Could not load more assets.')
        setAssets(current => [...current, ...(data.assets || []).filter(item => !current.some(existing => existing.id === item.id))])
        setHasMore(Boolean(data.hasMore))
      }
      setPage(nextPage)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load more assets.')
    } finally {
      setLoadingMore(false)
    }
  }

  if (category === 'Recently') {
    return <div className="min-h-0 flex-1">
      {recentError && <p role="alert" className="mb-2 rounded-lg border border-red-400/20 bg-red-400/5 p-2 text-[9px] text-red-200">{recentError}</p>}
      {recentAssets.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{recentAssets.map(asset => <article key={asset.id} className="min-w-0 overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.025]"><button type="button" onClick={() => void chooseAsset(asset)} disabled={Boolean(importingId)} className="block w-full text-left disabled:opacity-50"><div className="relative aspect-square overflow-hidden bg-black/20"><img src={asset.previewUrl} alt={asset.title} loading="lazy" className={asset.kind === 'icon' ? 'h-full w-full object-contain p-5' : 'h-full w-full object-cover'} />{importingId === asset.id && <span className="absolute inset-0 flex items-center justify-center bg-black/60"><LoaderCircle className="h-5 w-5 animate-spin text-white" /></span>}</div><div className="p-2"><p className="truncate text-[9px] font-medium text-slate-200">{asset.title}</p><p className="mt-0.5 truncate text-[8px] text-slate-500">{asset.creator || 'Community asset'}</p></div></button></article>)}</div>
        : <div className="flex flex-col items-center justify-center py-10 text-center"><div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]"><Sparkles className="h-4 w-4 text-slate-500" /></div><p className="mt-3 text-[10px] font-semibold text-slate-300">No recently used assets</p><p className="mt-1 max-w-[230px] text-[9px] leading-4 text-slate-500">Assets you successfully import will appear here on this device.</p></div>}
    </div>
  }
  if (trimmedQuery.length < 2) {
    return <div className="flex flex-1 flex-col items-center justify-center py-10 text-center"><Search className="h-5 w-5 text-slate-600" /><p className="mt-3 text-[10px] font-semibold text-slate-300">Search {category.toLowerCase()} assets</p><p className="mt-1 max-w-[230px] text-[9px] leading-4 text-slate-500">Enter at least 2 characters to search the {category} library.</p></div>
  }

  return <div className="min-h-0 flex-1">
    {recentError && <p role="alert" className="mb-2 rounded-lg border border-red-400/20 bg-red-400/5 p-2 text-[9px] text-red-200">{recentError}</p>}
    <div className="mb-2 flex items-center justify-between gap-2"><p className="text-[9px] text-slate-500">{loading ? 'Searching…' : total ? total.toLocaleString() + ' results found' : assets.length ? assets.length + ' results' : 'Search results'}</p>{assets.length > 0 && <span className="text-[8px] text-slate-500">Select to import</span>}</div>
    {loading && !assets.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><div className="aspect-square animate-pulse rounded-lg bg-white/[0.05]" /><div className="aspect-square animate-pulse rounded-lg bg-white/[0.05]" /><div className="aspect-square animate-pulse rounded-lg bg-white/[0.05]" /><div className="aspect-square animate-pulse rounded-lg bg-white/[0.05]" /></div>
      : error ? <div className="rounded-lg border border-red-400/15 bg-red-400/[0.05] p-3 text-[10px] leading-4 text-red-200" role="alert">{error}</div>
      : assets.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{assets.map(asset => <article key={asset.id} className="group min-w-0 overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.025]"><div className="relative aspect-square overflow-hidden bg-black/20">{asset.kind === 'icon' ? <img src={asset.previewUrl} alt={asset.title} loading="lazy" className="h-full w-full object-contain p-5" /> : <img src={asset.previewUrl} alt={asset.title} loading="lazy" className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]" />}{asset.kind === 'video' && <span className="absolute bottom-2 left-2 rounded-md bg-black/70 p-1"><Play className="h-3 w-3 text-white" /></span>}{asset.kind === 'gif' && <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[8px] font-bold text-white">GIF</span>}</div><div className="p-2"><p className="truncate text-[9px] font-medium text-slate-200" title={asset.title}>{asset.title}</p><p className="mt-0.5 truncate text-[8px] text-slate-500">{asset.creator || 'Community asset'}{asset.duration ? ' · ' + asset.duration + 's' : ''}</p>{asset.license && <p className="mt-1 truncate text-[8px] text-slate-500" title={asset.license}>{asset.license}</p>}<a href={asset.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[8px] text-fuchsia-300 hover:text-fuchsia-200">Source <ExternalLink className="h-2.5 w-2.5" /></a>{asset.kind === 'gif' ? <p className="mt-2 text-[8px] leading-3 text-slate-500">Powered by GIPHY · Preview only</p> : <button type="button" onClick={() => void chooseAsset(asset)} disabled={Boolean(importingId)} className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-gradient-to-r from-violet-600 to-fuchsia-600 text-[9px] font-bold text-white disabled:opacity-50">{importingId === asset.id ? <><LoaderCircle className="h-3 w-3 animate-spin" /> Importing…</> : 'Use this asset'}</button>}</div></article>)}</div>
      : <div className="py-10 text-center"><ImageIcon className="mx-auto h-5 w-5 text-slate-600" /><p className="mt-3 text-[10px] font-semibold text-slate-300">No assets found</p><p className="mt-1 text-[9px] text-slate-500">Try a shorter or more specific search.</p></div>}
    {hasMore && <button type="button" onClick={loadMore} disabled={loadingMore} className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] text-[9px] font-semibold text-slate-300 transition hover:bg-white/[0.07] disabled:opacity-50">{loadingMore && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}Load more</button>}
  </div>
}
