'use client'

import { Circle } from 'lucide-react'
import { PrivacySettingPage } from '@/components/shared/PrivacySettingPage'

export default function StatusPrivacyPage() {
  return (
    <PrivacySettingPage
      pageTitle="Status Privacy"
      icon={<Circle className="h-5 w-5" />}
      optionTitle="Who can see your status"
      optionDescription="Choose who can see when you're Active or Online (the blue/green dot on your profile picture)"
      column="status_privacy"
      category="status"
    />
  )
}
