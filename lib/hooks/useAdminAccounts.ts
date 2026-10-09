'use client'

import { useQuery } from '@tanstack/react-query'
import { Profile, Post, Comment, Story, StoryComment } from '@/lib/types/database.types'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

// Every admin account-inspection screen ignores that account's privacy
// Settings on purpose - moderation needs to see private accounts, their
// posts, comments, stories and likes the same as public ones. All of
// this goes through /api/admin/accounts/*, which checks the caller is an
// admin server-side before touching another account's data.

export function useAdminAccountsList(search: string) {
  return useQuery({
    queryKey: ['admin-accounts', search],
    queryFn: async () => {
      const params = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''
      const { accounts } = await fetchJson<{ accounts: Profile[] }>(`/api/admin/accounts${params}`)
      return accounts
    },
  })
}

export function useAdminAccount(userId: string) {
  return useQuery({
    queryKey: ['admin-account', userId],
    queryFn: async () => {
      const { account } = await fetchJson<{ account: Profile }>(`/api/admin/accounts/${userId}`)
      return account
    },
    enabled: !!userId,
  })
}

export function useAdminAccountPosts(userId: string) {
  return useQuery({
    queryKey: ['admin-account-posts', userId],
    queryFn: async () => {
      const { posts } = await fetchJson<{ posts: Post[] }>(`/api/admin/accounts/${userId}/posts`)
      return posts
    },
    enabled: !!userId,
  })
}

export type AdminAccountComment = Comment & {
  posts: { id: string; content: string | null; media_url: string | null; media_type: string | null; user_id: string; profiles: { username: string; avatar_url: string | null } } | null
}

export function useAdminAccountComments(userId: string) {
  return useQuery({
    queryKey: ['admin-account-comments', userId],
    queryFn: async () => {
      const { comments } = await fetchJson<{ comments: AdminAccountComment[] }>(`/api/admin/accounts/${userId}/comments`)
      return comments
    },
    enabled: !!userId,
  })
}

export function useAdminAccountStories(userId: string) {
  return useQuery({
    queryKey: ['admin-account-stories', userId],
    queryFn: async () => {
      const { stories } = await fetchJson<{ stories: Story[] }>(`/api/admin/accounts/${userId}/stories`)
      return stories
    },
    enabled: !!userId,
  })
}

export type AdminStoryComment = StoryComment & {
  profiles: { username: string; avatar_url: string | null }
  stories: { id: string; story_type: string; media_url: string | null; text_content: string | null }
}

export function useAdminAccountStoryComments(userId: string) {
  return useQuery({
    queryKey: ['admin-account-story-comments', userId],
    queryFn: async () => {
      const { storyComments } = await fetchJson<{ storyComments: AdminStoryComment[] }>(`/api/admin/accounts/${userId}/story-comments`)
      return storyComments
    },
    enabled: !!userId,
  })
}

export type AdminAccountLike = {
  id: string
  created_at: string
  posts: { id: string; content: string | null; media_url: string | null; media_type: string | null; user_id: string; profiles: { username: string; avatar_url: string | null } } | null
}

export function useAdminAccountLikes(userId: string) {
  return useQuery({
    queryKey: ['admin-account-likes', userId],
    queryFn: async () => {
      const { likes } = await fetchJson<{ likes: AdminAccountLike[] }>(`/api/admin/accounts/${userId}/likes`)
      return likes
    },
    enabled: !!userId,
  })
}
