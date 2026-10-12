'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { GoogleGenAI, Modality } from '@google/genai'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/lib/hooks/useUser'
import { AudioLines, Plus, Mic, PhoneOff, Play, Headphones, LoaderCircle, Trash2, AlertCircle, Radio, Menu, X } from 'lucide-react'

type VoiceConversation = { id: string; title: string; storage_path: string | null; mime_type: string; duration_ms: number; created_at: string; updated_at: string }
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

  const changeStatus = (value: VoiceStatus) => { statusRef.current = value; setStatus(value) }

  const loadHistory = useCallback(async (selectId?: string | null) => {
    const supabase = createClient()
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) { setRows([]); return }
    const { data, error: queryError } = await supabase.from('aperonix_voice_conversations')
      .select('id,title,storage_path,mime_type,duration_ms,created_at,updated_at')
      .eq('user_id', currentUser.id).order('updated_at', { ascending: false })
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
    const now = new Date()
    const title = 'Voice conversation · ' + now.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    const { data, error: insertError } = await supabase.from('aperonix_voice_conversations')
      .insert({ user_id: currentUser.id, title }).select('id,title,storage_path,mime_type,duration_ms,created_at,updated_at').single()
    if (insertError || !data) throw new Error(insertError?.message || 'Could not create conversation.')
    setRows(prev => [data as VoiceConversation, ...prev])
    setActiveId(data.id); activeRef.current = data.id; setPlaybackUrl(null); setError(null)
    return data.id as string
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
    try {
      if (!id) id = await createConversation()
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
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } },
          systemInstruction: { parts: [{ text: 'You are Aperonix, SociaLens official AI voice companion. Speak in a warm, sweet, calm, natural feminine voice. Be friendly, patient, and conversational rather than robotic. Respond naturally in the language the user speaks, including Hindi, Hinglish, and English. Keep replies concise unless asked for detail. Let the user interrupt. Never claim to have performed actions you did not perform.' }] },
        },
        callbacks: {
          onopen: () => changeStatus('listening'),
          onmessage: message => {
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
    setActiveId(row.id); activeRef.current = row.id; setPlaybackUrl(data.signedUrl); setError(null)
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
    if (activeId === row.id) { setActiveId(null); activeRef.current = null; setPlaybackUrl(null) }
    setDeleteId(null)
  }

  const active = rows.find(row => row.id === activeId) || null
  const busy = status !== 'idle'

  return <div className="relative h-[100dvh] lg:h-[calc(100dvh-3.5rem)] min-h-[480px] flex w-full overflow-hidden bg-background text-foreground">
    {sidebarOpen && <button type="button" aria-label="Close conversation sidebar" className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />}
    <aside className={`${sidebarOpen ? "fixed inset-y-0 left-0 z-50 flex w-[min(86vw,320px)] shadow-2xl" : "hidden"} lg:static lg:z-auto lg:flex lg:w-[260px] xl:lg:w-[290px] shrink-0 border-r border-border flex-col bg-card/40`}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-4"><div className="h-9 w-9 rounded-xl bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center text-white"><AudioLines className="h-5 w-5" /></div><div><h1 className="font-semibold text-sm">Aperonix Voice</h1><p className="text-xs text-muted-foreground">Voice conversations</p></div></div>
        <button disabled={busy} onClick={() => { setSidebarOpen(false); void createConversation().catch(e => setError(e.message)) }} className="w-full flex items-center justify-center gap-2 rounded-xl border border-pink-500/50 bg-pink-500/10 hover:bg-pink-500/15 px-3 py-2.5 text-sm font-semibold text-pink-500 disabled:opacity-50"><Plus className="h-4 w-4" /> New conversation</button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? <div className="flex justify-center py-8"><LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" /></div> : rows.length === 0 ? <p className="px-3 py-8 text-center text-xs leading-5 text-muted-foreground">Saved voice recordings will appear here.</p> : rows.map(row => <div key={row.id} className={'group rounded-xl mb-1 ' + (activeId === row.id ? 'bg-accent' : 'hover:bg-accent/60')}>
          <button onClick={() => { setActiveId(row.id); activeRef.current = row.id; setPlaybackUrl(null); setError(null); setSidebarOpen(false) }} className="w-full text-left p-3 flex items-start gap-2"><Headphones className="h-4 w-4 mt-0.5 shrink-0 text-pink-500" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium truncate">{row.title}</span><span className="block text-xs text-muted-foreground mt-1">{dateLabel(row.created_at)}</span><span className="block text-xs text-muted-foreground mt-1">{row.storage_path ? duration(row.duration_ms) : 'Not recorded yet'}</span></span></button>
          <div className="flex items-center justify-between px-3 pb-2"><button disabled={!row.storage_path} onClick={() => void playRecording(row)} className="text-xs text-pink-500 disabled:text-muted-foreground/50 flex items-center gap-1"><Play className="h-3 w-3" /> Play recording</button><button onClick={() => setDeleteId(row.id)} title="Delete recording" className="p-1 rounded text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button></div>
          {deleteId === row.id && <div className="px-3 pb-3 text-xs"><p className="mb-2 text-muted-foreground">Delete this recording permanently?</p><div className="flex gap-2"><button onClick={() => void removeConversation(row)} className="rounded-md bg-red-500 px-2 py-1 text-white">Delete</button><button onClick={() => setDeleteId(null)} className="rounded-md border px-2 py-1">Cancel</button></div></div>}
        </div>)}
      </div>
      <div className="p-3 border-t border-border text-[11px] text-muted-foreground">Recordings are stored privately in Supabase.</div>
    </aside>
    <main className="flex-1 min-w-0 w-full flex flex-col">
      <header className="min-h-14 border-b border-border px-3 sm:px-6 py-2 flex items-center gap-3"><button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open voice conversation history" title="Conversation history" className="lg:hidden shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card hover:bg-accent"><Menu className="h-5 w-5" /></button><div className="min-w-0 flex-1"><h2 className="font-semibold text-sm truncate">{active?.title || 'Aperonix Voice Agent'}</h2><p className="text-xs text-muted-foreground truncate">{status === 'listening' ? 'Live conversation · recording' : status === 'saving' ? 'Saving recording to Supabase…' : status === 'connecting' ? 'Connecting to Gemini Live…' : status === 'preparing' ? 'Preparing microphone…' : 'Natural, real-time voice conversation'}</p></div>{status === 'listening' && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{duration(elapsed)}</span>}</header>
      <section className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center px-4 sm:px-5 py-6 sm:py-8">
        <div className={'relative h-36 w-36 sm:h-44 sm:w-44 rounded-full flex items-center justify-center ' + (status === 'listening' ? 'bg-gradient-to-br from-pink-500/25 via-violet-500/25 to-cyan-400/25 shadow-[0_0_80px_rgba(217,70,239,0.22)]' : 'bg-muted/70')}><div className="absolute inset-3 rounded-full border border-pink-500/30" /><div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-gradient-to-br from-pink-500 via-purple-600 to-cyan-500 flex items-center justify-center shadow-lg text-white">{busy && status !== 'listening' ? <LoaderCircle className="h-10 w-10 animate-spin" /> : status === 'listening' ? <Radio className="h-10 w-10 animate-pulse" /> : <AudioLines className="h-10 w-10" />}</div></div>
        <h3 className="mt-8 text-xl sm:text-2xl font-semibold text-center">{status === 'listening' ? 'I’m listening…' : status === 'saving' ? 'Saving your recording' : status === 'connecting' ? 'Connecting to Aperonix' : status === 'preparing' ? 'Getting your voice ready' : playbackUrl ? 'Saved recording' : 'Talk naturally with Aperonix'}</h3>
        <p className="mt-2 max-w-md text-center text-sm text-muted-foreground leading-6">{status === 'listening' ? 'Speak naturally in Hindi, Hinglish, or English. You can interrupt Aperonix whenever you want.' : status === 'saving' ? 'Your combined conversation audio is being uploaded to private Supabase storage.' : playbackUrl ? 'Listen to your saved voice conversation below.' : 'Aperonix answers aloud in a warm, natural voice. Conversations are saved as audio recordings, not text chats.'}</p>
        {playbackUrl && status === 'idle' && <div className="w-full max-w-xl mt-8 rounded-2xl border border-border bg-card p-4"><div className="flex items-center gap-2 text-sm font-medium mb-3"><Headphones className="h-4 w-4 text-pink-500" /> Voice recording</div><audio key={playbackUrl} controls autoPlay src={playbackUrl} className="w-full" /><p className="text-xs text-muted-foreground mt-2">Private recording · playback link expires after 10 minutes</p></div>}
        {error && <div role="alert" className="mt-6 max-w-xl w-full rounded-xl border border-red-500/30 bg-red-500/5 p-3 flex items-start gap-2 text-sm text-red-500"><AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /><span>{error}</span></div>}
      </section>
      <footer className="shrink-0 border-t border-border px-3 py-4 sm:p-6 flex flex-col items-center gap-3"><div className="flex items-center justify-center gap-3">{status === 'idle' ? <button onClick={() => void startSession()} className="max-w-full flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-violet-600 hover:brightness-110 px-4 sm:px-6 py-3 text-sm sm:text-base text-white font-semibold shadow-lg"><Mic className="h-5 w-5 shrink-0" /> Start voice conversation</button> : status === 'saving' ? <button disabled className="flex items-center gap-2 rounded-full bg-muted px-6 py-3 text-muted-foreground font-semibold"><LoaderCircle className="h-5 w-5 animate-spin" /> Saving recording…</button> : <button onClick={() => void stopSession()} className="max-w-full flex items-center justify-center gap-2 rounded-full bg-red-500 hover:bg-red-600 px-4 sm:px-6 py-3 text-sm sm:text-base text-white font-semibold shadow-lg"><PhoneOff className="h-5 w-5 shrink-0" /> End conversation & save</button>}</div><p className="text-[11px] text-center text-muted-foreground">Microphone permission is required. Ending the call saves the combined audio recording.</p></footer>
    </main>
  </div>
}
