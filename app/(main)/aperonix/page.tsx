'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Send, Menu, Plus, Trash2, X, Sparkles, Copy, RefreshCw, ThumbsUp, ThumbsDown, Forward, Check, Volume2, Square, Mic, MicOff, MoreVertical, Pin, PencilLine, Link2 } from 'lucide-react'
import { useAperonixChats, AperonixMessage } from '@/lib/hooks/useAperonixChats'
import { AperonixShareModal } from '@/components/aperonix/AperonixShareModal'
import { speakText, stopSpeaking, isSpeechRecognitionSupported, createVoiceInput } from '@/lib/utils/voice'

export default function AperonixPage() {
  const {
    conversations,
    activeId,
    setActiveId,
    activeConversation,
    createConversation,
    deleteConversation,
    renameConversation,
    togglePinConversation,
    connectAsNewConversation,
    addMessage,
    editUserMessage,
    replaceMessageContent,
    setMessageFeedback,
    loaded,
  } = useAperonixChats()

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [shareText, setShareText] = useState<string | null>(null)
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
  const [editMsgValue, setEditMsgValue] = useState('')
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [attachedItems, setAttachedItems] = useState<{ file: File; type: 'image' | 'video'; previewUrl: string }[]>([])
  const [attachError, setAttachError] = useState<string | null>(null)
  const [checkingVideo, setCheckingVideo] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  // Kept intentionally out of any user-facing copy - enforced silently
  // rather than advertised as a documented limit.
  const MAX_PHOTOS = 5
  // Max clip length the chat can accept - Vercel's serverless function
  // timeout means Gemini can't realistically process much more than this
  // for a video before the request itself gets killed.
  const MAX_VIDEO_SECONDS = 20
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const speakHandleRef = useRef<{ stop: () => void } | null>(null)
  const voiceInputRef = useRef<{ start: () => void; stop: () => void } | null>(null)

  // Grows the box to fit whatever's been typed (up to a cap, then it
  // scrolls internally) instead of the text scrolling sideways in a
  // single-line input.
  const resizeTextarea = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  useEffect(() => {
    resizeTextarea()
  }, [input])

  useEffect(() => {
    if (loaded && !activeId) {
      if (conversations.length > 0) setActiveId(conversations[0].id)
    }
  }, [loaded, activeId, conversations, setActiveId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeConversation?.messages.length, sending])

  const sendMessage = async (text: string, viaVoice: boolean) => {
    text = text.trim()
    const items = attachedItems
    if ((!text && items.length === 0) || sending || attachError) return

    let conversationId = activeId
    if (!conversationId) {
      conversationId = createConversation()
    }

    setInput('')
    setSending(true)

    // Only photos get stored thumbnails - a video is never persisted to
    // localStorage (even compressed, one video's worth of base64 would
    // blow the quota), it just shows a simple label in the chat instead.
    const attachments: { type: 'image' | 'video'; thumbnailDataUrl?: string }[] = []
    for (const item of items) {
      if (item.type === 'image') {
        try {
          attachments.push({ type: 'image', thumbnailDataUrl: await compressImage(item.file) })
        } catch {
          attachments.push({ type: 'image' })
        }
      } else {
        attachments.push({ type: 'video' })
      }
    }

    const userMessage: Omit<AperonixMessage, 'id'> = {
      role: 'user',
      content: text,
      timestamp: Date.now(),
      attachments: attachments.length > 0 ? attachments : null,
    }
    addMessage(conversationId, userMessage)
    clearAttachment()

    try {
      const history = [...(activeConversation?.contextMessages ?? []), ...(activeConversation?.messages ?? [])]
        .map(m => ({ role: m.role, content: m.content }))

      const media = items.length > 0
        ? await Promise.all(items.map(async item => ({ mimeType: item.file.type, data: await fileToBase64(item.file) })))
        : undefined

      const res = await fetch('/api/aperonix/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, newMessage: text, media }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')

      const modelMsgId = addMessage(conversationId, { role: 'model', content: data.reply, timestamp: Date.now() })
      // A message sent by voice gets its reply read back out loud
      // automatically - that's what makes it feel like an actual spoken
      // conversation instead of just dictating into a text box.
      if (viaVoice) {
        setSpeakingMessageId(modelMsgId)
        speakHandleRef.current = await speakText(data.reply, () => setSpeakingMessageId(null))
      }
    } catch (err: any) {
      addMessage(conversationId, {
        role: 'model',
        content: 'Try again later.',
        timestamp: Date.now(),
      })
    } finally {
      setSending(false)
    }
  }

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input, false)
  }

  // Downscales + compresses a photo before it's ever stored, so the chat
  // history's local thumbnail never meaningfully adds up in localStorage
  // even after many photos over time.
  const compressImage = (file: File, maxDim = 480, quality = 0.6): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = document.createElement('img')
      const url = URL.createObjectURL(file)
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('canvas unavailable')); return }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(url)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
      img.src = url
    })
  }

  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      const url = URL.createObjectURL(file)
      video.preload = 'metadata'
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url)
        resolve(video.duration)
      }
      video.onerror = reject
      video.src = url
    })
  }

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const clearAttachment = () => {
    attachedItems.forEach(item => URL.revokeObjectURL(item.previewUrl))
    setAttachedItems([])
    setAttachError(null)
  }

  const removeAttachedItem = (index: number) => {
    setAttachedItems(prev => {
      const removed = prev[index]
      if (removed) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((_, i) => i !== index)
    })
    setAttachError(null)
  }

  const handlePhotoPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    setShowAttachMenu(false)
    if (files.length === 0) return

    setAttachedItems(prev => {
      // Photos and a video don't mix - picking a photo while a video is
      // attached starts a fresh photo-only selection instead.
      const base = prev.some(i => i.type === 'video') ? [] : prev
      const remainingSlots = Math.max(0, MAX_PHOTOS - base.length)
      const toAdd = files.slice(0, remainingSlots).map(file => ({
        file, type: 'image' as const, previewUrl: URL.createObjectURL(file),
      }))
      return [...base, ...toAdd]
    })
    setAttachError(null)
  }

  const handleVideoPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    setShowAttachMenu(false)
    if (!file) return

    setCheckingVideo(true)
    try {
      const duration = await getVideoDuration(file)
      if (duration > MAX_VIDEO_SECONDS) {
        setAttachError(`This video is ${Math.round(duration)}s long. Please pick one under ${MAX_VIDEO_SECONDS} seconds.`)
        setCheckingVideo(false)
        return
      }
      // Only one video at a time, and it replaces any photos already picked.
      clearAttachment()
      setAttachedItems([{ file, type: 'video', previewUrl: URL.createObjectURL(file) }])
    } catch {
      setAttachError('Could not read that video. Try a different file.')
    } finally {
      setCheckingVideo(false)
    }
  }

  const handleNewChat = () => {
    createConversation()
    setShowHistory(false)
  }

  const handleStartRename = (convo: { id: string; title: string }) => {
    setOpenMenuId(null)
    setRenamingId(convo.id)
    setRenameValue(convo.title)
  }

  const handleConfirmRename = (id: string) => {
    renameConversation(id, renameValue)
    setRenamingId(null)
  }

  const handleConnectAsNewChat = (id: string) => {
    setOpenMenuId(null)
    connectAsNewConversation(id)
    setShowHistory(false)
  }

  const handleCopy = async (msg: AperonixMessage) => {
    try {
      await navigator.clipboard.writeText(msg.content)
      setCopiedMessageId(msg.id)
      setTimeout(() => setCopiedMessageId(null), 1500)
    } catch {
      // Clipboard API can be blocked in some browsers/contexts - not
      // critical enough to show an error for.
    }
  }

  const handleStartEditMsg = (msg: AperonixMessage) => {
    setEditingMsgId(msg.id)
    setEditMsgValue(msg.content)
  }

  // Editing a message drops everything that came after it (the old reply
  // included) and asks Aperonix again from that point - same as ChatGPT's
  // "edit message" behavior.
  const handleConfirmEditMsg = async (msg: AperonixMessage) => {
    const newContent = editMsgValue.trim()
    if (!newContent || !activeId || !activeConversation) { setEditingMsgId(null); return }

    const idx = activeConversation.messages.findIndex(m => m.id === msg.id)
    if (idx === -1) { setEditingMsgId(null); return }

    const historyBefore = [...(activeConversation.contextMessages ?? []), ...activeConversation.messages.slice(0, idx)]
      .map(m => ({ role: m.role, content: m.content }))

    editUserMessage(activeId, msg.id, newContent)
    setEditingMsgId(null)
    setSending(true)

    try {
      const res = await fetch('/api/aperonix/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyBefore, newMessage: newContent }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      addMessage(activeId, { role: 'model', content: data.reply, timestamp: Date.now() })
    } catch {
      addMessage(activeId, { role: 'model', content: 'Try again later.', timestamp: Date.now() })
    } finally {
      setSending(false)
    }
  }

  const handleFeedback = (msg: AperonixMessage, type: 'like' | 'dislike') => {
    if (!activeId) return
    // Tapping the same reaction again clears it, same as a normal toggle.
    setMessageFeedback(activeId, msg.id, msg.feedback === type ? null : type)
  }

  // Regenerating asks Aperonix again using the same conversation up to (but
  // not including) this reply, then swaps this message's text in place
  // rather than adding a new one - so the reply position and any share/copy
  // history around it stays put.
  const handleRegenerate = async (msg: AperonixMessage) => {
    if (!activeId || !activeConversation || regeneratingId) return
    const idx = activeConversation.messages.findIndex(m => m.id === msg.id)
    if (idx === -1) return
    const priorUserMsg = [...activeConversation.messages.slice(0, idx)].reverse().find(m => m.role === 'user')
    if (!priorUserMsg) return

    const priorUserIdx = activeConversation.messages.findIndex(m => m.id === priorUserMsg.id)
    const history = [...(activeConversation.contextMessages ?? []), ...activeConversation.messages.slice(0, priorUserIdx)]
      .map(m => ({ role: m.role, content: m.content }))

    setRegeneratingId(msg.id)
    try {
      const res = await fetch('/api/aperonix/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, newMessage: priorUserMsg.content }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      replaceMessageContent(activeId, msg.id, data.reply)
    } catch {
      replaceMessageContent(activeId, msg.id, 'Try again later.')
    } finally {
      setRegeneratingId(null)
    }
  }

  // Toggles reading a reply out loud - tapping the same message again (or
  // starting a different one) stops whatever's currently playing first, so
  // only ever one reply is being read at a time.
  const handleReadAloud = async (msg: AperonixMessage) => {
    if (speakingMessageId === msg.id) {
      stopSpeaking()
      setSpeakingMessageId(null)
      return
    }
    stopSpeaking()
    setSpeakingMessageId(msg.id)
    speakHandleRef.current = await speakText(msg.content, () => setSpeakingMessageId(null))
  }

  const handleMicClick = () => {
    if (isListening) {
      voiceInputRef.current?.stop()
      return
    }
    if (!isSpeechRecognitionSupported()) {
      alert('Voice input is not supported in this browser. Try Chrome or Edge.')
      return
    }
    const controller = createVoiceInput({
      onInterim: (transcript) => setInput(transcript),
      onFinal: (transcript) => {
        if (transcript) sendMessage(transcript, true)
      },
      onEnd: () => setIsListening(false),
      onError: () => setIsListening(false),
    })
    if (!controller) return
    voiceInputRef.current = controller
    setIsListening(true)
    controller.start()
  }

  // Leaving the page (or switching conversations) shouldn't leave Aperonix
  // talking in the background.
  useEffect(() => {
    return () => stopSpeaking()
  }, [])
  useEffect(() => {
    stopSpeaking()
    setSpeakingMessageId(null)
  }, [activeId])

  return (
    <div className="flex h-[100dvh] lg:h-[calc(100vh-56px)] min-h-0 overflow-hidden">
      {/* History panel */}
      <div className={`
        fixed md:static inset-y-0 left-0 z-30 w-72 bg-card border-r flex-col
        ${showHistory ? 'flex' : 'hidden md:flex'}
      `}>
        <div className="p-3 border-b flex items-center justify-between">
          <p className="font-semibold text-sm">All Chats</p>
          <button onClick={() => setShowHistory(false)} className="md:hidden text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={handleNewChat}
          className="m-3 flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed border-pink-500/30 hover:border-pink-500 hover:bg-pink-500/5 text-pink-500 text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" /> New chat
        </button>
        <div className="flex-1 min-h-0 overflow-y-auto px-2 space-y-1">
          {conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8 px-4">No chats yet. Start a conversation with Aperonix!</p>
          ) : conversations.map(convo => (
            <div
              key={convo.id}
              onClick={() => { if (renamingId !== convo.id) { setActiveId(convo.id); setShowHistory(false) } }}
              className={`group relative flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                convo.id === activeId ? 'bg-pink-500/10 text-pink-500' : 'hover:bg-accent'
              }`}
            >
              {convo.pinned && <Pin className="h-3 w-3 shrink-0 fill-current" />}

              {renamingId === convo.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleConfirmRename(convo.id)
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  onBlur={() => handleConfirmRename(convo.id)}
                  className="flex-1 min-w-0 bg-background border border-pink-500 rounded-lg px-2 py-0.5 text-sm outline-none"
                />
              ) : (
                <span className="flex-1 min-w-0 text-sm truncate">{convo.title}</span>
              )}

              {renamingId !== convo.id && (
                <div className="relative shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === convo.id ? null : convo.id) }}
                    className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 rounded-lg hover:bg-muted transition-opacity text-muted-foreground"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>

                  {openMenuId === convo.id && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={e => { e.stopPropagation(); setOpenMenuId(null) }} />
                      <div
                        onClick={e => e.stopPropagation()}
                        className="absolute right-0 top-7 z-40 w-48 bg-card border rounded-xl shadow-xl overflow-hidden text-foreground"
                      >
                        <button
                          onClick={() => { togglePinConversation(convo.id); setOpenMenuId(null) }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted transition-colors"
                        >
                          <Pin className="h-3.5 w-3.5" /> {convo.pinned ? 'Unpin' : 'Pin'}
                        </button>
                        <button
                          onClick={() => handleStartRename(convo)}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted transition-colors"
                        >
                          <PencilLine className="h-3.5 w-3.5" /> Rename
                        </button>
                        <button
                          onClick={() => handleConnectAsNewChat(convo.id)}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted transition-colors"
                        >
                          <Link2 className="h-3.5 w-3.5" /> Connect with new chat
                        </button>
                        <button
                          onClick={() => { deleteConversation(convo.id); setOpenMenuId(null) }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {showHistory && (
        <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setShowHistory(false)} />
      )}

      {/* Chat window */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="sticky top-0 z-20 flex items-center gap-3 p-3 border-b bg-background shrink-0">
          <button onClick={() => setShowHistory(true)} className="md:hidden text-muted-foreground">
            <Menu className="h-5 w-5" />
          </button>
          <Image src="/images/aperonix-logo.png" alt="Aperonix" width={28} height={28} className="rounded-full" />
          <div>
            <p className="font-semibold text-sm">Aperonix</p>
            <p className="text-xs text-muted-foreground">SociaLens's official AI</p>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {(!activeConversation || activeConversation.messages.length === 0) && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-muted-foreground">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <p className="font-semibold text-foreground">Hey, I'm Aperonix 👋</p>
              <p className="text-sm max-w-xs">Ask me anything about SociaLens, or just chat with me about whatever's on your mind.</p>
            </div>
          )}

          {activeConversation?.messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              {editingMsgId === msg.id ? (
                <div className="max-w-[80%] w-full flex flex-col items-end gap-1.5">
                  <textarea
                    autoFocus
                    value={editMsgValue}
                    onChange={e => setEditMsgValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleConfirmEditMsg(msg) }
                      if (e.key === 'Escape') setEditingMsgId(null)
                    }}
                    rows={2}
                    className="w-full rounded-2xl px-4 py-2.5 text-sm bg-muted border border-pink-500 outline-none resize-none"
                  />
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditingMsgId(null)} className="text-xs px-3 py-1.5 rounded-full text-muted-foreground hover:bg-muted">
                      Cancel
                    </button>
                    <button
                      onClick={() => handleConfirmEditMsg(msg)}
                      className="text-xs px-3 py-1.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium"
                    >
                      Save & resend
                    </button>
                  </div>
                </div>
              ) : (
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white'
                    : 'bg-muted'
                }`}>
                  {msg.attachments && msg.attachments.length > 0 && (
                    msg.attachments[0].type === 'video' ? (
                      <div className="flex items-center gap-1.5 mb-2 text-xs opacity-90">🎥 Video attached</div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {msg.attachments.map((a, i) => (
                          a.thumbnailDataUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={i} src={a.thumbnailDataUrl} alt="Attached" className="rounded-xl w-20 h-20 object-cover" />
                          ) : null
                        ))}
                      </div>
                    )
                  )}
                  {regeneratingId === msg.id ? (
                    <span className="flex items-center py-1">
                      <Image
                        src="/images/aperonix-logo.png"
                        alt="Aperonix is thinking"
                        width={20}
                        height={20}
                        className="rounded-full animate-spin"
                        style={{ animationDuration: '1.2s' }}
                      />
                    </span>
                  ) : msg.content}
                </div>
              )}

              {/* Copy / Edit - only on the person's own messages. */}
              {msg.role === 'user' && editingMsgId !== msg.id && (
                <div className="flex items-center gap-1 mt-1 px-1 text-muted-foreground">
                  <button
                    onClick={() => handleCopy(msg)}
                    title="Copy"
                    className="p-1.5 rounded-lg hover:bg-muted hover:text-foreground transition-colors"
                  >
                    {copiedMessageId === msg.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => handleStartEditMsg(msg)}
                    title="Edit"
                    className="p-1.5 rounded-lg hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <PencilLine className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Copy / Regenerate / Like / Dislike / Share - only on
                  Aperonix's own replies, once it's done regenerating. */}
              {msg.role === 'model' && regeneratingId !== msg.id && (
                <div className="flex items-center gap-1 mt-1 px-1 text-muted-foreground">
                  <button
                    onClick={() => handleCopy(msg)}
                    title="Copy"
                    className="p-1.5 rounded-lg hover:bg-muted hover:text-foreground transition-colors"
                  >
                    {copiedMessageId === msg.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => handleRegenerate(msg)}
                    title="Regenerate"
                    className="p-1.5 rounded-lg hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleReadAloud(msg)}
                    title={speakingMessageId === msg.id ? 'Stop' : 'Read aloud'}
                    className={`p-1.5 rounded-lg hover:bg-muted transition-colors ${speakingMessageId === msg.id ? 'text-pink-500' : 'hover:text-foreground'}`}
                  >
                    {speakingMessageId === msg.id ? <Square className="h-3.5 w-3.5 fill-current" /> : <Volume2 className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => handleFeedback(msg, 'like')}
                    title="Good response"
                    className={`p-1.5 rounded-lg hover:bg-muted transition-colors ${msg.feedback === 'like' ? 'text-pink-500' : 'hover:text-foreground'}`}
                  >
                    <ThumbsUp className={`h-3.5 w-3.5 ${msg.feedback === 'like' ? 'fill-current' : ''}`} />
                  </button>
                  <button
                    onClick={() => handleFeedback(msg, 'dislike')}
                    title="Bad response"
                    className={`p-1.5 rounded-lg hover:bg-muted transition-colors ${msg.feedback === 'dislike' ? 'text-pink-500' : 'hover:text-foreground'}`}
                  >
                    <ThumbsDown className={`h-3.5 w-3.5 ${msg.feedback === 'dislike' ? 'fill-current' : ''}`} />
                  </button>
                  <button
                    onClick={() => setShareText(msg.content)}
                    title="Share"
                    className="p-1.5 rounded-lg hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <Forward className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl px-4 py-2.5 flex items-center">
                <Image
                  src="/images/aperonix-logo.png"
                  alt="Aperonix is thinking"
                  width={22}
                  height={22}
                  className="rounded-full animate-spin"
                  style={{ animationDuration: '1.2s' }}
                />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t">
          {(attachedItems.length > 0 || attachError || checkingVideo) && (
            <div className="px-3 pt-2.5 flex items-start gap-2 flex-wrap">
              {checkingVideo && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded-xl px-3 py-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Checking video length...
                </div>
              )}
              {attachError && (
                <div className="flex-1 flex items-center justify-between gap-2 bg-red-500/10 text-red-500 text-xs rounded-xl px-3 py-2">
                  <span>{attachError}</span>
                  <button onClick={() => setAttachError(null)} className="shrink-0"><X className="h-3.5 w-3.5" /></button>
                </div>
              )}
              {attachedItems.map((item, i) => (
                <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-border bg-black shrink-0">
                  {item.type === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.previewUrl} alt="Attached" className="w-full h-full object-cover" />
                  ) : (
                    <video src={item.previewUrl} className="w-full h-full object-cover" muted />
                  )}
                  <button onClick={() => removeAttachedItem(i)} className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5">
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSend} className="p-3 flex items-end gap-2">
            <input ref={photoInputRef} type="file" accept="image/*" multiple hidden onChange={handlePhotoPicked} />
            <input ref={videoInputRef} type="file" accept="video/*" hidden onChange={handleVideoPicked} />

            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowAttachMenu(v => !v)}
                title="Attach photo or video"
                className="w-10 h-10 rounded-full bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-transform duration-200"
                style={{ transform: showAttachMenu ? 'rotate(45deg)' : 'rotate(0deg)' }}
              >
                <Plus className="h-5 w-5" />
              </button>

              {showAttachMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowAttachMenu(false)} />
                  <div className="absolute bottom-12 left-0 z-40 w-44 bg-card border rounded-xl shadow-xl overflow-hidden">
                    <button
                      onClick={() => photoInputRef.current?.click()}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted transition-colors"
                    >
                      📷 Photo
                    </button>
                    <button
                      onClick={() => videoInputRef.current?.click()}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted transition-colors"
                    >
                      🎥 Video
                    </button>
                  </div>
                </>
              )}
            </div>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend(e as unknown as React.FormEvent)
                }
              }}
              placeholder={isListening ? 'Listening...' : 'Message Aperonix...'}
              rows={1}
              className="flex-1 bg-muted rounded-2xl px-4 py-2.5 text-sm outline-none border border-transparent focus:border-pink-500 resize-none overflow-y-auto leading-relaxed"
            />
            <button
              type="button"
              onClick={handleMicClick}
              title={isListening ? 'Stop listening' : 'Speak to Aperonix'}
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <button
              type="submit"
              disabled={(!input.trim() && attachedItems.length === 0) || sending || !!attachError || checkingVideo}
              className="w-10 h-10 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 text-white flex items-center justify-center disabled:opacity-40 shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>

      {shareText && (
        <AperonixShareModal replyText={shareText} onClose={() => setShareText(null)} />
      )}
    </div>
  )
}
