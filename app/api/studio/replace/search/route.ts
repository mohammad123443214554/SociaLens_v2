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


let openverseToken = ''
let openverseTokenExpiresAt = 0
let openverseTokenRequest: Promise<string> | null = null

async function getOpenverseToken(clientId: string, clientSecret: string) {
  if (openverseToken && Date.now() < openverseTokenExpiresAt - 60_000) return openverseToken
  if (openverseTokenRequest) return openverseTokenRequest
  openverseTokenRequest = (async () => {
    const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' })
    const response = await fetch('https://api.openverse.org/v1/auth_tokens/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })
    if (!response.ok) throw Object.assign(new Error('Openverse authentication is temporarily unavailable.'), { status: response.status, code: 'provider_auth_error' })
    const data = await response.json() as { access_token?: string; expires_in?: number }
    if (!data.access_token) throw Object.assign(new Error('Openverse did not return an access token.'), { status: 502, code: 'provider_auth_error' })
    openverseToken = data.access_token
    openverseTokenExpiresAt = Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000
    return openverseToken
  })()
  try { return await openverseTokenRequest } finally { openverseTokenRequest = null }
}

async function searchOpenverse(query: string, page: number, mode: 'photo' | 'sketch'): Promise<{ assets: Asset[]; hasMore: boolean; total: number }> {
  const expandedQuery = mode === 'photo' ? query : expandSearchQuery(query, ['sketch', 'drawing', 'illustration', 'line art', 'pencil art'])
  const url = new URL('https://api.openverse.org/v1/images/')
  url.searchParams.set('q', expandedQuery)
  url.searchParams.set('page', String(page))
  url.searchParams.set('page_size', '20')
  url.searchParams.set('mature', 'false')
  url.searchParams.set('filter_dead', 'true')
  if (mode === 'photo') {
    url.searchParams.set('category', 'photograph')
    url.searchParams.set('license_type', 'commercial')
  }
  const clientId = process.env.OPENVERSE_CLIENT_ID?.trim()
  const clientSecret = process.env.OPENVERSE_CLIENT_SECRET?.trim()
  let authorization = ''
  if (clientId && clientSecret) authorization = 'Bearer ' + await getOpenverseToken(clientId, clientSecret)
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


function plainMetadata(value: unknown, fallback: string) {
  if (typeof value !== 'string' || !value.trim()) return fallback
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\\s+/g, ' ').trim().slice(0, 180) || fallback
}

async function searchWikimediaVideos(query: string, page: number): Promise<{ assets: Asset[]; hasMore: boolean; total: number }> {
  const url = new URL('https://commons.wikimedia.org/w/api.php')
  url.searchParams.set('action', 'query')
  url.searchParams.set('generator', 'search')
  url.searchParams.set('gsrsearch', 'filetype:video ' + query)
  url.searchParams.set('gsrnamespace', '6')
  url.searchParams.set('gsrlimit', '20')
  url.searchParams.set('gsroffset', String((page - 1) * 20))
  url.searchParams.set('prop', 'imageinfo')
  url.searchParams.set('iiprop', 'url|size|mime|extmetadata')
  url.searchParams.set('iiurlwidth', '480')
  url.searchParams.set('format', 'json')
  url.searchParams.set('formatversion', '2')
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'Api-User-Agent': 'SociaLens/2.0 (Studio media search; https://socia-lens-v2.vercel.app/)' },
    signal: AbortSignal.timeout(12000),
    next: { revalidate: 3600 },
  })
  if (response.status === 429) throw Object.assign(new Error('Wikimedia Commons search limit reached. Please wait a moment and try again.'), { status: 429, code: 'rate_limited' })
  if (!response.ok) throw Object.assign(new Error('Wikimedia Commons is temporarily unavailable. Please try again.'), { status: response.status, code: 'provider_error' })
  const data = await response.json() as { query?: { pages?: Array<Record<string, any>> }; continue?: { gsroffset?: number } }
  const pages = Array.isArray(data.query?.pages) ? data.query!.pages! : []
  const supportedMimes = new Set(['video/webm', 'video/ogg', 'video/mpeg'])
  const assets = pages.flatMap(pageData => {
    const info = Array.isArray(pageData.imageinfo) ? pageData.imageinfo[0] : null
    if (!info || !supportedMimes.has(String(info.mime || '').toLowerCase()) || !info.url) return []
    const metadata = info.extmetadata && typeof info.extmetadata === 'object' ? info.extmetadata : {}
    const title = String(pageData.title || 'Wikimedia Commons video').replace(/^File:/, '')
    const sourceUrl = 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(String(pageData.title || '').replace(/ /g, '_'))
    return [{
      id: 'commons-video-' + String(pageData.pageid || title),
      title: plainMetadata(metadata.ObjectName?.value, title.replace(/\\.[^.]+$/, '').replace(/[_-]+/g, ' ')),
      kind: 'video' as const,
      previewUrl: String(info.thumburl || ''),
      assetUrl: String(info.url),
      sourceUrl,
      creator: plainMetadata(metadata.Artist?.value, 'Wikimedia Commons contributor'),
      width: Number(info.width) || undefined,
      height: Number(info.height) || undefined,
      license: plainMetadata(metadata.LicenseShortName?.value, 'See source page for license'),
      licenseUrl: String(metadata.LicenseUrl?.value || ''),
    }]
  })
  return { assets, hasMore: Boolean(data.continue?.gsroffset), total: assets.length }
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
        ? await searchOpenverse(query, page, 'sketch')
        : category === 'Photo' ? await searchOpenverse(query, page, 'photo') : await searchWikimediaVideos(query, page)
    return NextResponse.json({ ok: true, category, provider: category === 'Graphic' ? 'Iconify' : category === 'Video' ? 'Wikimedia Commons' : 'Openverse', ...result }, { headers: NO_STORE })
  } catch (error) {
    const status = Number((error as { status?: number })?.status) || 502
    const code = String((error as { code?: string })?.code || 'search_failed')
    const message = error instanceof Error ? error.message : 'Asset search failed. Please try again.'
    return jsonError(message, status, code, status === 429 || status >= 500)
  }
}
