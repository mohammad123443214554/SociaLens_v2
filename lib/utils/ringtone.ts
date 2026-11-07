/**
 * SociaLens shared ringtone player.
 *
 * Ringtones use one persistent HTMLAudioElement so the browser can stream the
 * selected file instead of waiting for a complete download + AudioContext
 * decode before the first sound. Custom signed URLs are cached and warmed as
 * soon as call settings load, keeping call setup off the audio critical path.
 */

import { createClient } from '@/lib/supabase/client'

export interface RingtoneOption {
  id: string
  name: string
  src: string
}

export const RINGTONES: RingtoneOption[] = Array.from({ length: 50 }, (_, index) => {
  const number = String(index + 1).padStart(2, '0')
  const extension = number === '04' || number === '11' ? 'wav' : 'mp3'
  return { id: `ringtone-${number}`, name: `Ringtone ${number}`, src: `/audio/ringtones/ringtone-${number}.${extension}` }
})

export const DEFAULT_RINGTONE_ID = 'ringtone-01'
export const DEFAULT_RINGTONE_VOLUME = 1
export const CALL_RINGTONE_BUCKET = 'call-ringtones'
export const CUSTOM_RINGTONE_PREFIX = 'custom:'

export function getCustomRingtonePath(id?: string | null): string | null {
  if (!id?.startsWith(CUSTOM_RINGTONE_PREFIX)) return null
  const path = id.slice(CUSTOM_RINGTONE_PREFIX.length)
  const segments = path.split('/')
  if (!path || path.startsWith('/') || path.includes('..') || path.includes(String.fromCharCode(92)) || segments.length !== 2 || !segments[0] || !segments[1]) return null
  return path
}

export function isCustomRingtoneId(id?: string | null): boolean {
  return getCustomRingtonePath(id) !== null
}

export function getRingtoneById(id?: string | null): RingtoneOption {
  if (getCustomRingtonePath(id)) return { id: id!, name: 'Custom ringtone', src: '' }
  return RINGTONES.find((ringtone) => ringtone.id === id) || RINGTONES[0]
}

let player: HTMLAudioElement | null = null
let activeRingtoneId = DEFAULT_RINGTONE_ID
let activeVolume = DEFAULT_RINGTONE_VOLUME
let shouldPlay = false
let pauseCount = 0
let generation = 0
let isPreview = false
let gestureUnlockInstalled = false
let activeSourceUrl: string | null = null

// Signed URLs last 24 hours; refresh them slightly before expiry.
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>()
const signedUrlPromises = new Map<string, Promise<string>>()

function getPlayer(): HTMLAudioElement {
  if (!player) {
    player = new Audio()
    player.preload = 'auto'
    player.loop = true
    player.setAttribute('playsinline', 'true')
  }
  return player
}

/**
 * Browsers require a user gesture before they allow page audio to autoplay.
 * Unlock the persistent media element on the first real app interaction, so a
 * later realtime call event can start ringing without waiting for a new tap.
 */
function installGestureUnlocker() {
  if (typeof window === 'undefined' || gestureUnlockInstalled) return
  gestureUnlockInstalled = true
  const unlock = () => {
    const audio = getPlayer()
    const wasMuted = audio.muted
    audio.muted = true
    const attempt = audio.play()
    if (attempt && typeof attempt.then === 'function') {
      void attempt.then(() => {
        audio.pause()
        try { audio.currentTime = 0 } catch {}
        audio.muted = wasMuted
      }).catch(() => { audio.muted = wasMuted })
    } else {
      audio.pause()
      audio.muted = wasMuted
    }
    window.removeEventListener('pointerdown', unlock, true)
    window.removeEventListener('touchstart', unlock, true)
    window.removeEventListener('keydown', unlock, true)
  }
  window.addEventListener('pointerdown', unlock, { capture: true, once: true })
  window.addEventListener('touchstart', unlock, { capture: true, once: true })
  window.addEventListener('keydown', unlock, { capture: true, once: true })
}

async function resolveRingtoneUrl(ringtone: RingtoneOption): Promise<string> {
  const customPath = getCustomRingtonePath(ringtone.id)
  if (!customPath) return ringtone.src

  const cached = signedUrlCache.get(ringtone.id)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url

  const pending = signedUrlPromises.get(ringtone.id)
  if (pending) return pending

  const request = (async () => {
    const supabase = createClient()
    const { data, error } = await supabase.storage
      .from(CALL_RINGTONE_BUCKET)
      .createSignedUrl(customPath, 24 * 60 * 60)
    if (error || !data?.signedUrl) throw new Error(error?.message || 'Could not access your uploaded ringtone.')
    signedUrlCache.set(ringtone.id, { url: data.signedUrl, expiresAt: Date.now() + 23 * 60 * 60 * 1000 })
    return data.signedUrl
  })()

  signedUrlPromises.set(ringtone.id, request)
  try { return await request } finally {
    if (signedUrlPromises.get(ringtone.id) === request) signedUrlPromises.delete(ringtone.id)
  }
}

function applyPlayerVolume() {
  if (!player) return
  player.volume = Math.max(0, Math.min(1, activeVolume))
}

function playResolvedSource(sourceUrl: string, playbackGeneration: number) {
  if (!shouldPlay || pauseCount > 0 || playbackGeneration !== generation) return
  const audio = getPlayer()
  applyPlayerVolume()
  if (activeSourceUrl !== sourceUrl || audio.src !== new URL(sourceUrl, window.location.href).href) {
    audio.pause()
    audio.src = sourceUrl
    audio.load()
    activeSourceUrl = sourceUrl
  }
  // Calling play immediately after assigning the source lets the browser
  // begin streaming; it does not wait for the complete file to download.
  void audio.play().catch((error) => {
    console.warn('[SociaLens ringtone] Browser blocked ringtone playback:', error)
  })
}

async function playActiveRingtone(playbackGeneration: number) {
  if (!shouldPlay || pauseCount > 0 || playbackGeneration !== generation) return
  const ringtone = getRingtoneById(activeRingtoneId)

  // If a custom URL is not yet warm (for example, a cold app launch), start
  // the built-in default immediately. Replace it with the selected custom
  // ringtone as soon as its signed URL is ready.
  if (isCustomRingtoneId(ringtone.id) && !signedUrlCache.has(ringtone.id)) {
    const fallback = getRingtoneById(DEFAULT_RINGTONE_ID)
    playResolvedSource(fallback.src, playbackGeneration)
  }

  try {
    const sourceUrl = await resolveRingtoneUrl(ringtone)
    playResolvedSource(sourceUrl, playbackGeneration)
  } catch (error) {
    console.error('[SociaLens ringtone] Could not prepare ringtone:', error)
    if (isCustomRingtoneId(ringtone.id) && playbackGeneration === generation && shouldPlay) {
      playResolvedSource(getRingtoneById(DEFAULT_RINGTONE_ID).src, playbackGeneration)
    }
  }
}

/** Warm the signed URL and browser media pipeline while the app is idle. */
export async function preloadRingtone(ringtoneId: string = DEFAULT_RINGTONE_ID): Promise<void> {
  if (typeof window === 'undefined') return
  installGestureUnlocker()
  try {
    const ringtone = getRingtoneById(ringtoneId)
    const sourceUrl = await resolveRingtoneUrl(ringtone)
    const audio = getPlayer()
    // Do not replace an actively playing ringtone while another call is live.
    if (!shouldPlay || activeRingtoneId === ringtoneId) {
      if (activeSourceUrl !== sourceUrl || audio.src !== new URL(sourceUrl, window.location.href).href) {
        audio.src = sourceUrl
        audio.load()
        activeSourceUrl = sourceUrl
      }
    }
  } catch (error) {
    console.warn('[SociaLens ringtone] Preload failed; playback will retry on demand:', error)
  }
}

/** Start the selected ringtone and stream it continuously until stopped. */
export function startRingtone(ringtoneId: string = DEFAULT_RINGTONE_ID, volume: number = DEFAULT_RINGTONE_VOLUME) {
  installGestureUnlocker()
  const next = getRingtoneById(ringtoneId)
  const changed = activeRingtoneId !== next.id
  activeRingtoneId = next.id
  activeVolume = Math.max(0, Math.min(1, volume))
  isPreview = false
  shouldPlay = true
  if (changed) {
    generation += 1
    if (player) player.pause()
  }
  applyPlayerVolume()
  if (pauseCount === 0) void playActiveRingtone(generation)
}

/** Pause ringing while a call announcement is speaking. */
export function pauseRingtone() {
  if (!shouldPlay) return
  pauseCount += 1
  if (pauseCount === 1 && player) player.pause()
}

/** Resume only after all overlapping announcements have finished. */
export function resumeRingtone() {
  pauseCount = Math.max(0, pauseCount - 1)
  if (shouldPlay && pauseCount === 0) void playActiveRingtone(generation)
}

/** Stop ringing permanently when a call is answered, declined, cancelled or ended. */
export function stopRingtone() {
  shouldPlay = false
  pauseCount = 0
  generation += 1
  isPreview = false
  if (player) {
    player.pause()
    try { player.currentTime = 0 } catch {}
  }
}

/** Play a selected ringtone preview in a loop until stopped or page cleanup. */
export function previewRingtone(ringtoneId: string, volume: number) {
  stopRingtone()
  activeRingtoneId = getRingtoneById(ringtoneId).id
  activeVolume = Math.max(0, Math.min(1, volume))
  shouldPlay = true
  isPreview = true
  void playActiveRingtone(generation)
}

/** Stop only a settings preview; never interrupts an actual call ringtone. */
export function stopRingtonePreview() {
  if (!isPreview) return
  stopRingtone()
}
