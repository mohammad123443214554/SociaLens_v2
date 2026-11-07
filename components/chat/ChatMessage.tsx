'use client'

import { useRef, useState } from 'react'
import { MoreVertical, Reply as ReplyIcon, Smile, Pencil, Trash2, EyeOff, Copy, Volume2, Square, Forward, Check, Download, Gauge, Phone, Video, Flag, Loader2, Play } from 'lucide-react'
import { SharedPostMessage } from './SharedPostMessage'
import { SharedStoryMessage } from './SharedStoryMessage'
import { AperonixReplyMessage } from './AperonixReplyMessage'
import { SharedAperonixContentMessage } from './SharedAperonixContentMessage'
import { MessageForwardModal } from './MessageForwardModal'
import { VoiceMessagePlayer } from './VoiceMessagePlayer'
import { FullEmojiPicker } from './FullEmojiPicker'
import { UnavailableMessage } from './UnavailableMessage'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Message } from '@/lib/types/database.types'
import { formatTimeAgo, getAvatarUrl } from '@/lib/utils/helpers'
import { cn } from '@/lib/utils/helpers'
import { getClampedPopupPosition } from '@/lib/utils/popupPosition'
import {
  useUnsendMessage,
  useDeleteMessageForMe,
  useEditMessage,
  useMessageReactions,
  useSetMessageReaction,
  useRemoveMessageReaction,
  useReplyPreview,
} from '@/lib/hooks/useMessageActions'
import { speakText, stopSpeaking } from '@/lib/utils/voice'
import { ReportModal } from '@/components/shared/ReportModal'
import { MessageActionConfirmDialog } from './MessageActionConfirmDialog'
import { getSharedAperonixReplyLabel } from '@/lib/utils/sharedAperonix'

interface ChatMessageProps {
  message: Message
  isOwn: boolean
  currentUserId: string
  otherUsername?: string
  currentUserAvatarUrl?: string | null
  otherAvatarUrl?: string | null
  onReply?: (message: Message) => void
  onRemoveMessage?: (messageId: string) => void
  onPatchMessage?: (messageId: string, patch: Partial<Message>) => void
  onCallAgain?: () => void
  unavailable?: boolean
}

const MENU_WIDTH = 208
const MENU_HEIGHT = 280
const EMOJI_WIDTH = 288
const EMOJI_HEIGHT = 288
const SPEEDS = [1, 1.5, 2, 0.5]

/** Return human-readable text for message actions without exposing share-payload JSON. */
function getMessageActionText(content: string): string {
  try {
    const payload = JSON.parse(content)
    if (payload?.__sociaLensShare === 1) {
      if (payload.type === 'prompt') return String(payload.prompt || '')
      if (payload.type === 'voice') return String(payload.title || 'Aperonix voice conversation')
      if (payload.type === 'chat' && Array.isArray(payload.messages)) {
        const username = String(payload.owner?.username || 'User')
        return payload.messages.map((item: { role?: string; content?: string; attachments?: { name?: string }[] }) => {
          const speaker = item.role === 'user' ? username : 'Aperonix'
          const body = String(item.content || '')
          const attachments = item.attachments?.length
            ? `\nAttachments: ${item.attachments.map(file => file.name || 'file').join(', ')}`
            : ''
          return `${speaker}:\n${body}${attachments}`
        }).join('\n\n')
      }
    }
  } catch {}
  return content
}

function formatCallDuration(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

type CallLogInfo = {
  callType: 'audio' | 'video'
  outcome: string
  durationSec: number
  callerId?: string | null
  calleeId?: string | null
  endedBy?: string | null
}

function getCallLogLabel(info: CallLogInfo, viewerId: string) {
  const kind = info.callType === 'video' ? 'video call' : 'voice call'
  const outgoing = info.callerId ? info.callerId === viewerId : true
  if (info.outcome === 'completed') return `${info.callType === 'video' ? 'Video' : 'Voice'} call · ${formatCallDuration(info.durationSec)}`
  if (info.outcome === 'missed') return outgoing ? `They didn't answer your ${kind}` : `You didn't answer the incoming ${kind}`
  if (info.outcome === 'rejected') return outgoing ? `They declined your ${kind}` : `You declined the incoming ${kind}`
  if (info.outcome === 'cancelled') return outgoing ? `You cancelled the ${kind}` : `They cancelled the ${kind}`
  if (info.outcome === 'ended' && info.endedBy) {
    if (info.endedBy === viewerId) return outgoing ? `You ended the ${kind}` : `You ended the incoming ${kind}`
    return outgoing ? `They ended your ${kind}` : `They ended the ${kind}`
  }
  return info.callType === 'video' ? 'Video call' : 'Voice call'
}

function MessageReadReceipt({ isRead, avatarUrl }: { isRead: boolean; avatarUrl?: string | null }) {
  if (isRead && avatarUrl) {
    return (
      <Avatar className="inline-flex h-[15px] w-[15px] shrink-0 align-middle ring-1 ring-violet-400/70" title="Seen">
        <AvatarImage src={getAvatarUrl(avatarUrl) || undefined} />
        <AvatarFallback className="text-[7px] bg-violet-600 text-white">✓</AvatarFallback>
      </Avatar>
    )
  }
  return (
    <span className={cn('inline-flex items-center shrink-0 align-middle', isRead ? 'text-violet-400' : 'text-muted-foreground/70')} title={isRead ? 'Seen' : 'Sent'} aria-label={isRead ? 'Seen' : 'Sent'}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M2 6.5 4.7 9 10 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

export function ChatMessage({ message, isOwn, currentUserId, otherUsername, currentUserAvatarUrl, otherAvatarUrl, onReply, onRemoveMessage, onPatchMessage, onCallAgain, unavailable }: ChatMessageProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [showCallMenu, setShowCallMenu] = useState(false)
  const [callMenuPos, setCallMenuPos] = useState<{ top: number; left: number } | null>(null)
  const callMenuBtnRef = useRef<HTMLButtonElement>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showForward, setShowForward] = useState(false)
  const [showReactors, setShowReactors] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'delete' | 'unsend' | null>(null)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(message.content)
  const [copied, setCopied] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [lightbox, setLightbox] = useState<{ type: 'image' | 'video'; url: string } | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const [emojiPos, setEmojiPos] = useState<{ top: number; left: number } | null>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const emojiBtnRef = useRef<HTMLButtonElement>(null)

  const unsendMessage = useUnsendMessage()
  const deleteForMe = useDeleteMessageForMe()
  const editMessage = useEditMessage()
  const { data: reactions = [] } = useMessageReactions(message.id)
  const setReaction = useSetMessageReaction()
  const removeReaction = useRemoveMessageReaction()
  const { data: replyPreview } = useReplyPreview((message as any).reply_to_id)

  const mediaType = (message as any).media_type as 'image' | 'video' | 'audio' | 'call' | null
  const mediaUrl = (message as any).media_url as string | null
  let sharedVoicePayload: { __sociaLensShare?: number; type?: string; audioUrl?: string; mimeType?: string; title?: string } | null = null
  try {
    const parsed = JSON.parse(message.content)
    if (parsed?.__sociaLensShare === 1 && parsed.type === 'voice') sharedVoicePayload = parsed
  } catch {}
  const isSharedVoiceMessage = Boolean(sharedVoicePayload)
  const sharedVoiceAudioUrl = sharedVoicePayload?.audioUrl || null
  const actionText = getMessageActionText(message.content)
  const myReaction = reactions.find(r => r.user_id === currentUserId)

  // Both popups are viewport-clamped (never spill off the edge of the
  // screen, flip upward if there's no room below) - essential on mobile
  // where a long message can push the button close to the bottom edge.
  const openMenu = () => {
    const rect = menuBtnRef.current?.getBoundingClientRect()
    if (rect) setMenuPos(getClampedPopupPosition(rect, MENU_WIDTH, MENU_HEIGHT))
    setShowMenu(v => !v)
  }

  const openEmojiPicker = () => {
    const rect = emojiBtnRef.current?.getBoundingClientRect()
    if (rect) setEmojiPos(getClampedPopupPosition(rect, EMOJI_WIDTH, EMOJI_HEIGHT))
    setShowEmojiPicker(v => !v)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(actionText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
    setShowMenu(false)
  }

  const handleRead = async () => {
    if (speaking) {
      stopSpeaking()
      setSpeaking(false)
      return
    }
    setShowMenu(false)
    setSpeaking(true)
    await speakText(actionText, () => setSpeaking(false))
  }

  const handleDownload = async () => {
    const downloadUrl = isSharedVoiceMessage ? sharedVoiceAudioUrl : mediaUrl
    if (!downloadUrl) {
      window.alert('The shared voice recording is unavailable.')
      setShowMenu(false)
      return
    }
    setDownloading(true)
    try {
      const res = await fetch(downloadUrl)
      if (!res.ok) throw new Error('Download request failed')
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const mime = sharedVoicePayload?.mimeType || blob.type
      const ext = isSharedVoiceMessage
        ? (mime.includes('wav') ? 'wav' : mime.includes('mpeg') || mime.includes('mp3') ? 'mp3' : mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm')
        : mediaType === 'video' ? 'mp4' : 'jpg'
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `socialens-${isSharedVoiceMessage ? 'aperonix-voice' : mediaType}-${message.id}.${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    } catch {
      // Cross-origin storage can block fetch; opening the original recording still
      // gives the recipient a browser-native way to play/save it.
      window.open(downloadUrl, '_blank', 'noopener,noreferrer')
    } finally {
      setDownloading(false)
      setShowMenu(false)
    }
  }

  const handlePlaySharedVoice = async () => {
    setShowMenu(false)
    const audio = document.querySelector<HTMLAudioElement>(`audio[data-shared-voice-message-id="${message.id}"]`)
    if (!audio) {
      window.alert('The shared voice player is unavailable. Please reload the chat and try again.')
      return
    }
    try {
      if (audio.ended) audio.currentTime = 0
      await audio.play()
    } catch {
      window.alert('Could not play this recording. Check the audio URL and try again.')
    }
  }

  const cyclePlaybackSpeed = () => {
    const idx = SPEEDS.indexOf(playbackRate)
    setPlaybackRate(SPEEDS[(idx + 1) % SPEEDS.length])
  }

  // Each action updates the local list immediately (so the person acting
  // sees it happen instantly) alongside the actual database mutation - the
  // other participant gets the same result moments later via realtime.
  const handleUnsend = () => {
    setConfirmAction(null)
    setShowMenu(false)
    onRemoveMessage?.(message.id)
    unsendMessage.mutate({ messageId: message.id, chatId: message.chat_id })
  }

  const handleDeleteForMe = async () => {
    setConfirmAction(null)
    setShowMenu(false)
    try {
      await deleteForMe.mutateAsync({ messageId: message.id, chatId: message.chat_id })
      onRemoveMessage?.(message.id)
    } catch (error) {
      console.error('[chat] Delete for me failed:', error)
      window.alert(error instanceof Error ? error.message : 'Could not delete this message for you. Please try again.')
    }
  }

  const handleSaveEdit = () => {
    const trimmed = editValue.trim()
    if (!trimmed || trimmed === message.content) { setEditing(false); return }
    onPatchMessage?.(message.id, { content: trimmed, is_edited: true } as Partial<Message>)
    editMessage.mutate({ messageId: message.id, content: trimmed, chatId: message.chat_id })
    setEditing(false)
  }

  const handleReact = (emoji: string) => {
    setShowEmojiPicker(false)
    if (myReaction?.emoji === emoji) {
      removeReaction.mutate({ messageId: message.id, userId: currentUserId })
    } else {
      setReaction.mutate({ messageId: message.id, userId: currentUserId, emoji, chatId: message.chat_id })
    }
  }

  // What shows in the little quoted-reply strip above a reply - text for a
  // normal message, otherwise a small thumbnail/label so it's obvious what
  // was actually replied to (Instagram-style), instead of just blank text.
  const renderReplyPreviewContent = () => {
    if (!replyPreview) return null
    if (replyPreview.sticker) {
      return (
        <div className={cn('rounded-2xl px-3 py-2 text-3xl', isOwn ? 'bg-muted' : 'bg-muted')}>
          {replyPreview.sticker}
        </div>
      )
    }
    // A call-log entry stores its details as JSON in `content` (same as the
    // call bubble itself) - show the same friendly "Voice call · 00:14"
    // label here instead of dumping that raw JSON into the reply preview.
    if (replyPreview.media_type === 'call') {
      let callInfo: CallLogInfo | null = null
      try { callInfo = JSON.parse(replyPreview.content) } catch {}
      if (callInfo) {
        const label = getCallLogLabel(callInfo, currentUserId)
        const Icon = callInfo.callType === 'video' ? Video : Phone
        return (
          <div className="bg-muted rounded-2xl px-3 py-2 text-sm text-muted-foreground flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {label}
          </div>
        )
      }
    }
    if (replyPreview.media_type === 'audio' && replyPreview.media_url) {
      return (
        <div className="bg-muted rounded-full px-3 py-2">
          <VoiceMessagePlayer url={replyPreview.media_url} durationSeconds={null} isOwn={false} />
        </div>
      )
    }
    if (replyPreview.media_type === 'image' && replyPreview.media_url) {
      return (
        <button onClick={(e) => { e.stopPropagation(); setLightbox({ type: 'image', url: replyPreview.media_url! }) }} className="rounded-2xl overflow-hidden block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={replyPreview.media_url} alt="" className="w-20 h-20 object-cover" />
        </button>
      )
    }
    if (replyPreview.media_type === 'video' && replyPreview.media_url) {
      return (
        <button onClick={(e) => { e.stopPropagation(); setLightbox({ type: 'video', url: replyPreview.media_url! }) }} className="relative rounded-2xl overflow-hidden block">
          <video src={replyPreview.media_url} className="w-20 h-20 object-cover" muted />
          <span className="absolute inset-0 flex items-center justify-center bg-black/20">
            <span className="w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white text-xs">▶</span>
          </span>
        </button>
      )
    }
    return (
      <div className="bg-muted rounded-2xl px-3 py-2 text-sm text-muted-foreground max-w-[220px] truncate">
        {getSharedAperonixReplyLabel(replyPreview.content)}
      </div>
    )
  }

  if ((message as any).is_system) {
    return (
      <div className="flex justify-center mb-3">
        <p className="text-[11px] text-muted-foreground bg-muted rounded-full px-3 py-1 text-center max-w-[80%]">
          {message.content}
        </p>
      </div>
    )
  }

  if (mediaType === 'call') {
    let callInfo: { callType: 'audio' | 'video'; outcome: string; durationSec: number } | null = null
    try { callInfo = JSON.parse(message.content) } catch {}
    if (callInfo) {
      const label = getCallLogLabel(callInfo, currentUserId)
      const Icon = callInfo.callType === 'video' ? Video : Phone
      const isMissedOrDeclined = callInfo.outcome === 'missed' || callInfo.outcome === 'rejected'

      const openCallMenu = () => {
        const rect = callMenuBtnRef.current?.getBoundingClientRect()
        if (rect) setCallMenuPos(getClampedPopupPosition(rect, MENU_WIDTH, 200))
        setShowCallMenu(v => !v)
      }

      return (
        <div className={cn('flex w-full min-w-0 flex-nowrap gap-1.5 mb-2 group items-end', isOwn && 'flex-row-reverse')}>
          {!isOwn && (
            <Avatar className="h-5 w-5 sm:h-6 sm:w-6 shrink-0 mb-1">
              <AvatarImage src={getAvatarUrl(otherAvatarUrl) || undefined} />
              <AvatarFallback className="text-[9px]">{(otherUsername || 'U').slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
          )}
          <div className="min-w-0 w-fit flex-[0_1_auto] max-w-[calc(100%-6.5rem)] sm:max-w-[78%] flex flex-col" style={{ alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
            <div className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-2xl text-sm',
              isOwn ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-br-sm' : 'bg-muted rounded-bl-sm',
              isMissedOrDeclined && !isOwn && 'text-red-500'
            )}>
              <Icon className={cn('h-4 w-4 shrink-0', isMissedOrDeclined && !isOwn ? 'text-red-500' : isOwn ? 'text-white' : 'text-muted-foreground')} />
              <span>{label}</span>
              <span className={cn('text-[10px]', isOwn ? 'text-white/70' : 'text-muted-foreground')}>
                {formatTimeAgo(message.created_at)}
              </span>
            </div>
            {reactions.length > 0 && (
              <button onClick={() => setShowReactors(true)} className="flex gap-0.5 mt-1 flex-wrap">
                {Object.entries(
                  reactions.reduce((acc: Record<string, number>, r) => { acc[r.emoji] = (acc[r.emoji] || 0) + 1; return acc }, {})
                ).map(([emoji, count]) => (
                  <span key={emoji} className="text-xs bg-muted rounded-full px-1.5 py-0.5 border border-border">
                    {emoji} {count > 1 ? count : ''}
                  </span>
                ))}
              </button>
            )}
          </div>

          <div className="flex w-fit basis-auto items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0 self-center">
            <button ref={callMenuBtnRef} onClick={openCallMenu} className="p-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
              <MoreVertical className="h-4 w-4" />
            </button>
            <button onClick={() => onReply?.(message)} className="p-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
              <ReplyIcon className="h-4 w-4" />
            </button>
            <button ref={emojiBtnRef} onClick={openEmojiPicker} className="p-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
              <Smile className="h-4 w-4" />
            </button>
          </div>

          {showCallMenu && callMenuPos && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowCallMenu(false)} />
              <div
                className="fixed z-40 bg-card border rounded-xl shadow-xl overflow-hidden"
                style={{ top: callMenuPos.top, left: callMenuPos.left, width: MENU_WIDTH }}
              >
                <button
                  onClick={() => { setShowCallMenu(false); onCallAgain?.() }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted"
                >
                  <Phone className="h-3.5 w-3.5" /> Call again
                </button>
                <button
                  onClick={() => { setShowCallMenu(false); onReply?.(message) }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted"
                >
                  <ReplyIcon className="h-3.5 w-3.5" /> Reply
                </button>
                <button onClick={() => { setShowCallMenu(false); setConfirmAction('delete') }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted">
                  <EyeOff className="h-3.5 w-3.5" /> Delete for me
                </button>
                {isOwn && (
                  <button onClick={() => { setShowCallMenu(false); setConfirmAction('unsend') }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-500/10">
                    <Trash2 className="h-3.5 w-3.5" /> Unsend
                  </button>
                )}
                {!isOwn && (
                  <button
                    onClick={() => { setShowCallMenu(false); setShowReport(true) }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-500/10"
                  >
                    <Flag className="h-3.5 w-3.5" /> Report
                  </button>
                )}
              </div>
            </>
          )}

          {showEmojiPicker && emojiPos && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowEmojiPicker(false)} />
              <FullEmojiPicker
                onSelect={handleReact}
                onClose={() => setShowEmojiPicker(false)}
                style={{ top: emojiPos.top, left: emojiPos.left }}
              />
            </>
          )}

          {showReactors && (
            <div className="fixed inset-0 bg-black/60 z-[110] flex items-center justify-center p-4" onClick={() => setShowReactors(false)}>
              <div className="bg-card border rounded-2xl w-full max-w-xs max-h-[70vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
                  <p className="font-semibold text-sm">Reactions ({reactions.length})</p>
                  <button onClick={() => setShowReactors(false)} className="text-muted-foreground hover:text-foreground">✕</button>
                </div>
                <div className="overflow-y-auto flex-1">
                  {reactions.map((r: any) => (
                    <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-b-0">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={getAvatarUrl(r.profiles?.avatar_url)} />
                        <AvatarFallback>{r.profiles?.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="flex-1 text-sm truncate">
                        @{r.profiles?.username}{r.user_id === currentUserId ? ' (You)' : ''}
                      </span>
                      <span className="text-xl shrink-0">{r.emoji}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <MessageActionConfirmDialog
            action={confirmAction}
            open={confirmAction !== null}
            pending={unsendMessage.isPending || deleteForMe.isPending}
            onCancel={() => setConfirmAction(null)}
            onConfirm={() => {
              if (confirmAction === 'unsend') handleUnsend()
              else if (confirmAction === 'delete') void handleDeleteForMe()
            }}
          />
        </div>
      )
    }
  }

  if (unavailable) {
    return (
      <div className={cn('flex mb-2', isOwn && 'justify-end')}>
        <UnavailableMessage isOwn={isOwn} />
      </div>
    )
  }

  let isSharedAperonixContent = false
  try {
    const sharedPayload = JSON.parse(message.content)
    isSharedAperonixContent = sharedPayload?.__sociaLensShare === 1 &&
      (sharedPayload.type === 'prompt' || sharedPayload.type === 'chat' || sharedPayload.type === 'voice')
  } catch {}

  const isAperonixReply = Boolean((message as any).is_aperonix_reply)

  return (
    <div className={cn('flex w-full min-w-0 flex-nowrap gap-1.5 mb-2 group items-end', isOwn && 'flex-row-reverse')}>
      {!isOwn && (
        <Avatar className="h-5 w-5 sm:h-6 sm:w-6 shrink-0 mb-4">
          <AvatarImage src={getAvatarUrl(otherAvatarUrl) || undefined} />
          <AvatarFallback className="text-[9px]">{(otherUsername || 'U').slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
      )}
      <div className={cn('min-w-0 w-fit flex-[0_1_auto] max-w-[calc(100%-6.5rem)] sm:max-w-[78%] flex flex-col')} style={{ alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
        {replyPreview && (
          <div className="flex flex-col mb-1.5" style={{ alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
            <p className="text-[11px] text-muted-foreground px-1 mb-1">
              {isOwn ? `You replied to ${replyPreview.profiles?.username}` : `${otherUsername || replyPreview.profiles?.username} replied to you`}
            </p>
            {renderReplyPreviewContent()}
          </div>
        )}

        {editing ? (
          <div className="w-full flex flex-col gap-1.5" style={{ alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
            <textarea
              autoFocus
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit() }
                if (e.key === 'Escape') setEditing(false)
              }}
              rows={2}
              className="w-full rounded-2xl px-3 py-2 text-sm bg-muted border border-pink-500 outline-none resize-none"
            />
            <div className="flex items-center gap-2">
              <button onClick={() => setEditing(false)} className="text-xs px-2.5 py-1 rounded-full text-muted-foreground hover:bg-muted">Cancel</button>
              <button onClick={handleSaveEdit} className="text-xs px-2.5 py-1 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium">Save</button>
            </div>
          </div>
        ) : isSharedAperonixContent ? (
          <div className="w-full min-w-0 max-w-[560px]">
            <SharedAperonixContentMessage content={message.content} isOwn={isOwn} messageId={message.id} />
            <p className={cn('text-[10px] mt-1 flex items-center gap-1.5', isOwn ? 'justify-end text-muted-foreground' : 'text-muted-foreground')}>
              {formatTimeAgo(message.created_at)}
              {isOwn && <MessageReadReceipt isRead={message.is_read} avatarUrl={otherAvatarUrl} />}
            </p>
          </div>
        ) : isAperonixReply ? (
          <div>
            <AperonixReplyMessage content={message.content} isOwn={isOwn} />
            <p className={cn('text-[10px] mt-1 flex items-center gap-1.5', isOwn ? 'justify-end text-muted-foreground' : 'text-muted-foreground')}>
              {formatTimeAgo(message.created_at)}
              {isOwn && <MessageReadReceipt isRead={message.is_read} avatarUrl={otherAvatarUrl} />}
            </p>
          </div>
        ) : (message as any).post_id ? (
          <div className="max-w-[240px]">
            <SharedPostMessage postId={(message as any).post_id} />
            <p className={cn('text-[10px] mt-1 flex items-center gap-1.5', isOwn ? 'justify-end text-white/70' : 'text-muted-foreground')}>
              {formatTimeAgo(message.created_at)}
              {isOwn && <MessageReadReceipt isRead={message.is_read} avatarUrl={otherAvatarUrl} />}
            </p>
          </div>
        ) : (message as any).story_id ? (
          <div>
            <SharedStoryMessage storyId={(message as any).story_id} content={message.content} isOwn={isOwn} />
            <p className={cn('text-[10px] mt-1 flex items-center gap-1.5', isOwn ? 'justify-end text-white/70' : 'text-muted-foreground')}>
              {formatTimeAgo(message.created_at)}
              {isOwn && <MessageReadReceipt isRead={message.is_read} avatarUrl={otherAvatarUrl} />}
            </p>
          </div>
        ) : (message as any).sticker ? (
          <div className="flex flex-col" style={{ alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
            <div className="text-6xl leading-none px-1">{(message as any).sticker}</div>
            <p className={cn('text-[10px] mt-1 flex items-center gap-1.5', isOwn ? 'text-muted-foreground' : 'text-muted-foreground')}>
              {formatTimeAgo(message.created_at)}
              {isOwn && <MessageReadReceipt isRead={message.is_read} avatarUrl={otherAvatarUrl} />}
            </p>
          </div>
        ) : mediaType === 'audio' ? (
          <div className={cn(
            'w-fit max-w-full px-3 py-2.5',
            isOwn
              ? 'bg-gradient-to-r from-pink-500/95 to-purple-600/95 text-white rounded-2xl rounded-br-sm'
              : 'bg-background/85 backdrop-blur-sm border border-violet-400/15 rounded-2xl rounded-bl-sm'
          )}>
            <VoiceMessagePlayer
              url={mediaUrl!}
              durationSeconds={(message as any).media_duration_seconds}
              isOwn={isOwn}
              playbackRate={playbackRate}
              timestamp={formatTimeAgo(message.created_at)}
              isRead={message.is_read}
              seenAvatarUrl={otherAvatarUrl}
            />
            {playbackRate !== 1 && <p className="text-[10px] mt-1 text-right opacity-75">{playbackRate}x speed</p>}
          </div>
        ) : (mediaType === 'image' || mediaType === 'video') ? (
          <div className={cn('rounded-2xl overflow-hidden max-w-[240px] relative', isOwn ? 'rounded-br-sm' : 'rounded-bl-sm')}>
            {mediaType === 'image' ? (
              <button onClick={() => setLightbox({ type: 'image', url: mediaUrl! })} className="block w-full" disabled={(message as any)._uploading}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl!} alt="Photo" className="w-full max-h-72 object-cover" />
              </button>
            ) : (
              <video src={mediaUrl!} controls={!(message as any)._uploading} className="w-full max-h-72" />
            )}
            {(message as any)._uploading && (
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 text-white">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-xs font-medium">Sending{mediaType === 'video' ? ' video' : ''}...</span>
              </div>
            )}
            {(message as any)._uploadFailed && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1.5 text-white px-3 text-center">
                <span className="text-xs font-medium">Couldn't send</span>
                <button
                  onClick={() => onRemoveMessage?.(message.id)}
                  className="text-[11px] underline text-white/80 hover:text-white"
                >
                  Dismiss
                </button>
              </div>
            )}
            {message.content && (
              <div className={cn('px-3 py-2 text-sm', isOwn ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white' : 'bg-muted')}>
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              </div>
            )}
            <p className={cn(
              'text-[10px] px-3 py-1 flex items-center gap-1.5',
              isOwn ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white/70' : 'bg-muted text-muted-foreground'
            )}>
              {formatTimeAgo(message.created_at)}
              {isOwn && <MessageReadReceipt isRead={message.is_read} avatarUrl={otherAvatarUrl} />}
            </p>
          </div>
        ) : (
          <div className={cn(
            'px-3 py-2 text-sm max-w-full break-words',
            isOwn
              ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-2xl rounded-br-sm'
              : 'bg-muted rounded-2xl rounded-bl-sm'
          )}>
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
            <p className={cn('text-[10px] mt-0.5 flex items-center gap-1.5', isOwn ? 'text-white/70 justify-end' : 'text-muted-foreground')}>
              {(message as any).is_edited && <span className="italic">Edited ·</span>}
              {formatTimeAgo(message.created_at)}
              {isOwn && <MessageReadReceipt isRead={message.is_read} avatarUrl={otherAvatarUrl} />}
            </p>
          </div>
        )}

        {reactions.length > 0 && (
          <button onClick={() => setShowReactors(true)} className="flex gap-0.5 mt-1 flex-wrap">
            {Object.entries(
              reactions.reduce((acc: Record<string, number>, r) => { acc[r.emoji] = (acc[r.emoji] || 0) + 1; return acc }, {})
            ).map(([emoji, count]) => (
              <span key={emoji} className="text-xs bg-muted rounded-full px-1.5 py-0.5 border border-border hover:bg-accent transition-colors">
                {emoji} {count > 1 ? count : ''}
              </span>
            ))}
          </button>
        )}
      </div>

      {!editing && (
        <div className="flex w-fit basis-auto items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0 self-center">
          <button ref={menuBtnRef} onClick={openMenu} className="p-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
            <MoreVertical className="h-4 w-4" />
          </button>

          <button onClick={() => onReply?.(message)} className="p-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
            <ReplyIcon className="h-4 w-4" />
          </button>

          <button ref={emojiBtnRef} onClick={openEmojiPicker} className="p-1.5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
            <Smile className="h-4 w-4" />
          </button>
        </div>
      )}

      {showMenu && menuPos && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
          <div
            className="fixed z-40 bg-card border rounded-xl shadow-xl overflow-hidden"
            style={{ top: menuPos.top, left: menuPos.left, width: MENU_WIDTH }}
          >
            {isOwn && !isAperonixReply && !isSharedAperonixContent && !mediaType && !((message as any).sticker) && !((message as any).post_id) && !((message as any).story_id) && (
              <button onClick={() => { setShowMenu(false); setEditing(true) }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            )}
            {!isSharedVoiceMessage && message.content && (
              <button onClick={handleCopy} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted">
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />} Copy
              </button>
            )}
            {!isSharedVoiceMessage && message.content && (
              <button onClick={handleRead} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted">
                {speaking ? <Square className="h-3.5 w-3.5 fill-current text-pink-500" /> : <Volume2 className="h-3.5 w-3.5" />} {speaking ? 'Stop' : 'Read aloud'}
              </button>
            )}
            {isSharedVoiceMessage && (
              <>
                <button onClick={handleDownload} disabled={downloading} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted disabled:opacity-50">
                  <Download className="h-3.5 w-3.5" /> {downloading ? 'Downloading...' : 'Download'}
                </button>
                <button onClick={handlePlaySharedVoice} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted">
                  <Play className="h-3.5 w-3.5" /> Play
                </button>
              </>
            )}
            {!isSharedVoiceMessage && (mediaType === 'image' || mediaType === 'video') && (
              <button onClick={handleDownload} disabled={downloading} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted disabled:opacity-50">
                <Download className="h-3.5 w-3.5" /> {downloading ? 'Downloading...' : mediaType === 'image' ? 'Download Photo' : 'Download Video'}
              </button>
            )}
            {!isSharedVoiceMessage && mediaType === 'audio' && (
              <button onClick={cyclePlaybackSpeed} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted">
                <Gauge className="h-3.5 w-3.5" /> Playback speed ({playbackRate}x)
              </button>
            )}
            <button onClick={() => { setShowMenu(false); setShowForward(true) }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted">
              <Forward className="h-3.5 w-3.5" /> Forward
            </button>
            <button onClick={() => { setShowMenu(false); setConfirmAction('delete') }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted">
              <EyeOff className="h-3.5 w-3.5" /> Delete for me
            </button>
            {isOwn && (
              <button onClick={() => { setShowMenu(false); setConfirmAction('unsend') }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-500/10">
                <Trash2 className="h-3.5 w-3.5" /> Unsend
              </button>
            )}
            {!isOwn && (
              <button
                onClick={() => { setShowMenu(false); setShowReport(true) }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-500/10"
              >
                <Flag className="h-3.5 w-3.5" /> Report
              </button>
            )}
          </div>
        </>
      )}

      {showEmojiPicker && emojiPos && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowEmojiPicker(false)} />
          <FullEmojiPicker
            onSelect={handleReact}
            onClose={() => setShowEmojiPicker(false)}
            style={{ top: emojiPos.top, left: emojiPos.left }}
          />
        </>
      )}

      {showReactors && (
        <div className="fixed inset-0 bg-black/60 z-[110] flex items-center justify-center p-4" onClick={() => setShowReactors(false)}>
          <div className="bg-card border rounded-2xl w-full max-w-xs max-h-[70vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <p className="font-semibold text-sm">Reactions ({reactions.length})</p>
              <button onClick={() => setShowReactors(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="overflow-y-auto flex-1">
              {reactions.map((r: any) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-b-0">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={getAvatarUrl(r.profiles?.avatar_url)} />
                    <AvatarFallback>{r.profiles?.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="flex-1 text-sm truncate">
                    @{r.profiles?.username}{r.user_id === currentUserId ? ' (You)' : ''}
                  </span>
                  <span className="text-xl shrink-0">{r.emoji}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showForward && (
        <MessageForwardModal
          message={{
            content: message.content,
            media_url: mediaUrl,
            media_type: mediaType === 'call' ? null : mediaType,
            media_duration_seconds: (message as any).media_duration_seconds ?? null,
            sticker: (message as any).sticker ?? null,
            post_id: (message as any).post_id ?? null,
            story_id: (message as any).story_id ?? null,
            is_aperonix_reply: isAperonixReply,
          }}
          onClose={() => setShowForward(false)}
        />
      )}

      <MessageActionConfirmDialog
        action={confirmAction}
        open={confirmAction !== null}
        pending={unsendMessage.isPending || deleteForMe.isPending}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (confirmAction === 'unsend') handleUnsend()
          else if (confirmAction === 'delete') void handleDeleteForMe()
        }}
      />
      {showReport && (
        <ReportModal
          reporterId={currentUserId}
          reportedUserId={message.sender_id}
          targetType="message"
          targetId={message.id}
          onClose={() => setShowReport(false)}
        />
      )}

      {lightbox && (
        <div className="fixed inset-0 bg-black/90 z-[130] flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl">✕</button>
          {lightbox.type === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lightbox.url} alt="" className="max-w-full max-h-full object-contain" onClick={e => e.stopPropagation()} />
          ) : (
            <video src={lightbox.url} controls autoPlay className="max-w-full max-h-full" onClick={e => e.stopPropagation()} />
          )}
        </div>
      )}
    </div>
  )
}
