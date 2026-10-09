'use client'

import { Phone } from 'lucide-react'
import { PrivacySettingPage } from '@/components/shared/PrivacySettingPage'

export default function CallPrivacyPage() {
  return (
    <PrivacySettingPage
      pageTitle="Call Privacy"
      icon={<Phone className="h-5 w-5" />}
      optionTitle="Who can call you"
      optionDescription="Choose who's allowed to start an audio or video call with you"
      column="call_privacy"
      category="call"
    />
  )
}
