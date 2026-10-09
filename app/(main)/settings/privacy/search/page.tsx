'use client'

import { Search } from 'lucide-react'
import { PrivacySettingPage } from '@/components/shared/PrivacySettingPage'

export default function SearchPrivacyPage() {
  return (
    <PrivacySettingPage
      pageTitle="Search Result Privacy"
      icon={<Search className="h-5 w-5" />}
      optionTitle="Who can find you in search"
      optionDescription="Choose who can find your account by searching for you"
      column="search_privacy"
      category="search"
    />
  )
} 
