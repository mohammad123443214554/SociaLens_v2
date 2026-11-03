#!/usr/bin/env node
/**
 * Restore damaged Google Animated Noto Emoji Lottie assets before Next.js builds.
 *
 * Source: https://googlefonts.github.io/noto-emoji-animation/
 * Assets: https://fonts.gstatic.com/s/e/notoemoji/latest/<codepoint>/lottie.json
 * License: CC BY 4.0 — attribution is recorded in NOTICE.txt.
 *
 * This intentionally downloads only assets already listed in
 * lib/call-reactions.ts. It never adds/removes reaction choices.
 */
import { readFile, writeFile, readdir, rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSET_DIR = path.join(ROOT, 'public/animations/call-reactions')
const INDEX_URL = 'https://googlefonts.github.io/noto-emoji-animation/data/api.json'
const ASSET_URL = (codepoint) => `https://fonts.gstatic.com/s/e/notoemoji/latest/${codepoint}/lottie.json`
const CONCURRENCY = 6
const RETRIES = 3

function slug(value) {
  return String(value ?? '')
    .replace(/^emoji_/i, '')
    .replace(/_Remap\b/gi, '')
    .replace(/^:|:$/g, '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function parseLottie(text, label) {
  let data
  try {
    data = JSON.parse(text)
  } catch (error) {
    throw new Error(`${label}: invalid JSON (${error.message})`)
  }
  if (
    !data || typeof data !== 'object' ||
    !Array.isArray(data.layers) ||
    !Number.isFinite(data.fr) ||
    !Number.isFinite(data.ip) ||
    !Number.isFinite(data.op) ||
    !Number.isFinite(data.w) ||
    !Number.isFinite(data.h) ||
    data.layers.length === 0
  ) {
    throw new Error(`${label}: JSON is not a complete Lottie animation`)
  }
  return data
}

async function fetchWithRetry(url) {
  let lastError
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const body = await response.text()
      parseLottie(body, url)
      return body
    } catch (error) {
      lastError = error
      if (attempt < RETRIES) await new Promise((resolve) => setTimeout(resolve, attempt * 700))
    }
  }
  throw lastError
}

async function loadIndex() {
  const response = await fetch(INDEX_URL, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new Error(`Google Noto Emoji index returned HTTP ${response.status}`)
  const body = await response.json()
  if (!Array.isArray(body.icons) || body.icons.length === 0) {
    throw new Error('Google Noto Emoji index did not contain an icons array')
  }
  return body.icons
}

function getCodepointMap(icons) {
  const byCodepoint = new Map()
  const byTag = new Map()
  for (const icon of icons) {
    if (typeof icon.codepoint !== 'string') continue
    const codepoint = icon.codepoint.split('_').map((part) => part.padStart(4, '0')).join('_')
    byCodepoint.set(icon.codepoint.toLowerCase(), codepoint)
    for (const tag of icon.tags ?? []) {
      const key = slug(tag)
      if (!key) continue
      const matches = byTag.get(key) ?? []
      matches.push(codepoint)
      byTag.set(key, matches)
    }
    if (icon.name) {
      const key = slug(icon.name)
      if (key) {
        const matches = byTag.get(key) ?? []
        matches.push(codepoint)
        byTag.set(key, matches)
      }
    }
  }
  return { byCodepoint, byTag }
}

function resolveCodepoint(fileName, currentText, maps) {
  const fileSlug = path.basename(fileName, '.json')

  // Exact Unicode sequences for upstream Noto assets whose source labels
  // are editorial names rather than Unicode names/shortcodes.
  const knownCodepoints = {
    comet: '2604',
    dinosaur: '1f995',
    cupid: '1f498',
    'cow-face': '1f42e',
    exhale: '1f62e_200d_1f4a8',
    'face-in-clouds': '1f636_200d_1f32b_fe0f',
    'index-finger': '261d_fe0f',
    'red-heart': '2764_fe0f',
    victory: '270c_fe0f',
    'writing-hand': '270d_fe0f',
    'dizzy-face': '1f635',
    'eye': '1f441',
    'fire-heart': '2764_fe0f_200d_1f525',
    'head-nod': '1f642_200d_2195_fe0f',
    'head-shake': '1f642_200d_2194_fe0f',
    'heart-exclamation-point': '2763_fe0f',
    'jack-o-lantern': '1f383',
    phoenix: '1f426_200d_1f525',
    'rain-cloud': '1f327',
    'snowflake': '2744_fe0f',
    'snowman-with-snow': '2603',
    tornado: '1f32a',
    'warm-smile': '263a_fe0f',
    'wind-face': '1f32c',
  }
  if (knownCodepoints[fileSlug]) return knownCodepoints[fileSlug]
  const nameMatch = currentText.match(/"nm"\s*:\s*"([^"]+)"/)
  const sourceName = nameMatch?.[1] ?? ''
  const codepointMatch = sourceName.match(/emoji_u([0-9a-f]+(?:_[0-9a-f]+)*)/i)
  if (codepointMatch) {
    const found = maps.byCodepoint.get(codepointMatch[1].toLowerCase())
    if (found) return found
  }

  // Skin-tone filenames use the same base emoji tag plus a tone suffix.
  // Resolve the tone explicitly so a generic tag (e.g. crossed-fingers)
  // never accidentally selects a different skin-tone variant.
  const toneSuffixes = [
    ['-medium-dark', '1f3fe'],
    ['-medium-light', '1f3fc'],
    ['-medium', '1f3fd'],
    ['-dark', '1f3ff'],
    ['-light', '1f3fb'],
  ]
  const tone = toneSuffixes.find(([suffix]) => fileSlug.endsWith(suffix))
  const baseSlug = tone ? fileSlug.slice(0, -tone[0].length) : fileSlug
  const sourceSlug = slug(sourceName)
  const candidates = [...new Set([baseSlug, fileSlug, sourceSlug].filter(Boolean))]

  for (const candidate of candidates) {
    const matches = [...new Set(maps.byTag.get(candidate) ?? [])]
    if (matches.length === 0) continue

    const selected = tone
      ? matches.filter((codepoint) => codepoint.endsWith('_' + tone[1]))
      : matches.filter((codepoint) => !codepoint.includes('_'))

    if (selected.length === 1) return selected[0]
    if (selected.length > 1) {
      throw new Error(`Ambiguous Google emoji mapping for ${fileName} via "${candidate}": ${selected.join(', ')}`)
    }
  }
  return null
}

async function runPool(items, worker) {
  let cursor = 0
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor]
      cursor += 1
      await worker(item)
    }
  })
  await Promise.all(workers)
}

async function main() {
  const icons = await loadIndex()
  const maps = getCodepointMap(icons)
  const names = (await readdir(ASSET_DIR)).filter((name) => name.endsWith('.json')).sort()
  const invalid = []

  for (const name of names) {
    const fullPath = path.join(ASSET_DIR, name)
    try {
      parseLottie(await readFile(fullPath, 'utf8'), name)
    } catch {
      invalid.push({ name, fullPath, currentText: await readFile(fullPath, 'utf8') })
    }
  }

  if (invalid.length === 0) {
    console.log(`[call-reactions] Validated all ${names.length} local Lottie JSON files; no restoration needed.`)
    return
  }

  console.log(`[call-reactions] Found ${invalid.length} invalid of ${names.length} assets. Restoring from Google's original CDN...`)
  const unresolved = invalid.filter((item) => !resolveCodepoint(item.name, item.currentText, maps))
  if (unresolved.length) {
    throw new Error(
      'Cannot safely map these damaged reaction assets to an official Google source; no files were changed: ' +
      unresolved.map((item) => item.name).join(', ')
    )
  }

  const restored = []
  await runPool(invalid, async (item) => {
    const codepoint = resolveCodepoint(item.name, item.currentText, maps)
    const url = ASSET_URL(codepoint)
    let body
    try {
      body = await fetchWithRetry(url)
    } catch (error) {
      throw new Error(`Failed to restore ${item.name} from ${url}: ${error.message}`)
    }
    parseLottie(body, item.name)
    const tempPath = item.fullPath + '.restore-tmp'
    await writeFile(tempPath, body, 'utf8')
    await rename(tempPath, item.fullPath)
    restored.push({ name: item.name, codepoint, bytes: Buffer.byteLength(body) })
  })

  // Re-read every file after replacement. A build must never proceed with a
  // broken animation, even if an individual network response was interrupted.
  for (const name of names) parseLottie(await readFile(path.join(ASSET_DIR, name), 'utf8'), name)
  console.log(`[call-reactions] Restored and validated ${restored.length} assets; all ${names.length} local Lottie JSON files are valid.`)
  for (const item of restored.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`[call-reactions] restored ${item.name} ← ${item.codepoint} (${item.bytes} bytes)`)
  }
}

main().catch((error) => {
  console.error('[call-reactions] Asset validation/restoration failed:', error)
  process.exitCode = 1
})
