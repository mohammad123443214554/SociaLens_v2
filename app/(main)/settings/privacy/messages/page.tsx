'use client'

import { MessageCircle } from 'lucide-react'
import { PrivacySettingPage } from '@/components/shared/PrivacySettingPage'

export default function MessagePrivacyPage() {
  return (
    <PrivacySettingPage
      pageTitle="Message Privacy"
      icon={<MessageCircle className="h-5 w-5" />}
      optionTitle="Who can message you"
      optionDescription="Choose who's allowed to start or continue a conversation with you"
      column="message_privacy"
      category="message"
    />
  )
}
