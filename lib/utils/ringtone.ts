/**
 * Ringtones - generated with the Web Audio API, so there's no audio file
 * To host/license and every option always plays instantly, even offline.
 * Each entry is a distinct little melody/pattern so they're easy to tell
 * Apart in the picker.
 */
export interface RingtoneOption {
  id: string
  name: string
  /** One melody pattern: [frequencyHz, startOffsetSec, durationSec][] */
  pattern: [number, number, number][]
  /** How long (sec) before the pattern loops while ringing. */
  loopEvery: number
}

export const RINGTONES: RingtoneOption[] = [
  {
    id: 'chime',
    name: 'Classic Chime',
    pattern: [[659, 0, 0.35], [880, 0.4, 0.5]],
    loopEvery: 1.8,
  },
  {
    id: 'pulse',
    name: 'Digital Pulse',
    pattern: [[523, 0, 0.15], [523, 0.2, 0.15], [523, 0.4, 0.15]],
    loopEvery: 1.4,
  },
  {
    id: 'marimba',
    name: 'Marimba',
    pattern: [[392, 0, 0.25], [523, 0.22, 0.25], [659, 0.44, 0.35]],
    loopEvery: 1.7,
  },
  {
    id: 'classic-ring',
    name: 'Classic Phone Ring',
    pattern: [[480, 0, 0.4], [620, 0.45, 0.4]],
    loopEvery: 2,
  },
  {
    id: 'bell',
    name: 'Soft Bell',
    pattern: [[784, 0, 0.6], [784, 0.7, 0.3]],
    loopEvery: 2.2,
  },
  {
    id: 'alert',
    name: 'Bright Alert',
    pattern: [[880, 0, 0.12], [988, 0.15, 0.12], [1175, 0.3, 0.2]],
    loopEvery: 1.3,
  },
]

export const DEFAULT_RINGTONE_ID = 'chime'
export const DEFAULT_RINGTONE_VOLUME = 1

export function getRingtoneById(id?: string | null): RingtoneOption {
  return RINGTONES.find(r => r.id === id) || RINGTONES[0]
}

let audioCtx: AudioContext | null = null
let intervalId: ReturnType<typeof setInterval> | null = null

function playPattern(pattern: [number, number, number][], volume: number) {
  if (!audioCtx) return
  const now = audioCtx.currentTime
  // At volume=1 (100%) this should actually ring at full, phone-ringer
  // loudness - it was capped at just 15% gain before, which is why "100%"
  // still sounded faint. 0.9 leaves a hair of headroom so nothing clips.
  const peak = 0.9 * Math.max(0, Math.min(1, volume))
  for (const [freq, startOffset, duration] of pattern) {
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const startAt = now + startOffset
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), startAt + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start(startAt)
    osc.stop(startAt + duration)
  }
}

/**
 * Starts ringing with the given ringtone + volume (0-1). Used for both the
 * incoming call screen and the outgoing "ringing..." screen.
 */
export function startRingtone(ringtoneId: string = DEFAULT_RINGTONE_ID, volume: number = DEFAULT_RINGTONE_VOLUME) {
  if (intervalId) return
  const ringtone = getRingtoneById(ringtoneId)
  try {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const tick = () => playPattern(ringtone.pattern, volume)
    tick()
    intervalId = setInterval(tick, ringtone.loopEvery * 1000)
  } catch {
    // Autoplay/audio restrictions - fail silently, the visual UI still works.
  }
}

export function stopRingtone() {
  if (intervalId) { clearInterval(intervalId); intervalId = null }
  if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null }
}

/** Plays one preview loop of a ringtone at a given volume, for the settings picker. */
export function previewRingtone(ringtoneId: string, volume: number) {
  stopRingtone()
  try {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    playPattern(getRingtoneById(ringtoneId).pattern, volume)
    setTimeout(() => { if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null } }, 1500)
  } catch {}
}
