/**
 * SociaLens file-backed ringtone library.
 *
 * All 50 bundled assets are played from /audio/ringtones. AudioBufferSourceNode
 * looping keeps the selected clip repeating for as long as the call is ringing.
 * A single shared player is used by previews and incoming/outgoing call screens.
 */

import { createClient } from '@/lib/supabase/client'

export interface RingtoneOption {
  id: string
  name: string
  src: string
}

export const RINGTONES: RingtoneOption[] = Array.from({ length: 50 }, (_, index) => {
  const number = String(index + 1).padStart(2, '0')
  // The uploaded files numbered 04 and 11 are WAV files; keep their real paths.
  const extension = number === '04' || number === '11' ? 'wav' : 'mp3'
  return {
    id: `ringtone-${number}`,
    name: `Ringtone ${number}`,
    src: `/audio/ringtones/ringtone-${number}.${extension}`,
  }
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
  if (getCustomRingtonePath(id)) {
    return { id: id!, name: 'Custom ringtone', src: '' }
  }
  return RINGTONES.find((ringtone) => ringtone.id === id) || RINGTONES[0]
}

let audioContext: AudioContext | null = null
let activeSource: AudioBufferSourceNode | null = null
let activeGain: GainNode | null = null
let activeRingtoneId = DEFAULT_RINGTONE_ID
let activeVolume = DEFAULT_RINGTONE_VOLUME
let shouldPlay = false
let pauseCount = 0
let generation = 0
let loadPromise: Promise<void> | null = null
let isPreview = false

// Keep decoded audio in memory so calls never wait on URL signing, download and decode.
const decodedBufferCache = new Map<string, AudioBuffer>()
const bufferLoadCache = new Map<string, Promise<AudioBuffer>>()

function getAudioContext(): AudioContext {
  if (!audioContext || audioContext.state === 'closed') {
    const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextConstructor) throw new Error('Audio playback is not supported by this browser.')
    audioContext = new AudioContextConstructor()
  }
  return audioContext
}

function stopSource() {
  if (activeSource) {
    try { activeSource.stop() } catch {}
    try { activeSource.disconnect() } catch {}
    activeSource = null
  }
  if (activeGain) {
    try { activeGain.disconnect() } catch {}
    activeGain = null
  }
}

function stopPlaybackState() {
  shouldPlay = false
  pauseCount = 0
  generation += 1
  loadPromise = null
  stopSource()
}

async function loadBuffer(ringtone: RingtoneOption, context: AudioContext): Promise<AudioBuffer> {
  const cached = decodedBufferCache.get(ringtone.id)
  if (cached) return cached
  const pending = bufferLoadCache.get(ringtone.id)
  if (pending) return pending
  const request = (async () => {
  let sourceUrl = ringtone.src
  const customPath = getCustomRingtonePath(ringtone.id)
  if (customPath) {
    const supabase = createClient()
    const { data, error } = await supabase.storage
      .from(CALL_RINGTONE_BUCKET)
      .createSignedUrl(customPath, 24 * 60 * 60)
    if (error || !data?.signedUrl) {
      throw new Error(error?.message || 'Could not access your uploaded ringtone.')
    }
    sourceUrl = data.signedUrl
  }
  if (!sourceUrl) throw new Error('This ringtone has no playable audio source.')
  const response = await fetch(sourceUrl, { cache: 'force-cache' })
  if (!response.ok) throw new Error(`Could not load ${ringtone.name} (${response.status}).`)
  const bytes = await response.arrayBuffer()
  const decoded = await context.decodeAudioData(bytes)
  decodedBufferCache.set(ringtone.id, decoded)
  return decoded
  })()
  bufferLoadCache.set(ringtone.id, request)
  try { return await request } finally { if (bufferLoadCache.get(ringtone.id) === request) bufferLoadCache.delete(ringtone.id) }
}

/** Load and decode the selected ringtone before a call arrives. */
export async function preloadRingtone(ringtoneId: string = DEFAULT_RINGTONE_ID): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    await loadBuffer(getRingtoneById(ringtoneId), getAudioContext())
  } catch (error) {
    console.warn('[SociaLens ringtone] Preload failed; playback will retry on demand:', error)
  }
}

async function beginPlayback() {
  if (!shouldPlay || pauseCount > 0 || activeSource || loadPromise) return
  const playbackGeneration = generation
  const ringtone = getRingtoneById(activeRingtoneId)
  try {
    const context = getAudioContext()
    loadPromise = loadBuffer(ringtone, context).then(async (buffer) => {
      if (!shouldPlay || pauseCount > 0 || playbackGeneration !== generation) return
      await context.resume()
      if (!shouldPlay || pauseCount > 0 || playbackGeneration !== generation) return
      const source = context.createBufferSource()
      const gain = context.createGain()
      source.buffer = buffer
      source.loop = true
      gain.gain.value = Math.max(0, Math.min(1, activeVolume))
      source.connect(gain)
      gain.connect(context.destination)
      activeSource = source
      activeGain = gain
      source.onended = () => {
        if (activeSource === source) stopSource()
      }
      source.start(0)
    }).catch((error) => {
      console.error('[SociaLens ringtone] Playback failed:', error)
    }).finally(() => {
      loadPromise = null
      if (shouldPlay && pauseCount === 0 && playbackGeneration !== generation && !activeSource) void beginPlayback()
    })
  } catch (error) {
    loadPromise = null
    console.error('[SociaLens ringtone] Audio initialization failed:', error)
  }
}

/** Start the selected ringtone and loop its decoded audio buffer continuously. */
export function startRingtone(ringtoneId: string = DEFAULT_RINGTONE_ID, volume: number = DEFAULT_RINGTONE_VOLUME) {
  const next = getRingtoneById(ringtoneId)
  const changed = activeRingtoneId !== next.id
  activeRingtoneId = next.id
  activeVolume = Math.max(0, Math.min(1, volume))
  isPreview = false
  shouldPlay = true
  if (changed) {
    generation += 1
    stopSource()
    loadPromise = null
  }
  if (activeGain) activeGain.gain.setTargetAtTime(activeVolume, audioContext?.currentTime ?? 0, 0.03)
  void beginPlayback()
}

/** Pause ringing while a call announcement is speaking. */
export function pauseRingtone() {
  if (!shouldPlay) return
  pauseCount += 1
  if (audioContext && audioContext.state === 'running') void audioContext.suspend().catch(() => {})
}

/** Resume only after all overlapping announcements have finished. */
export function resumeRingtone() {
  pauseCount = Math.max(0, pauseCount - 1)
  if (shouldPlay && pauseCount === 0) {
    if (audioContext?.state === 'suspended') void audioContext.resume().catch(() => {})
    else void beginPlayback()
  }
}

/** Stop ringing permanently when a call is answered, declined, cancelled or ended. */
export function stopRingtone() {
  stopPlaybackState()
  isPreview = false
  if (audioContext?.state === 'running') void audioContext.suspend().catch(() => {})
}

/** Play a selected ringtone preview in a loop until another selection or page cleanup. */
export function previewRingtone(ringtoneId: string, volume: number) {
  stopPlaybackState()
  activeRingtoneId = getRingtoneById(ringtoneId).id
  activeVolume = Math.max(0, Math.min(1, volume))
  shouldPlay = true
  isPreview = true
  void beginPlayback()
}

/** Stop only a settings preview; never interrupts an actual call ringtone. */
export function stopRingtonePreview() {
  if (!isPreview) return
  stopPlaybackState()
  isPreview = false
  if (audioContext?.state === 'running') void audioContext.suspend().catch(() => {})
}
