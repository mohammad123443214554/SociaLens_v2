'use client'

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

interface SociaLensTtsPlugin {
  speak(options: {
    text: string
    language?: string
    rate?: number
    pitch?: number
  }): Promise<{ utteranceId: string }>
  stop(): Promise<void>
  addListener(
    eventName: 'finished',
    listenerFunc: (event: { utteranceId: string; error: boolean }) => void,
  ): Promise<PluginListenerHandle>
}

const NativeTts = registerPlugin<SociaLensTtsPlugin>('SociaLensTts')

let cachedVoices: SpeechSynthesisVoice[] = []
let nativeListener: PluginListenerHandle | null = null
let nativeOnEnd: (() => void) | null = null
let speechGeneration = 0

function finishNativeSpeech(generation: number) {
  if (generation !== speechGeneration) return
  const onEnd = nativeOnEnd
  nativeOnEnd = null
  void nativeListener?.remove()
  nativeListener = null
  onEnd?.()
}

async function stopNativeSpeech() {
  speechGeneration++
  nativeOnEnd = null
  try { await NativeTts.stop() } catch {}
  try { await nativeListener?.remove() } catch {}
  nativeListener = null
}

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve([])
      return
    }
    const existing = window.speechSynthesis.getVoices()
    if (existing.length > 0) {
      cachedVoices = existing
      resolve(existing)
      return
    }
    window.speechSynthesis.onvoiceschanged = () => {
      cachedVoices = window.speechSynthesis.getVoices()
      resolve(cachedVoices)
    }
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 500)
  })
}

function cleanTextForSpeech(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{2190}-\u{21FF}]/gu, '')
    .replace(/[*_~`#]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function pickAperonixVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const preferredNames = [
    'Google UK English Female', 'Google US English', 'Google हिन्दी',
    'Samantha', 'Microsoft Aria Online', 'Microsoft Jenny Online', 'Microsoft Zira',
    'Victoria', 'Karen', 'Moira', 'Tessa',
  ]
  for (const name of preferredNames) {
    const match = voices.find(v => v.name.includes(name))
    if (match) return match
  }
  const anyGoogle = voices.find(v => v.name.startsWith('Google') && v.lang.startsWith('en'))
  if (anyGoogle) return anyGoogle
  const femaleMatch = voices.find(v => /female/i.test(v.name))
  if (femaleMatch) return femaleMatch
  return voices.find(v => v.lang.startsWith('en')) || voices[0]
}

interface SpeakHandle {
  stop: () => void
}

async function speakWithNativeAndroid(cleaned: string, onEnd: () => void): Promise<SpeakHandle> {
  await stopNativeSpeech()
  const generation = speechGeneration
  nativeOnEnd = onEnd

  nativeListener = await NativeTts.addListener('finished', (event) => {
    if (event.error) finishNativeSpeech(generation)
    else finishNativeSpeech(generation)
  })

  try {
    await NativeTts.speak({
      text: cleaned,
      language: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
      rate: 0.93,
      pitch: 1.02,
    })
  } catch (error) {
    await nativeListener.remove()
    nativeListener = null
    nativeOnEnd = null
    throw error
  }

  return { stop: () => { void stopNativeSpeech() } }
}

async function speakWithBrowserVoice(cleaned: string, onEnd: () => void): Promise<SpeakHandle> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onEnd()
    return { stop: () => {} }
  }

  window.speechSynthesis.cancel()
  const voices = cachedVoices.length ? cachedVoices : await loadVoices()
  const utterance = new SpeechSynthesisUtterance(cleaned)
  const voice = pickAperonixVoice(voices)
  if (voice) {
    utterance.voice = voice
    utterance.lang = voice.lang
  }
  utterance.pitch = 1.02
  utterance.rate = 0.93
  utterance.onend = onEnd
  utterance.onerror = onEnd

  window.speechSynthesis.speak(utterance)
  return { stop: () => window.speechSynthesis.cancel() }
}

export async function speakText(text: string, onEnd: () => void): Promise<SpeakHandle> {
  const cleaned = cleanTextForSpeech(text)
  if (!cleaned) {
    onEnd()
    return { stop: () => {} }
  }

  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      return await speakWithNativeAndroid(cleaned, onEnd)
    } catch {
      // If Android TTS is unavailable on a particular device, keep the
      // existing browser path as a graceful fallback rather than crashing.
    }
  }

  return speakWithBrowserVoice(cleaned, onEnd)
}

export function stopSpeaking() {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    void stopNativeSpeech()
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    speechGeneration++
    window.speechSynthesis.cancel()
  }
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false
  return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
}

interface VoiceInputHandlers {
  onInterim: (transcript: string) => void
  onFinal: (transcript: string) => void
  onEnd: () => void
  onError?: () => void
}

export function createVoiceInput(handlers: VoiceInputHandlers) {
  const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SpeechRecognitionCtor) return null

  const recognition = new SpeechRecognitionCtor()
  recognition.lang = navigator.language || 'en-US'
  recognition.interimResults = true
  recognition.continuous = false
  recognition.maxAlternatives = 1

  let finalTranscript = ''

  recognition.onresult = (event: any) => {
    let interim = ''
    finalTranscript = ''
    for (let i = 0; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript
      if (event.results[i].isFinal) finalTranscript += transcript
      else interim += transcript
    }
    handlers.onInterim(finalTranscript + interim)
  }

  recognition.onerror = () => handlers.onError?.()
  recognition.onend = () => {
    handlers.onFinal(finalTranscript.trim())
    handlers.onEnd()
  }

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
  }
}
