'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Send, Menu, Plus, Trash2, X, Sparkles, Copy, RefreshCw, ThumbsUp, ThumbsDown, Forward, Check, Volume2, Square, Mic, MicOff, MoreVertical, Pin, PencilLine, Link2, FileText, Archive, LoaderCircle, AudioLines, ArrowLeft } from 'lucide-react'
import { useAperonixChats, AperonixMessage, AperonixConversation } from '@/lib/hooks/useAperonixChats'
import { useUser } from '@/lib/hooks/useUser'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { AperonixShareModal } from '@/components/aperonix/AperonixShareModal'
import { speakText, stopSpeaking, isSpeechRecognitionSupported, createVoiceInput } from '@/lib/utils/voice'
import { createClient } from '@/lib/supabase/client'
import { ChatWallpaperControls, ChatWallpaper } from '@/components/aperonix/ChatWallpaperControls'
import { ArchivePasswordWizard } from '@/components/chat/ArchivePasswordWizard'
import { useArchiveLockStatus } from '@/lib/hooks/useChatSettings'

type WallpaperCacheEntry = { wallpaper: ChatWallpaper | null; expiresAt: number }
const wallpaperCache = new Map<string, WallpaperCacheEntry>()
const wallpaperLoads = new Map<string, Promise<ChatWallpaper | null>>()

async function loadConversationWallpaper(conversationId: string): Promise<ChatWallpaper | null> {
  const cached = wallpaperCache.get(conversationId)
  if (cached && cached.expiresAt > Date.now()) return cached.wallpaper
  const inFlight = wallpaperLoads.get(conversationId)
  if (inFlight) return inFlight

  const load = (async (): Promise<ChatWallpaper | null> => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data, error } = await supabase
      .from('aperonix_chat_wallpapers')
      .select('original_storage_path,processed_storage_path,filter_index,zoom,position_x,position_y')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw error
    if (!data) {
      wallpaperCache.set(conversationId, { wallpaper: null, expiresAt: Date.now() + 5 * 60 * 1000 })
      return null
    }
    const [original, processed] = await Promise.all([
      supabase.storage.from('aperonix-wallpapers').createSignedUrl(data.original_storage_path, 60 * 60),
      supabase.storage.from('aperonix-wallpapers').createSignedUrl(data.processed_storage_path, 60 * 60),
    ])
    if (original.error || processed.error || !original.data?.signedUrl || !processed.data?.signedUrl) {
      throw new Error('Could not load this chat wallpaper.')
    }
    const loaded: ChatWallpaper = {
      originalDataUrl: original.data.signedUrl,
      dataUrl: processed.data.signedUrl,
      originalStoragePath: data.original_storage_path,
      processedStoragePath: data.processed_storage_path,
      filterIndex: data.filter_index,
      zoom: data.zoom,
      positionX: data.position_x,
      positionY: data.position_y,
    }
    if (typeof window !== 'undefined') {
      const image = new window.Image()
      image.src = loaded.dataUrl
      if (typeof image.decode === 'function') await image.decode().catch(() => undefined)
      else await new Promise<void>(resolve => {
        image.onload = () => resolve()
        image.onerror = () => resolve()
      })
    }
    wallpaperCache.set(conversationId, { wallpaper: loaded, expiresAt: Date.now() + 50 * 60 * 1000 })
    return loaded
  })()
  wallpaperLoads.set(conversationId, load)
  try { return await load } finally { wallpaperLoads.delete(conversationId) }
}

function cacheConversationWallpaper(conversationId: string, wallpaper: ChatWallpaper | null) {
  wallpaperCache.set(conversationId, { wallpaper, expiresAt: Date.now() + (wallpaper ? 50 : 5) * 60 * 1000 })
}


type ReplyBlock =
  | { type: 'paragraph' | 'heading'; text: string; level?: number }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string }

function renderInlineMarkdown(text: string, keyPrefix: string): React.ReactNode[] {
  const tokenPattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)|\{\{color:(#[0-9a-fA-F]{6})\|([\s\S]+?)\}\}|\*\*(.+?)\*\*|__(.+?)__|\*(?!\s)(.+?)(?<!\s)\*|_(?!\s)(.+?)(?<!\s)_|\x60([^\x60]+)\x60)|(https?:\/\/[^\s<>)]+)/g
  const nodes: React.ReactNode[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  let index = 0
  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index))
    const key = keyPrefix + '-' + index++
    if (match[2] && match[3]) {
      nodes.push(<a key={key} href={match[3]} target="_blank" rel="noopener noreferrer" className="text-pink-500 underline underline-offset-2 hover:text-purple-500 break-all">{renderInlineMarkdown(match[2], key)}</a>)
    } else if (match[4] && match[5]) {
      nodes.push(<span key={key} style={{ color: match[4] }}>{renderInlineMarkdown(match[5], key)}</span>)
    } else if (match[11]) {
      nodes.push(<a key={key} href={match[11]} target="_blank" rel="noopener noreferrer" className="text-pink-500 underline underline-offset-2 hover:text-purple-500 break-all">{match[11]}</a>)
    } else if (match[6] || match[7]) {
      nodes.push(<strong key={key} className="font-semibold">{match[6] || match[7]}</strong>)
    } else if (match[8] || match[9]) {
      nodes.push(<em key={key}>{match[8] || match[9]}</em>)
    } else if (match[10]) {
      nodes.push(<code key={key} className="rounded bg-muted px-1.5 py-0.5 text-[0.92em] font-mono">{match[10]}</code>)
    }
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

function AperonixFormattedReply({ content }: { content: string }) {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ReplyBlock[] = []
  let paragraph: string[] = []
  const flushParagraph = () => {
    const text = paragraph.join(' ').trim()
    if (text) blocks.push({ type: 'paragraph', text })
    paragraph = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) { flushParagraph(); continue }
    const heading = line.match(/^#{1,3}\s+(.+)$/)
    if (heading) {
      flushParagraph()
      blocks.push({ type: 'heading', text: heading[1], level: line.match(/^#+/)?.[0].length || 2 })
      continue
    }
    const ordered = line.match(/^(?:\d+[.)]\s+|[①②③④⑤⑥⑦⑧⑨⑩]\s*)(.+)$/)
    const unordered = line.match(/^(?:[-*•]\s+)(.+)$/)
    if (ordered || unordered) {
      flushParagraph()
      const isOrdered = Boolean(ordered)
      const current = blocks[blocks.length - 1]
      const item = (ordered?.[1] || unordered?.[1] || '').trim()
      if (current?.type === 'list' && current.ordered === isOrdered) current.items.push(item)
      else blocks.push({ type: 'list', ordered: isOrdered, items: [item] })
      continue
    }
    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      flushParagraph()
      blocks.push({ type: 'quote', text: quote[1] })
      continue
    }
    paragraph.push(line)
  }
  flushParagraph()

  return (
    <div className="w-full space-y-3 leading-relaxed">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const Tag = block.level === 1 ? 'h2' : block.level === 2 ? 'h3' : 'h4'
          const headingClass = block.level === 1 ? 'text-2xl md:text-3xl' : block.level === 2 ? 'text-xl md:text-2xl' : 'text-lg md:text-xl'
          return <Tag key={index} className={headingClass + ' font-semibold text-foreground leading-tight'}>{renderInlineMarkdown(block.text, 'heading-' + index)}</Tag>
        }
        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul'
          const listClass = (block.ordered ? 'list-decimal' : 'list-disc') + ' pl-6 space-y-1.5 marker:text-pink-500'
          return <ListTag key={index} className={listClass}>
            {block.items.map((item, itemIndex) => <li key={itemIndex} className="pl-1">{renderInlineMarkdown(item, 'list-' + index + '-' + itemIndex)}</li>)}
          </ListTag>
        }
        if (block.type === 'quote') return <blockquote key={index} className="border-l-2 border-pink-500/60 pl-3 text-muted-foreground">{renderInlineMarkdown(block.text, 'quote-' + index)}</blockquote>
        return <p key={index}>{renderInlineMarkdown(block.text, 'paragraph-' + index)}</p>
      })}
    </div>
  )
}

export default function AperonixPage() {
  const { user, profile } = useUser()
  const searchParams = useSearchParams()
  const requestedChatId = searchParams.get('chatId')
  const isArchiveMode = searchParams.get('archive') === '1'
  const {
    conversations,
    activeId,
    setActiveId,
    activeConversation,
    createConversation,
    deleteConversation,
    archiveConversation,
    renameConversation,
    togglePinConversation,
    duplicateConversation,
    connectAsNewConversation,
    addMessage,
    updateConversationTitle,
    editUserMessage,
    replaceMessageContent,
    setMessageFeedback,
    loaded,
  } = useAperonixChats({ includeArchived: isArchiveMode })

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [activityLabel, setActivityLabel] = useState<'Thinking' | 'Researching'>('Thinking')
  const [titleGeneratingId, setTitleGeneratingId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [shareText, setShareText] = useState<string | null>(null)
  const [shareContentType, setShareContentType] = useState<'reply' | 'prompt' | 'chat'>('reply')
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null)
  const [showArchivePasswordWizard, setShowArchivePasswordWizard] = useState(false)
  const { data: archiveLock } = useArchiveLockStatus(user?.id)
  const [wallpaper, setWallpaper] = useState<ChatWallpaper | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
  const [editMsgValue, setEditMsgValue] = useState('')
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [attachedItems, setAttachedItems] = useState<{ file: File; type: 'image' | 'video' | 'file'; previewUrl: string }[]>([])
  const [attachError, setAttachError] = useState<string | null>(null)
  const [openedAttachment, setOpenedAttachment] = useState<{ url: string; name: string; mimeType: string } | null>(null)
  const [checkingVideo, setCheckingVideo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const MAX_FILES = 5
  const MAX_FILE_BYTES = 20 * 1024 * 1024
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
    let cancelled = false
    if (!activeId) {
      setWallpaper(null)
      return () => { cancelled = true }
    }
    const cached = wallpaperCache.get(activeId)
    setWallpaper(cached && cached.expiresAt > Date.now() ? cached.wallpaper : null)
    void loadConversationWallpaper(activeId).then(nextWallpaper => {
      if (!cancelled) setWallpaper(nextWallpaper)
    }).catch(error => {
      console.error('Could not load chat wallpaper', error)
      if (!cancelled) setWallpaper(null)
    })
    return () => { cancelled = true }
  }, [activeId])

  useEffect(() => {
    if (!loaded || !user?.id || conversations.length === 0) return
    for (const conversation of conversations) {
      if (conversation.id !== activeId) {
        void loadConversationWallpaper(conversation.id).catch(error => {
          console.error('Could not prefetch chat wallpaper', error)
        })
      }
    }
  }, [loaded, user?.id, conversations, activeId])

  useEffect(() => {
    if (loaded && !activeId) {
      if (conversations.length > 0) setActiveId(conversations[0].id)
    }
  }, [loaded, activeId, conversations, setActiveId])

  // Depend on a stable boolean, not the conversations array itself.
  // useAperonixChats returns a newly sorted array on every render; using that
  // array as a dependency made this effect rerun after every state update and
  // repeatedly close the mobile history drawer while an archived chat was open.
  const requestedConversationExists = Boolean(
    loaded && requestedChatId && conversations.some(conversation => conversation.id === requestedChatId)
  )

  useEffect(() => {
    if (!requestedConversationExists || !requestedChatId) return
    if (activeId !== requestedChatId) setActiveId(requestedChatId)
  }, [requestedConversationExists, requestedChatId, activeId, setActiveId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeConversation?.messages.length, sending])

  const sendMessage = async (text: string, viaVoice: boolean) => {
    text = text.trim()
    const items = attachedItems
    if ((!text && items.length === 0) || sending || attachError) return

    let conversationId = activeId
    if (!conversationId) conversationId = createConversation()
    const isFirstMessage = !(conversations.find(conversation => conversation.id === conversationId)?.messages.length)
    const messageId = crypto.randomUUID()
    setInput('')
    setActivityLabel(/\b(search|research|look up|find online|internet|latest|news|sources|youtube|video|horror|drama|movie|film|series|episode|watch|recommend|recommendation|review|price|buy|weather|today|website|site|official link|trailer|song|music|download)\b|search karo|research karo|internet par|dhoondh|dhundh/i.test(text) ? 'Researching' : 'Thinking')
    setSending(true)


    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Please sign in to upload files and save your chat.')

      // Compress image files before storage; all other file bytes go directly
      // from the browser to private Supabase Storage, never through Vercel.
      const uploaded = await Promise.all(items.map(async item => {
        let uploadBlob: Blob = item.file
        let uploadName = item.file.name
        let mimeType = item.file.type || 'application/octet-stream'
        if (item.type === 'image') {
          try {
            uploadBlob = await compressImageBlob(item.file)
            uploadName = item.file.name.replace(/\.[^.]+$/, '') + '.jpg'
            mimeType = 'image/jpeg'
          } catch {
            // Preserve the original if this browser cannot decode/compress it.
          }
        }
        if (uploadBlob.size > MAX_FILE_BYTES) {
          throw new Error(`“${item.file.name}” is larger than the 20 MB limit after compression.`)
        }
        const safeName = uploadName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'upload.bin'
        const path = `${user.id}/${conversationId}/${messageId}/${crypto.randomUUID()}-${safeName}`
        const { error } = await supabase.storage.from('aperonix-files').upload(path, uploadBlob, {
          contentType: mimeType, upsert: false, cacheControl: '3600',
        })
        if (error) throw new Error(`Could not upload “${item.file.name}”. Please try again.`)
        const kind = mimeType.startsWith('image/') ? 'image'
          : mimeType.startsWith('video/') ? 'video'
          : mimeType.startsWith('audio/') ? 'audio'
          : ['application/pdf','text/plain','text/csv','application/json'].includes(mimeType) ? 'document' : 'file'
        return { name: item.file.name, path, mimeType, size: uploadBlob.size, kind: kind as 'image'|'video'|'audio'|'document'|'file' }
      }))

      const userMessage: Omit<AperonixMessage, 'id'> & { id: string } = {
        id: messageId, role: 'user', content: text, timestamp: Date.now(),
        attachments: uploaded.length > 0 ? uploaded : null,
      }
      await addMessage(conversationId, userMessage)
      clearAttachment()

      // Start naming as soon as the first message is submitted. Keep "New chat"
      // visible with Aperonix's spinner until the AI-generated title is ready.
      if (isFirstMessage) {
        setTitleGeneratingId(conversationId)
        void fetch('/api/aperonix/title', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            attachmentNames: uploaded.map(file => file.name),
          }),
        }).then(async titleResponse => {
          if (!titleResponse.ok) throw new Error('Title generation failed')
          const titleData = await titleResponse.json()
          if (typeof titleData.title === 'string' && titleData.title.trim()) {
            updateConversationTitle(conversationId, titleData.title)
          }
        }).catch(error => {
          console.error('Could not generate Aperonix chat title', error)
        }).finally(() => {
          setTitleGeneratingId(current => current === conversationId ? null : current)
        })
      }

      const history = [...(activeConversation?.contextMessages ?? []), ...(activeConversation?.messages ?? [])]
        .map(m => ({ role: m.role, content: m.content, files: m.attachments ?? [] }))
      const res = await fetch('/api/aperonix/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, newMessage: text, files: uploaded }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Aperonix could not analyze this message.')
      const modelMsgId = await addMessage(conversationId, { role: 'model', content: data.reply, timestamp: Date.now() })
      if (viaVoice) {
        setSpeakingMessageId(modelMsgId)
        speakHandleRef.current = await speakText(data.reply, () => setSpeakingMessageId(null))
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Please try again later.'
      if (text) setInput(text)
      // Request failures must not set attachError: that state disables the composer
      // until an attachment is cleared, which can leave the whole chat stuck.
      try { await addMessage(conversationId, { role: 'model', content: message, timestamp: Date.now() }) } catch (saveError) { console.error('Could not save Aperonix error message', saveError) }
    } finally {
      setSending(false)
    }
  }

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input, false)
  }

  const compressImageBlob = (file: File, maxDim = 1600, quality = 0.78): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = document.createElement('img')
      const url = URL.createObjectURL(file)
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) { URL.revokeObjectURL(url); reject(new Error('Image compression unavailable')); return }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(url)
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image compression failed')), 'image/jpeg', quality)
      }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image could not be decoded')) }
      img.src = url
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
  const handleFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    setShowAttachMenu(false)
    if (!files.length) return
    const tooLarge = files.find(file => file.size > MAX_FILE_BYTES)
    if (tooLarge) {
      setAttachError(`“${tooLarge.name}” is larger than the 20 MB per-file limit.`)
      return
    }
    setAttachedItems(prev => {
      const remaining = Math.max(0, MAX_FILES - prev.length)
      const toAdd = files.slice(0, remaining).map(file => {
        const type = file.type.startsWith('image/') ? 'image' as const
          : file.type.startsWith('video/') ? 'video' as const : 'file' as const
        return { file, type, previewUrl: type === 'image' || type === 'video' ? URL.createObjectURL(file) : '' }
      })
      return [...prev, ...toAdd]
    })
    setAttachError(null)
  }

  const openStoredAttachment = async (attachment: { path: string; name: string; mimeType: string }) => {
    try {
      const supabase = createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) throw new Error('Please sign in again to open this file.')
      if (!attachment.path.startsWith(`${user.id}/`)) throw new Error('This file does not belong to your account.')
      const { data, error } = await supabase.storage.from('aperonix-files')
        .createSignedUrl(attachment.path, 60 * 5)
      if (error || !data?.signedUrl) throw new Error('Could not open this file. It may have been deleted.')
      setOpenedAttachment({ url: data.signedUrl, name: attachment.name, mimeType: attachment.mimeType || 'application/octet-stream' })
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not open this file.')
    }
  }

  const handleNewChat = () => {
    if (isArchiveMode) return
    createConversation()
    setShowHistory(false)
  }

  const handleArchiveConversation = async (id: string) => {
    try {
      if (isArchiveMode) {
        const supabase = createClient()
        const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()
        if (authError || !currentUser) throw new Error('Please sign in again before restoring this chat.')
        const { error } = await supabase.from('aperonix_conversations').update({ archived_at: null, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', currentUser.id)
        if (error) throw error
        window.location.href = '/chat/archive'
        return
      }
      await archiveConversation(id)
      setArchiveConfirmId(null)
      setShowArchivePasswordWizard(false)
      setOpenMenuId(null)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not update this conversation. Please try again.')
    }
  }

  const handleStartRename = (convo: { id: string; title: string }) => {
    setOpenMenuId(null)
    setRenamingId(convo.id)
    setRenameValue(convo.title)
  }

  const handleConfirmRename = (id: string) => {
    const title = renameValue.trim()
    if (!title) return
    renameConversation(id, title)
    setRenamingId(null)
    setRenameValue('')
  }

  const handleDuplicateChat = async (id: string) => {
    setOpenMenuId(null)
    try {
      const duplicateId = await duplicateConversation(id)
      setShowHistory(false)
      if (duplicateId) setActiveId(duplicateId)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not duplicate this chat. Please try again.')
    }
  }

  const handleConnectAsNewChat = (id: string) => {
    setOpenMenuId(null)
    connectAsNewConversation(id)
    setShowHistory(false)
  }

  const handleShareChat = (convo: AperonixConversation) => {
    setOpenMenuId(null)
    const sharedChat = {
      version: 1,
      type: 'chat',
      title: convo.title,
      owner: {
        username: profile?.username || user?.email?.split('@')[0] || 'SociaLens user',
        avatar_url: getAvatarUrl(profile?.avatar_url ?? null),
      },
      messages: convo.messages.map(message => ({
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
        attachments: (message.attachments ?? []).map(attachment => ({
          name: attachment.name,
          kind: attachment.kind,
          mimeType: attachment.mimeType,
        })),
      })),
    }
    setShareContentType('chat')
    setShareText(JSON.stringify(sharedChat))
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
      .map(m => ({ role: m.role, content: m.content, files: m.attachments ?? [] }))

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
      await addMessage(activeId, { role: 'model', content: data.reply, timestamp: Date.now() })
    } catch {
      try { await addMessage(activeId, { role: 'model', content: 'Try again later.', timestamp: Date.now() }) } catch (saveError) { console.error('Could not save Aperonix error message', saveError) }
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
      .map(m => ({ role: m.role, content: m.content, files: m.attachments ?? [] }))

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
      },      onEnd: () => setIsListening(false),
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

  const continuedFromTitle = activeConversation?.title.endsWith(' (continued)')
    ? activeConversation.title.slice(0, -' (continued)'.length).trim()
    : null

  return (
    <div className="flex h-[100dvh] lg:h-[calc(100vh-56px)] min-h-0 overflow-hidden">
      {/* History panel */}
      <div className={`
        fixed md:static inset-y-0 md:inset-y-auto left-0 z-[100] w-72 max-w-[85vw] bg-card border-r flex-col transition-transform duration-200 ease-out
        ${showHistory ? 'flex' : 'hidden md:flex'}
      `}>
        <div className="p-3 border-b flex items-center justify-between">
          <p className="font-semibold text-sm">{isArchiveMode ? 'Archived Chats' : 'All Chats'}</p>
          <button onClick={() => setShowHistory(false)} className="md:hidden text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        {!isArchiveMode && <button
          onClick={handleNewChat}
          className="m-3 flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed border-pink-500/30 hover:border-pink-500 hover:bg-pink-500/5 text-pink-500 text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" /> New chat
        </button>}
        <div className="flex-1 min-h-0 overflow-y-auto px-2 pt-2 space-y-1">
          {conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8 px-4">{isArchiveMode ? 'No archived Aperonix chats.' : 'No chats yet. Start a conversation with Aperonix!'}</p>
          ) : conversations.map(convo => (
            <div
              key={convo.id}
              onClick={() => { if (renamingId !== convo.id) { setActiveId(convo.id); setShowHistory(false) } }}
              className={`group relative flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                convo.id === activeId ? 'bg-pink-500/10 text-pink-500' : 'hover:bg-accent'
              }`}
            >
              {convo.pinned && <Pin className="h-3 w-3 shrink-0 fill-current" />}

              <span className="flex-1 min-w-0 text-sm truncate">{convo.title}</span>
              {titleGeneratingId === convo.id && (
                <LoaderCircle aria-label="Aperonix is generating the chat title" className="h-3.5 w-3.5 shrink-0 animate-spin text-pink-500" />
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
                      <div className="fixed inset-0 z-10" onClick={e => { e.stopPropagation(); setOpenMenuId(null) }} />
                      <div
                        onClick={e => e.stopPropagation()}
                        className="absolute right-0 top-7 z-20 w-56 bg-card border border-border rounded-xl shadow-xl overflow-hidden text-foreground"
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
                        <ChatWallpaperControls conversationId={convo.id} wallpaper={convo.id === activeId ? wallpaper : null} isActive={convo.id === activeId} onWallpaperChange={nextWallpaper => { cacheConversationWallpaper(convo.id, nextWallpaper); if (convo.id === activeId) setWallpaper(nextWallpaper) }} />
                        <button
                          onClick={() => void handleDuplicateChat(convo.id)}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted transition-colors"
                        >
                          <Copy className="h-3.5 w-3.5" /> Duplicate
                        </button>
                        {!isArchiveMode && <button
                          onClick={() => handleConnectAsNewChat(convo.id)}
                          className="w-full flex items-center gap-2.5 whitespace-nowrap px-3.5 py-2.5 text-sm hover:bg-muted transition-colors"
                        >
                          <Link2 className="h-3.5 w-3.5 shrink-0" /> Connect with new chat
                        </button>}
                        {!isArchiveMode && <button
                          onClick={() => handleShareChat(convo)}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted transition-colors"
                        >
                          <Forward className="h-3.5 w-3.5" /> Share Chat
                        </button>}
                        <button
                          onClick={() => { if (isArchiveMode) void handleArchiveConversation(convo.id); else { setArchiveConfirmId(convo.id); setOpenMenuId(null) } }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted transition-colors"
                        >
                          <Archive className="h-3.5 w-3.5" /> {isArchiveMode ? 'Unarchive Chat' : 'Archive Chat'}
                        </button>
                        <button
                          onClick={() => { setOpenMenuId(null); setDeleteConfirmId(convo.id) }}
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
        <button type="button" aria-label="Close chat history" className="fixed inset-0 z-[90] bg-black/50 md:hidden" onClick={() => setShowHistory(false)} />
      )}

      {/* Chat window */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="sticky top-0 z-20 flex items-center gap-2 sm:gap-3 p-3 border-b bg-background shrink-0">
          <button type="button" aria-label="Go back" title="Go back" onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.assign('/home') }} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ArrowLeft className="h-[18px] w-[18px]" />
          </button>
          <button type="button" aria-label="Open chat history" aria-expanded={showHistory} onClick={() => setShowHistory(true)} className="relative z-10 md:hidden text-muted-foreground hover:text-foreground">
            <Menu className="h-5 w-5" />
          </button>
          <Image src="/images/aperonix-logo.png" alt="Aperonix" width={36} height={36} className="rounded-full" />
          <div>
            <p className="font-semibold text-sm">Aperonix</p>
            <p className="text-xs text-muted-foreground">SociaLens's official AI</p>
          </div>
{!isArchiveMode && (
            <Link
              href="/aperonix/voice"
              className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-xl border border-transparent bg-transparent px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Open Aperonix Voice Agent"
            >
              <AudioLines aria-hidden="true" className="h-5 w-5 shrink-0 text-pink-500" />
              <span className="relative hidden sm:inline">Voice Agent</span>
            </Link>
          )}
        </div>

        <div className="relative flex-1 min-h-0 overflow-y-auto p-4 space-y-4" style={wallpaper ? { backgroundImage: 'linear-gradient(rgba(2, 6, 23, 0.08), rgba(2, 6, 23, 0.14)), url("' + wallpaper.dataUrl + '")', backgroundSize: 'cover, cover', backgroundPosition: 'center, ' + wallpaper.positionX + '% ' + wallpaper.positionY + '%', backgroundRepeat: 'no-repeat, no-repeat' } : undefined}>
          {continuedFromTitle && (
            <div className="flex items-center gap-2 border-b border-border/70 pb-3 text-sm text-muted-foreground">
              <Link2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Continued from <span className="font-medium text-foreground">{continuedFromTitle}</span></span>
            </div>
          )}
          {(!activeConversation || activeConversation.messages.length === 0) && !continuedFromTitle && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-muted-foreground">
              <div className="flex items-center justify-center">
                <img src="/images/aperonix-logo.png" alt="Aperonix" className="h-44 w-44 sm:h-52 sm:w-52 object-contain" />
              </div>
              <p className="text-xl font-semibold text-foreground">Hey, I'm Aperonix</p>
              <p className="text-base max-w-sm">Ask me anything about SociaLens, or just chat with me about whatever's on your mind.</p>
            </div>
          )}

          {activeConversation?.messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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
                <div className={`flex items-start gap-2 max-w-[90%] min-w-0 ${msg.role === 'user' ? 'flex-row' : 'flex-row'}`}>
                  {msg.role === 'model' && (
                    <div className="mt-1 h-8 w-8 shrink-0">
                      <Image
                        src="/images/aperonix-logo.png"
                        alt="Aperonix"
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded-full object-contain"
                      />
                    </div>
                  )}

                  <div className={`min-w-0 max-w-full flex flex-col gap-2 ${msg.role === 'user' ? 'w-full items-end' : 'items-start'}`}>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className={`w-[min(284px,100%)] max-w-full shrink-0 rounded-2xl p-3 ${msg.role === 'user' ? 'mr-10 bg-gradient-to-r from-pink-500 to-purple-500 text-white' : 'bg-muted'}`}>
                        <div className="flex flex-col items-start gap-3">
                          {msg.attachments.map((a, i) => (
                                                          <button
                                key={a.path || i}
                                type="button"
                                onClick={() => void openStoredAttachment(a)}
                                title={`Open ${a.name}`}
                                className={`group flex w-full items-center gap-2.5 min-w-0 rounded-xl border px-3 py-2.5 text-left transition-colors ${msg.role === 'user' ? 'border-white/20 bg-black/10 hover:bg-black/20' : 'border-border bg-background hover:bg-accent'}`}
                              >
                                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${msg.role === 'user' ? 'bg-white/15' : 'bg-muted'}`}>
                                  <FileText className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-medium">{a.name}</span>
                                  <span className="block text-[10px] opacity-70">{a.mimeType || 'File'} · Click to open</span>
                                </span>
                                <span className="text-[10px] opacity-70 group-hover:opacity-100">Open</span>
                              </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {(regeneratingId === msg.id || msg.content) && (
                      msg.role === 'user' ? (
                        <div className="flex w-full items-end justify-end gap-2">
                          <div className="min-w-0 max-w-full text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-2xl px-4 py-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white">
                            {msg.content}
                          </div>
                          <div className="mb-0.5 h-8 w-8 shrink-0">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={getAvatarUrl(profile?.avatar_url ?? null)} alt={profile?.username || 'Your profile'} />
                              <AvatarFallback>{profile?.username?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                            </Avatar>
                          </div>
                        </div>
                      ) : (
                        <div className="min-w-0 max-w-full">
                          <div className="min-w-0 max-w-full text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere] w-full py-1 text-foreground">
                            {regeneratingId === msg.id ? (
                              <span className="flex items-center py-1">
                                <Image
                                  src="/images/aperonix-logo.png"
                                  alt="Aperonix is thinking"
                                  width={30}
                                  height={30}
                                  className="rounded-full animate-spin"
                                  style={{ animationDuration: '1.2s' }}
                                />
                              </span>
                            ) : <AperonixFormattedReply content={msg.content} />}
                          </div>
                        </div>
                      )
                    )}

                    {/* Keep user actions directly under the prompt, aligned with the message content. */}
                    {msg.role === 'user' && editingMsgId !== msg.id && (
                      <div className={`flex items-center gap-1 -mt-1 px-1 text-muted-foreground ${msg.role === 'user' ? 'mr-10 justify-end' : ''}`}>
                        <button
                          onClick={() => handleCopy(msg)}
                          title="Copy"
                          className="p-1.5 rounded-lg hover:bg-muted hover:text-foreground transition-colors"
                        >
                          {copiedMessageId === msg.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={() => { setShareContentType('prompt'); setShareText(msg.content) }}
                          title="Share prompt"
                          className="p-1.5 rounded-lg hover:bg-muted hover:text-foreground transition-colors"
                        >
                          <Forward className="h-3.5 w-3.5" />
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

                    {/* Aperonix actions stay beneath the reply. */}
                    {msg.role === 'model' && regeneratingId !== msg.id && (
                      <div className="flex items-center gap-1 -mt-1 px-1 text-muted-foreground">
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
                          onClick={() => { setShareContentType('reply'); setShareText(msg.content) }}
                          title="Share"
                          className="p-1.5 rounded-lg hover:bg-muted hover:text-foreground transition-colors"
                        >
                          <Forward className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {sending && (
            <div className="flex justify-start items-center gap-2.5 py-1" role="status" aria-live="polite">
              <Image
                src="/images/aperonix-logo.png"
                alt=""
                aria-hidden="true"
                width={30}
                height={30}
                className="rounded-full animate-spin shrink-0"
                style={{ animationDuration: '1.2s' }}
              />
              <span className="aperonix-status-shimmer text-sm font-medium bg-clip-text text-transparent">
                {activityLabel}
                <span className="inline-block w-5 text-left aperonix-status-dots">...</span>
              </span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t">
          {(attachedItems.length > 0 || attachError || checkingVideo) && (
            <div className="px-3 pt-2.5 flex flex-col items-stretch gap-2">
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
                <div key={i} className="relative w-full max-w-sm min-h-16 rounded-xl overflow-hidden border border-border bg-muted shrink-0 p-2 flex items-center justify-start gap-3">
                  {item.type === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.previewUrl} alt="Attached" className="w-16 h-10 object-cover rounded shrink-0" />
                  ) : item.type === 'video' ? (
                    <video src={item.previewUrl} className="w-16 h-10 object-cover rounded shrink-0" muted />
                  ) : <FileText className="h-5 w-5 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate text-xs text-left">{item.file.name}</span>
                  <button onClick={() => removeAttachedItem(i)} className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5">
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSend} className="p-3 flex items-end gap-2">
            <input ref={fileInputRef} type="file" multiple hidden onChange={handleFilesPicked} />

            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowAttachMenu(v => !v)}
                title="Upload file"
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
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-muted transition-colors"
                    >
                      <FileText className="h-4 w-4" /> Upload File
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
              rows={1}              className="flex-1 bg-muted rounded-2xl px-4 py-2.5 text-sm outline-none border border-transparent focus:border-pink-500 resize-none overflow-y-auto leading-relaxed"
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
            <p className="pb-2 text-center text-[10px] text-muted-foreground/70">Aperonix is AI and can make mistakes. Check important info.</p>
        </div>
      </div>

      {openedAttachment && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-3 sm:p-6" onClick={() => setOpenedAttachment(null)}>
          <div className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <FileText className="h-4 w-4 shrink-0 text-pink-500" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{openedAttachment.name}</span>
              <a href={openedAttachment.url} target="_blank" rel="noreferrer" className="rounded-lg px-3 py-1.5 text-xs hover:bg-muted">Open in new tab</a>
              <button onClick={() => setOpenedAttachment(null)} aria-label="Close file preview" className="rounded-lg p-2 hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-black/5 p-2 sm:p-4 flex items-center justify-center">
              {openedAttachment.mimeType.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={openedAttachment.url} alt={openedAttachment.name} className="max-h-[78dvh] max-w-full rounded-lg object-contain" />
              ) : openedAttachment.mimeType.startsWith('video/') ? (
                <video src={openedAttachment.url} controls className="max-h-[78dvh] max-w-full rounded-lg" />
              ) : openedAttachment.mimeType === 'application/pdf' ? (
                <iframe src={openedAttachment.url} title={openedAttachment.name} className="h-[78dvh] w-full rounded-lg bg-white" />
              ) : (
                <div className="flex flex-col items-center gap-3 p-8 text-center">
                  <FileText className="h-12 w-12 text-pink-500" />
                  <p className="max-w-lg break-words text-sm">{openedAttachment.name}</p>
                  <p className="text-xs text-muted-foreground">This file type can be downloaded or opened in a new tab.</p>
                  <a href={openedAttachment.url} download={openedAttachment.name} className="rounded-full bg-gradient-to-r from-pink-500 to-purple-500 px-4 py-2 text-sm font-medium text-white">Download file</a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {shareText !== null && (
        <AperonixShareModal
          replyText={shareText}
          contentType={shareContentType}
          onClose={() => setShareText(null)}
        />
      )}

      {renamingId && (() => { const convo = conversations.find(item => item.id === renamingId); if (!convo) return null; return <div className="fixed inset-0 z-[145] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]" onClick={() => setRenamingId(null)}><div role="dialog" aria-modal="true" aria-labelledby="rename-chat-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl" onClick={event => event.stopPropagation()}><div className="flex items-start gap-3 border-b border-border p-5"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><PencilLine className="h-5 w-5" /></div><div className="min-w-0 flex-1"><h2 id="rename-chat-title" className="text-base font-semibold">Rename chat</h2><p className="mt-1 text-sm text-muted-foreground">Choose a clear name so you can find this chat later.</p></div></div><form className="p-5" onSubmit={event => { event.preventDefault(); handleConfirmRename(convo.id) }}><label htmlFor="rename-chat-input" className="mb-2 block text-sm font-medium">Chat name</label><input id="rename-chat-input" autoFocus value={renameValue} onChange={event => setRenameValue(event.target.value)} maxLength={80} placeholder="Enter chat name" className="w-full rounded-xl border border-border bg-background px-3.5 py-3 text-sm outline-none transition-colors focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20" onKeyDown={event => { if (event.key === 'Escape') { setRenamingId(null); setRenameValue('') } }} /><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => { setRenamingId(null); setRenameValue('') }} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent">Cancel</button><button type="submit" disabled={!renameValue.trim()} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">Save changes</button></div></form></div></div> })()}
      {deleteConfirmId && (() => { const convo = conversations.find(item => item.id === deleteConfirmId); if (!convo) return null; return <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]" onClick={() => { if (!deleteBusy) setDeleteConfirmId(null) }}><div role="dialog" aria-modal="true" aria-labelledby="delete-chat-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl" onClick={event => event.stopPropagation()}><div className="flex items-start gap-3 border-b border-border p-5"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-500"><Trash2 className="h-5 w-5" /></div><div className="min-w-0 flex-1"><h2 id="delete-chat-title" className="text-base font-semibold">Delete this chat?</h2><p className="mt-1 text-sm text-muted-foreground">“{convo.title}” and its messages and attachments will be permanently deleted. This action cannot be undone.</p></div></div><div className="flex flex-col-reverse gap-2 p-4 sm:flex-row sm:justify-end"><button disabled={deleteBusy} onClick={() => setDeleteConfirmId(null)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50">Cancel</button><button disabled={deleteBusy} onClick={async () => { setDeleteBusy(true); try { await deleteConversation(convo.id); setDeleteConfirmId(null) } catch (error) { alert(error instanceof Error ? error.message : 'Could not delete this chat and its files.') } finally { setDeleteBusy(false) } }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">{deleteBusy && <LoaderCircle className="h-4 w-4 animate-spin" />} {deleteBusy ? 'Deleting…' : 'Delete Chat'}</button></div></div></div> })()}
      {!isArchiveMode && archiveConfirmId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]" onClick={() => setArchiveConfirmId(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="archive-aperonix-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-start gap-3 border-b border-border p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Archive className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <h2 id="archive-aperonix-title" className="text-base font-semibold">Archive this conversation?</h2>
                <p className="mt-1 text-sm text-muted-foreground">Your conversation with Aperonix will be moved to your protected Archive and removed from All Chats. Your messages and attachments will be kept.</p>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 p-4 sm:flex-row sm:justify-end">
              <button onClick={() => setArchiveConfirmId(null)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-accent">Cancel</button>
              <button onClick={() => {
                if (!archiveLock?.hasPassword) setShowArchivePasswordWizard(true)
                else void handleArchiveConversation(archiveConfirmId)
              }} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">Archive Chat</button>
            </div>
          </div>
        </div>
      )}

      {!isArchiveMode && showArchivePasswordWizard && archiveConfirmId && (
        <ArchivePasswordWizard
          onClose={() => setShowArchivePasswordWizard(false)}
          onDone={() => { setShowArchivePasswordWizard(false); void handleArchiveConversation(archiveConfirmId) }}
        />
      )}
    </div>
  )
}