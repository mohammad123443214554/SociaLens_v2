'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Send, X, Smile, Mic, Square, Image as ImageIcon, Sticker as StickerIcon, Trash2, Loader2 } from 'lucide-react'
import { Message } from '@/lib/types/database.types'
import { createClient } from '@/lib/supabase/client'
const FullEmojiPicker = dynamic(() => import('./FullEmojiPicker').then(module => module.FullEmojiPicker), { ssr: false })
import { StickerPicker } from './StickerPicker'
import { getClampedPopupPosition } from '@/lib/utils/popupPosition'
import { LimitAlertDialog } from '@/components/shared/LimitAlertDialog'
import { getSharedAperonixReplyLabel } from '@/lib/utils/sharedAperonix'

export interface SendPayload {
  content?: string
  replyToId?: string | null
  mediaUrl?: string
  mediaType?: 'image' | 'video' | 'audio'
  durationSeconds?: number
  sticker?: string
}

interface MessageInputProps {
  onSend: (payload: SendPayload) => void
  onSendPending?: (tempId: string, payload: { content?: string; replyToId?: string | null; mediaUrl: string; mediaType: 'image' | 'video' }) => boolean
  onResolvePending?: (tempId: string, payload: SendPayload) => void
  onFailPending?: (tempId: string) => void
  onTyping: () => void
  currentUserId: string
  disabled?: boolean
  replyingTo?: Message | null
  onCancelReply?: () => void
}

const MAX_VIDEO_SECONDS = 60 * 60 // 60 minutes
const MAX_MESSAGE_WORDS = 10000

function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    video.preload = 'metadata'
    video.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(video.duration) }
    video.onerror = reject
    video.src = url
  })
}

async function uploadChatMedia(file: File | Blob, filename: string, userId: string): Promise<string> {
  // Uploaded straight from the browser to Supabase Storage rather than
  // routed through a server API endpoint - a server route's request body
  // gets rejected by the hosting platform's size limit well before a
  // video or a longer voice message would actually hit this app's own
  // 50MB cap, so going straight to storage is what actually lets a real
  // video/voice-message get through in production.
  const supabase = createClient()
  const ext = filename.split('.').pop() || 'bin'
  const path = `${userId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('chat-media').upload(path, file, {
    cacheControl: '31536000',
    contentType: file instanceof File ? file.type : 'audio/webm',
  })
  if (error) throw new Error(error.message || 'Upload failed')
  const { data } = supabase.storage.from('chat-media').getPublicUrl(path)
  return data.publicUrl
}

export function MessageInput({ onSend, onSendPending, onResolvePending, onFailPending, onTyping, currentUserId, disabled, replyingTo, onCancelReply }: MessageInputProps) {
  const [message, setMessage] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [showStickers, setShowStickers] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [emojiPos, setEmojiPos] = useState<{ top: number; left: number } | null>(null)
  const [stickerPos, setStickerPos] = useState<{ top: number; left: number } | null>(null)

  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [attachedType, setAttachedType] = useState<'image' | 'video' | null>(null)
  const [attachedPreviewUrl, setAttachedPreviewUrl] = useState<string | null>(null)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [limitPopup, setLimitPopup] = useState<{ title: string; description: string } | null>(null)
  const [checkingVideo, setCheckingVideo] = useState(false)
  const [sending, setSending] = useState(false)
  const [isComposerExpanded, setIsComposerExpanded] = useState(false)

  const [isRecording, setIsRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [waveformLevels, setWaveformLevels] = useState<number[]>(() => Array.from({ length: 42 }, () => 0.035))
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const waveformFrameRef = useRef<number | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const emojiBtnRef = useRef<HTMLButtonElement>(null)
  const stickerBtnRef = useRef<HTMLButtonElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const resizeTextarea = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const nextHeight = Math.min(el.scrollHeight, 300)
    el.style.height = `${nextHeight}px`
    setIsComposerExpanded(nextHeight > (window.innerWidth >= 640 ? 44 : 36) + 2)
  }
  useLayoutEffect(() => { resizeTextarea() }, [message])

  // Warm the emoji picker chunk after the chat composer mounts so opening it is immediate.
  useEffect(() => {
    void import('./FullEmojiPicker')
  }, [])

  const openEmoji = () => {
    const rect = emojiBtnRef.current?.getBoundingClientRect()
    if (rect) setEmojiPos(getClampedPopupPosition(rect, 360, 440))
    setShowEmoji(v => !v)
    setShowStickers(false)
  }

  const openStickers = () => {
    const rect = stickerBtnRef.current?.getBoundingClientRect()
    if (rect) setStickerPos(getClampedPopupPosition(rect, 360, 440))
    setShowStickers(v => !v)
    setShowEmoji(false)
  }

  const insertEmoji = (emoji: string) => {
    setMessage(prev => prev + emoji)
    setShowEmoji(false)
    textareaRef.current?.focus()
  }

  const clearAttachment = () => {
    if (attachedPreviewUrl) URL.revokeObjectURL(attachedPreviewUrl)
    setAttachedFile(null)
    setAttachedType(null)
    setAttachedPreviewUrl(null)
    setAttachError(null)
  }

  const handlePhotoPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    setShowAttachMenu(false)
    if (!file) return
    clearAttachment()
    setAttachedFile(file)
    setAttachedType('image')
    setAttachedPreviewUrl(URL.createObjectURL(file))
  }

  const handleVideoPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    setShowAttachMenu(false)
    if (!file) return
    clearAttachment()
    setCheckingVideo(true)
    try {
      const duration = await getVideoDuration(file)
      if (duration > MAX_VIDEO_SECONDS) {
        setLimitPopup({
          title: 'Video is too long',
          description: 'You can only send a video up to 60 minutes long in chat. Please trim it or pick a shorter one.',
        })
        setCheckingVideo(false)
        return
      }
      setAttachedFile(file)
      setAttachedType('video')
      setAttachedPreviewUrl(URL.createObjectURL(file))
    } catch {
      setAttachError('Could not read that video. Try a different file.')
    } finally {
      setCheckingVideo(false)
    }
  }

  // --- Voice recording -------------------------------------------------
  const stopWaveformMeter = () => {
    if (waveformFrameRef.current !== null) {
      cancelAnimationFrame(waveformFrameRef.current)
      waveformFrameRef.current = null
    }
    const context = audioContextRef.current
    audioContextRef.current = null
    if (context && context.state !== 'closed') void context.close().catch(() => undefined)
    setWaveformLevels(Array.from({ length: 42 }, () => 0.035))
  }

  const startWaveformMeter = (stream: MediaStream) => {
    try {
      const AudioContextConstructor = window.AudioContext
      if (!AudioContextConstructor) return
      const context = new AudioContextConstructor()
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.72
      const source = context.createMediaStreamSource(stream)
      source.connect(analyser)
      audioContextRef.current = context
      const samples = new Uint8Array(analyser.fftSize)
      let lastPaint = 0

      const draw = (timestamp: number) => {
        analyser.getByteTimeDomainData(samples)
        let energy = 0
        for (let i = 0; i < samples.length; i += 1) {
          const normalized = (samples[i] - 128) / 128
          energy += normalized * normalized
        }
        const rms = Math.sqrt(energy / samples.length)
        const level = Math.min(1, Math.max(0.035, rms * 4.8))
        if (timestamp - lastPaint >= 55) {
          setWaveformLevels(previous => [...previous.slice(1), level])
          lastPaint = timestamp
        }
        waveformFrameRef.current = requestAnimationFrame(draw)
      }

      waveformFrameRef.current = requestAnimationFrame(draw)
    } catch {
      // Recording remains available even if live audio metering is unsupported.
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []
      setWaveformLevels(Array.from({ length: 42 }, () => 0.035))
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.start()
      mediaRecorderRef.current = recorder
      startWaveformMeter(stream)
      setIsRecording(true)
      setRecordSeconds(0)
      recordTimerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000)
    } catch {
      setAttachError('Microphone access was blocked. Allow it to send a voice message.')
    }
  }

  const stopRecordingAndSend = () => {
    const recorder = mediaRecorderRef.current
    if (!recorder) return
    recorder.onstop = async () => {
      recorder.stream.getTracks().forEach(t => t.stop())
      stopWaveformMeter()
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
      const duration = recordSeconds
      setIsRecording(false)
      if (duration < 1) return // accidental tap, nothing worth sending
      const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      setSending(true)
      try {
        const url = await uploadChatMedia(blob, `voice-${Date.now()}.webm`, currentUserId)
        onSend({ mediaUrl: url, mediaType: 'audio', durationSeconds: duration, replyToId: replyingTo?.id })
        onCancelReply?.()
      } catch {
        setAttachError('Could not send the voice message. Try again.')
      } finally {
        setSending(false)
      }
    }
    recorder.stop()
  }

  const cancelRecording = () => {
    const recorder = mediaRecorderRef.current
    if (recorder) {
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach(t => t.stop())
        stopWaveformMeter()
      }
      recorder.stop()
    } else {
      stopWaveformMeter()
    }
    if (recordTimerRef.current) clearInterval(recordTimerRef.current)
    setIsRecording(false)
    setRecordSeconds(0)
  }

  // --- Sending -----------------------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (disabled || sending) return
    const text = message.trim()
    if (!text && !attachedFile) return

    if (countWords(text) > MAX_MESSAGE_WORDS) {
      setLimitPopup({
        title: 'Message is too long',
        description: `You can only send up to ${MAX_MESSAGE_WORDS.toLocaleString()} words in a single message. Please shorten it or split it into more than one message.`,
      })
      return
    }

    if (attachedFile) {
      // Photo/video: show it in the thread immediately (as an "uploading"
      // bubble - see ChatMessage) and let the actual upload happen in the
      // background, instead of freezing the composer for however long a
      // 1-2 minute video takes to reach Supabase Storage. This is the fix
      // for sending feeling slow - the message appears right away, same
      // as Instagram/WhatsApp, even though the real transfer still takes
      // the time it takes.
      if (onSendPending && onResolvePending) {
        const tempId = crypto.randomUUID()
        const localUrl = attachedPreviewUrl!
        const fileToUpload = attachedFile
        const fileName = attachedFile.name
        const mediaType = attachedType!
        const contentText = text
        const replyToId = replyingTo?.id

        const accepted = onSendPending(tempId, { content: contentText, replyToId, mediaUrl: localUrl, mediaType })
        if (!accepted) return // e.g. blocked by a messaging restriction - nothing was shown, nothing to upload

        setMessage('')
        // Reset the composer WITHOUT revoking the preview URL - the
        // pending bubble now owns it and will revoke it itself once the
        // real upload finishes (see the finally block below).
        setAttachedFile(null)
        setAttachedType(null)
        setAttachedPreviewUrl(null)
        setAttachError(null)
        onCancelReply?.()

        ;(async () => {
          try {
            const url = await uploadChatMedia(fileToUpload, fileName, currentUserId)
            await onResolvePending(tempId, { content: contentText, mediaUrl: url, mediaType, replyToId })
          } catch {
            onFailPending?.(tempId)
          } finally {
            URL.revokeObjectURL(localUrl)
          }
        })()
      } else {
        // Fallback for any caller that hasn't wired up the pending-message
        // callbacks - behaves exactly as before (blocks until uploaded).
        setSending(true)
        try {
          const url = await uploadChatMedia(attachedFile, attachedFile.name, currentUserId)
          onSend({ content: text, mediaUrl: url, mediaType: attachedType!, replyToId: replyingTo?.id })
          setMessage('')
          clearAttachment()
          onCancelReply?.()
        } catch {
          setAttachError('Could not send that file. Try again.')
        } finally {
          setSending(false)
        }
      }
      return
    }

    onSend({ content: text, replyToId: replyingTo?.id })
    setMessage('')
    onCancelReply?.()
  }

  const handleStickerSelect = (sticker: string) => {
    setShowStickers(false)
    onSend({ sticker, replyToId: replyingTo?.id })
    onCancelReply?.()
  }

  const hasContent = !!message.trim() || !!attachedFile

  return (
    <div className="shrink-0 border-t border-white/10 bg-black/10 backdrop-blur-sm">
      {replyingTo && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/40">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-pink-500">Replying to</p>
            <p className="text-xs text-muted-foreground truncate">{getSharedAperonixReplyLabel(replyingTo.content)}</p>
          </div>
          <button onClick={onCancelReply} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {(attachedPreviewUrl || attachError || checkingVideo) && (
        <div className="px-3 pt-2.5 flex items-start gap-2">
          {checkingVideo && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded-xl px-3 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking video...
            </div>
          )}
          {attachError && (
            <div className="flex-1 flex items-center justify-between gap-2 bg-red-500/10 text-red-500 text-xs rounded-xl px-3 py-2">
              <span>{attachError}</span>
              <button onClick={() => setAttachError(null)} className="shrink-0"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
          {attachedPreviewUrl && attachedType === 'image' && (
            <div className="relative w-16 h-16 rounded-xl overflow-hidden border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={attachedPreviewUrl} alt="Attached" className="w-full h-full object-cover" />
              <button onClick={clearAttachment} className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5">
                <X className="h-3 w-3 text-white" />
              </button>
            </div>
          )}
          {attachedPreviewUrl && attachedType === 'video' && (
            <div className="relative w-16 h-16 rounded-xl overflow-hidden border bg-black">
              <video src={attachedPreviewUrl} className="w-full h-full object-cover" muted />
              <button onClick={clearAttachment} className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5">
                <X className="h-3 w-3 text-white" />
              </button>
            </div>
          )}
        </div>
      )}

      <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={handlePhotoPicked} />
      <input ref={videoInputRef} type="file" accept="video/*" hidden onChange={handleVideoPicked} />

      {isRecording ? (
        <div className="px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex min-h-12 items-center gap-3 rounded-[26px] border border-white/10 bg-background/85 px-3 py-2 shadow-sm backdrop-blur-xl sm:gap-4 sm:px-4">
            <button
              type="button"
              onClick={cancelRecording}
              aria-label="Discard voice recording"
              title="Discard recording"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 className="h-[18px] w-[18px]" />
            </button>

            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-50" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
                </span>
                <span className="min-w-[38px] font-mono text-[13px] font-semibold tabular-nums text-foreground">
                  {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, '0')}
                </span>
              </div>

              <div
                className="flex h-9 min-w-0 flex-1 items-center justify-center gap-[3px] overflow-hidden"
                role="img"
                aria-label="Live microphone waveform"
              >
                {waveformLevels.map((level, index) => (
                  <span
                    key={index}
                    className="w-[3px] max-w-[3px] shrink-0 rounded-full bg-gradient-to-t from-pink-500 via-fuchsia-500 to-violet-400 transition-[height,opacity] duration-75"
                    style={{
                      height: `${Math.max(4, Math.round(level * 34))}px`,
                      opacity: 0.48 + level * 0.52,
                    }}
                  />
                ))}
              </div>
              <span className="hidden shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-rose-400 sm:inline">
                Rec
              </span>
            </div>

            <button
              type="button"
              onClick={stopRecordingAndSend}
              aria-label="Send voice message"
              title="Send voice message"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 via-fuchsia-500 to-violet-600 text-white shadow-[0_3px_14px_rgba(217,70,239,0.28)] transition-transform hover:scale-[1.04] active:scale-95"
            >
              <Send className="h-[17px] w-[17px] translate-x-[-1px]" />
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="px-3 py-2 sm:px-4 sm:py-3"><div className={`flex w-full ${isComposerExpanded ? "items-end rounded-[26px] sm:rounded-[28px]" : "items-center rounded-full"} gap-1 border border-white/15 bg-background/85 px-1.5 py-1 sm:gap-1.5 sm:px-2 sm:py-1.5 shadow-sm focus-within:border-white/30 transition-[border-radius] duration-150`}>
          <div className="relative shrink-0">
            <button ref={emojiBtnRef} type="button" onMouseEnter={() => { void import('./FullEmojiPicker') }} onFocus={() => { void import('./FullEmojiPicker') }} onClick={openEmoji} className="p-1.5 sm:p-2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
              <Smile className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          </div>

          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => {
              const nextValue = e.target.value
              const el = e.currentTarget
              el.style.height = 'auto'
              const nextHeight = Math.min(el.scrollHeight, 144)
              el.style.height = `${nextHeight}px`
              setIsComposerExpanded(nextHeight > (window.innerWidth >= 640 ? 44 : 36) + 2)
              setMessage(nextValue)
              onTyping()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e as unknown as React.FormEvent) }
            }}
            placeholder="Message..."
            rows={1}
            disabled={disabled}
            className="flex-1 min-w-0 min-h-[36px] sm:min-h-[44px] max-h-36 bg-transparent rounded-xl px-1.5 py-2 text-sm sm:px-2 sm:py-2.5 outline-none border-0 focus:ring-0 resize-none overflow-y-auto leading-relaxed disabled:opacity-60 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          />

          {hasContent ? (
            <button
              type="submit"
              disabled={disabled || sending}
              className="w-10 h-10 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 text-white flex items-center justify-center disabled:opacity-40 shrink-0"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          ) : (
            <div className="flex items-center gap-0.5 shrink-0">
              <button type="button" onClick={startRecording} disabled={disabled} className="p-2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                <Mic className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAttachMenu(v => !v)}
                  disabled={disabled}
                  className="p-2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ImageIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                </button>
                {showAttachMenu && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowAttachMenu(false)} />
                    <div className="absolute bottom-11 right-0 z-40 w-40 bg-card border rounded-xl shadow-xl overflow-hidden">
                      <button onClick={() => photoInputRef.current?.click()} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted">
                        📷 Photo
                      </button>
                      <button onClick={() => videoInputRef.current?.click()} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted">
                        🎥 Video
                      </button>
                    </div>
                  </>
                )}
              </div>
              <button ref={stickerBtnRef} type="button" onClick={openStickers} disabled={disabled} className="p-2 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                <StickerIcon className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
            </div>
          )}
        </div></form>
      )}

      {showEmoji && emojiPos && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowEmoji(false)} />
          <FullEmojiPicker onSelect={insertEmoji} onClose={() => setShowEmoji(false)} style={{ top: emojiPos.top, left: emojiPos.left }} />
        </>
      )}
      {showStickers && stickerPos && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowStickers(false)} />
          <StickerPicker onSelect={handleStickerSelect} onClose={() => setShowStickers(false)} style={{ top: stickerPos.top, left: stickerPos.left }} />
        </>
      )}
      {limitPopup && (
        <LimitAlertDialog
          title={limitPopup.title}
          description={limitPopup.description}
          onClose={() => setLimitPopup(null)}
        />
      )}
    </div>
  )
}
