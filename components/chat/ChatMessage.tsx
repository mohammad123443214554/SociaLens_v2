'use client'

import { useRef, useState } from 'react'
import { MoreVertical, Reply as ReplyIcon, Smile, Pencil, Trash2, EyeOff, Copy, Volume2, Square, Forward, Check, Download, Gauge, Phone, Video, Flag, Loader2 } from 'lucide-react'
import { SharedPostMessage } from './SharedPostMessage'
import { SharedStoryMessage } from './SharedStoryMessage'
import { AperonixReplyMessage } from './AperonixReplyMessage'
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

interface ChatMessageProps {
  message: Message
  isOwn: boolean
  currentUserId: string
  otherUsername?: string
  onReply?: (message: Message) => void
  onRemoveMessage?: (messageId: string) => void
  onPatchMessage?: (messageId: string, patch: Partial<Message>) => void
  onCallAgain?: () => void
  unavailable?: boolean
}

const MENU_WIDTH = 208
const MENU_HEIGHT = 320
const EMOJI_WIDTH = 288
const EMOJI_HEIGHT = 288
const SPEEDS = [1, 1.5, 2, 0.5]

function formatCallDuration(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function ChatMessage({ message, isOwn, currentUserId, otherUsername, onReply, onRemoveMessage, onPatchMessage, onCallAgain, unavailable }: ChatMessageProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [showCallMenu, setShowCallMenu] = useState(false)
  const [callMenuPos, setCallMenuPos] = useState<{ top: number; left: number } | null>(null)
  const callMenuBtnRef = useRef<HTMLButtonElement>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showForward, setShowForward] = useState(false)
  const [showReactors, setShowReactors] = useState(false)
  const [showReport, setShowReport] = useState(false)
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
      await navigator.clipboard.writeText(message.content)
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
    await speakText(message.content, () => setSpeaking(false))
  }

  const handleDownload = async () => {
    if (!mediaUrl) return
    setDownloading(true)
    try {
      const res = await fetch(mediaUrl)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const ext = mediaType === 'video' ? 'mp4' : 'jpg'
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `socialens-${mediaType}-${message.id}.${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(blobUrl)
    } catch {
      // If the download fetch fails (e.g. blocked by CORS on a custom CDN),
      // falling back to opening it in a new tab still lets them save it manually.
      window.open(mediaUrl, '_blank')
    } finally {
      setDownloading(false)
      setShowMenu(false)
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
    setShowMenu(false)
    onRemoveMessage?.(message.id)
    unsendMessage.mutate({ messageId: message.id, chatId: message.chat_id })
  }

  const handleDeleteForMe = () => {
    setShowMenu(false)
    onRemoveMessage?.(message.id)
    deleteForMe.mutate({ messageId: message.id, chatId: message.chat_id, isSender: isOwn })
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
      let callInfo: { callType: 'audio' | 'video'; outcome: string; durationSec: number } | null = null
      try { callInfo = JSON.parse(replyPreview.content) } catch {}
      if (callInfo) {
        const label =
          callInfo.outcome === 'completed'
            ? `${callInfo.callType === 'video' ? 'Video' : 'Voice'} call · ${formatCallDuration(callInfo.durationSec)}`
            : callInfo.outcome === 'missed' ? 'Missed call'
            : callInfo.outcome === 'rejected' ? 'Call declined'
            : callInfo.outcome === 'cancelled' ? 'Cancelled call'
            : `${callInfo.callType === 'video' ? 'Video' : 'Voice'} call`
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
        {replyPreview.content}
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
      const label =
        callInfo.outcome === 'completed'
          ? `${callInfo.callType === 'video' ? 'Video' : 'Voice'} call · ${formatCallDuration(callInfo.durationSec)}`
          : callInfo.outcome === 'missed' ? 'Missed call'
          : callInfo.outcome === 'rejected' ? 'Call declined'
          : callInfo.outcome === 'cancelled' ? 'Cancelled call'
          : `${callInfo.callType === 'video' ? 'Video' : 'Voice'} call`
      const Icon = callInfo.callType === 'video' ? Video : Phone
      const isMissedOrDeclined = callInfo.outcome === 'missed' || callInfo.outcome === 'rejected'

      const openCallMenu = () => {
        const rect = callMenuBtnRef.current?.getBoundingClientRect()
        if (rect) setCallMenuPos(getClampedPopupPosition(rect, MENU_WIDTH, 200))
        setShowCallMenu(v => !v)
      }

      return (
        <div className={cn('flex gap-1 mb-2 group items-center', isOwn && 'flex-row-reverse')}>
          <div className="flex flex-col" style={{ alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
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

          <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
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
                <button onClick={handleDeleteForMe} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted">
                  <EyeOff className="h-3.5 w-3.5" /> Delete for me
                </button>
                {isOwn && (
                  <button onClick={handleUnsend} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-500/10">
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

  if ((message as any).is_aperonix_reply) {
    return (
      <div className={cn('flex gap-2 mb-3', isOwn && 'flex-row-reverse')}>
        <div>
          <AperonixReplyMessage content={message.content} isOwn={isOwn} />
          <p className={cn('text-[10px] mt-1', isOwn ? 'text-right text-muted-foreground' : 'text-muted-foreground')}>
            {formatTimeAgo(message.created_at)}
            {isOwn && (message.is_read ? ' · Seen' : ' · Sent')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex gap-1 mb-2 group items-center', isOwn && 'flex-row-reverse')}>
      <div className="max-w-[70%] flex flex-col" style={{ alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
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
        ) : (message as any).post_id ? (
          <div className="max-w-[240px]">
            <SharedPostMessage postId={(message as any).post_id} />
            <p className={cn('text-[10px] mt-1', isOwn ? 'text-right text-white/70' : 'text-muted-foreground')}>
              {formatTimeAgo(message.created_at)}
              {isOwn && (message.is_read ? ' · Seen' : ' · Sent')}
            </p>
          </div>
        ) : (message as any).story_id ? (
          <div>
            <SharedStoryMessage storyId={(message as any).story_id} content={message.content} isOwn={isOwn} />
            <p className={cn('text-[10px] mt-1', isOwn ? 'text-right text-white/70' : 'text-muted-foreground')}>
              {formatTimeAgo(message.created_at)}
              {isOwn && (message.is_read ? ' · Seen' : ' · Sent')}
            </p>
          </div>
        ) : (message as any).sticker ? (
          <div className="text-6xl leading-none px-1">{(message as any).sticker}</div>
        ) : mediaType === 'audio' ? (
          <div className={cn(
            'px-3 py-2',
            isOwn
              ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-2xl rounded-br-sm'
              : 'bg-muted rounded-2xl rounded-bl-sm'
          )}>
            <VoiceMessagePlayer url={mediaUrl!} durationSeconds={(message as any).media_duration_seconds} isOwn={isOwn} playbackRate={playbackRate} />
            <p className={cn('text-[10px] mt-1 flex items-center gap-1.5', isOwn ? 'text-white/70' : 'text-muted-foreground')}>
              {playbackRate !== 1 && <span className="font-semibold">{playbackRate}x ·</span>}
              {formatTimeAgo(message.created_at)}
              {isOwn && (message.is_read ? ' · Seen' : ' · Sent')}
            </p>
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
              'text-[10px] px-3 py-1',
              isOwn ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white/70' : 'bg-muted text-muted-foreground'
            )}>
              {formatTimeAgo(message.created_at)}
              {isOwn && (message.is_read ? ' · Seen' : ' · Sent')}
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
            <p className={cn('text-[10px] mt-0.5 flex items-center gap-1', isOwn ? 'text-white/70' : 'text-muted-foreground')}>
              {(message as any).is_edited && <span className="italic">Edited ·</span>}
              {formatTimeAgo(message.created_at)}
              {isOwn && (message.is_read ? ' · Seen' : ' · Sent')}
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
        <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
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
            {isOwn && !mediaType && !((message as any).sticker) && !((message as any).post_id) && !((message as any).story_id) && (
              <button onClick={() => { setShowMenu(false); setEditing(true) }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            )}
            {message.content && (
              <button onClick={handleCopy} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted">
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />} Copy
              </button>
            )}
            {message.content && (
              <button onClick={handleRead} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted">
                {speaking ? <Square className="h-3.5 w-3.5 fill-current text-pink-500" /> : <Volume2 className="h-3.5 w-3.5" />} {speaking ? 'Stop' : 'Read aloud'}
              </button>
            )}
            {(mediaType === 'image' || mediaType === 'video') && (
              <button onClick={handleDownload} disabled={downloading} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted disabled:opacity-50">
                <Download className="h-3.5 w-3.5" /> {downloading ? 'Downloading...' : mediaType === 'image' ? 'Download Photo' : 'Download Video'}
              </button>
            )}
            {mediaType === 'audio' && (
              <button onClick={cyclePlaybackSpeed} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted">
                <Gauge className="h-3.5 w-3.5" /> Playback speed ({playbackRate}x)
              </button>
            )}
            <button onClick={() => { setShowMenu(false); setShowForward(true) }} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted">
              <Forward className="h-3.5 w-3.5" /> Forward
            </button>
            <button onClick={handleDeleteForMe} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted">
              <EyeOff className="h-3.5 w-3.5" /> Delete for me
            </button>
            {isOwn && (
              <button onClick={handleUnsend} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-500/10">
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
          }}
          onClose={() => setShowForward(false)}
        />
      )}

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
