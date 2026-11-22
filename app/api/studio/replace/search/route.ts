import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' }
const jsonError = (message: string, status: number, code: string, retryable = false) =>
  NextResponse.json({ ok: false, error: message, code, retryable }, { status, headers: NO_STORE })

async function requireUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return error || !user ? null : user
}

function boundedInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

function cleanQuery(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 100)
}

async function fetchJson(url: URL, revalidate: number) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
    next: { revalidate },
  })
  if (response.status === 429) throw Object.assign(new Error('This asset library is receiving too many searches. Please wait a moment and try again.'), { status: 429, code: 'rate_limited' })
  if (!response.ok) throw Object.assign(new Error('The asset library is temporarily unavailable. Please try again.'), { status: response.status, code: 'provider_error' })
  return response.json()
}

const SEARCH_SYNONYMS: Record<string, string[]> = {
  rose: ['roses', 'bloom', 'floral', 'petals'],
  flower: ['flowers', 'bloom', 'blossom', 'floral'],
  cat: ['cats', 'kitten', 'feline'],
  dog: ['dogs', 'puppy', 'canine'],
  mountain: ['mountains', 'landscape', 'hills'],
  beach: ['coast', 'seaside', 'ocean'],
  car: ['automobile', 'vehicle'],
  food: ['cuisine', 'dish', 'meal'],
  tree: ['trees', 'forest', 'woodland'],
  sketch: ['drawing', 'line art', 'pencil art'],
  logo: ['symbol', 'brand mark', 'emblem'],
}

function expandSearchQuery(query: string, extras: string[] = []) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const expanded = [...terms]
  for (const term of terms) expanded.push(...(SEARCH_SYNONYMS[term] || []))
  expanded.push(...extras)
  return [...new Set(expanded)].join(' ').slice(0, 100)
}

async function searchPixabay(query: string, page: number, kind: 'image' | 'video'): Promise<{ assets: Asset[]; hasMore: boolean; total: number }> {
  const key = process.env.PIXABAY_API_KEY?.trim()
  if (!key) throw Object.assign(new Error('Pixabay is not configured yet. Add PIXABAY_API_KEY in Vercel Environment Variables.'), { status: 503, code: 'not_configured' })
  const url = new URL(kind === 'video' ? 'https://pixabay.com/api/videos/' : 'https://pixabay.com/api/')
  url.searchParams.set('key', key)
  url.searchParams.set('q', expandSearchQuery(query))
  url.searchParams.set('page', String(page))
  url.searchParams.set('per_page', '40')
  url.searchParams.set('safesearch', 'true')
  url.searchParams.set('lang', 'en')
  if (kind === 'image') {
    url.searchParams.set('image_type', 'photo')
    url.searchParams.set('orientation', 'all')
  } else {
    url.searchParams.set('video_type', 'all')
  }
  const data = await fetchJson(url, 86400) as {
    total?: number
    totalHits?: number
    hits?: Array<Record<string, any>>
  }
  const hits = Array.isArray(data.hits) ? data.hits : []
  const assets = hits.map(hit => {
    if (kind === 'video') {
      const videos = hit.videos && typeof hit.videos === 'object' ? hit.videos : {}
      const rendition = videos.medium || videos.small || videos.tiny || videos.large
      return {
        id: 'pixabay-video-' + String(hit.id),
        title: String(hit.tags || 'Pixabay video').slice(0, 120),
        kind: 'video' as const,
        previewUrl: String(rendition?.thumbnail || ''),
        assetUrl: String(rendition?.url || ''),
        sourceUrl: String(hit.pageURL || ''),
        creator: String(hit.user || 'Pixabay contributor'),
        duration: Number(hit.duration) || undefined,
        width: Number(rendition?.width) || undefined,
        height: Number(rendition?.height) || undefined,
      }
    }
    return {
      id: 'pixabay-photo-' + String(hit.id),
      title: String(hit.tags || 'Pixabay photo').slice(0, 120),
      kind: 'image' as const,
      previewUrl: String(hit.webformatURL || hit.previewURL || ''),
      assetUrl: String(hit.largeImageURL || hit.webformatURL || ''),
      sourceUrl: String(hit.pageURL || ''),
      creator: String(hit.user || 'Pixabay contributor'),
      width: Number(hit.imageWidth) || undefined,
      height: Number(hit.imageHeight) || undefined,
    }
  }).filter(asset => asset.previewUrl && asset.assetUrl && asset.sourceUrl)
  const total = Number(data.totalHits ?? data.total) || 0
  return { assets, hasMore: page * 40 < Math.min(total, 500), total }
}

async function searchOpenverse(query: string, page: number): Promise<{ assets: Asset[]; hasMore: boolean; total: number }> {
  const expandedQuery = expandSearchQuery(query, ['sketch', 'drawing', 'illustration', 'line art', 'pencil art'])
  const url = new URL('https://api.openverse.org/v1/images/')
  url.searchParams.set('q', expandedQuery)
  url.searchParams.set('page', String(page))
  url.searchParams.set('page_size', '20')
  url.searchParams.set('mature', 'false')
  url.searchParams.set('filter_dead', 'true')
  const clientId = process.env.OPENVERSE_CLIENT_ID?.trim()
  const clientSecret = process.env.OPENVERSE_CLIENT_SECRET?.trim()
  let authorization = ''
  if (clientId && clientSecret) {
    const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' })
    const tokenResponse = await fetch('https://api.openverse.org/v1/auth_tokens/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })
    if (tokenResponse.ok) {
      const tokenData = await tokenResponse.json() as { access_token?: string }
      if (tokenData.access_token) authorization = 'Bearer ' + tokenData.access_token
    } else if (tokenResponse.status !== 401) {
      throw Object.assign(new Error('Openverse authentication is temporarily unavailable.'), { status: tokenResponse.status, code: 'provider_auth_error' })
    }
  }
  const response = await fetch(url, {
    headers: { Accept: 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 900 },
  })
  if (response.status === 429) throw Object.assign(new Error('Openverse search limit reached. Please wait a moment and try again.'), { status: 429, code: 'rate_limited' })
  if (!response.ok) throw Object.assign(new Error('Openverse is temporarily unavailable. Please try again.'), { status: response.status, code: 'provider_error' })
  const data = await response.json() as { results?: Array<Record<string, any>>; result_count?: number; page_count?: number }
  const results = Array.isArray(data.results) ? data.results : []
  const assets = results.map(item => ({
    id: 'openverse-' + String(item.id || item.foreign_landing_url || ''),
    title: String(item.title || 'Openly licensed artwork').slice(0, 140),
    kind: 'image' as const,
    previewUrl: String(item.thumbnail || item.url || ''),
    assetUrl: String(item.url || ''),
    sourceUrl: String(item.foreign_landing_url || item.detail_url || ''),
    creator: String(item.creator || 'Unknown creator'),
    width: Number(item.width) || undefined,
    height: Number(item.height) || undefined,
    license: String(item.license || ''),
    licenseUrl: String(item.license_url || ''),
  })).filter(item => item.previewUrl && item.assetUrl && item.sourceUrl)
  const total = Number(data.result_count) || 0
  return { assets, hasMore: page < (Number(data.page_count) || 0), total }
}

async function searchIconify(query: string, page: number): Promise<{ assets: Asset[]; hasMore: boolean; total: number }> {
  const start = (page - 1) * 48
  const url = new URL('https://api.iconify.design/search')
  url.searchParams.set('query', expandSearchQuery(query))
  url.searchParams.set('limit', '48')
  url.searchParams.set('start', String(start))
  const data = await fetchJson(url, 86400) as { icons?: string[]; total?: number; limit?: number }
  const icons = Array.isArray(data.icons) ? data.icons : []
  const assets = icons.map(name => {
    const [prefix, iconName] = name.split(':')
    if (!prefix || !iconName) return null
    const svgUrl = 'https://api.iconify.design/' + encodeURIComponent(prefix) + '/' + encodeURIComponent(iconName) + '.svg'
    return {
      id: 'iconify-' + name,
      title: name.replace(':', ' / ').replace(/[-_]/g, ' '),
      kind: 'icon' as const,
      previewUrl: svgUrl,
      assetUrl: svgUrl,
      sourceUrl: 'https://icon-sets.iconify.design/' + prefix + '/' + iconName + '/',
      creator: prefix,
    }
  }).filter((item): item is NonNullable<typeof item> => Boolean(item))
  const total = Number(data.total) || 0
  return { assets, hasMore: icons.length === 48, total }
}

export async function GET(request: NextRequest) {
  const user = await requireUser()
  if (!user) return jsonError('Please sign in to browse Studio assets.', 401, 'unauthorized')
  const params = request.nextUrl.searchParams
  const category = params.get('category')
  const query = cleanQuery(params.get('q') || '')
  const page = boundedInt(params.get('page'), 1, 1, 100)
  if (query.length < 2) return NextResponse.json({ ok: true, assets: [], hasMore: false, total: 0 }, { headers: NO_STORE })
  if (category !== 'Graphic' && category !== 'Sketch' && category !== 'Photo' && category !== 'Video') {
    return jsonError('This asset category is not supported by this search endpoint.', 400, 'invalid_category')
  }
  try {
    const result = category === 'Graphic'
      ? await searchIconify(query, page)
      : category === 'Sketch'
        ? await searchOpenverse(query, page)
        : await searchPixabay(query, page, category === 'Video' ? 'video' : 'image')
    return NextResponse.json({ ok: true, category, provider: category === 'Graphic' ? 'Iconify' : category === 'Sketch' ? 'Openverse' : 'Pixabay', ...result }, { headers: NO_STORE })
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 502
    const code = String((error as { code?: string })?.code || 'search_failed')
    const message = error instanceof Error ? error.message : 'Asset search failed. Please try again.'
    return jsonError(message, status, code, status === 429 || status >= 500)
  }
}
