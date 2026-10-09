'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Circle, Settings, Phone, Loader2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { StatusDot } from '@/components/shared/StatusDot'
import { RealtimeMessages } from '@/components/chat/RealtimeMessages'
import { MessageInput } from '@/components/chat/MessageInput'
import { NicknameModal } from '@/components/chat/NicknameModal'
import { WallpaperModal } from '@/components/chat/WallpaperModal'
import { ChatSettingsPage } from '@/components/chat/ChatSettingsPage'
import { CallSettingsPage } from '@/components/chat/CallSettingsPage'
import { useUser } from '@/lib/hooks/useUser'
import { useRealtimeMessages } from '@/lib/hooks/useRealtimeMessages'
import { useActiveStories } from '@/lib/hooks/useStories'
import { useNickname, useSetNickname, useDeleteNickname, useBlockStatus, useToggleBlock, useDeleteChatForMe, useChatWallpaper, useSetChatWallpaper, useDeleteChatWallpaper, useArchiveLockStatus } from '@/lib/hooks/useChatSettings'
import { ArchiveUnlockScreen } from '@/components/chat/ArchiveUnlockScreen'
import { ArchivePasswordWizard } from '@/components/chat/ArchivePasswordWizard'
import { useCallContext } from '@/components/call/CallProvider'
import { StoryViewer } from '@/components/stories/StoryViewer'
import { createClient } from '@/lib/supabase/client'
import { usePresence } from '@/lib/contexts/PresenceContext'
import { canAccessByPrivacy } from '@/lib/utils/privacyAccess'
import { ChatWithProfiles, Message } from '@/lib/types/database.types'
import { getAvatarUrl } from '@/lib/utils/helpers'
import { isRestricted } from '@/lib/utils/restrictionCheck'
import { RestrictionPopup } from '@/components/shared/RestrictionPopup'
import { VerifiedBadge } from '@/components/shared/VerifiedBadge'
import { PageLoader } from '@/components/shared/LoadingSpinner'

export default function ChatRoomPage() {
  const params = useParams()
  const chatId = params.chatId as string
  const { user, profile, loading } = useUser()
  const [chat, setChat] = useState<ChatWithProfiles | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [canSend, setCanSend] = useState(true)
  const [restrictionMessage, setRestrictionMessage] = useState('')
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [showStory, setShowStory] = useState(false)
  const [showNicknameModal, setShowNicknameModal] = useState(false)
  const [showWallpaperModal, setShowWallpaperModal] = useState(false)
  const [showSettingsPage, setShowSettingsPage] = useState(false)
  const [showCallSettings, setShowCallSettings] = useState(false)
  const [savingWallpaper, setSavingWallpaper] = useState(false)
  const [showRestrictionPopup, setShowRestrictionPopup] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const { messages, isTyping, onlineUsers, sendMessage, sendTypingIndicator, removeMessageLocally, patchMessageLocally, addPendingMessage, resolvePendingMessage, failPendingMessage, loadOlderMessages, hasMoreOlder, isLoadingOlder } =
    useRealtimeMessages(chatId, user?.id ?? '')
  const { data: storyGroups = [] } = useActiveStories(user?.id)

  const guardedSendMessage = async (payload: Parameters<typeof sendMessage>[0]) => {
    if (isRestricted(profile?.restrict_message_until)) {
      setShowRestrictionPopup(true)
      return
    }
    return sendMessage(payload)
  }

  const guardedAddPendingMessage = (tempId: string, payload: Parameters<typeof addPendingMessage>[1]): boolean => {
    if (isRestricted(profile?.restrict_message_until)) {
      setShowRestrictionPopup(true)
      return false
    }
    addPendingMessage(tempId, payload)
    return true
  }

  const guardedResolvePendingMessage: typeof resolvePendingMessage = async (tempId, payload) => {
    if (isRestricted(profile?.restrict_message_until)) {
      failPendingMessage(tempId)
      setShowRestrictionPopup(true)
      return
    }
    return resolvePendingMessage(tempId, payload)
  }

  const other = chat && user ? (chat.participant1_id === user.id ? chat.participant2 : chat.participant1) : null

  const { activeUserIds } = usePresence()
  const [statusAllowed, setStatusAllowed] = useState(true)
  useEffect(() => {
    if (!user || !other) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('profiles').select('status_privacy').eq('id', other.id).maybeSingle()
      const ok = await canAccessByPrivacy(supabase, user.id, other.id, (data as any)?.status_privacy, 'status')
      if (!cancelled) setStatusAllowed(ok)
    })()
    return () => { cancelled = true }
  }, [other?.id, user?.id])

  const { data: myNicknameForThem } = useNickname(chatId, user?.id)
  const setNickname = useSetNickname()
  const deleteNickname = useDeleteNickname()
  const { data: blockStatus } = useBlockStatus(user?.id, other?.id)
  const toggleBlock = useToggleBlock()
  const deleteChatForMe = useDeleteChatForMe()

  const { data: wallpaper } = useChatWallpaper(chatId, user?.id)
  const setChatWallpaper = useSetChatWallpaper()
  const deleteChatWallpaper = useDeleteChatWallpaper()

  const { startCall, reportBlocked } = useCallContext()
  const [canCall, setCanCall] = useState(false)
  const [callStarting, setCallStarting] = useState(false)
  // Resets every time this page mounts - opening an archived chat always
  // Re-asks for the password, it isn't a one-time unlock.
  const [archiveUnlocked, setArchiveUnlocked] = useState(false)

  const { data: archiveLock } = useArchiveLockStatus(user?.id)

  const theyBlockedMe = !!blockStatus?.theyBlockedMe
  const iBlockedThem = !!blockStatus?.iBlockedThem

  useEffect(() => {
    if (!chatId) return
    supabase
      .from('chats')
      .select('*, participant1:profiles!chats_participant1_id_fkey(*), participant2:profiles!chats_participant2_id_fkey(*)')
      .eq('id', chatId)
      .single()
      .then(({ data }) => setChat(data as ChatWithProfiles))
  }, [chatId])

  // Live-check the other person's Message Privacy setting every time this
  // Conversation is opened - it may have changed since the chat was created.
  useEffect(() => {
    if (!chat || !user) return
    const otherP = chat.participant1_id === user.id ? chat.participant2 : chat.participant1
    const privacy = (otherP as any).message_privacy || 'everyone'

    const check = async () => {
      if (privacy === 'everyone') { setCanSend(true); return }
      if (privacy === 'none') { setCanSend(false); setRestrictionMessage('Message is not available.'); return }

      if (privacy === 'followers') {
        const { data } = await supabase.from('follows').select('id')
          .eq('follower_id', user.id).eq('following_id', otherP.id).eq('status', 'accepted').maybeSingle()
        setCanSend(!!data)
        if (!data) setRestrictionMessage('Message is unavailable. Please follow and start conversation.')
        return
      }
      if (privacy === 'following') {
        const { data } = await supabase.from('follows').select('id')
          .eq('follower_id', otherP.id).eq('following_id', user.id).eq('status', 'accepted').maybeSingle()
        setCanSend(!!data)
        if (!data) setRestrictionMessage('Message is only available to people this user follows.')
        return
      }
      if (privacy === 'selected') {
        const { data } = await supabase.from('privacy_selected_users').select('id')
          .eq('owner_id', otherP.id).eq('category', 'message').eq('selected_user_id', user.id).maybeSingle()
        setCanSend(!!data)
        if (!data) setRestrictionMessage('Message is a selected person are available.')
        return
      }
      setCanSend(true)
    }
    check()
  }, [chat, user])

  useEffect(() => {
    if (!user || !chatId) return
    supabase
      .from('messages')
      .update({ is_read: true })
      .eq('chat_id', chatId)
      .neq('sender_id', user.id)
      .then(() => {})
  }, [messages, chatId, user])

  // Calling is limited to people who follow me or whom I follow (either
  // direction) - not open to everyone the way messaging can be.
  useEffect(() => {
    if (!user || !other) { setCanCall(false); return }
    let cancelled = false
    ;(async () => {
      const [{ data: iFollowThem, error: e1 }, { data: theyFollowMe, error: e2 }] = await Promise.all([
        supabase.from('follows').select('id').eq('follower_id', user.id).eq('following_id', other.id).eq('status', 'accepted').maybeSingle(),
        supabase.from('follows').select('id').eq('follower_id', other.id).eq('following_id', user.id).eq('status', 'accepted').maybeSingle(),
      ])
      console.log('[SociaLens Call] canCall check', { iFollowThem, theyFollowMe, e1, e2, myId: user.id, otherId: other.id })
      if (!cancelled) setCanCall(!!iFollowThem || !!theyFollowMe)
    })()
    return () => { cancelled = true }
  }, [user?.id, other?.id])

  const handleStartCall = async (type: 'audio' | 'video') => {
    console.log('[SociaLens Call] call button clicked', { type, canCall, theyBlockedMe, iBlockedThem, other })
    if (!other) return
    if (theyBlockedMe || iBlockedThem) {
      reportBlocked(iBlockedThem ? "You've blocked this user." : 'You cannot call this user.')
      return
    }
    if (!canCall) {
      reportBlocked('You can only call people you follow or who follow you.')
      return
    }
    setCallStarting(true)
    try {
      await startCall({ id: other.id, username: other.username, avatar_url: other.avatar_url }, chatId, type)
    } finally {
      setCallStarting(false)
    }
  }

  const handleDeleteChat = async () => {
    if (!user) return
    if (!confirm('Delete this conversation? It will be removed from your inbox.')) return
    setDeleting(true)
    try {
      await deleteChatForMe.mutateAsync({ chatId, userId: user.id })
      router.replace('/chat')
    } catch (err) {
      console.error(err)
      setDeleting(false)
    }
  }

  const handleSaveNickname = async (nickname: string) => {
    if (!user || !other) return
    await setNickname.mutateAsync({ chatId, setById: user.id, targetId: other.id, nickname })
    setShowNicknameModal(false)
  }

  const handleDeleteNickname = async () => {
    if (!user) return
    await deleteNickname.mutateAsync({ chatId, setById: user.id })
    setShowNicknameModal(false)
  }

  // Wallpaper is uploaded to its own storage bucket, then saved as a row
  // scoped to (chatId, user.id) - so it only ever shows up in this one
  // chat, on this one person's own screen. Setting it here never touches
  // the wallpaper of any other conversation.
  const handleSaveWallpaper = async (file: File, position: { x: number; y: number }) => {
    if (!user) return
    setSavingWallpaper(true)
    try {
      // Straight-to-Supabase-Storage upload (same reasoning as post media
      // and chat photos/videos) - no server route in the middle to hit a
      // request-body size ceiling.
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('chat-wallpapers').upload(path, file, {
        cacheControl: '31536000',
      })
      if (uploadError) throw new Error(uploadError.message || 'Upload failed')
      const { data: urlData } = supabase.storage.from('chat-wallpapers').getPublicUrl(path)

      await setChatWallpaper.mutateAsync({
        chatId,
        userId: user.id,
        wallpaperUrl: urlData.publicUrl,
        positionX: Math.round(position.x),
        positionY: Math.round(position.y),
      })
      setShowWallpaperModal(false)
    } catch (err) {
      console.error(err)
      alert('Could not set wallpaper. Please try again.')
    } finally {
      setSavingWallpaper(false)
    }
  }

  const handleRemoveWallpaper = () => {
    if (!user) return
    deleteChatWallpaper.mutate({ chatId, userId: user.id })
  }

  const handleToggleBlock = () => {
    if (!user || !other) return
    const willBlock = !iBlockedThem
    if (willBlock && !confirm(`Block ${other.username}? They won't be able to message you, and your profile will be hidden from them here.`)) return
    toggleBlock.mutate({ blockerId: user.id, blockedId: other.id, block: willBlock })
  }

  if (loading || !chat || !other) return <PageLoader />
  if (!user) return null

  // A chat archived by ME is locked behind the archive password no matter
  // how it's opened - search, someone's profile "Message" button, a direct
  // link, all of it - not just the /chat/archive list. If a password was
  // never set (e.g. it got archived before one existed), fall back to the
  // same setup wizard the Archive section itself would show.
  const isArchivedByMe = (chat as any).archived_by?.includes(user.id)
  if (isArchivedByMe && !archiveUnlocked) {
    if (archiveLock && !archiveLock.hasPassword) {
      return <ArchivePasswordWizard onClose={() => router.push('/chat')} onDone={() => setArchiveUnlocked(true)} />
    }
    if (archiveLock) {
      return <ArchiveUnlockScreen hint={archiveLock.hint} onUnlock={() => setArchiveUnlocked(true)} title="Chat is locked" />
    }
    return <PageLoader />
  }

  const isOnlineInThisChat = onlineUsers.includes(other.id)
  const isActiveGlobally = activeUserIds.has(other.id)
  const presenceStatus: 'online' | 'active' | null = !statusAllowed ? null : isOnlineInThisChat ? 'online' : isActiveGlobally ? 'active' : null
  const otherStoryGroupIndex = storyGroups.findIndex(g => g.userId === other.id)
  const hasStory = otherStoryGroupIndex !== -1 && !theyBlockedMe

  // If they blocked me, their profile shows anonymized in my view of this
  // chat - and messages I already exchanged with them from their side
  // still render, but as an unavailable placeholder (see isMessageUnavailable).
  const displayName = theyBlockedMe ? 'SociaLens User' : (myNicknameForThem || other.username)
  const displayAvatar = theyBlockedMe ? null : getAvatarUrl(other.avatar_url)
  const canSendFinal = canSend && !theyBlockedMe && !iBlockedThem

  const isMessageUnavailable = (senderId: string) => {
    if ((chat as any).deleted_by?.includes(senderId)) return true
    if (theyBlockedMe && senderId === other.id) return true
    return false
  }

  return (
    <div className="relative flex flex-col h-[100dvh] lg:h-[calc(100vh-3.5rem)] max-w-xl mx-auto">
      {showRestrictionPopup && (
        <RestrictionPopup feature="messaging" until={profile?.restrict_message_until} onClose={() => setShowRestrictionPopup(false)} />
      )}
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background sticky top-0 lg:top-14 z-10">
        <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button
          onClick={() => theyBlockedMe ? undefined : (hasStory ? setShowStory(true) : router.push(`/profile/${other.username}`))}
          className="shrink-0"
          disabled={theyBlockedMe}
        >
          <div className={hasStory ? 'p-[2px] rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600' : ''}>
            <div className={`relative ${hasStory ? 'p-[2px] rounded-full bg-background' : ''}`}>
              <Avatar className="h-9 w-9">
                <AvatarImage src={displayAvatar || undefined} />
                <AvatarFallback>{displayName?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              {!theyBlockedMe && <StatusDot status={presenceStatus} size="sm" className="absolute bottom-0 right-0" />}
            </div>
          </div>
        </button>
        <div className="flex-1 min-w-0">
          <button
            onClick={() => theyBlockedMe ? undefined : (hasStory ? setShowStory(true) : router.push(`/profile/${other.username}`))}
            disabled={theyBlockedMe}
            className="font-semibold text-sm hover:underline text-left truncate flex items-center gap-1"
          >
            {displayName}
            {!theyBlockedMe && other.is_verified && <VerifiedBadge type={other.verification_type} className="text-xs shrink-0" />}
          </button>
          {!theyBlockedMe && (
            <div className="flex items-center gap-1">
              <Circle className={`h-2 w-2 fill-current ${
                presenceStatus === 'online' ? 'text-green-500' : presenceStatus === 'active' ? 'text-blue-500' : 'text-muted-foreground'
              }`} />
              <span className="text-xs text-muted-foreground">
                {presenceStatus === 'online' ? 'Online' : presenceStatus === 'active' ? 'Active' : 'Offline'}
              </span>
            </div>
          )}
        </div>

        {/* Voice call only - video calling was removed since the video
            transport wasn't reliable enough and hurt the calling experience. */}
        <button
          onClick={() => handleStartCall('audio')}
          disabled={callStarting}
          className={`p-1 rounded-lg hover:bg-accent transition-colors ${canCall && !theyBlockedMe && !iBlockedThem ? 'text-muted-foreground hover:text-foreground' : 'text-muted-foreground/40'}`}
          title="Voice call"
        >
          {callStarting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Phone className="h-5 w-5" />}
        </button>

        {/* Chat settings */}
        <button
          onClick={() => setShowSettingsPage(true)}
          className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-accent transition-colors"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>

      {/* Messages */}
      <RealtimeMessages
        messages={messages}
        currentUserId={user.id}
        isTyping={isTyping}
        otherUsername={other.username}
        onReply={setReplyingTo}
        onRemoveMessage={removeMessageLocally}
        onPatchMessage={patchMessageLocally}
        onCallAgain={() => handleStartCall('audio')}
        isMessageUnavailable={isMessageUnavailable}
        wallpaperUrl={wallpaper?.wallpaper_url}
        wallpaperPosition={wallpaper ? { x: wallpaper.position_x, y: wallpaper.position_y } : undefined}
        onLoadOlder={loadOlderMessages}
        hasMoreOlder={hasMoreOlder}
        isLoadingOlder={isLoadingOlder}
      />

      {/* Input */}
      {canSendFinal ? (
        <MessageInput
          onSend={guardedSendMessage}
          onSendPending={guardedAddPendingMessage}
          onResolvePending={guardedResolvePendingMessage}
          onFailPending={failPendingMessage}
          onTyping={sendTypingIndicator}
          currentUserId={user.id}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
        />
      ) : (
        <div className="px-4 py-4 border-t text-center">
          <p className="text-sm text-muted-foreground">
            {theyBlockedMe ? 'Message is not available.' : iBlockedThem ? "You've blocked this user." : restrictionMessage}
          </p>
        </div>
      )}
      {showStory && hasStory && (
        <StoryViewer
          groups={storyGroups}
          startGroupIndex={otherStoryGroupIndex}
          currentUserId={user.id}
          onClose={() => setShowStory(false)}
        />
      )}
      {showSettingsPage && (
        <ChatSettingsPage
          otherUsername={displayName}
          myNicknameForThem={myNicknameForThem || null}
          hasWallpaper={!!wallpaper}
          iBlockedThem={iBlockedThem}
          deleting={deleting}
          showNicknameOption={!theyBlockedMe}
          onBack={() => setShowSettingsPage(false)}
          onSetNickname={() => setShowNicknameModal(true)}
          onSetWallpaper={() => setShowWallpaperModal(true)}
          onRemoveWallpaper={handleRemoveWallpaper}
          onToggleBlock={handleToggleBlock}
          onDeleteChat={handleDeleteChat}
          onOpenCallSettings={() => setShowCallSettings(true)}
        />
      )}
      {showCallSettings && (
        <CallSettingsPage
          userId={user.id}
          onBack={() => setShowCallSettings(false)}
        />
      )}
      {showWallpaperModal && (
        <WallpaperModal
          onDone={handleSaveWallpaper}
          onClose={() => setShowWallpaperModal(false)}
          saving={savingWallpaper}
        />
      )}
      {showNicknameModal && (
        <NicknameModal
          currentNickname={myNicknameForThem || null}
          targetUsername={other.username}
          onSave={handleSaveNickname}
          onDelete={handleDeleteNickname}
          onClose={() => setShowNicknameModal(false)}
          saving={setNickname.isPending}
          deleting={deleteNickname.isPending}
        />
      )}
    </div>
  )
}
