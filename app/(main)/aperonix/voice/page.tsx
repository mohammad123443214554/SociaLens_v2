'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { GoogleGenAI, Modality } from '@google/genai'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/useUser'
import { AudioLines, Plus, Mic, PhoneOff, Play, LoaderCircle, Trash2, AlertCircle, Radio, Menu, MoreHorizontal, Pin, Pencil, Copy, X, ArrowLeft } from 'lucide-react'

type VoiceConversation = { id: string; title: string; storage_path: string | null; mime_type: string; duration_ms: number; pinned: boolean; created_at: string; updated_at: string }
type VoiceStatus = 'idle' | 'preparing' | 'connecting' | 'listening' | 'saving'

function pcm16Base64(input: Float32Array, sampleRate: number) {
  const ratio = sampleRate / 16000
  const output = new Int16Array(Math.floor(input.length / ratio))
  for (let i = 0; i < output.length; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(input.length, Math.floor((i + 1) * ratio))
    let total = 0
    for (let j = start; j < end; j++) total += input[j]
    const value = Math.max(-1, Math.min(1, total / Math.max(1, end - start)))
    output[i] = value < 0 ? value * 32768 : value * 32767
  }
  const bytes = new Uint8Array(output.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}
function decodeBase64(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
function duration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0')
}
function dateLabel(value: string) {
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function VoiceParticleAnimation() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let frame = 0
    let raf = 0
    let width = 0
    let height = 0
    let dpr = 1
    let particles: { x: number; y: number; z: number; size: number; phase: number }[] = []
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.round(Math.min(1050, Math.max(560, width * height / 55)))
      particles = Array.from({ length: count }, (_, i) => {
        const y = 1 - 2 * ((i + 0.5) / count)
        const radius = Math.sqrt(Math.max(0, 1 - y * y))
        const angle = i * Math.PI * (3 - Math.sqrt(5))
        return { x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius, size: 0.45 + Math.random() * 1.15, phase: Math.random() * Math.PI * 2 }
      })
    }
    resize()
    const draw = () => {
      frame += 1
      ctx.clearRect(0, 0, width, height)
      const cx = width / 2
      const cy = height / 2
      const radius = Math.min(width, height) * 0.325
      const t = frame * 0.0065
      const cos = Math.cos(t)
      const sin = Math.sin(t)
      const tilt = -0.22
      const ct = Math.cos(tilt)
      const st = Math.sin(tilt)

      // Soft electric-blue aura behind the particle core.
      const glow = ctx.createRadialGradient(cx, cy, radius * 0.04, cx, cy, radius * 1.3)
      glow.addColorStop(0, 'rgba(0, 140, 255, 0.24)')
      glow.addColorStop(0.48, 'rgba(0, 72, 255, 0.12)')
      glow.addColorStop(1, 'rgba(0, 20, 120, 0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(cx, cy, radius * 1.3, 0, Math.PI * 2)
      ctx.fill()

      // Fine orbital filaments wrap around the glowing sphere.
      for (let orbit = 0; orbit < 4; orbit++) {
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(t * (orbit % 2 ? -0.38 : 0.52) + orbit * 1.31)
        ctx.scale(1, 0.34 + (orbit % 3) * 0.13)
        ctx.beginPath()
        ctx.ellipse(0, 0, radius * (1.02 + orbit * 0.055), radius * (0.78 + orbit * 0.04), 0, 0, Math.PI * 2)
        ctx.strokeStyle = orbit % 2 ? 'rgba(0, 100, 255, 0.44)' : 'rgba(24, 125, 255, 0.25)'
        ctx.lineWidth = 0.7
        ctx.stroke()
        ctx.restore()
      }

      const projected = particles.map(p => {
        const rx = p.x * cos - p.z * sin
        const rz = p.x * sin + p.z * cos
        const ry = p.y * ct - rz * st
        const z = p.y * st + rz * ct
        const perspective = 2.1 / (2.1 - z * 0.28)
        return { x: cx + rx * radius * perspective, y: cy + ry * radius * perspective, z, size: p.size * perspective, phase: p.phase }
      }).sort((a, b) => a.z - b.z)

      // Connect nearby visible particles to create a living neural web.
      ctx.lineWidth = 0.55
      for (let i = 0; i < projected.length; i += 2) {
        const a = projected[i]
        if (a.z < -0.12) continue
        for (let j = i + 1; j < Math.min(i + 15, projected.length); j++) {
          const b = projected[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < radius * 0.19) {
            ctx.strokeStyle = 'rgba(0, 111, 255, ' + ((1 - dist / (radius * 0.19)) * (0.16 + Math.max(0, a.z) * 0.3)) + ')'
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      for (const p of projected) {
        const depth = Math.max(0.12, (p.z + 1) / 2)
        const twinkle = 0.55 + 0.45 * Math.sin(frame * 0.075 + p.phase)
        const alpha = (0.18 + depth * 0.82) * twinkle
        const size = p.size * (0.7 + depth * 0.7)
        if (depth > 0.55 && size > 1.05 && (Math.sin(p.phase * 4 + frame * 0.035) > 0.78)) {
          ctx.strokeStyle = 'rgba(24, 125, 255, ' + alpha * 0.65 + ')'
          ctx.lineWidth = 0.8
          ctx.beginPath()
          ctx.moveTo(p.x - size * 4, p.y)
          ctx.lineTo(p.x + size * 4, p.y)
          ctx.moveTo(p.x, p.y - size * 4)
          ctx.lineTo(p.x, p.y + size * 4)
          ctx.stroke()
        }
        ctx.fillStyle = 'rgba(22, 119, 255, ' + alpha + ')'
        ctx.beginPath()
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2)
        ctx.fill()
        if (depth > 0.72 && size > 0.8) {
          ctx.fillStyle = 'rgba(130, 205, 255, ' + alpha * 0.65 + ')'
          ctx.beginPath()
          ctx.arc(p.x, p.y, Math.max(0.35, size * 0.36), 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Bright moving sparks give the orb the same energetic, electric feel.
      for (let i = 0; i < 13; i++) {
        const a = t * (i % 2 ? -0.75 : 0.9) + i * 2.399
        const orbitR = radius * (0.78 + 0.28 * Math.sin(i * 3.1))
        const x = cx + Math.cos(a) * orbitR
        const y = cy + Math.sin(a * 1.19) * orbitR * 0.67
        const spark = 1.1 + 1.6 * (0.5 + 0.5 * Math.sin(frame * 0.11 + i))
        const sg = ctx.createRadialGradient(x, y, 0, x, y, spark * 4)
        sg.addColorStop(0, 'rgba(190, 230, 255, 0.95)')
        sg.addColorStop(0.25, 'rgba(0, 132, 255, 0.75)')
        sg.addColorStop(1, 'rgba(0, 82, 255, 0)')
        ctx.fillStyle = sg
        ctx.beginPath()
        ctx.arc(x, y, spark * 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(205, 239, 255, 0.95)'
        ctx.beginPath()
        ctx.arc(x, y, spark * 0.55, 0, Math.PI * 2)
        ctx.fill()
      }
      raf = window.requestAnimationFrame(draw)
    }
    raf = window.requestAnimationFrame(draw)
    window.addEventListener('resize', resize)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} aria-label="Aperonix voice animation" role="img" className="h-64 w-64 sm:h-72 sm:w-72 max-w-full" />
}

export default function AperonixVoiceAgentPage() {
  const { user } = useUser()
  const [rows, setRows] = useState<VoiceConversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameTitle, setRenameTitle] = useState('')
  const [playbackModal, setPlaybackModal] = useState(false)
  const [titleGeneratingId, setTitleGeneratingId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const sessionRef = useRef<any>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const startedRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cursorRef = useRef(0)
  const activeRef = useRef<string | null>(null)
  const statusRef = useRef<VoiceStatus>('idle')
  const pendingNewConversationRef = useRef(false)
  const creatingConversationRef = useRef(false)
  const titleStartedRef = useRef(false)
  const firstUtteranceRef = useRef('')

  const changeStatus = (value: VoiceStatus) => { statusRef.current = value; setStatus(value) }

  const loadHistory = useCallback(async (selectId?: string | null) => {
    const supabase = createClient()
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) { setRows([]); return }
    const { data, error: queryError } = await supabase.from('aperonix_voice_conversations')
      .select('id,title,storage_path,mime_type,duration_ms,pinned,created_at,updated_at')
      .eq('user_id', currentUser.id).order('pinned', { ascending: false }).order('updated_at', { ascending: false })
    if (queryError) throw queryError
    const list = (data || []) as VoiceConversation[]
    setRows(list)
    const nextId = selectId || activeRef.current
    const selected = nextId && list.some(row => row.id === nextId) ? nextId : (list[0]?.id || null)
    setActiveId(selected)
    activeRef.current = selected
  }, [])

  useEffect(() => {
    let alive = true
    void loadHistory().catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Could not load history.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [loadHistory, user?.id])
  useEffect(() => { activeRef.current = activeId }, [activeId])
  useEffect(() => {
    if (status !== 'listening' || !startedRef.current) return
    const tick = () => setElapsed(Date.now() - (startedRef.current || Date.now()))
    tick()
    timerRef.current = setInterval(tick, 500)
    return () => { if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null }
  }, [status])

  const createConversation = useCallback(async () => {
    const supabase = createClient()
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !currentUser) throw new Error('Please sign in to save voice conversations.')
    const title = 'New conversation'
    const { data, error: insertError } = await supabase.from('aperonix_voice_conversations')
      .insert({ user_id: currentUser.id, title, pinned: false }).select('id,title,storage_path,mime_type,duration_ms,pinned,created_at,updated_at').single()
    if (insertError || !data) throw new Error(insertError?.message || 'Could not create conversation.')
    setRows(prev => [data as VoiceConversation, ...prev])
    setActiveId(data.id); activeRef.current = data.id; setPlaybackUrl(null); setPlaybackModal(false); setError(null)
    return data.id as string
  }, [])

  const generateVoiceTitle = useCallback(async (id: string, message: string) => {
    setTitleGeneratingId(id)
    try {
      const response = await fetch('/api/aperonix/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      if (!response.ok) throw new Error('Title generation failed')
      const data = await response.json()
      if (typeof data.title !== 'string' || !data.title.trim()) throw new Error('Empty title')
      const title = data.title.trim().slice(0, 80)
      const supabase = createClient()
      const { error: updateError } = await supabase.from('aperonix_voice_conversations')
        .update({ title, updated_at: new Date().toISOString() }).eq('id', id)
      if (updateError) throw updateError
      const updatedAt = new Date().toISOString()
      setRows(prev => prev.map(row => row.id === id ? { ...row, title, updated_at: updatedAt } : row)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.updated_at) - +new Date(a.updated_at)))
    } catch (e) {
      console.error('Could not generate voice conversation title', e)
    } finally {
      setTitleGeneratingId(current => current === id ? null : current)
    }
  }, [])

  const saveRecording = useCallback(async (id: string, blob: Blob, durationMs: number) => {
    if (!blob.size) throw new Error('No audio was captured. Please try again.')
    const supabase = createClient()
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !currentUser) throw new Error('Your session expired before the recording could be saved.')
    const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
    const path = currentUser.id + '/' + id + '/recording-' + Date.now() + '.' + ext
    const { error: uploadError } = await supabase.storage.from('aperonix-voice-recordings').upload(path, blob, { contentType: blob.type || 'audio/webm', upsert: false })
    if (uploadError) throw new Error('Could not upload recording: ' + uploadError.message)
    const { error: updateError } = await supabase.from('aperonix_voice_conversations').update({
      storage_path: path, mime_type: blob.type || 'audio/webm', duration_ms: durationMs, updated_at: new Date().toISOString(),
    }).eq('id', id).eq('user_id', currentUser.id)
    if (updateError) { await supabase.storage.from('aperonix-voice-recordings').remove([path]); throw updateError }
    await loadHistory(id)
  }, [loadHistory])

  const stopSession = useCallback(async () => {
    if (statusRef.current === 'idle' || statusRef.current === 'saving') return
    changeStatus('saving')
    const id = activeRef.current
    const durationMs = startedRef.current ? Date.now() - startedRef.current : elapsed
    startedRef.current = null
    if (timerRef.current) clearInterval(timerRef.current)
    try { sessionRef.current?.close() } catch {}
    sessionRef.current = null
    const recorder = recorderRef.current
    const blobPromise = recorder && recorder.state !== 'inactive'
      ? new Promise<Blob>((resolve, reject) => {
          recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }))
          recorder.onerror = () => reject(new Error('Browser could not finish recording.'))
          recorder.stop()
        })
      : Promise.resolve(new Blob(chunksRef.current, { type: 'audio/webm' }))
    recorderRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    const context = contextRef.current
    contextRef.current = null; destinationRef.current = null
    try {
      const blob = await blobPromise
      if (id && blob.size) await saveRecording(id, blob, durationMs)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save recording.') }
    finally {
      if (context && context.state !== 'closed') await context.close().catch(() => undefined)
      chunksRef.current = []; cursorRef.current = 0
      changeStatus('idle'); setElapsed(durationMs)
    }
  }, [elapsed, saveRecording])

  useEffect(() => () => {
    try { sessionRef.current?.close() } catch {}
    streamRef.current?.getTracks().forEach(track => track.stop())
    if (timerRef.current) clearInterval(timerRef.current)
    const context = contextRef.current
    if (context && context.state !== 'closed') void context.close().catch(() => undefined)
  }, [])

  const startSession = async () => {
    if (statusRef.current !== 'idle') return
    setError(null); setPlaybackUrl(null); setElapsed(0); changeStatus('preparing')
    let id = activeRef.current
    pendingNewConversationRef.current = !id
    creatingConversationRef.current = false
    titleStartedRef.current = false
    firstUtteranceRef.current = ''
    try {
      const response = await fetch('/api/aperonix/voice-token', { method: 'POST', cache: 'no-store' })
      const tokenData = await response.json()
      if (!response.ok || !tokenData.token) throw new Error(tokenData.error || 'Could not prepare Gemini Live.')
      changeStatus('connecting')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      streamRef.current = stream
      const context = new AudioContext()
      contextRef.current = context
      await context.resume()
      const destination = context.createMediaStreamDestination()
      destinationRef.current = destination
      const micSource = context.createMediaStreamSource(stream)
      micSource.connect(destination)
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '')
      const recorder = new MediaRecorder(destination.stream, mime ? { mimeType: mime } : undefined)
      recorderRef.current = recorder; chunksRef.current = []
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data) }
      recorder.start(1000)
      const ai = new GoogleGenAI({ apiKey: tokenData.token })
      startedRef.current = Date.now()
      const session = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } },
          systemInstruction: { parts: [{ text: 'You are Aperonix, SociaLens official AI voice companion. Speak in a warm, sweet, calm, natural feminine voice. Be friendly, patient, and conversational rather than robotic. Respond naturally in the language the user speaks, including Hindi, Hinglish, and English. Keep replies concise unless asked for detail. Let the user interrupt. Never claim to have performed actions you did not perform.' }] },
        },
        callbacks: {
          onopen: () => changeStatus('listening'),
          onmessage: message => {
            const transcript = message.serverContent?.inputTranscription?.text
            if (typeof transcript === 'string' && transcript.trim()) {
              firstUtteranceRef.current = (firstUtteranceRef.current + ' ' + transcript.trim()).trim().slice(0, 12000)
            }
            if (message.serverContent?.turnComplete && pendingNewConversationRef.current && !titleStartedRef.current && firstUtteranceRef.current.trim() && !creatingConversationRef.current) {
              creatingConversationRef.current = true
              titleStartedRef.current = true
              pendingNewConversationRef.current = false
              const utterance = firstUtteranceRef.current.trim()
              void createConversation().then(id => {
                void generateVoiceTitle(id, utterance)
              }).catch(e => {
                creatingConversationRef.current = false
                titleStartedRef.current = false
                pendingNewConversationRef.current = true
                setError(e instanceof Error ? e.message : 'Could not save the new conversation.')
              })
            }
            const parts = message.serverContent?.modelTurn?.parts || []
            for (const part of parts) {
              if (!part.inlineData?.data || !part.inlineData.mimeType?.startsWith('audio/pcm')) continue
              try {
                const bytes = decodeBase64(part.inlineData.data)
                const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2))
                const samples = new Float32Array(pcm.length)
                for (let i = 0; i < pcm.length; i++) samples[i] = pcm[i] / 32768
                const ctx = contextRef.current
                if (!ctx) continue
                const buffer = ctx.createBuffer(1, samples.length, 24000)
                buffer.copyToChannel(samples, 0)
                const source = ctx.createBufferSource(); source.buffer = buffer
                source.connect(ctx.destination)
                if (destinationRef.current) source.connect(destinationRef.current)
                const startAt = Math.max(ctx.currentTime + 0.02, cursorRef.current)
                source.start(startAt); cursorRef.current = startAt + buffer.duration
              } catch (e) { console.error('Could not play voice output', e) }
            }
          },
          onerror: event => { console.error('Gemini Live error', event); setError('The voice connection had a problem. End the session and try again.') },
          onclose: () => { if (statusRef.current === 'listening') setError('Voice connection closed. End the session to save your recording.') },
        },
      })
      sessionRef.current = session
      const processor = context.createScriptProcessor(4096, 1, 1)
      processor.onaudioprocess = event => {
        if (!sessionRef.current || statusRef.current !== 'listening') return
        try { sessionRef.current.sendRealtimeInput({ audio: { data: pcm16Base64(event.inputBuffer.getChannelData(0), context.sampleRate), mimeType: 'audio/pcm;rate=16000' } }) }
        catch (e) { console.error('Could not send microphone audio', e) }
      }
      micSource.connect(processor)
      const mute = context.createGain(); mute.gain.value = 0; processor.connect(mute); mute.connect(context.destination)
      changeStatus('listening')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start voice session.')
      try { sessionRef.current?.close() } catch {}
      sessionRef.current = null
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
      recorderRef.current = null
      streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null
      const context = contextRef.current; contextRef.current = null; destinationRef.current = null
      if (context && context.state !== 'closed') await context.close().catch(() => undefined)
      chunksRef.current = []; startedRef.current = null; changeStatus('idle')
    }
  }

  const playRecording = async (row: VoiceConversation) => {
    if (!row.storage_path) { setError('This conversation does not have a saved recording yet.'); return }
    const supabase = createClient()
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !currentUser || !row.storage_path.startsWith(currentUser.id + '/')) { setError('You cannot access this recording.'); return }
    const { data, error: signError } = await supabase.storage.from('aperonix-voice-recordings').createSignedUrl(row.storage_path, 600)
    if (signError || !data?.signedUrl) { setError('Could not open this recording.'); return }
    setActiveId(row.id); activeRef.current = row.id; setPlaybackUrl(data.signedUrl); setPlaybackModal(true); setError(null)
  }

  const removeConversation = async (row: VoiceConversation) => {
    const supabase = createClient()
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !currentUser) { setError('Please sign in again.'); return }
    if (row.storage_path && row.storage_path.startsWith(currentUser.id + '/')) {
      const { error: storageError } = await supabase.storage.from('aperonix-voice-recordings').remove([row.storage_path])
      if (storageError) { setError('Could not delete the recording.'); return }
    }
    const { error: deleteError } = await supabase.from('aperonix_voice_conversations').delete().eq('id', row.id).eq('user_id', currentUser.id)
    if (deleteError) { setError('Could not delete conversation.'); return }
    setRows(prev => prev.filter(item => item.id !== row.id))
    if (activeId === row.id) { setActiveId(null); activeRef.current = null; setPlaybackUrl(null); setPlaybackModal(false) }
    setDeleteId(null)
  }

  const togglePin = async (row: VoiceConversation) => {
    const pinned = !row.pinned
    const supabase = createClient()
    const { error: updateError } = await supabase.from('aperonix_voice_conversations').update({ pinned, updated_at: new Date().toISOString() }).eq('id', row.id)
    if (updateError) { setError('Could not update pin.'); return }
    setRows(prev => prev.map(item => item.id === row.id ? { ...item, pinned } : item).sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.updated_at) - +new Date(a.updated_at)))
    setMenuId(null)
  }
  const saveRename = async () => {
    const title = renameTitle.trim()
    if (!renameId || !title) return
    const supabase = createClient()
    const { error: updateError } = await supabase.from('aperonix_voice_conversations').update({ title, updated_at: new Date().toISOString() }).eq('id', renameId)
    if (updateError) { setError('Could not rename conversation.'); return }
    setRows(prev => prev.map(item => item.id === renameId ? { ...item, title, updated_at: new Date().toISOString() } : item).sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.updated_at) - +new Date(a.updated_at)))
    setRenameId(null); setRenameTitle(''); setMenuId(null)
  }
  const duplicateConversation = async (row: VoiceConversation) => {
    const supabase = createClient()
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !currentUser) { setError('Please sign in again.'); return }
    let copiedPath: string | null = null
    if (row.storage_path) {
      const { data: source, error: downloadError } = await supabase.storage.from('aperonix-voice-recordings').download(row.storage_path)
      if (downloadError || !source) { setError('Could not duplicate the recording.'); return }
      copiedPath = currentUser.id + '/' + crypto.randomUUID() + '/recording-copy-' + Date.now() + '.' + (row.storage_path.split('.').pop() || 'webm')
      const { error: uploadError } = await supabase.storage.from('aperonix-voice-recordings').upload(copiedPath, source, { contentType: row.mime_type || 'audio/webm', upsert: false })
      if (uploadError) { setError('Could not copy the recording.'); return }
    }
    const { data, error: insertError } = await supabase.from('aperonix_voice_conversations').insert({ user_id: currentUser.id, title: row.title + ' (copy)', storage_path: copiedPath, mime_type: row.mime_type, duration_ms: row.duration_ms, pinned: false }).select('id,title,storage_path,mime_type,duration_ms,pinned,created_at,updated_at').single()
    if (insertError || !data) {
      if (copiedPath) await supabase.storage.from('aperonix-voice-recordings').remove([copiedPath])
      setError('Could not duplicate conversation.'); return
    }
    setRows(prev => [data as VoiceConversation, ...prev]); setActiveId(data.id); activeRef.current = data.id
    setPlaybackUrl(null); setPlaybackModal(false); setMenuId(null); setSidebarOpen(false)
  }

  const active = rows.find(row => row.id === activeId) || null
  const busy = status !== 'idle'

  return <div className="relative h-[100dvh] lg:h-[calc(100dvh-3.5rem)] min-h-[480px] flex w-full overflow-hidden bg-background text-foreground">
    {sidebarOpen && <button type="button" aria-label="Close conversation sidebar" className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />}
    <aside className={`${sidebarOpen ? "fixed inset-y-0 left-0 z-[100] flex w-[min(86vw,320px)] shadow-2xl" : "hidden"} lg:static lg:z-auto lg:flex lg:w-[260px] xl:w-[290px] shrink-0 border-r border-border flex-col bg-background`}>
      <div className="p-4 border-b border-border">
        <div className="mb-4"><h1 className="font-semibold text-sm">All conversations</h1></div>
        <button disabled={busy} onClick={() => { setSidebarOpen(false); setActiveId(null); activeRef.current = null; setPlaybackUrl(null); setPlaybackModal(false); setError(null); setTitleGeneratingId(null); pendingNewConversationRef.current = true; creatingConversationRef.current = false; titleStartedRef.current = false; firstUtteranceRef.current = '' }} aria-label="New conversation" title="New conversation" className="m-3 flex w-[calc(100%-1.5rem)] items-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed border-pink-500/30 hover:border-pink-500 hover:bg-pink-500/5 text-pink-500 text-sm font-medium transition-colors disabled:opacity-50"><Plus className="h-4 w-4" /> New conversation</button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? <div className="flex justify-center py-8"><LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" /></div> : rows.length === 0 ? <p className="px-3 py-8 text-center text-xs leading-5 text-muted-foreground">No conversations yet.</p> : rows.map(row => <div key={row.id} className={'group relative rounded-lg mb-1 ' + (activeId === row.id ? 'bg-accent' : 'hover:bg-accent/60')}>
          <div className="flex items-center gap-1 p-1"><button onClick={() => { setActiveId(row.id); activeRef.current = row.id; setPlaybackUrl(null); setPlaybackModal(false); setError(null); setSidebarOpen(false) }} className="min-w-0 flex-1 text-left px-2 py-2.5"><span className="flex items-center gap-2 min-w-0"><span className="block text-sm font-medium truncate">{row.title}</span>{titleGeneratingId === row.id && <LoaderCircle aria-label="Aperonix is generating the conversation title" className="h-3.5 w-3.5 shrink-0 animate-spin text-pink-500" />}{row.pinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground fill-current" />}</span></button><button aria-label={'Conversation options for ' + row.title} onClick={() => setMenuId(menuId === row.id ? null : row.id)} className="p-2 rounded-md text-muted-foreground hover:bg-background hover:text-foreground"><MoreHorizontal className="h-4 w-4" /></button></div>
          {menuId === row.id && <><button aria-label="Close conversation menu" className="fixed inset-0 z-20 cursor-default" onClick={() => setMenuId(null)} /><div className="absolute right-2 top-10 z-30 w-48 rounded-xl border border-border bg-popover p-1.5 shadow-xl">
            <button onClick={() => void togglePin(row)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"><Pin className="h-4 w-4" />{row.pinned ? 'Unpin conversation' : 'Pin to top'}</button>
            <button onClick={() => { setRenameId(row.id); setRenameTitle(row.title); setMenuId(null) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"><Pencil className="h-4 w-4" />Rename</button>
            <button onClick={() => void duplicateConversation(row)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"><Copy className="h-4 w-4" />Duplicate</button>
            <button disabled={!row.storage_path} onClick={() => { setMenuId(null); void playRecording(row) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-40"><Play className="h-4 w-4" />Play recording</button>
            <button onClick={() => { setDeleteId(row.id); setMenuId(null) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-500 hover:bg-accent"><Trash2 className="h-4 w-4" />Delete</button>
          </div></>}
          {renameId === row.id && <div className="px-2 pb-2"><input autoFocus value={renameTitle} onChange={e => setRenameTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void saveRename(); if (e.key === 'Escape') setRenameId(null) }} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-pink-500" maxLength={80} /><div className="mt-2 flex justify-end gap-2"><button onClick={() => setRenameId(null)} className="rounded-md border border-border px-2 py-1 text-xs">Cancel</button><button onClick={() => void saveRename()} className="rounded-md bg-pink-600 px-2 py-1 text-xs text-white">Save</button></div></div>}
          
        </div>)}
      </div>
      
    </aside>
    <main className="flex-1 min-w-0 w-full flex flex-col">
      <header className="min-h-14 border-b border-border px-3 sm:px-6 py-2 flex items-center gap-2 sm:gap-3"><button type="button" onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.assign('/home') }} aria-label="Go back" title="Go back" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft className="h-[18px] w-[18px]" /></button><button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open voice conversation history" title="Conversation history" className="relative z-10 lg:hidden shrink-0 text-muted-foreground hover:text-foreground"><Menu className="h-5 w-5" /></button><Image src="/images/aperonix-logo.png" alt="Aperonix" width={36} height={36} className="h-9 w-9 shrink-0 rounded-full object-contain" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="font-semibold text-sm truncate">{active?.title || 'New conversation'}</h2>{active && titleGeneratingId === active.id && <LoaderCircle aria-label="Aperonix is generating the conversation title" className="h-3.5 w-3.5 shrink-0 animate-spin text-pink-500" />}</div><p className="text-xs text-muted-foreground truncate">{status === 'listening' ? 'Real-time voice conversation · recording' : status === 'saving' ? 'Saving recording to Supabase…' : status === 'connecting' ? 'Connecting to Gemini Live…' : status === 'preparing' ? 'Preparing microphone…' : 'Real-time voice conversation'}</p></div>{status === 'listening' && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{duration(elapsed)}</span>}</header>
      <section className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center px-4 sm:px-5 py-6 sm:py-8">
        {status === 'listening' ? <VoiceParticleAnimation /> : <div className="relative flex h-36 w-36 sm:h-44 sm:w-44 items-center justify-center"><Image src="/images/aperonix-logo.png" alt="Aperonix" width={220} height={220} priority className="h-full w-full object-contain" /></div>}
        <h3 className="mt-8 text-xl sm:text-2xl font-semibold text-center">{status === 'listening' ? 'I’m listening…' : status === 'saving' ? 'Saving your recording' : status === 'connecting' ? 'Connecting to Aperonix' : status === 'preparing' ? 'Getting your voice ready' : playbackUrl ? 'Saved recording' : 'Hey, I’m Aperonix'}</h3>
        <p className="mt-2 max-w-md text-center text-sm text-muted-foreground leading-6">{status === 'listening' ? 'I’m listening. Go ahead whenever you’re ready.' : status === 'saving' ? 'Your combined conversation audio is being uploaded to private Supabase storage.' : playbackUrl ? 'Listen to your saved voice conversation below.' : 'Your curious companion for big ideas, everyday questions, and new discoveries. Let’s figure things out together.'}</p>
        {playbackUrl && status === 'idle' && playbackModal && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4" onClick={() => setPlaybackModal(false)}><div role="dialog" aria-modal="true" aria-label="Play voice conversation" className="w-full max-w-lg rounded-2xl border border-border bg-background p-5 shadow-2xl" onClick={e => e.stopPropagation()}><div className="flex items-center justify-between gap-3 mb-5"><div><h3 className="font-semibold text-base">{active?.title || 'Voice recording'}</h3><p className="text-xs text-muted-foreground mt-1">Full saved conversation audio</p></div><button onClick={() => setPlaybackModal(false)} aria-label="Close player" className="rounded-full p-2 hover:bg-accent"><X className="h-4 w-4" /></button></div><audio key={playbackUrl} controls autoPlay src={playbackUrl} className="w-full" /><p className="text-xs text-muted-foreground mt-3">Private recording · playback link expires after 10 minutes</p></div></div>}
        {error && <div role="alert" className="mt-6 max-w-xl w-full rounded-xl border border-red-500/30 bg-red-500/5 p-3 flex items-start gap-2 text-sm text-red-500"><AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /><span>{error}</span></div>}
      </section>
      <footer className="shrink-0 border-t border-border px-3 py-4 sm:p-6 flex flex-col items-center gap-3"><div className="flex items-center justify-center gap-3">{status === 'idle' ? <button onClick={() => void startSession()} className="max-w-full flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-violet-600 hover:brightness-110 px-4 sm:px-6 py-3 text-sm sm:text-base text-white font-semibold shadow-lg"><Mic className="h-5 w-5 shrink-0" /> Start voice conversation</button> : status === 'saving' ? <button disabled className="flex items-center gap-2 rounded-full bg-muted px-6 py-3 text-muted-foreground font-semibold"><LoaderCircle className="h-5 w-5 animate-spin" /> Saving recording…</button> : <button onClick={() => void stopSession()} className="max-w-full flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-violet-600 hover:brightness-110 px-4 sm:px-6 py-3 text-sm sm:text-base text-white font-semibold shadow-lg"><PhoneOff className="h-5 w-5 shrink-0" /> Stop</button>}</div><p className="mt-2 pb-2 text-center text-[10px] text-muted-foreground/70">Aperonix is AI and can make mistakes. Check important info.</p></footer>
    </main>
    {deleteId && (() => { const row = rows.find(item => item.id === deleteId); if (!row) return null; return <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]" onClick={() => { if (!deleteBusy) setDeleteId(null) }}><div role="dialog" aria-modal="true" aria-labelledby="delete-voice-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl" onClick={event => event.stopPropagation()}><div className="flex items-start gap-3 border-b border-border p-5"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-500"><Trash2 className="h-5 w-5" /></div><div className="min-w-0 flex-1"><h2 id="delete-voice-title" className="text-base font-semibold">Delete this conversation?</h2><p className="mt-1 text-sm text-muted-foreground">“{row.title}” and its saved voice recording will be permanently deleted. This action cannot be undone.</p></div></div><div className="flex flex-col-reverse gap-2 p-4 sm:flex-row sm:justify-end"><button disabled={deleteBusy} onClick={() => setDeleteId(null)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50">Cancel</button><button disabled={deleteBusy} onClick={async () => { setDeleteBusy(true); try { await removeConversation(row) } finally { setDeleteBusy(false) } }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">{deleteBusy && <LoaderCircle className="h-4 w-4 animate-spin" />} {deleteBusy ? 'Deleting…' : 'Delete conversation'}</button></div></div></div> })()}
  </div>
}
