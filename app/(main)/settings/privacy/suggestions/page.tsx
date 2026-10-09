'use client'

import { Users } from 'lucide-react'
import { PrivacySettingPage } from '@/components/shared/PrivacySettingPage'

export default function SuggestionsPrivacyPage() {
  return (
    <PrivacySettingPage
      pageTitle="Suggestions Privacy"
      icon={<Users className="h-5 w-5" />}
      optionTitle="Who sees you in suggestions"
      optionDescription="Choose who can see your account in the 'Suggestions for you' page"
      column="suggestions_privacy"
      category="suggestions"
    />
  )
}
