-- ===========================================================
-- SociaLens - Performance indexes
-- Safe to run more than once. Every index here is CREATE INDEX
-- IF NOT EXISTS - purely additive, never drops or alters anything,
-- And doesn't change any query's results, only how fast it runs.
-- ===========================================================

-- posts: profile grids and admin "posts by user" views filter directly
-- by user_id; feed/follow queries filter posts by a list of user_ids
-- then sort by recency, which is exactly what this composite serves.
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON public.posts(user_id, created_at DESC);

-- likes: fetchPostsWithLikes looks up "which of these post_ids has this
-- user_id liked" for every feed/reels/explore page load - a composite on
-- (user_id, post_id) makes that lookup a direct index hit either way.
CREATE INDEX IF NOT EXISTS idx_likes_user_post ON public.likes(user_id, post_id);
CREATE INDEX IF NOT EXISTS idx_likes_post_id ON public.likes(post_id);

-- reposts: same shape of lookup as likes above (now batched - see
-- fetchPostsWithLikes), plus profile pages listing what someone reposted.
CREATE INDEX IF NOT EXISTS idx_reposts_user_post ON public.reposts(user_id, post_id);
CREATE INDEX IF NOT EXISTS idx_reposts_post_id ON public.reposts(post_id);

-- saved_posts: Settings/Saved and folder views filter by user_id, and by
-- (user_id, folder_id) when a specific folder is open.
CREATE INDEX IF NOT EXISTS idx_saved_posts_user_folder ON public.saved_posts(user_id, folder_id);

-- comments: loading a post's comment thread is the single most repeated
-- comments query in the app and had no index on post_id at all.
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON public.comments(post_id, created_at);

-- follows: this is the one that matters most for feed speed - "who does
-- this person follow" (follower_id) drives the whole home feed, and
-- "who follows this person" (following_id) drives follower counts/lists
-- and privacy checks; both are filtered by status alongside the id.
CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows(follower_id, status);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows(following_id, status);

-- notifications: the notifications page/bell badge queries by user_id
-- ordered by recency, and separately counts unread ones.
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, is_read) WHERE is_read = false;

-- messages: opening a chat loads its messages ordered by time - this was
-- the single biggest missing index for anything chat-related.
CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON public.messages(chat_id, created_at);

-- chats: the chat list looks up every chat a given profile participates
-- in, from either side of the 1-on-1 conversation.
CREATE INDEX IF NOT EXISTS idx_chats_participant1 ON public.chats(participant1_id);
CREATE INDEX IF NOT EXISTS idx_chats_participant2 ON public.chats(participant2_id);

-- stories: the stories bar loads everyone's still-active stories most
-- recent first, and a profile's own story history by user_id.
CREATE INDEX IF NOT EXISTS idx_stories_user_created ON public.stories(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON public.stories(expires_at);
