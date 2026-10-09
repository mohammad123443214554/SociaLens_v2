'use client'

import { MessagesSquare } from 'lucide-react'
import { PrivacySettingPage } from '@/components/shared/PrivacySettingPage'

export default function StoryCommentPrivacyPage() {
  return (
    <PrivacySettingPage
      pageTitle="Story Comment Privacy"
      icon={<MessagesSquare className="h-5 w-5" />}
      optionTitle="Who can see comments on your story"
      optionDescription="Choose who's allowed to see the comments section on your stories"
      column="story_comment_privacy"
      category="story_comment"
      note="You can always see every comment on your own story, no matter what this is set to."
    />
  )
} 
