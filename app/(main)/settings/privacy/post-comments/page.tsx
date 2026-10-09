'use client'

import { MessageSquare } from 'lucide-react'
import { PrivacySettingPage } from '@/components/shared/PrivacySettingPage'

export default function PostCommentPrivacyPage() {
  return (
    <PrivacySettingPage
      pageTitle="Post Comment Privacy"
      icon={<MessageSquare className="h-5 w-5" />}
      optionTitle="Who can see comments on your posts"
      optionDescription="Choose who's allowed to see the comments section on the posts you share"
      column="post_comment_privacy"
      category="post_comment"
      note="Anyone commenting still needs Post Privacy to allow them to see the post itself. You can always see every comment on your own posts, no matter what this is set to."
    />
  )
}
