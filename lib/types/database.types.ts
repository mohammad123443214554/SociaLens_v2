export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Profile = {
  id: string
  username: string
  full_name: string | null
  bio: string | null
  avatar_url: string | null
  cover_photo_url: string | null
  is_private: boolean
  post_privacy: 'everyone' | 'followers' | 'following' | 'selected' | 'none'
  message_privacy: 'everyone' | 'followers' | 'following' | 'selected' | 'none'
  search_privacy: 'everyone' | 'followers' | 'following' | 'selected' | 'none'
  suggestions_privacy: 'everyone' | 'followers' | 'following' | 'selected' | 'none'
  story_privacy: 'everyone' | 'followers' | 'following' | 'selected' | 'none'
  post_comment_privacy: 'everyone' | 'followers' | 'following' | 'selected' | 'none'
  story_comment_privacy: 'everyone' | 'followers' | 'following' | 'selected' | 'none'
  call_privacy: 'everyone' | 'followers' | 'following' | 'selected' | 'none'
  notifications_muted: boolean
  notify_messages: 'everyone' | 'followers' | 'following' | 'selected' | 'none'
  notify_posts: 'everyone' | 'followers' | 'following' | 'selected' | 'none'
  is_verified: boolean
  verification_type: 'blue' | 'yellow' | null
  onboarding_completed: boolean
  posts_count: number
  followers_count: number
  following_count: number
  is_admin: boolean
  is_suspended: boolean
  suspended_at: string | null
  suspension_deadline: string | null
  suspension_reason: string | null
  restrict_post_until: string | null
  restrict_comment_until: string | null
  restrict_message_until: string | null
  restrict_story_until: string | null
  created_at: string
  updated_at: string
}

export type Report = {
  id: string
  reporter_id: string
  reported_user_id: string
  target_type: 'post' | 'story' | 'comment' | 'story_comment' | 'message' | 'user'
  post_id: string | null
  story_id: string | null
  comment_id: string | null
  story_comment_id: string | null
  message_id: string | null
  reason: 'spam' | 'nudity' | 'harassment' | 'fake_account' | 'hate_speech' | 'other'
  details: string | null
  status: 'pending' | 'actioned' | 'dismissed'
  reviewed_at: string | null
  created_at: string
}

export type ReportWithProfiles = Report & {
  reporter: Profile
  reported_user: Profile
}

export type AccountAppeal = {
  id: string
  user_id: string
  photo_url: string
  letter: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  reviewed_at: string | null
}

export type SharedAperonixReply = {
  id: string
  shared_by: string | null
  content: string
  created_at: string
}

export type ContactSubmission = {
  id: string
  user_id: string
  name: string
  message: string
  media_url: string | null
  media_type: 'image' | 'video' | null
  status: 'pending' | 'resolved'
  created_at: string
  reviewed_at: string | null
}

export type ModerationLog = {
  id: string
  admin_id: string | null
  target_user_id: string | null
  target_username: string
  action: 'suspend' | 'unsuspend' | 'restrict' | 'unrestrict' | 'delete_account' | 'appeal_approved' | 'appeal_rejected'
  feature: 'post' | 'comment' | 'message' | 'story' | null
  reason: string | null
  report_id: string | null
  created_at: string
}

export type Post = {
  id: string
  user_id: string
  content: string | null
  media_url: string | null
  media_type: 'image' | 'video' | 'none' | null
  likes_count: number
  comments_count: number
  shares_count: number
  views_count: number
  total_watch_seconds?: number
  watch_sessions?: number
  completion_count?: number
  rewatch_count?: number
  skip_count?: number
  not_interested_count?: number
  report_count?: number
  quality_score?: number
  last_engaged_at?: string | null
  created_at: string
  updated_at: string
  expires_at: string | null
}

export type Like = {
  id: string
  post_id: string
  user_id: string
  created_at: string
}

export type Comment = {
  id: string
  post_id: string
  user_id: string
  content: string
  parent_id?: string | null
  hidden?: boolean
  created_at: string
  updated_at: string
}

export type Follow = {
  id: string
  follower_id: string
  following_id: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
}

export type Chat = {
  id: string
  participant1_id: string
  participant2_id: string
  last_message: string | null
  last_message_time: string | null
  last_message_type: 'text' | 'post' | 'reel' | 'story' | 'aperonix' | 'image' | 'video' | 'audio' | 'call' | 'sticker' | 'reaction' | null
  last_message_sender_id: string | null
  pinned_by: string[]
  archived_by: string[]
  deleted_by: string[]
  created_at: string
}

export type Message = {
  id: string
  chat_id: string
  sender_id: string
  content: string
  post_id: string | null
  story_id: string | null
  is_aperonix_reply: boolean
  is_read: boolean
  deleted_for_sender: boolean
  deleted_for_recipient: boolean
  is_edited: boolean
  reply_to_id: string | null
  media_url: string | null
  media_type: 'image' | 'video' | 'audio' | 'call' | null
  media_duration_seconds: number | null
  sticker: string | null
  is_system: boolean
  created_at: string
}

export type Nickname = {
  id: string
  chat_id: string
  set_by_id: string
  target_id: string
  nickname: string
  created_at: string
}

export type Block = {
  id: string
  blocker_id: string
  blocked_id: string
  created_at: string
}

export type MessageReaction = {
  id: string
  message_id: string
  user_id: string
  emoji: string
  created_at: string
}

export type Share = {
  id: string
  post_id: string
  shared_by_id: string
  shared_to_chat_id: string | null
  created_at: string
}

export type Notification = {
  id: string
  user_id: string
  actor_id: string
  type: 'like' | 'comment' | 'follow' | 'unfollow' | 'message' | 'story_mention' | string
  message: string | null
  post_id: string | null
  story_id?: string | null
  comment_id?: string | null
  emoji?: string | null
  context_text?: string | null
  is_read: boolean
  created_at: string
}

export type StoryMention = {
  id: string
  story_id: string
  creator_id: string
  mentioned_user_id: string
  overlay_id: string
  username_at_mention: string
  x: number
  y: number
  scale: number
  created_at: string
}

export type SavedFolder = {
  id: string
  user_id: string
  name: string
  created_at: string
}

export type SavedPost = {
  id: string
  user_id: string
  post_id: string
  folder_id: string
  created_at: string
}

export type TextScene = {
  id: string
  text: string
  duration: number
  backgroundColor: string   // hex, or "gradient:#hex1:#hex2"
  textColor: string         // hex, or "gradient:#hex1:#hex2"
  fontFamily?: string
  textX: number              // percent from left, where the text box sits
  textY: number              // percent from top
  textSize: number           // font size in px
  musicUrl?: string
  musicTitle?: string
  musicArtist?: string
  musicArtworkUrl?: string
  musicStart?: number        // Seconds into the preview clip to start from
  musicDuration?: number     // how many seconds of it to play
}

export type GlobalMusic = {
  url: string
  title: string
  artist: string
  artworkUrl: string
  start: number
  duration: number
  timelineStart?: number
  source?: string
  licenseUrl?: string
  stickerStyle?: 'pill' | 'cover' | 'square' | 'vinyl' | 'waveform'
  stickerX?: number
  stickerY?: number
  stickerScale?: number
  stickerRotation?: number
}

export type StoryMentionOverlay = {
  id: string
  userId: string
  username: string
  fullName: string | null
  avatarUrl: string | null
  x: number
  y: number
  scale: number
}

export type PhotoScene = {
  id: string
  imageUrl: string
  duration: number
  overlayText?: string
  overlayTexts?: Array<{ id: string; text: string; x: number; y: number; scale: number; rotation?: number; color?: string; fontFamily?: string | null; start?: number; duration?: number }>
  mentions?: StoryMentionOverlay[]
  overlayStart?: number
  overlayDuration?: number
  overlayTextColor?: string
  overlayFontFamily?: string
  overlayX: number
  overlayY: number
  musicUrl?: string
  musicTitle?: string
  musicArtist?: string
  musicArtworkUrl?: string
  musicStart?: number
  musicDuration?: number
}

export type VideoScene = {
  overlayTexts?: Array<{ id: string; text: string; x: number; y: number; scale: number; rotation?: number; color?: string; fontFamily?: string | null; start?: number; duration?: number }>
  mentions?: StoryMentionOverlay[]
  id: string
  videoUrl: string
  duration: number
  overlayText?: string
  overlayFontFamily?: string
  overlayX: number
  overlayY: number
  musicUrl?: string
  musicTitle?: string
  musicArtist?: string
  musicArtworkUrl?: string
  musicStart?: number
  musicDuration?: number
}

export type StoryVisibility = 'everyone' | 'followers' | 'following' | 'selected'

export type Story = {
  id: string
  user_id: string
  story_type: 'text' | 'photo' | 'video'
  media_url: string | null
  text_content: string | null
  background_color: string | null
  overlay_text: string | null
  overlay_x: number
  overlay_y: number
  music_url: string | null
  music_title: string | null
  music_artist: string | null
  music_artwork_url: string | null
  duration_seconds: number
  text_color: string | null
  font_family: string | null
  overlay_text_color: string | null
  overlay_font_family: string | null
  text_scenes: TextScene[] | null
  photo_scenes: PhotoScene[] | null
  video_scenes: VideoScene[] | null
  global_music: GlobalMusic | null
  global_font_family: string | null
  visibility: StoryVisibility
  visibility_selected_ids: string[] | null
  link_url: string | null
  link_label: string | null
  created_at: string
  expires_at: string
}

export type StoryWithProfile = Story & {
  profiles: Profile
}

export type StoryLike = {
  id: string
  story_id: string
  user_id: string
  created_at: string
}

export type StoryReaction = {
  id: string
  story_id: string
  user_id: string
  emoji: string
  created_at: string
}

export type StoryReactionWithProfile = StoryReaction & {
  profiles: Profile
}

export type StoryComment = {
  id: string
  story_id: string
  user_id: string
  content: string
  parent_id?: string | null
  hidden?: boolean
  created_at: string
}

export type StoryCommentWithProfile = StoryComment & {
  profiles: Profile
}

// A comment or reply (post or story) enriched with likes, the viewer's
// own reaction, and (for top-level comments) its nested replies - what
// the shared CommentThread UI actually renders.
export type EnrichedComment = {
  id: string
  user_id: string
  content: string
  parent_id: string | null
  hidden: boolean
  created_at: string
  profiles: Profile
  likes_count: number
  is_liked: boolean
  my_reaction: string | null
  reaction_counts: Record<string, number>
  replies: EnrichedComment[]
}

export type StoryHiddenViewer = {
  id: string
  owner_id: string
  hidden_user_id: string
  created_at: string
}

export type PostWithProfile = Post & {
  profiles: Profile
  is_liked?: boolean
  /** Set when this post is showing up because someone reposted it - the
   *  post itself still displays the ORIGINAL author's name/avatar as the
   *  owner; this is only used for the small "reposted by" indicator. */
  reposted_by?: { id: string; username: string; avatar_url: string | null; is_verified?: boolean; verification_type?: 'blue' | 'yellow' | null }[] | null
  is_reposted?: boolean
  /** Set when this post was added to fill out a thin/empty feed (not
   *  from someone the viewer follows) - lets the UI show a small
   *  "Suggested for you" divider before it, Instagram-style. */
  is_suggested?: boolean
}

export type CommentWithProfile = Comment & {
  profiles: Profile
}

export type ChatWithProfiles = Chat & {
  participant1: Profile
  participant2: Profile
}

// Simple Database type for Supabase client
export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile> & { id: string; username: string }; Update: Partial<Profile> }
      posts: { Row: Post; Insert: Omit<Post, 'id' | 'created_at' | 'updated_at' | 'likes_count' | 'comments_count' | 'shares_count' | 'expires_at'> & { id?: string; expires_at?: string | null }; Update: Partial<Post> }
      likes: { Row: Like; Insert: Omit<Like, 'id' | 'created_at'>; Update: Partial<Like> }
      comments: { Row: Comment; Insert: Omit<Comment, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Comment> }
      follows: { Row: Follow; Insert: Omit<Follow, 'id' | 'created_at'>; Update: Partial<Follow> }
      chats: { Row: Chat; Insert: Omit<Chat, 'id' | 'created_at'>; Update: Partial<Chat> }
      messages: { Row: Message; Insert: Omit<Message, 'id' | 'created_at'>; Update: Partial<Message> }
      shares: { Row: Share; Insert: Omit<Share, 'id' | 'created_at'>; Update: Partial<Share> }
      notifications: { Row: Notification; Insert: Omit<Notification, 'id' | 'created_at' | 'is_read'> & { is_read?: boolean }; Update: Partial<Notification> }
      saved_folders: { Row: SavedFolder; Insert: Omit<SavedFolder, 'id' | 'created_at'>; Update: Partial<SavedFolder> }
      saved_posts: { Row: SavedPost; Insert: Omit<SavedPost, 'id' | 'created_at'>; Update: Partial<SavedPost> }
      stories: { Row: Story; Insert: Omit<Story, 'id' | 'created_at' | 'expires_at'> & { id?: string }; Update: Partial<Story> }
      story_mentions: { Row: StoryMention; Insert: Omit<StoryMention, 'id' | 'created_at'> & { id?: string }; Update: Partial<StoryMention> }
      story_likes: { Row: StoryLike; Insert: Omit<StoryLike, 'id' | 'created_at'>; Update: Partial<StoryLike> }
      story_reactions: { Row: StoryReaction; Insert: Omit<StoryReaction, 'id' | 'created_at'>; Update: Partial<StoryReaction> }
      story_comments: { Row: StoryComment; Insert: Omit<StoryComment, 'id' | 'created_at'>; Update: Partial<StoryComment> }
      story_hidden_viewers: { Row: StoryHiddenViewer; Insert: Omit<StoryHiddenViewer, 'id' | 'created_at'>; Update: Partial<StoryHiddenViewer> }
    }
  }
}
