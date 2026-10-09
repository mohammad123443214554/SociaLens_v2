'use client'

import { Image as ImageIcon } from 'lucide-react'
import { PrivacySettingPage } from '@/components/shared/PrivacySettingPage'

export default function PostPrivacyPage() {
  return (
    <PrivacySettingPage
      pageTitle="Post Privacy"
      icon={<ImageIcon className="h-5 w-5" />}
      optionTitle="Who can see your posts"
      optionDescription="Choose who gets to see the photos, reels, and text posts you share"
      column="post_privacy"
      category="post"
    />
  )
} 
