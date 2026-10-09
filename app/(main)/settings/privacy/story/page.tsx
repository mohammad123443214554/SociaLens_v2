'use client'

import { Clock } from 'lucide-react'
import { PrivacySettingPage } from '@/components/shared/PrivacySettingPage'

export default function StoryPrivacyPage() {
  return (
    <PrivacySettingPage
      pageTitle="Story Privacy"
      icon={<Clock className="h-5 w-5" />}
      optionTitle="Who can see your story"
      optionDescription="Choose who gets to see the stories you post by default"
      column="story_privacy"
      category="story"
      note="You can still pick a different audience for an individual story when you post it."
    />
  )
} 
